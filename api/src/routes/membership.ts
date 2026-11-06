// Membership applications and linking an app account to an official GWMB membership record.
// Ports: RLS on membership_applications / membership_verification_requests, `submit_membership_link_request`,
// `get_my_membership_details` (202610200001, 202610150001) and the `membership-email-otp` Edge Function.
// Status side effects (pending / verified / expired) are SQLite triggers in 0004_membership_triggers.sql.
import { z } from 'zod';
import { sendEmail } from '../email';
import type { Env } from '../env';
import { body, HttpError, nowIso, requireUser, router } from '../http';
import { timingSafeEqual } from '../identity';

export const membership = router();
membership.use('*', requireUser);

// ---------- normalizers (were SQL functions) ----------

/** `normalize_membership_email`: trim, drop trailing whitespace/punctuation, lowercase. */
export function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().replace(/[\s.,;:]+$/, '').toLowerCase();
}

/** `normalize_member_identifier`: order-insensitive token match, e.g. "2026-gwmb-12" == "GWMB 2026 12". */
export function normalizeIdentifier(value: string | null | undefined) {
  const rank = (t: string) => (t === 'gwmb' ? 0 : /^[a-z]+$/.test(t) ? 1 : /^[0-9]{4}$/.test(t) ? 2 : 3);
  return (value ?? '').trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)).join('');
}

type MembershipRecord = { id: string; member_identifier: string; membership_email: string; chapter: string | null; status: string; linked_user_id: string | null };

async function findRecord(env: Env, email: string, identifier: string) {
  // The email filter narrows candidates; exact normalized comparison happens here (no regex in SQLite).
  const { results } = await env.DB.prepare('select * from membership_records where instr(lower(membership_email), ?) > 0').bind(email).all<MembershipRecord>();
  const wanted = normalizeIdentifier(identifier);
  return results.find((r) => normalizeEmail(r.membership_email) === email && normalizeIdentifier(r.member_identifier) === wanted) ?? null;
}

// ---------- applications (owner may read and submit; admins review elsewhere) ----------

membership.get('/application', async (c) => {
  const row = await c.env.DB.prepare('select * from membership_applications where user_id = ? order by submitted_at desc limit 1').bind(c.get('userId')).first();
  return c.json(row ?? null);
});

const applicationInput = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(160),
  email: z.string().trim().email('Enter a valid email address.').max(254),
  phone: z.string().trim().min(5, 'Enter a phone number.').max(40),
  city: z.string().trim().min(2, 'Enter your city.').max(120),
  occupation: z.string().trim().min(2, 'Enter your occupation.').max(160),
  motivation: z.string().trim().min(10, 'Tell us a little more about why you want to join.').max(2000),
});

membership.post('/application', async (c) => {
  const input = await body(c, applicationInput);
  const row = await c.env.DB.prepare(
    `insert into membership_applications (user_id, full_name, email, phone, city, occupation, motivation, status)
     values (?, ?, ?, ?, ?, ?, ?, 'submitted') returning *`,
  ).bind(c.get('userId'), input.fullName, input.email.toLowerCase(), input.phone, input.city, input.occupation, input.motivation).first();
  return c.json(row, 201);
});

// ---------- verification request + details ----------

membership.get('/verification-request', async (c) => {
  const row = await c.env.DB.prepare('select * from membership_verification_requests where user_id = ?').bind(c.get('userId')).first();
  return c.json(row ?? null);
});

membership.get('/details', async (c) => {
  const row = await c.env.DB.prepare(
    `select r.member_identifier, r.membership_email, r.chapter, r.status as record_status, r.dues_status
     from memberships m join membership_records r on r.id = m.membership_record_id where m.user_id = ?`,
  ).bind(c.get('userId')).first();
  return c.json(row ?? null);
});

// ---------- link request (`submit_membership_link_request`) ----------

type LinkResult = { result: 'verified' | 'inactive' | 'needs_review' | 'email_confirmation_required' | 'already_linked'; request_status: 'pending' | 'needs_review' | 'approved' | 'rejected'; message: string };

const linkInput = z.object({
  membershipEmail: z.string().max(254),
  memberIdentifier: z.string().max(80),
  chapter: z.string().max(120).nullish(),
});

