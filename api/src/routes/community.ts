// Community and chapters: cliques, community preferences, volunteering, local chapter activities,
// live attendance and participation. Ports the RLS on these tables and the chapter functions in
// 202610200002/202610200004/202610300002 (create_local_activity, get_chapter_activity_roster,
// confirm_local_attendance, complete_local_activity, request_live_attendance, get_my_* helpers,
// submit_volunteer_application, list/assign/set_chapter_admin*). Admin calendar reminders for local
// activities are SQLite triggers in 0005_notification_triggers.sql.
import { z } from 'zod';
import { decode, decodeAll, isoTime } from '../db';
import { audit, body, HttpError, nowIso, requireAdmin, requireUser, router } from '../http';
import { isAdmin } from '../identity';
import { enforceRateLimit } from '../rate-limit';
import type { Env } from '../env';

const JOIN_OPENS_MS = 30 * 60_000;
const DEFAULT_LENGTH_MS = 4 * 60 * 60_000;
const PARTICIPATION_THRESHOLD = 70;

async function isVerified(env: Env, userId: string) {
  return Boolean(await env.DB.prepare("select 1 from memberships where user_id = ? and status = 'verified'").bind(userId).first());
}

/** `is_chapter_admin`: app admins, or an active admin of this chapter. */
async function isChapterAdmin(env: Env, userId: string, chapterId: string) {
  if (await isAdmin(env, { kind: 'user', id: userId, email: '' })) return true;
  return Boolean(await env.DB.prepare('select 1 from chapter_admins where chapter_id = ? and user_id = ? and active = 1').bind(chapterId, userId).first());
}

async function activityChapter(env: Env, activityId: string) {
  return env.DB.prepare('select a.chapter_id, c.name as chapter_name from local_activities a join chapters c on c.id = a.chapter_id where a.id = ?')
    .bind(activityId).first<{ chapter_id: string; chapter_name: string }>();
}

async function requireChapterAdminFor(env: Env, userId: string, activityId: string) {
  const activity = await activityChapter(env, activityId);
  if (!activity || !(await isChapterAdmin(env, userId, activity.chapter_id))) throw new HttpError(403, 'Chapter admin access required');
  return activity;
}

// ---------- member ----------

export const community = router();
community.use('*', requireUser);

community.get('/cliques', async (c) => {
  const { results } = await c.env.DB.prepare('select clique_id from clique_memberships where user_id = ? order by joined_at desc').bind(c.get('userId')).all<{ clique_id: string }>();
  return c.json(results.map((r) => r.clique_id));
});

community.put('/cliques/:cliqueId', async (c) => {
  if (!(await isVerified(c.env, c.get('userId')))) throw new HttpError(403, 'Verified GWMB membership is required to join a clique.');
  await c.env.DB.prepare('insert or ignore into clique_memberships (user_id, clique_id) values (?, ?)').bind(c.get('userId'), c.req.param('cliqueId')).run();
  return c.json({ ok: true });
});

community.get('/clique-seats', async (c) => {
  if (!(await isVerified(c.env, c.get('userId')))) return c.json([]);
  const { results } = await c.env.DB.prepare("select session_id from clique_session_seats where user_id = ? and status = 'saved' order by saved_at desc")
    .bind(c.get('userId')).all<{ session_id: string }>();
  return c.json(results.map((r) => r.session_id));
});

community.put('/clique-seats/:sessionId', async (c) => {
  if (!(await isVerified(c.env, c.get('userId')))) throw new HttpError(403, 'Verified GWMB membership is required to save a seat.');
  const now = nowIso();
  await c.env.DB.prepare(
    `insert into clique_session_seats (user_id, session_id, status, saved_at, updated_at) values (?, ?, 'saved', ?, ?)
     on conflict (user_id, session_id) do update set status = 'saved', saved_at = excluded.saved_at, updated_at = excluded.updated_at`,
  ).bind(c.get('userId'), c.req.param('sessionId'), now, now).run();
  return c.json({ ok: true });
});

community.get('/preferences', async (c) => {
  return c.json(await c.env.DB.prepare('select member_type, location, campus from community_preferences where user_id = ?').bind(c.get('userId')).first());
});

