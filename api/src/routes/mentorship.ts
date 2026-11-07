// Mentorship: mentors, group sessions, seat registrations, interests and one-on-one applications.
// Ports the RLS on the mentorship tables, `register_for_mentorship_session`, `submit_mentorship_application`
// (202610300002), `get_approved_mentorship_booking`, `admin_list_mentorship_sessions` and
// `refresh_mentorship_operations_tasks` (src/mentorship-tasks.ts). Notifications, mentor communications and
// operations tasks driven by data changes are SQLite triggers in 0007_mentorship_triggers.sql.
import { z } from 'zod';
import { readableLevels } from '../access';
import { decode, decodeAll, encode } from '../db';
import { audit, body, HttpError, nowIso, optionalUser, requireAdmin, requireUser, router } from '../http';
import { refreshMentorshipTasks } from '../mentorship-tasks';
import { enforceRateLimit } from '../rate-limit';
import type { Env } from '../env';

// Columns members may see. Never select `*` for members: admin_notes, meeting_url, selected_user_ids stay private.
const MENTOR_COLUMNS = 'id, full_name, photo_url, job_title, organisation, bio, industry, subfields, expertise, guidance_topics, mentorship_types, active, publish_public_profile';
const SESSION_COLUMNS = `id, title, mentorship_type, industry, subfield, description, starts_at, registration_deadline, capacity, access_level, replay_url, resources,
  eligibility, status, timezone, recording_allowed, published_at, completed_at, cancelled_at, audience_type, audience_fields, audience_subfields,
  notification_channels, distribution_surfaces, feature_level, mentor_confirmed_at, attendance_recorded_at, replay_expected, created_at, updated_at`;
const prefixed = (alias: string, cols: string) => cols.split(',').map((c) => `${alias}.${c.trim()}`).join(', ');

async function sessionLevels(env: Env, userId: string | undefined) {
  const levels = await readableLevels(env, userId);
  return levels.includes('members') ? ['open', 'members'] : ['open'];
}

// ---------- public ----------

export const mentorship = router();

mentorship.get('/mentors', optionalUser, async (c) => {
  const { results } = await c.env.DB.prepare(`select ${MENTOR_COLUMNS} from mentors where active = 1 and publish_public_profile = 1 order by full_name`).all();
  return c.json(decodeAll('mentors', results));
});

mentorship.get('/mentors/:id', optionalUser, async (c) => {
  const row = await c.env.DB.prepare(`select ${MENTOR_COLUMNS} from mentors where id = ? and active = 1 and publish_public_profile = 1`).bind(c.req.param('id')).first();
  return c.json(decode('mentors', row));
});

mentorship.get('/sessions', optionalUser, async (c) => {
  const levels = await sessionLevels(c.env, c.get('userId'));
  const db = c.env.DB;
  const [sessions, links] = await db.batch([
    db.prepare(`select ${SESSION_COLUMNS} from mentorship_sessions where status in ('published', 'upcoming', 'live', 'completed')
                and access_level in (${levels.map(() => '?').join(', ')}) order by starts_at`).bind(...levels),
    db.prepare(`select l.session_id, ${prefixed('m', MENTOR_COLUMNS)} from mentorship_session_mentors l join mentors m on m.id = l.mentor_id
                where m.active = 1 and m.publish_public_profile = 1`),
  ]);
  const mentorsBySession = new Map<string, unknown[]>();
  for (const row of links.results as Record<string, unknown>[]) {
    const { session_id, ...mentor } = row;
    mentorsBySession.set(String(session_id), [...(mentorsBySession.get(String(session_id)) ?? []), decode('mentors', mentor)]);
  }
  return c.json(decodeAll<{ id: string }>('mentorship_sessions', sessions.results as Record<string, unknown>[])
    .map((s) => ({ ...s, mentors: mentorsBySession.get(s.id) ?? [] })));
});

// ---------- member ----------

