// Opportunities: saved opportunities, applications and application profiles/reminders.
// Ports the RLS on saved_opportunities, opportunity_applications, application_profiles, application_reminders,
// `get_opportunity_application_context` and `submit_opportunity_application` (202610290004).
// Status notifications and reminders are SQLite triggers in 0006_career_triggers.sql.
import { z } from 'zod';
import { publicMetadata } from '../access';
import { decode, decodeAll, encode } from '../db';
import { audit, body, HttpError, nowIso, requireAdmin, requireUser, router } from '../http';
import type { Env } from '../env';

export const opportunities = router();
opportunities.use('*', requireUser);

type Item = { id: string; slug: string; title: string; eyebrow: string | null; summary: string | null; status: string; visible: number; access_level: string; publish_at: string | null; metadata: string };

async function findOpportunity(env: Env, idOrSlug: string) {
  const item = await env.DB.prepare("select * from content_items where area = 'opportunities' and (id = ?1 or slug = ?1) limit 1").bind(idOrSlug).first<Item>();
  if (!item || item.status !== 'published' || !item.visible || (item.publish_at && item.publish_at > nowIso())) return null;
  return item;
}

async function isVerified(env: Env, userId: string) {
  return Boolean(await env.DB.prepare("select 1 from memberships where user_id = ? and status = 'verified'").bind(userId).first());
}

function deadlineOf(item: Item) {
  try { const d = Date.parse(String(JSON.parse(item.metadata || '{}').deadline ?? '')); return Number.isNaN(d) ? null : d; } catch { return null; }
}

// ---------- saved ----------

opportunities.get('/saved', async (c) => {
  const { results } = await c.env.DB.prepare('select opportunity_id from saved_opportunities where user_id = ?').bind(c.get('userId')).all<{ opportunity_id: string }>();
  return c.json(results.map((r) => r.opportunity_id));
});

opportunities.put('/saved/:opportunityId', async (c) => {
  await c.env.DB.prepare('insert or ignore into saved_opportunities (user_id, opportunity_id) values (?, ?)').bind(c.get('userId'), c.req.param('opportunityId')).run();
  return c.json({ ok: true });
});

opportunities.delete('/saved/:opportunityId', async (c) => {
  await c.env.DB.prepare('delete from saved_opportunities where user_id = ? and opportunity_id = ?').bind(c.get('userId'), c.req.param('opportunityId')).run();
  return c.json({ ok: true });
});

// ---------- applications ----------