community.put('/preferences', async (c) => {
  const input = await body(c, z.object({
    member_type: z.enum(['student', 'graduate', 'professional']),
    location: z.string().trim().min(1, 'Choose your location.').max(160),
    campus: z.string().trim().max(160).nullish(),
  }));
  await c.env.DB.prepare(
    `insert into community_preferences (user_id, member_type, location, campus, updated_at) values (?, ?, ?, ?, ?)
     on conflict (user_id) do update set member_type = excluded.member_type, location = excluded.location, campus = excluded.campus, updated_at = excluded.updated_at`,
  ).bind(c.get('userId'), input.member_type, input.location, input.campus || null, nowIso()).run();
  return c.json({ ok: true });
});

const DETAIL = 'Complete every field and add a little more detail';
const volunteerInput = z.object({
  full_name: z.string().trim().min(2, DETAIL).max(180),
  location: z.string().trim().min(2, DETAIL).max(180),
  interest_area: z.string().trim().min(2, DETAIL).max(180),
  availability: z.string().trim().min(3, DETAIL).max(1000),
  motivation: z.string().trim().min(20, DETAIL).max(5000),
});

community.post('/volunteer', async (c) => {
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare("select * from volunteer_applications where user_id = ? and status in ('submitted', 'under_review', 'accepted') order by submitted_at desc limit 1")
    .bind(userId).first();
  if (existing) return c.json(decode('volunteer_applications', existing));
  const input = await body(c, volunteerInput);
  await enforceRateLimit(c.env, userId, 'volunteer_application', 3, 86_400);
  const row = await c.env.DB.prepare(
    `insert into volunteer_applications (user_id, full_name, email, location, interest_area, availability, motivation, status)
     values (?, ?, ?, ?, ?, ?, ?, 'submitted') returning *`,
  ).bind(userId, input.full_name, c.get('userEmail'), input.location, input.interest_area, input.availability, input.motivation).first();
  return c.json(decode('volunteer_applications', row), 201);
});

community.get('/attendance', async (c) => {
  const { results } = await c.env.DB.prepare(
    `select aa.id, a.id as activity_id, a.title, a.kind, ch.name as chapter_name, a.starts_at, a.venue, aa.status, aa.confirmed_at
     from local_activity_attendance aa join local_activities a on a.id = aa.activity_id join chapters ch on ch.id = a.chapter_id
     where aa.user_id = ? order by a.starts_at desc`,
  ).bind(c.get('userId')).all();
  return c.json(results);
});

/** Activities in the member's chapter whose attendance window (30 min before start until the end) is open now. */
community.get('/live-activities', async (c) => {
  const userId = c.get('userId');
  if (!(await isVerified(c.env, userId))) return c.json([]);
  const { results } = await c.env.DB.prepare(
    `select a.id, a.title, a.kind, ch.name as chapter_name, a.starts_at, a.ends_at, a.venue, rq.status as request_status
     from local_activities a join chapters ch on ch.id = a.chapter_id
     join membership_records mr on mr.linked_user_id = ?1 and lower(trim(mr.chapter)) = lower(trim(ch.name))
     left join local_attendance_requests rq on rq.activity_id = a.id and rq.user_id = ?1
     where a.status = 'published' order by a.starts_at`,
  ).bind(userId).all<{ starts_at: string; ends_at: string | null } & Record<string, unknown>>();
  const now = Date.now();
  const open = results.filter((a) => {
    const start = Date.parse(a.starts_at);
    const end = a.ends_at ? Date.parse(a.ends_at) : start + DEFAULT_LENGTH_MS;
    return now >= start - JOIN_OPENS_MS && now <= end;
  });
  return c.json(open.map(({ ends_at: _, ...a }) => a));
});

