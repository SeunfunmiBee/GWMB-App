// Account requests, support, error reporting, feature flags, beta testers and the membership approvals console.
// Ports the RLS on these tables and request_account_action / cancel_account_deletion (202610200005),
// submit_support_request / log_app_error (202610300002), add_beta_tester_by_email, admin_resolve_membership_link
// (202610150001), and the `account-request-process` Edge Function (export bundles and account deletion).
import { z } from 'zod';
import { decode, decodeAll } from '../db';
import { audit, body, HttpError, nowIso, optionalUser, requireAdmin, requireUser, router } from '../http';
import { normalizeEmail } from './membership';
import { enforceRateLimit } from '../rate-limit';
import { exportPathFor, loadRequest, processRequest } from '../account-processing';
import { signedUrl } from '../storage';

const MINUTE = 60_000;

// ---------- member: account requests and support ----------

export const account = router();
account.use('*', requireUser);

account.get('/requests', async (c) => {
  const { results } = await c.env.DB.prepare('select id, request_type, status, details, requested_at from account_requests where user_id = ? order by requested_at desc')
    .bind(c.get('userId')).all();
  return c.json(results);
});

account.post('/requests', async (c) => {
  const input = await body(c, z.object({ type: z.enum(['data_export', 'account_deletion'], { message: 'Unsupported account request' }), details: z.string().trim().max(2000).nullish() }));
  const userId = c.get('userId');
  const active = await c.env.DB.prepare("select 1 from account_requests where user_id = ? and request_type = ? and status in ('submitted', 'in_review')").bind(userId, input.type).first();
  if (active) throw new HttpError(409, 'You already have an active request of this type');
  const row = await c.env.DB.prepare('insert into account_requests (user_id, email, request_type, details) values (?, ?, ?, ?) returning id')
    .bind(userId, c.get('userEmail'), input.type, input.details || null).first<{ id: string }>();
  return c.json({ id: row?.id }, 201);
});

/** A 10-minute download link for the member's own completed data export. */
account.get('/requests/:id/export-url', async (c) => {
  const path = exportPathFor(await loadRequest(c.env, c.req.param('id')), c.get('userId'));
  if (!path) throw new HttpError(403, 'This export is not available.');
  return c.json({ url: await signedUrl(c.env, new URL(c.req.url).origin, 'privacy-exports', path, 600) });
});

account.post('/requests/cancel-deletion', async (c) => {
  await c.env.DB.prepare("update account_requests set status = 'cancelled' where user_id = ? and request_type = 'account_deletion' and status = 'submitted'").bind(c.get('userId')).run();
  return c.json({ ok: true });
});

account.post('/support', async (c) => {
  const input = await body(c, z.object({
    type: z.enum(['support', 'problem', 'feedback'], { message: 'Unsupported request type' }),
    subject: z.string().trim().min(3, 'Add a subject and a little more detail').max(180),
    message: z.string().trim().min(10, 'Add a subject and a little more detail').max(5000),
    route: z.string().trim().max(240).nullish(),
  }));
  const userId = c.get('userId');
  // The same message sent twice within 10 minutes is one request.
  const duplicate = await c.env.DB.prepare(
    'select id from support_requests where user_id = ? and request_type = ? and lower(subject) = lower(?) and message = ? and created_at > ? order by created_at desc limit 1',
  ).bind(userId, input.type, input.subject, input.message, new Date(Date.now() - 10 * MINUTE).toISOString()).first<{ id: string }>();
  if (duplicate) return c.json({ id: duplicate.id });
  await enforceRateLimit(c.env, userId, 'support_request', 5, 3600);
  const row = await c.env.DB.prepare('insert into support_requests (user_id, email, request_type, subject, message, route) values (?, ?, ?, ?, ?, ?) returning id')
    .bind(userId, c.get('userEmail'), input.type, input.subject, input.message, input.route || null).first<{ id: string }>();
  return c.json({ id: row?.id }, 201);
});

// ---------- error reporting (signed in or anonymous) ----------

export const errors = router();

