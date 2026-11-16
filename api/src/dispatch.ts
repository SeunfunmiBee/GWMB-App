// Notification delivery (port of the `notification-dispatch` Edge Function). Runs every minute from the Cron
// Trigger, and on demand from the admin "send now" button. Rows are claimed with one UPDATE ... RETURNING, so
// overlapping runs never deliver the same row twice.
import { decode } from './db';
import { emailConfigured, renderEmail, sendEmail, type EmailContent } from './email';
import type { Env } from './env';
import { publish } from './live';
import { nowIso } from './http';

const BATCH = 100;
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_EXPIRY_MS = 24 * 3600_000;

type OutboxRow = { id: string; user_id: string; channel: 'push' | 'in_app' | 'email'; template_key: string; payload: string };
type MentorRow = { id: string; mentor_id: string; session_id: string | null; recipient_email: string; template_key: string; payload: string };
type Preferences = Record<string, boolean | string | null>;
type PushTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };
type PushReceipt = PushTicket;
type Outcome = 'sent' | 'skipped' | 'failed';
export type DispatchSummary = { processed: number; sent: number; skipped: number; failed: number; receiptsChecked: number; receiptErrors: number };

class Skip extends Error {}

export async function dispatchNotifications(env: Env): Promise<DispatchSummary> {
  const receipts = await checkPushReceipts(env);
  const summary: DispatchSummary = { processed: 0, sent: 0, skipped: 0, failed: 0, receiptsChecked: receipts.checked, receiptErrors: receipts.errors };
  const count = (outcome: Outcome) => { summary.processed++; summary[outcome]++; };
  const now = nowIso();

  const { results: rows } = await env.DB.prepare(
    `update notification_outbox set status = 'processing', error_message = null
     where id in (select id from notification_outbox where status = 'pending' and scheduled_for <= ? and channel in ('push', 'in_app', 'email') order by scheduled_for limit ${BATCH})
     returning id, user_id, channel, template_key, payload`,
  ).bind(now).all<OutboxRow>();
  const inAppUsers = new Set<string>();
  for (const row of rows) {
    const outcome = await deliver(env, row);
    if (outcome === 'sent' && row.channel === 'in_app') inAppUsers.add(row.user_id);
    count(outcome);
  }

  const { results: mentorRows } = await env.DB.prepare(
    `update mentor_communication_outbox set status = 'processing', error_message = null
     where id in (select id from mentor_communication_outbox where status = 'pending' and scheduled_for <= ? order by scheduled_for limit ${BATCH})
     returning id, mentor_id, session_id, recipient_email, template_key, payload`,
  ).bind(now).all<MentorRow>();
  for (const row of mentorRows) count(await deliverMentor(env, row));

  // New in-app notifications reach open apps immediately; the admin console sees the outbox move.
  if (inAppUsers.size) await publish(env, { users: { ids: [...inAppUsers], topics: ['notifications'] } });
  if (summary.processed) await publish(env, { broadcast: ['admin'] });
  return summary;
}

async function deliver(env: Env, row: OutboxRow): Promise<Outcome> {
  try {
    const payload = parse(row.payload);
    const preferences = decode<Preferences>('notification_preferences', await env.DB.prepare('select * from notification_preferences where user_id = ?').bind(row.user_id).first());
    if (!categoryAllowed(row.template_key, preferences)) throw new Skip('Disabled in notification preferences');
    const title = String(payload.title ?? 'GWMB update');
    const text = String(payload.body ?? 'Open GWMB to see what is new.');
    const route = String(payload.route ?? '/notifications');
    if (row.channel === 'in_app') {
      await env.DB.prepare('insert into user_notifications (user_id, kind, title, body, route) values (?, ?, ?, ?, ?)').bind(row.user_id, row.template_key, title, text, route).run();
    } else if (row.channel === 'push') {
      if (!preferences?.push_enabled) throw new Skip('Push is disabled');
      await sendPush(env, row.id, row.user_id, { title, body: text, route });
    } else {
      if (preferences?.email_enabled === false) throw new Skip('Email is disabled');
      const user = await env.DB.prepare('select email from "user" where id = ?').bind(row.user_id).first<{ email: string }>();
      const to = String(payload.email ?? user?.email ?? '');
      if (!to || !emailConfigured(env)) throw new Skip('Email provider is not configured');
      await sendHtmlEmail(env, to, title, text, { title, body: text });
    }
    await finish(env, 'notification_outbox', row.id, 'sent');
    return 'sent';
  } catch (error) {
    const outcome = error instanceof Skip ? 'skipped' : 'failed';
    await finish(env, 'notification_outbox', row.id, outcome, error instanceof Error ? error.message : 'Notification delivery failed');
    return outcome;
  }
}