community.post('/activities/:id/attendance-request', async (c) => {
  const userId = c.get('userId');
  const activityId = c.req.param('id');
  const activity = await c.env.DB.prepare(
    'select a.status, a.starts_at, a.ends_at, ch.name as chapter_name from local_activities a join chapters ch on ch.id = a.chapter_id where a.id = ?',
  ).bind(activityId).first<{ status: string; starts_at: string; ends_at: string | null; chapter_name: string }>();
  const start = activity ? Date.parse(activity.starts_at) : NaN;
  const end = activity?.ends_at ? Date.parse(activity.ends_at) : start + DEFAULT_LENGTH_MS;
  if (!activity || activity.status !== 'published' || !(Date.now() >= start - JOIN_OPENS_MS && Date.now() <= end)) {
    throw new HttpError(400, 'Attendance opens 30 minutes before the activity and closes when it ends');
  }
  const member = await c.env.DB.prepare(
    `select 1 from memberships m join membership_records r on r.id = m.membership_record_id
     where m.user_id = ? and m.status = 'verified' and lower(trim(r.chapter)) = lower(trim(?))`,
  ).bind(userId, activity.chapter_name).first();
  if (!member) throw new HttpError(403, 'Verified membership in this chapter is required');
  await c.env.DB.prepare('insert or ignore into local_attendance_requests (activity_id, user_id) values (?, ?)').bind(activityId, userId).run();
  const row = await c.env.DB.prepare('select status from local_attendance_requests where activity_id = ? and user_id = ?').bind(activityId, userId).first<{ status: string }>();
  return c.json({ status: row?.status ?? 'pending' });
});

community.get('/participation', async (c) => {
  const row = await c.env.DB.prepare(
    'select state, attended_count, eligible_count, participation_percentage, review_started_at, downgraded_at from membership_participation_status where user_id = ?',
  ).bind(c.get('userId')).first();
  return c.json(row ?? { state: 'good', attended_count: 0, eligible_count: 0, participation_percentage: 100, review_started_at: null, downgraded_at: null });
});

// ---------- chapter admins ----------

export const chapters = router();
chapters.use('*', requireUser);

chapters.get('/:chapterId/activities', async (c) => {
  const chapterId = c.req.param('chapterId');
  const admin = await isChapterAdmin(c.env, c.get('userId'), chapterId);
  const { results } = await c.env.DB.prepare(
    `select id, chapter_id, kind, title, description, starts_at, venue, status, members_only from local_activities
     where chapter_id = ? ${admin ? '' : "and status = 'published'"} order by starts_at desc`,
  ).bind(chapterId).all();
  return c.json(decodeAll('local_activities', results));
});

const activityInput = z.object({
  kind: z.enum(['event', 'project'], { message: 'Activity must be an event or project' }),
  title: z.string().trim().min(3, 'Add a title of at least 3 characters.').max(180),
  description: z.string().trim().max(4000).nullish(),
  startsAt: z.string(),
  venue: z.string().trim().min(1, 'Add a venue.').max(300),
});

chapters.post('/:chapterId/activities', async (c) => {
  const chapterId = c.req.param('chapterId');
  if (!(await isChapterAdmin(c.env, c.get('userId'), chapterId))) throw new HttpError(403, 'Chapter admin access required');
  const input = await body(c, activityInput);
  const row = await c.env.DB.prepare(
    'insert into local_activities (chapter_id, kind, title, description, starts_at, venue, created_by) values (?, ?, ?, ?, ?, ?, ?) returning id',
  ).bind(chapterId, input.kind, input.title, input.description || null, isoTime(input.startsAt, 'start time'), input.venue, c.get('userId')).first<{ id: string }>();
  return c.json({ id: row?.id }, 201);
});

chapters.get('/activities/:id/roster', async (c) => {
  const activityId = c.req.param('id');
  const activity = await requireChapterAdminFor(c.env, c.get('userId'), activityId);
  const { results } = await c.env.DB.prepare(
    `select r.linked_user_id as user_id, p.full_name, u.email, r.member_identifier, aa.status as attendance_status,
       rq.status as attendance_request_status, aa.confirmed_at
     from membership_records r
     join memberships m on m.user_id = r.linked_user_id and m.status = 'verified'
     join "user" u on u.id = r.linked_user_id
     left join profiles p on p.id = r.linked_user_id
     left join local_activity_attendance aa on aa.activity_id = ?1 and aa.user_id = r.linked_user_id
     left join local_attendance_requests rq on rq.activity_id = ?1 and rq.user_id = r.linked_user_id
     where r.linked_user_id is not null and lower(trim(r.chapter)) = lower(trim(?2))
     order by (rq.status = 'pending') desc, coalesce(p.full_name, u.email)`,
  ).bind(activityId, activity.chapter_name).all();
  return c.json(results);
});