const errorInput = z.object({
  source: z.string().trim().max(120).default('unknown'),
  message: z.string().trim().max(2000).default('Unknown application error'),
  severity: z.enum(['warning', 'error', 'fatal']).catch('error'),
  context: z.record(z.string(), z.unknown()).default({}),
});

errors.post('/', optionalUser, async (c) => {
  const input = await body(c, errorInput);
  const userId = c.get('userId') ?? null;
  const source = input.source || 'unknown';
  const message = input.message || 'Unknown application error';
  const clientId = String(input.context.client_id ?? 'unknown').slice(0, 100);
  const context = JSON.stringify(input.context).slice(0, 20_000);
  const db = c.env.DB;
  // The same error from the same reporter within 2 minutes is logged once.
  const recent = await db.prepare(
    `select id from app_error_logs where user_id is ? and source = ? and message = ? and (? is not null or json_extract(context, '$.client_id') = ?)
       and created_at > ? order by created_at desc limit 1`,
  ).bind(userId, source, message, userId, clientId, new Date(Date.now() - 2 * MINUTE).toISOString()).first<{ id: string }>();
  if (recent) return c.json({ id: recent.id });
  if (userId) {
    await enforceRateLimit(c.env, userId, 'app_error_log', 60, 3600);
  } else {
    const count = await db.prepare("select count(*) as n from app_error_logs where user_id is null and json_extract(context, '$.client_id') = ? and created_at > ?")
      .bind(clientId, new Date(Date.now() - 60 * MINUTE).toISOString()).first<{ n: number }>();
    if (clientId === 'unknown' || (count?.n ?? 0) >= 20) return c.json({ id: null });
  }
  const row = await db.prepare('insert into app_error_logs (user_id, severity, source, message, context, platform, app_version) values (?, ?, ?, ?, ?, ?, ?) returning id')
    .bind(userId, input.severity, source, message, context, String(input.context.platform ?? '').slice(0, 40) || null, String(input.context.app_version ?? '').slice(0, 80) || null)
    .first<{ id: string }>();
  return c.json({ id: row?.id ?? null }, 201);
});

// ---------- feature flags (public read) ----------

export const flags = router();

flags.get('/', optionalUser, async (c) => {
  const userId = c.get('userId');
  const [rows, beta] = await c.env.DB.batch([
    c.env.DB.prepare('select key, enabled, beta_only from feature_flags'),
    c.env.DB.prepare('select active from beta_testers where user_id = ?').bind(userId ?? ''),
  ]);
  return c.json({
    flags: decodeAll('feature_flags', rows.results as Record<string, unknown>[]),
    isBetaTester: (beta.results[0] as { active?: number } | undefined)?.active === 1,
  });
});

// ---------- admin: launch operations ----------

export const adminOperations = router();
adminOperations.use('*', requireUser, requireAdmin);

adminOperations.get('/', async (c) => {
  const db = c.env.DB;
  const [accounts, support, errorLogs, auditLogs, flagRows, beta] = await db.batch([
    db.prepare('select * from account_requests order by requested_at desc limit 50'),
    db.prepare('select * from support_requests order by created_at desc limit 50'),
    db.prepare('select * from app_error_logs order by created_at desc limit 50'),
    db.prepare('select * from admin_audit_logs order by created_at desc limit 50'),
    db.prepare('select * from feature_flags order by label'),
    db.prepare('select * from beta_testers order by added_at desc'),
  ]);
  const rows = (r: D1Result) => r.results as Record<string, unknown>[];
  return c.json({
    accountRequests: rows(accounts), supportRequests: rows(support), errors: decodeAll('app_error_logs', rows(errorLogs)),
    audit: decodeAll('admin_audit_logs', rows(auditLogs)), flags: decodeAll('feature_flags', rows(flagRows)), betaTesters: decodeAll('beta_testers', rows(beta)),
  });
});