membership.post('/link', async (c) => {
  const input = await body(c, linkInput);
  const env = c.env;
  const userId = c.get('userId');
  const email = normalizeEmail(input.membershipEmail);
  const identifier = input.memberIdentifier.trim();
  const chapter = input.chapter?.trim() || null;
  if (!email || !identifier) throw new HttpError(400, 'Membership email and Member ID are required');

  const upsertRequest = (status: string, note: string, recordId: string | null, requestChapter: string | null, touchSubmitted = true) =>
    env.DB.prepare(
      `insert into membership_verification_requests (user_id, membership_email, member_identifier, chapter, phone, membership_record_id, status, review_note, submitted_at, updated_at)
       values (?1, ?2, ?3, ?4, '', ?5, ?6, ?7, ?8, ?8)
       on conflict (user_id) do update set membership_email = excluded.membership_email, member_identifier = excluded.member_identifier,
         chapter = excluded.chapter, membership_record_id = excluded.membership_record_id, status = excluded.status,
         review_note = excluded.review_note, updated_at = excluded.updated_at
         ${touchSubmitted ? ', submitted_at = excluded.submitted_at' : ''}`,
    ).bind(userId, email, identifier, requestChapter, recordId, status, note, nowIso());
  const markPending = env.DB.prepare("update memberships set status = 'pending' where user_id = ?").bind(userId);
  const respond = (result: LinkResult) => c.json(result);

  const record = await findRecord(env, email, identifier);
  if (!record) {
    await env.DB.batch([upsertRequest('needs_review', 'No matching Member ID and membership email were found in the official membership database.', null, chapter), markPending]);
    return respond({ result: 'needs_review', request_status: 'needs_review', message: 'No matching official record was found yet. We will check again automatically when an administrator updates the records.' });
  }

  if (record.linked_user_id && record.linked_user_id !== userId) {
    return respond({ result: 'already_linked', request_status: 'rejected', message: 'This Member ID is already linked to another app account. Sign in to that account or recover it.' });
  }

  if (chapter && record.chapter && chapter.toLowerCase() !== record.chapter.trim().toLowerCase()) {
    await env.DB.batch([upsertRequest('needs_review', 'Member ID and email matched, but the chapter needs manual confirmation.', record.id, chapter), markPending]);
    return respond({ result: 'needs_review', request_status: 'needs_review', message: 'Your Member ID and email matched, but the chapter needs review.' });
  }

  const account = await env.DB.prepare('select email, emailVerified from "user" where id = ?').bind(userId).first<{ email: string; emailVerified: number }>();
  if (account?.emailVerified && normalizeEmail(account.email) === normalizeEmail(record.membership_email)) {
    // The app account email is the confirmed membership email: link straight away (the trigger syncs `memberships`).
    const active = record.status === 'active';
    try {
      await env.DB.batch([
        env.DB.prepare('update membership_records set linked_user_id = ? where id = ?').bind(userId, record.id),
        upsertRequest('approved', 'Verified using the confirmed app-account email.', record.id, record.chapter, false),
      ]);
    } catch (error) {
      throw linkError(error);
    }
    return respond({
      result: active ? 'verified' : 'inactive',
      request_status: 'approved',
      message: active ? 'Membership verified and linked to your app account.' : 'Your membership record matched, but it is not currently active.',
    });
  }

  await env.DB.batch([upsertRequest('pending', 'Member ID and email matched. Confirm ownership of the membership email.', record.id, record.chapter), markPending]);
  return respond({ result: 'email_confirmation_required', request_status: 'pending', message: 'Your details matched. GWMB needs to confirm ownership of the membership email before linking.' });
});

function linkError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('inactivity downgrade')) return new HttpError(409, 'Membership reapplication is required after an inactivity downgrade.');
  if (message.includes('UNIQUE')) return new HttpError(409, 'This Member ID is already linked to another app account.');
  return error;
}

// ---------- membership email ownership code (`membership-email-otp`) ----------

const CODE_TTL_MS = 10 * 60_000;
const RESEND_WAIT_MS = 60_000;
const MAX_ATTEMPTS = 5; // per 24-hour window, across resends
const ATTEMPT_WINDOW_MS = 24 * 60 * 60_000;

async function pendingRequest(env: Env, userId: string) {
  const request = await env.DB.prepare('select membership_email, membership_record_id, status from membership_verification_requests where user_id = ?')
    .bind(userId).first<{ membership_email: string; membership_record_id: string | null; status: string }>();
  if (!request?.membership_record_id || request.status !== 'pending') throw new HttpError(400, 'No membership email confirmation is waiting for this account.');
  return request as { membership_email: string; membership_record_id: string; status: string };
}