mentorship.get('/registrations', requireUser, async (c) => {
  const { results } = await c.env.DB.prepare('select * from mentorship_registrations where user_id = ? order by registered_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('mentorship_registrations', results));
});

mentorship.post('/sessions/:id/register', requireUser, async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const session = await c.env.DB.prepare('select status, registration_deadline, starts_at, access_level, capacity from mentorship_sessions where id = ?').bind(sessionId)
    .first<{ status: string; registration_deadline: string | null; starts_at: string; access_level: string; capacity: number | null }>();
  if (!session || !['published', 'upcoming'].includes(session.status)) throw new HttpError(404, 'This mentorship session is not open for registration');
  if (session.registration_deadline && session.registration_deadline < nowIso()) throw new HttpError(400, 'Registration has closed');
  if (session.starts_at <= nowIso()) throw new HttpError(400, 'This session has already started');
  if (!(await sessionLevels(c.env, userId)).includes(session.access_level)) throw new HttpError(403, 'Verified GWMB membership is required');
  const existing = await c.env.DB.prepare('select * from mentorship_registrations where user_id = ? and session_id = ?').bind(userId, sessionId).first<{ status: string }>();
  if (existing && existing.status !== 'cancelled') return c.json(decode('mentorship_registrations', existing));
  await enforceRateLimit(c.env, userId, 'mentorship_session_registration', 30, 3600);
  const now = nowIso();
  // Seat count and insert in one statement, so concurrent registrations cannot overfill the session.
  const row = await c.env.DB.prepare(
    `insert into mentorship_registrations (user_id, session_id, status, attendance_status, reminder_status, registered_at, updated_at)
     select ?1, ?2, s.status_choice, 'not_recorded', case when s.status_choice = 'registered' then 'scheduled' else 'not_required' end, ?4, ?4
     from (select case when ?3 is not null and (select count(*) from mentorship_registrations where session_id = ?2 and status = 'registered') >= ?3
       then 'waitlisted' else 'registered' end as status_choice) s
     where true
     on conflict (user_id, session_id) do update set status = excluded.status, attendance_status = 'not_recorded',
       reminder_status = excluded.reminder_status, registered_at = excluded.registered_at, updated_at = excluded.updated_at
     returning *`,
  ).bind(userId, sessionId, session.capacity, now).first();
  return c.json(decode('mentorship_registrations', row));
});

// Members may cancel their own seat only before attendance is recorded.
mentorship.post('/sessions/:id/cancel', requireUser, async (c) => {
  const row = await c.env.DB.prepare(
    "update mentorship_registrations set status = 'cancelled', updated_at = ? where user_id = ? and session_id = ? and attendance_status = 'not_recorded' returning *",
  ).bind(nowIso(), c.get('userId'), c.req.param('id')).first();
  if (!row) throw new HttpError(404, 'No cancellable seat was found for this session.');
  return c.json(decode('mentorship_registrations', row));
});

mentorship.get('/interests', requireUser, async (c) => {
  const { results } = await c.env.DB.prepare('select industry, subfield, notifications_enabled from mentorship_industry_interests where user_id = ?').bind(c.get('userId')).all();
  return c.json(decodeAll('mentorship_industry_interests', results));
});

mentorship.put('/interests', requireUser, async (c) => {
  const input = await body(c, z.object({ industry: z.string().trim().min(1).max(160), subfield: z.string().trim().max(160).default(''), notifications_enabled: z.boolean().default(true) }));
  await c.env.DB.prepare(
    `insert into mentorship_industry_interests (user_id, industry, subfield, notifications_enabled) values (?, ?, ?, ?)
     on conflict (user_id, industry, subfield) do update set notifications_enabled = excluded.notifications_enabled, updated_at = ?`,
  ).bind(c.get('userId'), input.industry, input.subfield, input.notifications_enabled ? 1 : 0, nowIso()).run();
  return c.json({ ok: true });
});

mentorship.get('/applications', requireUser, async (c) => {
  const db = c.env.DB;
  const apps = decodeAll<Record<string, unknown> & { requested_mentor_id: string | null; assigned_mentor_id: string | null }>('mentorship_applications',
    (await db.prepare('select * from mentorship_applications where user_id = ? order by submitted_at desc').bind(c.get('userId')).all()).results);
  const ids = [...new Set(apps.flatMap((a) => [a.requested_mentor_id, a.assigned_mentor_id]).filter((x): x is string => Boolean(x)))];
  const mentors = ids.length
    ? decodeAll<{ id: string }>('mentors', (await db.prepare(`select ${MENTOR_COLUMNS} from mentors where id in (${ids.map(() => '?').join(', ')})`).bind(...ids).all()).results)
    : [];
  const byId = new Map(mentors.map((m) => [m.id, m]));
  return c.json(apps.map((a) => ({
    ...a,
    requested_mentor: a.requested_mentor_id ? byId.get(a.requested_mentor_id) ?? null : null,
    assigned_mentor: a.assigned_mentor_id ? byId.get(a.assigned_mentor_id) ?? null : null,
  })));
});