async function sendPush(env: Env, outboxId: string, userId: string, message: { title: string; body: string; route: string }) {
  const { results: devices } = await env.DB.prepare('select id, expo_push_token from push_devices where user_id = ? and active = 1').bind(userId).all<{ id: string; expo_push_token: string }>();
  if (!devices.length) throw new Skip('No active push device');
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(devices.map((d) => ({ to: d.expo_push_token, title: message.title, body: message.body, sound: 'default', priority: 'high', channelId: 'gwmb-reminders', data: { route: message.route } }))),
  });
  if (!res.ok) throw new Error(`Expo push returned ${res.status}`);
  const result = (await res.json()) as { data?: PushTicket[] | PushTicket; errors?: { message?: string }[] };
  const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (!tickets.length) throw new Error(result.errors?.[0]?.message ?? 'Expo returned no push tickets');
  const sentAt = nowIso();
  const statements = devices.flatMap((device, index) => {
    const ticket: PushTicket = tickets[index] ?? { status: 'error', message: 'Expo returned no ticket for this device' };
    const ok = ticket.status === 'ok';
    const errorCode = ticket.details?.error ?? null;
    const upsert = env.DB.prepare(
      `insert into notification_push_deliveries (outbox_id, device_id, expo_push_token, ticket_id, ticket_status, receipt_status, error_code, error_message, sent_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (outbox_id, expo_push_token) do update set device_id = excluded.device_id, ticket_id = excluded.ticket_id, ticket_status = excluded.ticket_status,
         receipt_status = excluded.receipt_status, error_code = excluded.error_code, error_message = excluded.error_message, sent_at = excluded.sent_at`,
    ).bind(outboxId, device.id, device.expo_push_token, ticket.id ?? null, ok ? 'accepted' : 'error', ok ? 'pending' : 'error', errorCode, ticket.message ?? null, sentAt);
    return errorCode === 'DeviceNotRegistered' ? [upsert, env.DB.prepare('update push_devices set active = 0 where id = ?').bind(device.id)] : [upsert];
  });
  await env.DB.batch(statements);
  if (!tickets.some((t) => t.status === 'ok' && t.id)) throw new Error(tickets.map((t) => t.message).filter(Boolean).join('; ') || 'Every push ticket was rejected');
}

/** Expo receipts become available ~15 minutes after sending; tickets with none after 24 hours are marked expired. */
async function checkPushReceipts(env: Env) {
  const now = Date.now();
  const eligibleBefore = new Date(now - RECEIPT_DELAY_MS).toISOString();
  const expiresAfter = new Date(now - RECEIPT_EXPIRY_MS).toISOString();
  await env.DB.prepare("update notification_push_deliveries set receipt_status = 'expired', receipt_checked_at = ?, error_message = 'No Expo receipt became available within 24 hours' where receipt_status = 'pending' and sent_at < ?")
    .bind(nowIso(), expiresAfter).run();
  const { results } = await env.DB.prepare("select id, device_id, ticket_id from notification_push_deliveries where receipt_status = 'pending' and ticket_id is not null and sent_at <= ? and sent_at >= ? limit 300")
    .bind(eligibleBefore, expiresAfter).all<{ id: string; device_id: string | null; ticket_id: string }>();
  if (!results.length) return { checked: 0, errors: 0 };
  const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ ids: results.map((r) => r.ticket_id) }),
  }).catch(() => null);
  if (!res?.ok) return { checked: 0, errors: 1 };
  const receipts = ((await res.json()) as { data?: Record<string, PushReceipt> }).data ?? {};
  let checked = 0;
  let errors = 0;
  const statements: D1PreparedStatement[] = [];
  for (const delivery of results) {
    const receipt = receipts[delivery.ticket_id];
    if (!receipt) continue;
    checked++;
    if (receipt.status === 'error') errors++;
    const errorCode = receipt.details?.error ?? null;
    statements.push(env.DB.prepare('update notification_push_deliveries set receipt_status = ?, receipt_checked_at = ?, error_code = ?, error_message = ? where id = ?')
      .bind(receipt.status === 'ok' ? 'delivered' : 'error', nowIso(), errorCode, receipt.message ?? null, delivery.id));
    if (errorCode === 'DeviceNotRegistered' && delivery.device_id) statements.push(env.DB.prepare('update push_devices set active = 0 where id = ?').bind(delivery.device_id));
  }
  if (statements.length) await env.DB.batch(statements);
  return { checked, errors };
}