async function codeHash(env: Env, userId: string, code: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${code}:${env.SIGNING_SECRET}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

membership.post('/email-code/send', async (c) => {
  const userId = c.get('userId');
  const request = await pendingRequest(c.env, userId);
  const existing = await c.env.DB.prepare('select sent_at, attempts, created_at from membership_email_challenges where user_id = ?').bind(userId)
    .first<{ sent_at: string; attempts: number; created_at: string }>();
  if (existing && Date.now() - Date.parse(existing.sent_at) < RESEND_WAIT_MS) throw new HttpError(429, 'Wait one minute before requesting another code.');
  const windowOpen = existing && Date.now() - Date.parse(existing.created_at) < ATTEMPT_WINDOW_MS;
  if (windowOpen && existing.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Try again tomorrow or request manual review.');

  // The guess budget (MAX_ATTEMPTS per 24 hours) survives resends; only a new window resets it.
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const now = nowIso();
  await c.env.DB.prepare(
    `insert into membership_email_challenges (user_id, membership_record_id, code_hash, expires_at, attempts, sent_at, created_at) values (?1, ?2, ?3, ?4, 0, ?5, ?5)
     on conflict (user_id) do update set membership_record_id = excluded.membership_record_id, code_hash = excluded.code_hash,
       expires_at = excluded.expires_at, sent_at = excluded.sent_at,
       attempts = case when membership_email_challenges.created_at < ?6 then 0 else membership_email_challenges.attempts end,
       created_at = case when membership_email_challenges.created_at < ?6 then excluded.created_at else membership_email_challenges.created_at end`,
  ).bind(userId, request.membership_record_id, await codeHash(c.env, userId, code), new Date(Date.now() + CODE_TTL_MS).toISOString(), now,
    new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString()).run();

  try {
    await sendEmail(c.env, request.membership_email, 'Your GWMB membership verification code', `Enter this code in the GWMB app to confirm your membership email: ${code}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email.`);
  } catch {
    // Expire the undelivered code but keep the row, so the attempt budget is not reset.
    await c.env.DB.prepare('update membership_email_challenges set expires_at = ? where user_id = ?').bind(new Date(0).toISOString(), userId).run();
    throw new HttpError(502, 'The verification email could not be delivered. Request manual review for now.');
  }
  return c.json({ ok: true, message: 'We sent a 6-digit code to your registered membership email.' });
});

membership.post('/email-code/verify', async (c) => {
  const userId = c.get('userId');
  const { code } = await body(c, z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.') }));
  await pendingRequest(c.env, userId);
  // Spend one attempt atomically *before* comparing, so parallel guesses cannot exceed the budget.
  const challenge = await c.env.DB.prepare(
    `update membership_email_challenges set attempts = attempts + 1
     where user_id = ? and attempts < ? and expires_at > ? returning membership_record_id, code_hash`,
  ).bind(userId, MAX_ATTEMPTS, nowIso()).first<{ membership_record_id: string; code_hash: string }>();
  if (!challenge) {
    const row = await c.env.DB.prepare('select attempts from membership_email_challenges where user_id = ?').bind(userId).first<{ attempts: number }>();
    if (row && row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Try again tomorrow or request manual review.');
    throw new HttpError(400, 'This code has expired. Request a new code.');
  }
  if (!timingSafeEqual(await codeHash(c.env, userId, code), challenge.code_hash)) throw new HttpError(400, 'That code is not correct.');

  const record = await c.env.DB.prepare('select linked_user_id, status from membership_records where id = ?').bind(challenge.membership_record_id)
    .first<{ linked_user_id: string | null; status: string }>();
  if (!record) throw new HttpError(404, 'This membership record no longer exists.');
  if (record.linked_user_id && record.linked_user_id !== userId) throw new HttpError(409, 'This Member ID is already linked to another app account.');
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('update membership_records set linked_user_id = ? where id = ?').bind(userId, challenge.membership_record_id),
      c.env.DB.prepare("update membership_verification_requests set status = 'approved', review_note = 'Membership email ownership verified with a one-time code.', updated_at = ? where user_id = ?").bind(nowIso(), userId),
      c.env.DB.prepare('delete from membership_email_challenges where user_id = ?').bind(userId),
    ]);
  } catch (error) {
    throw linkError(error);
  }
  const active = record.status === 'active';
  return c.json({ ok: true, status: active ? 'verified' : 'inactive', message: active ? 'Membership Verified' : 'Membership matched but is not currently active.' });
});
