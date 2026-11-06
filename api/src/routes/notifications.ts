// In-app notifications, notification preferences, push devices and admin broadcasts.
// Ports the RLS on user_notifications / notification_preferences / push_devices, `register_push_device`
// (202610140006) and `queue_admin_notification` (202610280003). Delivery is the dispatcher's job (phase 4).
import { z } from 'zod';
import { decode, decodeAll, encode, isoTime } from '../db';
import { audit, body, nowIso, requireAdmin, requireUser, router } from '../http';

export const notifications = router();
notifications.use('*', requireUser);

notifications.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('select * from user_notifications where user_id = ? order by created_at desc limit 50').bind(c.get('userId')).all();
  return c.json(results);
});

notifications.get('/unread-count', async (c) => {
  const row = await c.env.DB.prepare('select count(*) as count from user_notifications where user_id = ? and read_at is null').bind(c.get('userId')).first<{ count: number }>();
  return c.json({ count: row?.count ?? 0 });
});

notifications.post('/read-all', async (c) => {
  await c.env.DB.prepare('update user_notifications set read_at = ? where user_id = ? and read_at is null').bind(nowIso(), c.get('userId')).run();
  return c.json({ ok: true });
});

notifications.post('/:id/read', async (c) => {
  await c.env.DB.prepare('update user_notifications set read_at = ? where user_id = ? and id = ?').bind(nowIso(), c.get('userId'), c.req.param('id')).run();
  return c.json({ ok: true });
});

/** The caller's preferences, created with the defaults on first read (as the app did before). */
notifications.get('/preferences', async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare('insert or ignore into notification_preferences (user_id) values (?)').bind(userId).run();
  return c.json(decode('notification_preferences', await c.env.DB.prepare('select * from notification_preferences where user_id = ?').bind(userId).first()));
});

const flag = z.boolean().optional();
const preferencesInput = z.object({
  push_enabled: flag, email_enabled: flag, sms_enabled: flag, whatsapp_enabled: flag, events_enabled: flag, opportunities_enabled: flag,
  learning_enabled: flag, community_enabled: flag, newsletter_enabled: flag, reminder_24h: flag, reminder_1h: flag, reminder_live: flag,
});

notifications.patch('/preferences', async (c) => {
  const data = encode('notification_preferences', await body(c, preferencesInput));
  const cols = Object.keys(data);
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    `insert into notification_preferences (user_id${cols.map((col) => `, ${col}`).join('')}) values (?${cols.map(() => ', ?').join('')})
     on conflict (user_id) do update set ${[...cols.map((col) => `${col} = excluded.${col}`), 'updated_at = ?'].join(', ')} returning *`,
  ).bind(userId, ...cols.map((col) => data[col]), nowIso()).first();
  return c.json(decode('notification_preferences', row));
});

// A token belongs to whichever account registered it last (a shared phone moves to the new account).
notifications.post('/push-devices', async (c) => {
  const input = await body(c, z.object({
    token: z.string().trim().min(10).max(300),
    device_name: z.string().trim().max(120).nullish(),
    platform: z.enum(['android', 'ios'], { message: 'Unsupported platform' }),
  }));
  const now = nowIso();
  await c.env.DB.prepare(
    `insert into push_devices (user_id, expo_push_token, device_name, platform, active, last_seen_at) values (?, ?, ?, ?, 1, ?)
     on conflict (expo_push_token) do update set user_id = excluded.user_id, device_name = excluded.device_name, platform = excluded.platform,
       active = 1, last_seen_at = excluded.last_seen_at`,
  ).bind(c.get('userId'), input.token, input.device_name ?? null, input.platform, now).run();
  return c.json({ ok: true });
});

// ---------- admin ----------

export const adminNotifications = router();
adminNotifications.use('*', requireUser, requireAdmin);

const STATUSES = ['pending', 'processing', 'sent', 'failed', 'skipped'] as const;

adminNotifications.get('/overview', async (c) => {
  const db = c.env.DB;
  const [members, mentors, tasks] = await db.batch([
    db.prepare('select status, count(*) as n from notification_outbox group by status'),
    db.prepare('select status, count(*) as n from mentor_communication_outbox group by status'),
    db.prepare("select id, title, detail, priority, due_at from mentorship_operations_tasks where status = 'open' order by due_at limit 8"),
  ]);
  const counts = Object.fromEntries(STATUSES.map((status) => [status,
    [...(members.results as { status: string; n: number }[]), ...(mentors.results as { status: string; n: number }[])]
      .filter((r) => r.status === status).reduce((sum, r) => sum + r.n, 0)]));
  return c.json({ counts, tasks: decodeAll('mentorship_operations_tasks', tasks.results as Record<string, unknown>[]) });
});

const broadcastInput = z.object({
  title: z.string().trim().min(1, 'Title and message are required').max(200),
  body: z.string().trim().min(1, 'Title and message are required').max(2000),
  route: z.string().trim().max(500).nullish(),
  scheduled_for: z.string().nullish(),
  audience: z.enum(['everyone', 'members', 'app-users']),
  channels: z.array(z.enum(['in_app', 'push', 'email', 'sms', 'whatsapp'])).min(1, 'Choose at least one channel').max(5),
});

adminNotifications.post('/broadcast', async (c) => {
  const input = await body(c, broadcastInput);
  const scheduledFor = input.scheduled_for ? isoTime(input.scheduled_for, 'scheduled time') : nowIso();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${input.title}${input.body}${scheduledFor}`));
  const batchKey = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  // One outbox row per recipient and channel; the dedupe key makes repeating the same broadcast a no-op.
  const result = await c.env.DB.prepare(
    `insert into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
     select u.id, ch.value, 'admin_broadcast', json_object('title', ?1, 'body', ?2, 'route', coalesce(?3, '/notifications')), ?4,
       'admin-broadcast:' || ?5 || ':' || u.id || ':' || ch.value
     from "user" u join json_each(?6) ch left join memberships m on m.user_id = u.id
     where ?7 = 'everyone' or (?7 = 'members' and m.status = 'verified') or (?7 = 'app-users' and coalesce(m.status, 'non_member') <> 'verified')
     on conflict (dedupe_key) where dedupe_key is not null do nothing`,
  ).bind(input.title, input.body, input.route || null, scheduledFor, batchKey, JSON.stringify([...new Set(input.channels)]), input.audience).run();
  const queued = result.meta.changes ?? 0;
  await audit(c.env, c.get('userId'), 'broadcast', 'notification_outbox', batchKey, { audience: input.audience, channels: input.channels, queued });
  return c.json({ queued });
});