const applicationInput = z.object({
  requested_mentor_id: z.string().max(120).nullish(),
  recommend_for_me: z.boolean().nullish(),
  industry: z.string().trim().min(2, 'Complete your career field, guidance need, desired outcome and career stage').max(160),
  guidance_request: z.string().trim().min(10, 'Complete your career field, guidance need, desired outcome and career stage').max(1500),
  desired_outcome: z.string().trim().min(10, 'Complete your career field, guidance need, desired outcome and career stage').max(1500),
  career_stage: z.string().trim().min(2, 'Complete your career field, guidance need, desired outcome and career stage').max(100),
  supporting_information: z.string().trim().max(4000).nullish(),
});

mentorship.post('/applications', requireUser, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  if (!(await db.prepare("select 1 from memberships where user_id = ? and status = 'verified'").bind(userId).first())) throw new HttpError(403, 'Verified GWMB membership is required');
  const existing = await db.prepare("select * from mentorship_applications where user_id = ? and status not in ('not_approved', 'completed') order by submitted_at desc limit 1").bind(userId).first();
  if (existing) return c.json(decode('mentorship_applications', existing));
  const input = await body(c, applicationInput);
  if (!input.recommend_for_me && !input.requested_mentor_id) throw new HttpError(400, 'Choose a mentor or ask GWMB to recommend one');
  if (input.requested_mentor_id) {
    const available = await db.prepare(
      "select 1 from mentors m where m.id = ? and m.active = 1 and exists (select 1 from json_each(m.mentorship_types) t where t.value = 'one_on_one')",
    ).bind(input.requested_mentor_id).first();
    if (!available) throw new HttpError(400, 'The selected mentor is not available for one-on-one mentorship');
  }
  await enforceRateLimit(c.env, userId, 'mentorship_application', 3, 86_400);
  const row = await db.prepare(
    `insert into mentorship_applications (user_id, requested_mentor_id, recommend_for_me, industry, guidance_request, desired_outcome, career_stage, supporting_information, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'submitted') returning *`,
  ).bind(userId, input.requested_mentor_id ?? null, input.recommend_for_me ? 1 : 0, input.industry, input.guidance_request, input.desired_outcome,
    input.career_stage, input.supporting_information || null).first();
  return c.json(decode('mentorship_applications', row), 201);
});

// The private booking link is released only for the member's own approved application.
mentorship.get('/applications/:id/booking', requireUser, async (c) => {
  const row = await c.env.DB.prepare(
    `select b.booking_url from mentorship_applications a join mentorship_booking_links b on b.mentor_id = a.assigned_mentor_id
     where a.id = ? and a.user_id = ? and a.status in ('approved', 'booking_access_released') and a.booking_link_released = 1`,
  ).bind(c.req.param('id'), c.get('userId')).first<{ booking_url: string }>();
  return c.json({ booking_url: row?.booking_url ?? null });
});

// ---------- admin ----------

export const adminMentorship = router();
adminMentorship.use('*', requireUser, requireAdmin);

const LIMIT = 500;

adminMentorship.get('/', async (c) => {
  await refreshMentorshipTasks(c.env);
  const db = c.env.DB;
  const [applications, mentors, operations, sessions, links, registrations, tasks] = await db.batch([
    db.prepare('select * from mentorship_applications order by submitted_at desc limit ?').bind(LIMIT),
    db.prepare('select * from mentors order by full_name limit ?').bind(LIMIT),
    db.prepare('select * from mentor_operations order by submitted_at desc limit ?').bind(LIMIT),
    db.prepare('select * from mentorship_sessions order by starts_at desc limit ?').bind(LIMIT),
    db.prepare('select * from mentorship_session_mentors limit ?').bind(LIMIT * 2),
    db.prepare('select * from mentorship_registrations order by registered_at desc limit ?').bind(LIMIT * 2),
    db.prepare("select * from mentorship_operations_tasks where status = 'open' order by due_at limit 100"),
  ]);
  const rows = (r: D1Result) => r.results as Record<string, unknown>[];
  return c.json({
    applications: decodeAll('mentorship_applications', rows(applications)),
    mentors: decodeAll('mentors', rows(mentors)),
    operations: decodeAll('mentor_operations', rows(operations)),
    sessions: decodeAll('mentorship_sessions', rows(sessions)),
    sessionMentors: rows(links),
    registrations: decodeAll('mentorship_registrations', rows(registrations)),
    tasks: decodeAll('mentorship_operations_tasks', rows(tasks)),
  });
});