adminOperations.patch('/flags/:key', async (c) => {
  const input = await body(c, z.object({ enabled: z.boolean(), beta_only: z.boolean() }));
  const key = c.req.param('key');
  const row = await c.env.DB.prepare('update feature_flags set enabled = ?, beta_only = ?, updated_by = ?, updated_at = ? where key = ? returning *')
    .bind(input.enabled ? 1 : 0, input.beta_only ? 1 : 0, c.get('userId'), nowIso(), key).first();
  if (!row) throw new HttpError(404, 'Unknown feature flag.');
  await audit(c.env, c.get('userId'), 'update', 'feature_flags', key, input);
  return c.json(decode('feature_flags', row));
});

const ACCOUNT_STATUSES = ['submitted', 'in_review', 'completed', 'cancelled'] as const;
const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

adminOperations.patch('/account-requests/:id', async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(ACCOUNT_STATUSES) }));
  const row = await c.env.DB.prepare('update account_requests set status = ?, completed_at = ? where id = ? returning id')
    .bind(status, status === 'completed' ? nowIso() : null, c.req.param('id')).first();
  if (!row) throw new HttpError(404, 'This request no longer exists.');
  await audit(c.env, c.get('userId'), 'update', 'account_requests', c.req.param('id'), { status });
  return c.json({ ok: true });
});

/** Builds the data export or deletes the account (with its files). */
adminOperations.post('/account-requests/:id/process', async (c) => c.json(await processRequest(c.env, c.get('userId'), c.req.param('id'))));

adminOperations.patch('/support-requests/:id', async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(SUPPORT_STATUSES) }));
  const row = await c.env.DB.prepare('update support_requests set status = ?, resolved_at = ? where id = ? returning id')
    .bind(status, status === 'resolved' ? nowIso() : null, c.req.param('id')).first();
  if (!row) throw new HttpError(404, 'This request no longer exists.');
  return c.json({ ok: true });
});