chapters.post('/activities/:id/attendance', async (c) => {
  const activityId = c.req.param('id');
  const actor = c.get('userId');
  const activity = await requireChapterAdminFor(c.env, actor, activityId);
  const input = await body(c, z.object({ userId: z.string().max(64), attended: z.boolean(), note: z.string().trim().max(1000).nullish() }));
  const record = await c.env.DB.prepare(
    `select r.id from membership_records r join memberships m on m.user_id = r.linked_user_id and m.status = 'verified'
     where r.linked_user_id = ? and lower(trim(r.chapter)) = lower(trim(?)) limit 1`,
  ).bind(input.userId, activity.chapter_name).first<{ id: string }>();
  if (!record) throw new HttpError(400, 'This person is not a verified member of the activity chapter');
  const now = nowIso();
  const status = input.attended ? 'attended' : 'absent';
  await c.env.DB.batch([
    c.env.DB.prepare(
      `insert into local_activity_attendance (activity_id, user_id, membership_record_id, status, confirmed_by, confirmed_at, note) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (activity_id, user_id) do update set status = excluded.status, confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, note = excluded.note`,
    ).bind(activityId, input.userId, record.id, status, actor, now, input.note || null),
    c.env.DB.prepare('update local_attendance_requests set status = ?, reviewed_by = ?, reviewed_at = ? where activity_id = ? and user_id = ?')
      .bind(input.attended ? 'confirmed' : 'rejected', actor, now, activityId, input.userId),
  ]);
  return c.json({ ok: true });
});

type MemberStanding = { user_id: string; eligible: number; attended: number; previous: string | null; current_attended: number };

/** `complete_local_activity`: close the activity, mark non-attendees absent, and recompute participation. */
chapters.post('/activities/:id/complete', async (c) => {
  const activityId = c.req.param('id');
  const actor = c.get('userId');
  const activity = await requireChapterAdminFor(c.env, actor, activityId);
  const db = c.env.DB;
  const now = nowIso();
  const chapterMembers = `from memberships m join membership_records r on r.id = m.membership_record_id
    where m.status = 'verified' and lower(trim(r.chapter)) = lower(trim(?))`;
  await db.batch([
    db.prepare("update local_activities set status = 'completed', updated_at = ? where id = ?").bind(now, activityId),
    db.prepare(`insert into local_activity_attendance (activity_id, user_id, membership_record_id, status, confirmed_by, confirmed_at, note)
      select ?, m.user_id, m.membership_record_id, 'absent', ?, ?, 'No confirmed attendance before activity close.' ${chapterMembers}
      on conflict (activity_id, user_id) do nothing`).bind(activityId, actor, now, activity.chapter_name),
  ]);
  const { results } = await db.prepare(
    `select m.user_id,
       (select count(*) from local_activities a where a.chapter_id = ?1 and a.status = 'completed' and a.members_only = 1
          and a.starts_at >= coalesce(m.verified_at, '0000')) as eligible,
       (select count(*) from local_activities a join local_activity_attendance aa on aa.activity_id = a.id and aa.user_id = m.user_id and aa.status = 'attended'
          where a.chapter_id = ?1 and a.status = 'completed' and a.members_only = 1 and a.starts_at >= coalesce(m.verified_at, '0000')) as attended,
       (select state from membership_participation_status ps where ps.user_id = m.user_id) as previous,
       exists (select 1 from local_activity_attendance where activity_id = ?2 and user_id = m.user_id and status = 'attended') as current_attended
     from memberships m join membership_records r on r.id = m.membership_record_id
     where m.status = 'verified' and lower(trim(r.chapter)) = lower(trim(?3))`,
  ).bind(activity.chapter_id, activityId, activity.chapter_name).all<MemberStanding>();

  const writes: D1PreparedStatement[] = [];
  for (const m of results) {
    const percentage = m.eligible === 0 ? 100 : Math.round((m.attended / m.eligible) * 10_000) / 100;
    const upsert = (state: string, extra: string) => db.prepare(
      `insert into membership_participation_status (user_id, state, attended_count, eligible_count, participation_percentage, review_started_at, downgraded_at, updated_at)
       values (?1, ?2, ?3, ?4, ?5, case when ?2 = 'review' then ?6 end, case when ?2 = 'downgraded' then ?6 end, ?6)
       on conflict (user_id) do update set state = excluded.state, attended_count = excluded.attended_count, eligible_count = excluded.eligible_count,
         participation_percentage = excluded.participation_percentage, updated_at = excluded.updated_at${extra}`,
    ).bind(m.user_id, state, m.attended, m.eligible, percentage, now);
    if (percentage < PARTICIPATION_THRESHOLD && m.previous === 'review' && !m.current_attended) {
      writes.push(upsert('downgraded', ', downgraded_at = excluded.downgraded_at'));
      writes.push(db.prepare("update memberships set status = 'non_member', verified_at = null where user_id = ?").bind(m.user_id));
    } else if (percentage < PARTICIPATION_THRESHOLD) {
      writes.push(upsert('review', ', review_started_at = coalesce(membership_participation_status.review_started_at, excluded.review_started_at)'));
    } else {
      writes.push(upsert('good', ', review_started_at = null'));
    }
  }
  if (writes.length) await db.batch(writes);
  await audit(c.env, actor, 'complete', 'local_activities', activityId, { members: results.length });
  return c.json({ ok: true, members: results.length });
});