const applicationPatch = z.object({
  status: z.enum(['submitted', 'under_review', 'more_information_required', 'approved', 'mentor_assigned', 'booking_access_released', 'not_approved', 'completed']).optional(),
  assigned_mentor_id: z.string().max(120).nullable().optional(),
  admin_comments: z.string().max(4000).nullable().optional(),
  preparation_instructions: z.string().max(4000).nullable().optional(),
  booking_link_released: z.boolean().optional(),
  approved_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

adminMentorship.patch('/applications/:id', async (c) => {
  const data = encode('mentorship_applications', { ...(await body(c, applicationPatch)), updated_at: nowIso() });
  const cols = Object.keys(data);
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`update mentorship_applications set ${cols.map((col) => `${col} = ?`).join(', ')} where id = ? returning *`)
    .bind(...cols.map((col) => data[col]), id).first();
  if (!row) throw new HttpError(404, 'This application no longer exists.');
  await audit(c.env, c.get('userId'), 'update', 'mentorship_applications', id, { status: data.status ?? null });
  return c.json(decode('mentorship_applications', row));
});

const list = z.array(z.string().max(200)).max(100);
const mentorInput = z.object({
  id: z.string().trim().min(1).max(120), full_name: z.string().trim().min(1).max(200), photo_url: z.string().max(2048).nullish(),
  job_title: z.string().trim().max(200), organisation: z.string().trim().max(200), bio: z.string().max(10_000), industry: z.string().trim().max(160),
  subfields: list.optional(), expertise: list, guidance_topics: list, mentorship_types: z.array(z.enum(['discovery', 'industry', 'one_on_one', 'webinar_training'])),
  active: z.boolean(), publish_public_profile: z.boolean().optional(), admin_notes: z.string().max(10_000).nullish(),
  booking_url: z.string().trim().url().max(2048).optional().or(z.literal('')),
});

async function upsert(db: D1Database, table: string, key: string, values: Record<string, unknown>) {
  const data = encode(table, values);
  const cols = Object.keys(data);
  const updates = cols.filter((col) => col !== key).map((col) => `${col} = excluded.${col}`);
  return db.prepare(
    `insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})
     on conflict (${key}) do ${updates.length ? `update set ${updates.join(', ')}` : 'nothing'}`,
  ).bind(...cols.map((col) => data[col]));
}

adminMentorship.put('/mentors', async (c) => {
  const { booking_url, ...mentor } = await body(c, mentorInput);
  const statements = [await upsert(c.env.DB, 'mentors', 'id', { ...mentor, updated_at: nowIso() })];
  if (booking_url) statements.push(await upsert(c.env.DB, 'mentorship_booking_links', 'mentor_id', { mentor_id: mentor.id, booking_url, updated_at: nowIso() }));
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

const operationsInput = z.object({
  email: z.string().trim().email().max(254), phone: z.string().max(60).nullish(), linkedin_url: z.string().max(1000).nullish(),
  status: z.enum(['new_submission', 'under_review', 'confirmed', 'active', 'paused', 'inactive']).optional(), source: z.string().max(60).optional(),
  external_identifier: z.string().max(200).nullish(), preferred_frequency: z.string().max(120).nullish(), preferred_days: list.optional(), preferred_times: list.optional(),
  general_availability: z.string().max(2000).nullish(), discovery_available: z.boolean().optional(), industry_available: z.boolean().optional(),
  one_on_one_available: z.boolean().optional(), one_on_one_capacity: z.number().int().min(0).optional(), private_booking_url: z.string().max(2048).nullish(),
  available_dates: list.optional(), recording_consent: z.boolean().optional(), limitations: z.string().max(4000).nullish(), internal_notes: z.string().max(10_000).nullish(),
  availability_last_confirmed_at: z.string().nullish(), availability_confirmed_until: z.string().max(40).nullish(), availability_confirmation_due: z.string().max(40).nullish(),
  availability_status: z.enum(['active', 'unavailable']).optional(), next_available_period: z.string().max(200).nullish(),
});

adminMentorship.put('/mentors/:id/operations', async (c) => {
  const input = await body(c, operationsInput);
  const mentorId = c.req.param('id');
  const statements = [await upsert(c.env.DB, 'mentor_operations', 'mentor_id', { ...input, mentor_id: mentorId, updated_at: nowIso() })];
  if (input.private_booking_url) statements.push(await upsert(c.env.DB, 'mentorship_booking_links', 'mentor_id', { mentor_id: mentorId, booking_url: input.private_booking_url, updated_at: nowIso() }));
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

adminMentorship.post('/mentors/:id/status', async (c) => {
  const { status } = await body(c, z.object({ status: z.enum(['new_submission', 'under_review', 'confirmed', 'active', 'paused', 'inactive']) }));
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('update mentor_operations set status = ?, updated_at = ? where mentor_id = ?').bind(status, nowIso(), id),
    c.env.DB.prepare('update mentors set active = ?, updated_at = ? where id = ?').bind(status === 'active' || status === 'confirmed' ? 1 : 0, nowIso(), id),
  ]);
  return c.json({ ok: true });
});

adminMentorship.post('/mentors/:id/publish', async (c) => {
  const { published } = await body(c, z.object({ published: z.boolean() }));
  const sql = published ? 'update mentors set publish_public_profile = 1, active = 1, updated_at = ? where id = ?' : 'update mentors set publish_public_profile = 0, updated_at = ? where id = ?';
  await c.env.DB.prepare(sql).bind(nowIso(), c.req.param('id')).run();
  return c.json({ ok: true });
});

const sessionInput = z.object({
  id: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(300),
  mentorship_type: z.enum(['discovery', 'industry', 'webinar_training']), industry: z.string().trim().max(160), subfield: z.string().max(160).optional(),
  description: z.string().max(20_000), starts_at: z.string(), registration_deadline: z.string().nullish(), capacity: z.number().int().positive().nullish(),
  access_level: z.enum(['open', 'members']), meeting_url: z.string().max(2048).nullish(), replay_url: z.string().max(2048).nullish(),
  resources: z.array(z.unknown()).max(100).optional(), eligibility: z.string().max(4000).nullish(),
  status: z.enum(['draft', 'scheduled', 'published', 'upcoming', 'live', 'completed', 'cancelled']), timezone: z.string().max(80).optional(),
  recording_allowed: z.boolean().optional(), published_at: z.string().nullish(), completed_at: z.string().nullish(),
  audience_type: z.enum(['everyone', 'members', 'career_field', 'subfield', 'selected_users']).optional(),
  audience_fields: list.optional(), audience_subfields: list.optional(), selected_user_ids: z.array(z.string().max(64)).max(5000).optional(),
  notification_channels: z.array(z.enum(['in_app', 'push', 'email'])).optional(),
  distribution_surfaces: z.array(z.enum(['mentorship', 'learn', 'home', 'related_courses'])).optional(),
  feature_level: z.enum(['normal', 'featured', 'priority']).optional(), mentor_confirmed_at: z.string().nullish(), replay_expected: z.boolean().optional(),
  mentor_id: z.string().max(120).optional(),
});

adminMentorship.put('/sessions', async (c) => {
  const { mentor_id, ...session } = await body(c, sessionInput);
  const now = nowIso();
  // Lifecycle stamps (previously set by the app before saving).
  const published = session.status === 'published' || session.status === 'upcoming';
  const lifecycle = {
    ...session,
    published_at: published ? session.published_at || now : session.published_at,
    completed_at: session.status === 'completed' ? session.completed_at || now : session.completed_at,
    cancelled_at: session.status === 'cancelled' ? now : undefined,
    updated_at: now,
  };
  await (await upsert(c.env.DB, 'mentorship_sessions', 'id', lifecycle)).run();
  if (mentor_id) {
    await c.env.DB.prepare('insert or ignore into mentorship_session_mentors (session_id, mentor_id) values (?, ?)').bind(session.id, mentor_id).run();
  }
  await audit(c.env, c.get('userId'), 'upsert', 'mentorship_sessions', session.id, { status: session.status });
  return c.json(decode('mentorship_sessions', await c.env.DB.prepare('select * from mentorship_sessions where id = ?').bind(session.id).first()));
});

adminMentorship.patch('/registrations/:id/attendance', async (c) => {
  const { attendance_status } = await body(c, z.object({ attendance_status: z.enum(['attended', 'absent']) }));
  const row = await c.env.DB.prepare('update mentorship_registrations set attendance_status = ?, updated_at = ? where id = ? returning *').bind(attendance_status, nowIso(), c.req.param('id')).first();
  if (!row) throw new HttpError(404, 'This registration no longer exists.');
  return c.json(decode('mentorship_registrations', row));
});

adminMentorship.post('/tasks/:id/complete', async (c) => {
  await c.env.DB.prepare("update mentorship_operations_tasks set status = 'completed', completed_at = ?, updated_at = ? where id = ?").bind(nowIso(), nowIso(), c.req.param('id')).run();
  return c.json({ ok: true });
});