adminOperations.post('/errors/:id/resolve', async (c) => {
  await c.env.DB.prepare('update app_error_logs set resolved = 1 where id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

adminOperations.post('/beta-testers', async (c) => {
  const input = await body(c, z.object({
    email: z.string().trim().email().max(254),
    role: z.enum(['app_user', 'member', 'chapter_admin', 'central_admin'], { message: 'Unsupported beta role' }).default('member'),
    notes: z.string().trim().max(1000).nullish(),
  }));
  const user = await c.env.DB.prepare('select id from "user" where lower(email) = lower(?)').bind(input.email).first<{ id: string }>();
  if (!user) throw new HttpError(404, 'No app account found for this email');
  await c.env.DB.prepare(
    `insert into beta_testers (user_id, role, notes, added_by) values (?, ?, ?, ?)
     on conflict (user_id) do update set role = excluded.role, notes = excluded.notes, active = 1, added_by = excluded.added_by, added_at = ?`,
  ).bind(user.id, input.role, input.notes || null, c.get('userId'), nowIso()).run();
  await audit(c.env, c.get('userId'), 'upsert', 'beta_testers', user.id, { role: input.role });
  return c.json({ user_id: user.id }, 201);
});

// ---------- admin: membership approvals console ----------

export const adminMemberships = router();
adminMemberships.use('*', requireUser, requireAdmin);

const PAGE = 30;
const page = (offset: string | undefined) => Math.max(0, Number(offset ?? 0) || 0);

adminMemberships.get('/records', async (c) => {
  const term = (c.req.query('q') ?? '').replace(/[^a-zA-Z0-9@._ -]/g, ' ').trim();
  const where = term ? 'where member_identifier like ?1 or membership_email like ?1 or chapter like ?1' : '';
  const params = term ? [`%${term}%`] : [];
  const [items, count] = await c.env.DB.batch([
    c.env.DB.prepare(`select id, member_identifier, membership_email, chapter, status, dues_status, linked_user_id, created_at from membership_records ${where}
      order by created_at desc limit ${PAGE} offset ${page(c.req.query('offset'))}`).bind(...params),
    c.env.DB.prepare(`select count(*) as total from membership_records ${where}`).bind(...params),
  ]);
  return c.json({ items: items.results, total: (count.results[0] as { total: number }).total });
});

adminMemberships.post('/records', async (c) => {
  const input = await body(c, z.object({
    member_identifier: z.string().trim().min(3, 'Enter the GWMB Member ID.').max(80),
    membership_email: z.string().trim().email('Enter a valid membership email.').max(254),
    chapter: z.string().trim().max(160).nullish(),
  }));
  try {
    const row = await c.env.DB.prepare(
      `insert into membership_records (id, member_identifier, membership_email, chapter, status, dues_status) values (?, ?, ?, ?, 'active', 'unknown')
       returning id, member_identifier, membership_email, chapter, status, dues_status, linked_user_id, created_at`,
    ).bind(crypto.randomUUID(), input.member_identifier, normalizeEmail(input.membership_email), input.chapter || null).first();
    await audit(c.env, c.get('userId'), 'insert', 'membership_records', (row as { id: string }).id);
    return c.json(row, 201);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(`${error.message} ${(error as { cause?: Error }).cause?.message ?? ''}`)) throw new HttpError(409, 'That Member ID already exists.');
    throw error;
  }
});

adminMemberships.get('/requests', async (c) => {
  const [items, count] = await c.env.DB.batch([
    c.env.DB.prepare(`select user_id, membership_email, member_identifier, chapter, membership_record_id, status, review_note, submitted_at
      from membership_verification_requests order by submitted_at desc limit ${PAGE} offset ${page(c.req.query('offset'))}`),
    c.env.DB.prepare('select count(*) as total from membership_verification_requests'),
  ]);
  return c.json({ items: items.results, total: (count.results[0] as { total: number }).total });
});

adminMemberships.get('/applications', async (c) => {
  const [items, count] = await c.env.DB.batch([
    c.env.DB.prepare(`select * from membership_applications order by submitted_at desc limit ${PAGE} offset ${page(c.req.query('offset'))}`),
    c.env.DB.prepare('select count(*) as total from membership_applications'),
  ]);
  return c.json({ items: items.results, total: (count.results[0] as { total: number }).total });
});

/** `admin_resolve_membership_link`: approve (link the matched record) or reject a verification request. */
adminMemberships.post('/requests/:userId/resolve', async (c) => {
  const input = await body(c, z.object({ approved: z.boolean(), note: z.string().trim().max(2000).nullish() }));
  const userId = c.req.param('userId');
  const db = c.env.DB;
  const request = await db.prepare('select membership_record_id from membership_verification_requests where user_id = ?').bind(userId).first<{ membership_record_id: string | null }>();
  if (!request) throw new HttpError(404, 'Verification request not found');
  if (!input.approved) {
    await db.batch([
      db.prepare("update membership_verification_requests set status = 'rejected', review_note = ?, updated_at = ? where user_id = ?")
        .bind(input.note || 'The membership details could not be verified.', nowIso(), userId),
      db.prepare("update memberships set status = 'non_member' where user_id = ? and status = 'pending'").bind(userId),
    ]);
  } else {
    if (!request.membership_record_id) throw new HttpError(400, 'Match this request to an official membership record before approval');
    const record = await db.prepare('select linked_user_id from membership_records where id = ?').bind(request.membership_record_id).first<{ linked_user_id: string | null }>();
    if (record?.linked_user_id && record.linked_user_id !== userId) throw new HttpError(409, 'This Member ID is already linked to another account');
    try {
      // Linking the record makes the membership verified/expired through the 0004 triggers.
      await db.batch([
        db.prepare('update membership_records set linked_user_id = ? where id = ?').bind(userId, request.membership_record_id),
        db.prepare("update membership_verification_requests set status = 'approved', review_note = ?, updated_at = ? where user_id = ?")
          .bind(input.note || 'Membership manually verified by GWMB.', nowIso(), userId),
      ]);
    } catch (error) {
      if (error instanceof Error && /inactivity downgrade/.test(`${error.message} ${(error as { cause?: Error }).cause?.message ?? ''}`)) {
        throw new HttpError(409, 'This member was downgraded for inactivity and must reapply.');
      }
      throw error;
    }
  }
  await audit(c.env, c.get('userId'), input.approved ? 'approve' : 'reject', 'membership_verification_requests', userId);
  return c.json({ ok: true });
});
