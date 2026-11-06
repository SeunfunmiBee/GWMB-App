// Career readiness: practice questions, review submissions, practice responses and saved resources.
// Ports the RLS on career_* tables and `submit_career_review` (202610300002).
// Review decision notifications are SQLite triggers in 0006_career_triggers.sql.
import { z } from 'zod';
import { decode, decodeAll, encode } from '../db';
import { audit, body, HttpError, nowIso, optionalUser, requireAdmin, requireUser, router } from '../http';
import { enforceRateLimit } from '../rate-limit';

// ---------- practice questions (active ones are public) ----------

export const careerPublic = router();
careerPublic.use('*', optionalUser);

careerPublic.get('/questions', async (c) => {
  const { results } = await c.env.DB.prepare('select id, category, question, guidance, framework, career_areas, sort_order from career_practice_questions where active = 1 order by sort_order').all();
  return c.json(decodeAll('career_practice_questions', results));
});

// ---------- member ----------

export const career = router();
career.use('*', requireUser);

career.get('/reviews', async (c) => {
  const { results } = await c.env.DB.prepare('select * from career_review_submissions where user_id = ? order by created_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('career_review_submissions', results));
});

const trimmed = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const reviewInput = z.object({
  review_type: z.enum(['cv', 'linkedin', 'job_application', 'career_profile'], { message: 'Choose a valid review type' }),
  cv_record_id: z.string().max(64).nullish(),
  uploaded_file_path: trimmed(1024),
  uploaded_file_name: trimmed(240),
  linkedin_url: trimmed(500),
  target_role: z.string().trim().min(1, 'Complete your career field, target role and career stage').max(180),
  company_name: trimmed(180),
  job_description_url: trimmed(1000),
  job_description_text: trimmed(12000),
  career_field: z.string().trim().min(1, 'Complete your career field, target role and career stage').max(180),
  career_stage: z.string().trim().min(1, 'Complete your career field, target role and career stage').max(100),
  feedback_focus: trimmed(2000),
  clinic_event_id: z.string().max(64).nullish(),
  consent_authorized_review: z.literal(true, { message: 'Review consent is required' }),
  consent_group_review: z.boolean().nullish(),
  anonymize_for_session: z.boolean().nullish(),
});

career.post('/reviews', async (c) => {
  const input = await body(c, reviewInput);
  const userId = c.get('userId');
  const db = c.env.DB;
  if ((input.review_type === 'cv' || input.review_type === 'career_profile') && !input.cv_record_id && !input.uploaded_file_path) throw new HttpError(400, 'Choose a CV or upload a document');
  if (input.review_type === 'linkedin' && !input.linkedin_url) throw new HttpError(400, 'Add your LinkedIn URL');
  if (input.cv_record_id && !(await db.prepare('select 1 from cv_records where id = ? and user_id = ?').bind(input.cv_record_id, userId).first())) {
    throw new HttpError(400, 'The selected CV is not available');
  }
  if (input.uploaded_file_path && !input.uploaded_file_path.startsWith(`${userId}/`)) throw new HttpError(400, 'The uploaded document does not belong to this account');
  if (input.clinic_event_id) {
    const clinic = await db.prepare(
      "select 1 from content_items where id = ? and area = 'events' and status = 'published' and visible = 1 and (publish_at is null or publish_at <= ?)",
    ).bind(input.clinic_event_id, nowIso()).first();
    if (!clinic) throw new HttpError(400, 'The selected clinic is not available');
  }
  // An open submission of the same type for the same clinic is returned instead of creating a duplicate.
  const existing = await db.prepare(
    `select * from career_review_submissions where user_id = ? and review_type = ? and clinic_event_id is ?
       and status in ('submitted', 'under_review', 'selected') order by created_at desc limit 1`,
  ).bind(userId, input.review_type, input.clinic_event_id ?? null).first();
  if (existing) return c.json(decode('career_review_submissions', existing));

  await enforceRateLimit(c.env, userId, 'career_review_submission', 5, 86_400);
  const data = encode('career_review_submissions', {
    ...input, cv_record_id: input.cv_record_id ?? null, clinic_event_id: input.clinic_event_id ?? null,
    future_clinic_interest: !input.clinic_event_id, consent_authorized_review: true,
    consent_group_review: input.consent_group_review ?? false, anonymize_for_session: input.anonymize_for_session ?? true,
  });
  const cols = Object.keys(data);
  const row = await db.prepare(`insert into career_review_submissions (user_id, ${cols.join(', ')}, status) values (?, ${cols.map(() => '?').join(', ')}, 'submitted') returning *`)
    .bind(userId, ...cols.map((col) => data[col])).first();
  return c.json(decode('career_review_submissions', row), 201);
});

career.get('/responses', async (c) => {
  const { results } = await c.env.DB.prepare('select * from career_practice_responses where user_id = ?').bind(c.get('userId')).all();
  return c.json(decodeAll('career_practice_responses', results));
});

career.put('/responses/:questionId', async (c) => {
  const { response_text } = await body(c, z.object({ response_text: z.string().max(20_000) }));
  const now = nowIso();
  const row = await c.env.DB.prepare(
    `insert into career_practice_responses (user_id, question_id, response_text, updated_at) values (?, ?, ?, ?)
     on conflict (user_id, question_id) do update set response_text = excluded.response_text, updated_at = excluded.updated_at returning *`,
  ).bind(c.get('userId'), c.req.param('questionId'), response_text, now).first();
  return c.json(decode('career_practice_responses', row));
});

career.get('/saved-resources', async (c) => {
  const { results } = await c.env.DB.prepare('select content_id from career_saved_resources where user_id = ?').bind(c.get('userId')).all<{ content_id: string }>();
  return c.json(results.map((r) => r.content_id));
});

career.put('/saved-resources/:contentId', async (c) => {
  const exists = await c.env.DB.prepare('select 1 from career_saved_resources where user_id = ? and content_id = ?').bind(c.get('userId'), c.req.param('contentId')).first();
  if (!exists) await c.env.DB.prepare('insert into career_saved_resources (user_id, content_id) values (?, ?)').bind(c.get('userId'), c.req.param('contentId')).run();
  return c.json({ ok: true });
});

career.delete('/saved-resources/:contentId', async (c) => {
  await c.env.DB.prepare('delete from career_saved_resources where user_id = ? and content_id = ?').bind(c.get('userId'), c.req.param('contentId')).run();
  return c.json({ ok: true });
});

// ---------- admin ----------

export const adminCareer = router();
adminCareer.use('*', requireUser, requireAdmin);

const REVIEW_STATUSES = ['submitted', 'under_review', 'selected', 'reviewed', 'not_selected'] as const;

adminCareer.get('/questions', async (c) => {
  const { results } = await c.env.DB.prepare('select * from career_practice_questions order by sort_order').all();
  return c.json(decodeAll('career_practice_questions', results));
});

const questionInput = z.object({
  id: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(1000),
  guidance: z.string().trim().max(4000),
  framework: z.string().max(200).nullable(),
  career_areas: z.array(z.string().max(120)).max(50),
  sort_order: z.number().int(),
  active: z.boolean(),
});

adminCareer.put('/questions', async (c) => {
  const data = encode('career_practice_questions', await body(c, questionInput));
  const cols = Object.keys(data);
  const row = await c.env.DB.prepare(
    `insert into career_practice_questions (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})
     on conflict (id) do update set ${cols.filter((col) => col !== 'id').map((col) => `${col} = excluded.${col}`).join(', ')}, updated_at = ? returning *`,
  ).bind(...cols.map((col) => data[col]), nowIso()).first();
  return c.json(decode('career_practice_questions', row));
});

adminCareer.delete('/questions/:id', async (c) => {
  await c.env.DB.prepare('delete from career_practice_questions where id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

adminCareer.get('/reviews', async (c) => {
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const limit = Math.min(100, Math.max(10, Number(c.req.query('limit') ?? 25) || 25));
  const status = c.req.query('status');
  const term = (c.req.query('q') ?? '').replace(/[^a-zA-Z0-9 _-]/g, ' ').trim();
  const where: string[] = [];
  const params: unknown[] = [];
  if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
  if (term) { where.push('(target_role like ? or career_field like ? or review_type like ?)'); params.push(`%${term}%`, `%${term}%`, `%${term}%`); }
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const [rows, count] = await c.env.DB.batch([
    c.env.DB.prepare(`select * from career_review_submissions ${clause} order by created_at desc limit ? offset ?`).bind(...params, limit, offset),
    c.env.DB.prepare(`select count(*) as total from career_review_submissions ${clause}`).bind(...params),
  ]);
  return c.json({ items: decodeAll('career_review_submissions', rows.results as Record<string, unknown>[]), total: (count.results[0] as { total: number }).total });
});

adminCareer.get('/reviews/counts', async (c) => {
  const { results } = await c.env.DB.prepare('select status, count(*) as n from career_review_submissions group by status').all<{ status: string; n: number }>();
  return c.json(Object.fromEntries(REVIEW_STATUSES.map((s) => [s, results.find((r) => r.status === s)?.n ?? 0])));
});

adminCareer.patch('/reviews/:id', async (c) => {
  const change = await body(c, z.object({
    status: z.enum(REVIEW_STATUSES).optional(),
    admin_feedback: z.string().max(20_000).optional(),
    clinic_event_id: z.string().max(64).nullable().optional(),
    anonymize_for_session: z.boolean().optional(),
  }));
  const id = c.req.param('id');
  const data = encode('career_review_submissions', { ...change, reviewed_by: change.status === 'reviewed' ? c.get('userId') : undefined, updated_at: nowIso() });
  const cols = Object.keys(data);
  const row = await c.env.DB.prepare(`update career_review_submissions set ${cols.map((col) => `${col} = ?`).join(', ')} where id = ? returning *`)
    .bind(...cols.map((col) => data[col]), id).first();
  if (!row) throw new HttpError(404, 'This submission no longer exists.');
  await audit(c.env, c.get('userId'), 'update', 'career_review_submissions', id, { status: change.status ?? null });
  // reviewed_at is stamped by the trigger after this update; read the final row.
  return c.json(decode('career_review_submissions', await c.env.DB.prepare('select * from career_review_submissions where id = ?').bind(id).first()));
});