async function deliverMentor(env: Env, row: MentorRow): Promise<Outcome> {
  try {
    const payload = parse(row.payload);
    const pending = row.recipient_email.endsWith('@mentor.pending');
    if (pending || !emailConfigured(env)) {
      // No way to email the mentor: hand it to an admin as a manual task instead.
      await env.DB.prepare(
        `insert into mentorship_operations_tasks (dedupe_key, mentor_id, session_id, kind, title, detail, priority, status) values (?, ?, ?, 'manual_mentor_reminder', ?, ?, ?, 'open')
         on conflict (dedupe_key) do update set title = excluded.title, detail = excluded.detail, priority = excluded.priority, status = 'open'`,
      ).bind(`mentor-message:${row.id}`, row.mentor_id, row.session_id, mentorTaskTitle(row.template_key), String(payload.title ?? 'Mentorship session'),
        /24h|1h/.test(row.template_key) ? 'high' : 'normal').run();
      throw new Skip(pending ? 'Mentor email needs confirmation' : 'Email provider is not configured');
    }
    const subject = mentorEmailTitle(row.template_key, payload);
    const { text, html } = mentorEmailBody(row.template_key, payload);
    await sendHtmlEmail(env, row.recipient_email, subject, text, { title: subject, ...html });
    await finish(env, 'mentor_communication_outbox', row.id, 'sent');
    return 'sent';
  } catch (error) {
    const outcome = error instanceof Skip ? 'skipped' : 'failed';
    await finish(env, 'mentor_communication_outbox', row.id, outcome, error instanceof Error ? error.message : 'Mentor reminder failed');
    return outcome;
  }
}

function finish(env: Env, table: 'notification_outbox' | 'mentor_communication_outbox', id: string, status: Outcome, errorMessage?: string) {
  return env.DB.prepare(`update ${table} set status = ?, error_message = ?, sent_at = ? where id = ?`)
    .bind(status, errorMessage?.slice(0, 1000) ?? null, status === 'sent' ? nowIso() : null, id).run();
}

export function categoryAllowed(key: string, preferences: Preferences | null) {
  if (!preferences) return true;
  if (key.includes('event') || key.includes('mentorship')) return preferences.events_enabled !== false;
  if (key.includes('opportunit') || key.includes('application')) return preferences.opportunities_enabled !== false;
  if (key.includes('learning') || key.includes('course')) return preferences.learning_enabled !== false;
  if (key.includes('community')) return preferences.community_enabled !== false;
  if (key.includes('newsletter')) return preferences.newsletter_enabled !== false;
  return true;
}

const sendHtmlEmail = (env: Env, to: string, subject: string, text: string, content: EmailContent) => sendEmail(env, to, subject, text, renderEmail(env, content));

function parse(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function mentorTaskTitle(key: string) {
  if (key.includes('24h')) return 'Send mentor 24-hour reminder';
  if (key.includes('1h')) return 'Send mentor final reminder';
  if (key.includes('7d')) return 'Send mentor 7-day reminder';
  if (key.includes('thank')) return 'Send mentor thank-you';
  return 'Send mentor session confirmation';
}

function mentorEmailTitle(key: string, payload: Record<string, unknown>) {
  const title = String(payload.title ?? 'your mentorship session');
  if (key.includes('thank')) return `Thank you for ${title}`;
  if (key.includes('confirmed')) return `Confirmed: ${title}`;
  return `Reminder: ${title}`;
}

function mentorEmailBody(key: string, payload: Record<string, unknown>) {
  const start = payload.starts_at
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(String(payload.starts_at)))
    : 'the scheduled time';
  const link = String(payload.meeting_url ?? '');
  const prefix = key.includes('confirmed') ? 'Your GWMB mentorship session is confirmed.' : 'A reminder about your upcoming GWMB mentorship session.';
  const intro = `${prefix} It is scheduled for ${start}.`;
  const text = `${intro}${link ? ` Meeting link: ${link}` : ' GWMB Admin will share the meeting link separately.'}`;
  // Only https links become a button; anything else stays readable in the body.
  return /^https:\/\//i.test(link)
    ? { text, html: { body: intro, action: { label: 'Join the meeting', url: link } } }
    : { text, html: { body: text } };
}
