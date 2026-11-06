// Event registrations: event_registrations RLS (owner read; owner may only cancel),
// `register_for_event` (202610290001) and `get_registered_event_meeting` (202610290005).
// Confirmation and reminder notifications are SQLite triggers in 0005_notification_triggers.sql.
import { z } from 'zod';
import { readableLevels } from '../access';
import { decode, decodeAll } from '../db';
import { body, HttpError, nowIso, requireUser, router } from '../http';

export const events = router();
events.use('*', requireUser);

events.get('/registrations', async (c) => {
  const { results } = await c.env.DB.prepare('select * from event_registrations where user_id = ? order by registered_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('event_registrations', results));
});

events.get('/registrations/:eventId', async (c) => {
  const row = await c.env.DB.prepare('select * from event_registrations where user_id = ? and event_id = ?').bind(c.get('userId'), c.req.param('eventId')).first();
  return c.json(decode('event_registrations', row));
});

type EventRow = { id: string; slug: string; title: string; status: string; visible: number; access_level: string; publish_at: string | null; starts_at: string | null; metadata: string };

const registerInput = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(160),
  email: z.string().trim().email('Enter a valid email address').max(254),
  learningGoal: z.string().trim().max(1000).nullish(),
});

events.post('/:eventId/register', async (c) => {
  const input = await body(c, registerInput);
  const userId = c.get('userId');
  const now = nowIso();
  const event = await c.env.DB.prepare("select * from content_items where area = 'events' and (id = ?1 or slug = ?1)").bind(c.req.param('eventId')).first<EventRow>();
  if (!event || event.status !== 'published' || !event.visible || (event.publish_at && event.publish_at > now)) throw new HttpError(404, 'This event is not available');
  const levels = await readableLevels(c.env, userId);
  if (!levels.includes(event.access_level as never)) {
    if (event.access_level === 'members') throw new HttpError(403, 'Verified GWMB membership is required');
    throw new HttpError(404, 'This event is not available');
  }
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(event.metadata || '{}'); } catch { /* treat as empty */ }
  const deadline = Date.parse(String(meta.registration_deadline ?? ''));
  if (!Number.isNaN(deadline) && deadline < Date.now()) throw new HttpError(400, 'Registration has closed');
  if (event.starts_at && event.starts_at < now) throw new HttpError(400, 'This event has already started');

  const existing = await c.env.DB.prepare('select * from event_registrations where user_id = ? and event_id = ?').bind(userId, event.id).first<{ status: string }>();
  if (existing && existing.status !== 'cancelled') return c.json(decode('event_registrations', existing));

  const capacity = Number.parseInt(String(meta.capacity ?? ''), 10);
  const waitlistOnly = String(meta.bookingMode ?? '').toLowerCase() === 'waitlist';
  // Seat check and insert in one statement, so two people cannot both take the last seat.
  const row = await c.env.DB.prepare(
    `insert into event_registrations (user_id, event_id, event_title, event_starts_at, event_route, full_name, email, learning_goal, status, registered_at, updated_at)
     select ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
       case when ?9 = 1 then 'waitlisted'
            when ?10 is not null and (select count(*) from event_registrations where event_id = ?2 and status = 'registered') >= ?10 then 'waitlisted'
            else 'registered' end, ?11, ?11
     where true
     on conflict (user_id, event_id) do update set full_name = excluded.full_name, email = excluded.email, learning_goal = excluded.learning_goal,
       status = excluded.status, event_title = excluded.event_title, event_starts_at = excluded.event_starts_at, event_route = excluded.event_route,
       registered_at = excluded.registered_at, updated_at = excluded.updated_at
     returning *`,
  ).bind(userId, event.id, event.title, event.starts_at, `/event/${event.slug}`, input.fullName, input.email.toLowerCase(), input.learningGoal || null,
    waitlistOnly ? 1 : 0, Number.isNaN(capacity) ? null : capacity, now).first();
  return c.json(decode('event_registrations', row));
});

events.post('/:eventId/cancel', async (c) => {
  const row = await c.env.DB.prepare("update event_registrations set status = 'cancelled', updated_at = ? where user_id = ? and event_id = ? returning *")
    .bind(nowIso(), c.get('userId'), c.req.param('eventId')).first();
  if (!row) throw new HttpError(404, 'No registration was found for this event.');
  return c.json(decode('event_registrations', row));
});

const JOIN_OPENS_MS = 30 * 60_000;
const DEFAULT_LENGTH_MS = 4 * 60 * 60_000;

events.get('/:eventId/meeting', async (c) => {
  const levels = await readableLevels(c.env, c.get('userId'));
  const event = await c.env.DB.prepare(
    `select c.starts_at, c.ends_at, m.meeting_url from content_items c
     left join content_meetings m on m.content_id = c.id and m.status = 'ready'
     where c.area = 'events' and (c.id = ?1 or c.slug = ?1) and c.status = 'published' and c.visible = 1
       and c.access_level in (${levels.map((_, i) => `?${i + 3}`).join(', ')})
       and exists (select 1 from event_registrations r where r.event_id = c.id and r.user_id = ?2 and r.status = 'registered')`,
  ).bind(c.req.param('eventId'), c.get('userId'), ...levels).first<{ starts_at: string | null; ends_at: string | null; meeting_url: string | null }>();
  if (!event?.starts_at) return c.json(null);
  const start = Date.parse(event.starts_at);
  const opens = start - JOIN_OPENS_MS;
  const closes = event.ends_at ? Date.parse(event.ends_at) : start + DEFAULT_LENGTH_MS;
  const now = Date.now();
  const hasLink = Boolean(event.meeting_url?.trim());
  const open = hasLink && now >= opens && now <= closes;
  return c.json({
    meeting_url: open ? event.meeting_url : null,
    starts_at: event.starts_at,
    available_at: new Date(opens).toISOString(),
    closes_at: new Date(closes).toISOString(),
    join_available: open,
    unavailable_reason: !hasLink ? 'The meeting link has not been added yet.' : now < opens ? 'Joining opens 30 minutes before the event.' : now > closes ? 'The joining window has closed.' : null,
  });
});