// ---------- app admins: chapter admin assignments ----------

export const adminChapters = router();
adminChapters.use('*', requireUser, requireAdmin);

adminChapters.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `select ca.id, ch.id as chapter_id, ch.name as chapter_name, ch.kind as chapter_kind, ca.user_id, p.full_name, u.email, ca.active
     from chapter_admins ca join chapters ch on ch.id = ca.chapter_id join "user" u on u.id = ca.user_id left join profiles p on p.id = ca.user_id
     order by ch.name, coalesce(p.full_name, u.email)`,
  ).all();
  return c.json(decodeAll('chapter_admins', results));
});

adminChapters.post('/', async (c) => {
  const input = await body(c, z.object({
    email: z.string().trim().email().max(254), chapterName: z.string().trim().min(2).max(160), chapterKind: z.enum(['city', 'campus']).default('city'),
  }));
  const actor = c.get('userId');
  const user = await c.env.DB.prepare('select id from "user" where lower(email) = lower(?)').bind(input.email).first<{ id: string }>();
  if (!user) throw new HttpError(404, 'No app account exists for this email');
  const chapter = await c.env.DB.prepare(
    `insert into chapters (name, kind, location) values (?1, ?2, ?1)
     on conflict (lower(trim(name))) do update set active = 1 returning id`,
  ).bind(input.chapterName, input.chapterKind).first<{ id: string }>();
  await c.env.DB.prepare(
    `insert into chapter_admins (chapter_id, user_id, created_by, active) values (?, ?, ?, 1)
     on conflict (chapter_id, user_id) do update set active = 1, created_by = excluded.created_by`,
  ).bind(chapter?.id, user.id, actor).run();
  await audit(c.env, actor, 'assign', 'chapter_admins', user.id, { chapter: input.chapterName });
  return c.json({ chapter_id: chapter?.id }, 201);
});

adminChapters.patch('/:id', async (c) => {
  const { active } = await body(c, z.object({ active: z.boolean() }));
  const row = await c.env.DB.prepare('update chapter_admins set active = ? where id = ? returning id').bind(active ? 1 : 0, c.req.param('id')).first();
  if (!row) throw new HttpError(404, 'This assignment no longer exists.');
  await audit(c.env, c.get('userId'), 'update', 'chapter_admins', c.req.param('id'), { active });
  return c.json({ ok: true });
});