opportunities.get('/applications', async (c) => {
  const { results } = await c.env.DB.prepare('select * from opportunity_applications where user_id = ? order by submitted_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('opportunity_applications', results));
});

opportunities.get('/:opportunityId/context', async (c) => {
  const item = await findOpportunity(c.env, c.req.param('opportunityId'));
  if (!item) return c.json(null);
  const deadline = deadlineOf(item);
  let blocked: string | null = null;
  if (item.access_level === 'members' && !(await isVerified(c.env, c.get('userId')))) blocked = 'Verified GWMB membership is required for this opportunity.';
  else if (item.access_level === 'admin') blocked = 'This opportunity is not open for applications.';
  else if (deadline !== null && deadline < Date.now()) blocked = 'Applications for this opportunity have closed.';
  return c.json({ id: item.id, slug: item.slug, title: item.title, eyebrow: item.eyebrow, summary: item.summary, access_level: item.access_level,
    metadata: publicMetadata(JSON.parse(item.metadata || '{}')), can_apply: blocked === null, blocked_reason: blocked });
});

// Drafts: the owner may create/update only while the application is a draft (RLS).
const draftInput = z.object({
  portfolio_url: z.string().trim().max(1000).nullable(),
  motivation: z.string().max(2000),
  cv_record_id: z.string().max(64).nullable(),
  completion_percent: z.number().int().min(0).max(100),
});

opportunities.put('/:opportunityId/draft', async (c) => {
  const input = await body(c, draftInput);
  const userId = c.get('userId');
  const now = nowIso();
  const row = await c.env.DB.prepare(
    `insert into opportunity_applications (user_id, opportunity_id, portfolio_url, motivation, status, cv_record_id, completion_percent, submitted_at, updated_at)
     values (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?7)
     on conflict (user_id, opportunity_id) do update set portfolio_url = excluded.portfolio_url, motivation = excluded.motivation,
       cv_record_id = excluded.cv_record_id, completion_percent = excluded.completion_percent, updated_at = excluded.updated_at
       where opportunity_applications.status = 'draft'
     returning *`,
  ).bind(userId, c.req.param('opportunityId'), input.portfolio_url || null, input.motivation, input.cv_record_id, input.completion_percent, now).first();
  if (!row) throw new HttpError(409, 'You have already applied for this opportunity');
  return c.json(decode('opportunity_applications', row));
});

const submitInput = z.object({
  portfolioUrl: z.string().trim().max(1000).nullish(),
  motivation: z.string().trim().min(30, 'Your motivation must be between 30 and 2000 characters').max(2000, 'Your motivation must be between 30 and 2000 characters'),
  cvRecordId: z.string().max(64).nullish(),
});

opportunities.post('/:opportunityId/submit', async (c) => {
  const input = await body(c, submitInput);
  const userId = c.get('userId');
  const item = await findOpportunity(c.env, c.req.param('opportunityId'));
  if (!item) throw new HttpError(404, 'This opportunity is not available');
  if (item.access_level === 'members' && !(await isVerified(c.env, userId))) throw new HttpError(403, 'Verified GWMB membership is required');
  if (item.access_level === 'admin') throw new HttpError(403, 'This opportunity is not open for applications');
  const deadline = deadlineOf(item);
  if (deadline !== null && deadline < Date.now()) throw new HttpError(400, 'Applications have closed');

  // The CV snapshot is taken server-side from the applicant's own record (the client no longer sends it).
  let snapshot: string | null = null;
  if (input.cvRecordId) {
    const cv = await c.env.DB.prepare(
      'select id, name, target_role, opportunity_type, template, original_file_path, generated_file_path, structured_data, updated_at from cv_records where id = ? and user_id = ?',
    ).bind(input.cvRecordId, userId).first<Record<string, unknown>>();
    if (!cv) throw new HttpError(400, 'The selected CV is not available');
    snapshot = JSON.stringify({ ...cv, structured_data: JSON.parse(String(cv.structured_data || '{}')) });
  }
  const existing = await c.env.DB.prepare('select status, submission_reference from opportunity_applications where user_id = ? and opportunity_id = ?')
    .bind(userId, item.slug).first<{ status: string; submission_reference: string | null }>();
  if (existing && existing.status !== 'draft') throw new HttpError(409, 'You have already applied for this opportunity');
  const reference = existing?.submission_reference ?? `GWMB-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const now = nowIso();
  const row = await c.env.DB.prepare(
    `insert into opportunity_applications (user_id, opportunity_id, opportunity_content_id, submission_reference, portfolio_url, motivation,
       cv_record_id, cv_snapshot, status, completion_percent, submitted_at, updated_at)
     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'submitted', 100, ?9, ?9)
     on conflict (user_id, opportunity_id) do update set opportunity_content_id = excluded.opportunity_content_id,
       submission_reference = excluded.submission_reference, portfolio_url = excluded.portfolio_url, motivation = excluded.motivation,
       cv_record_id = excluded.cv_record_id, cv_snapshot = excluded.cv_snapshot, status = 'submitted', completion_percent = 100,
       submitted_at = excluded.submitted_at, updated_at = excluded.updated_at
       where opportunity_applications.status = 'draft'
     returning *`,
  ).bind(userId, item.slug, item.id, reference, input.portfolioUrl || null, input.motivation, input.cvRecordId ?? null, snapshot, now).first();
  if (!row) throw new HttpError(409, 'You have already applied for this opportunity');
  return c.json(decode('opportunity_applications', row));
});

// ---------- application profile + reminders (owner only) ----------

opportunities.get('/profile', async (c) => {
  return c.json(decode('application_profiles', await c.env.DB.prepare('select * from application_profiles where user_id = ?').bind(c.get('userId')).first()));
});

const profileInput = z.object({
  professional_bio: z.string().max(4000), career_direction: z.string().max(1000),
  strengths: z.array(z.string().max(300)).max(50), achievements: z.array(z.string().max(1000)).max(50),
  reusable_motivation: z.string().max(4000), linkedin_url: z.string().max(1000), portfolio_url: z.string().max(1000),
  preferred_location: z.string().max(200), refinement_count: z.number().int().min(0),
});

opportunities.put('/profile', async (c) => {
  const data = encode('application_profiles', await body(c, profileInput));
  const cols = Object.keys(data);
  const row = await c.env.DB.prepare(
    `insert into application_profiles (user_id, ${cols.join(', ')}, updated_at) values (?, ${cols.map(() => '?').join(', ')}, ?)
     on conflict (user_id) do update set ${cols.map((col) => `${col} = excluded.${col}`).join(', ')}, updated_at = excluded.updated_at returning *`,
  ).bind(c.get('userId'), ...cols.map((col) => data[col]), nowIso()).first();
  return c.json(decode('application_profiles', row));
});

const remindersInput = z.object({
  opportunityId: z.string().min(1).max(200),
  reminders: z.array(z.object({ label: z.string().min(1).max(200), days_after_submission: z.number().int().min(0).max(365), enabled: z.boolean(), scheduled_for: z.string() })).max(10),
});

opportunities.put('/reminders', async (c) => {
  const input = await body(c, remindersInput);
  const userId = c.get('userId');
  const stmt = (r: z.infer<typeof remindersInput>['reminders'][number]) => {
    const data = encode('application_reminders', r);
    return c.env.DB.prepare(
      `insert into application_reminders (user_id, opportunity_id, label, days_after_submission, enabled, scheduled_for) values (?, ?, ?, ?, ?, ?)
       on conflict (user_id, opportunity_id, days_after_submission) do update set label = excluded.label, enabled = excluded.enabled, scheduled_for = excluded.scheduled_for
       returning *`,
    ).bind(userId, input.opportunityId, r.label, r.days_after_submission, data.enabled, data.scheduled_for);
  };
  const results = input.reminders.length ? await c.env.DB.batch(input.reminders.map(stmt)) : [];
  return c.json(results.map((r) => decode('application_reminders', r.results[0] as Record<string, unknown>)));
});

// ---------- admin ----------

export const adminOpportunities = router();
adminOpportunities.use('*', requireUser, requireAdmin);

adminOpportunities.get('/applications', async (c) => {
  const { results } = await c.env.DB.prepare(
    `select a.*, p.full_name as applicant_full_name, p.city_club as applicant_city_club
     from opportunity_applications a left join profiles p on p.id = a.user_id order by a.submitted_at desc`,
  ).all<Record<string, unknown>>();
  return c.json(results.map(({ applicant_full_name, applicant_city_club, ...row }) => ({
    ...decode('opportunity_applications', row), applicant: { full_name: applicant_full_name ?? null, city_club: applicant_city_club ?? null },
  })));
});

adminOpportunities.patch('/applications/:id', async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(['submitted', 'under_review', 'successful', 'unsuccessful']) }));
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('update opportunity_applications set status = ?, updated_at = ? where id = ? returning *').bind(status, nowIso(), id).first();
  if (!row) throw new HttpError(404, 'This application no longer exists.');
  await audit(c.env, c.get('userId'), 'update', 'opportunity_applications', id, { status });
  return c.json(decode('opportunity_applications', row));
});
