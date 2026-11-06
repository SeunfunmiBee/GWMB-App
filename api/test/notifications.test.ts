import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, createUser, type TestUser } from './helpers';

async function notify(user: TestUser, title = 'Hello') {
  await env.DB.prepare("insert into user_notifications (user_id, kind, title, body) values (?, 'test', ?, 'Body')").bind(user.id, title).run();
}

describe('in-app notifications', () => {
  it('shows each user only their own notifications and tracks reads', async () => {
    const user = await createUser();
    const other = await createUser();
    await notify(user, 'One');
    await notify(user, 'Two');
    await notify(other, 'Not yours');
    const list = await api<{ id: string; title: string }[]>(user, 'GET', '/v1/notifications');
    expect(list.body.map((n) => n.title).sort()).toEqual(['One', 'Two']);
    expect((await api<{ count: number }>(user, 'GET', '/v1/notifications/unread-count')).body.count).toBe(2);
    await api(other, 'POST', `/v1/notifications/${list.body[0].id}/read`);
    expect((await api<{ count: number }>(user, 'GET', '/v1/notifications/unread-count')).body.count).toBe(2);
    await api(user, 'POST', `/v1/notifications/${list.body[0].id}/read`);
    expect((await api<{ count: number }>(user, 'GET', '/v1/notifications/unread-count')).body.count).toBe(1);
    await api(user, 'POST', '/v1/notifications/read-all');
    expect((await api<{ count: number }>(user, 'GET', '/v1/notifications/unread-count')).body.count).toBe(0);
  });

  it('creates default preferences and saves changes as booleans', async () => {
    const user = await createUser();
    const prefs = await api<{ push_enabled: boolean; email_enabled: boolean }>(user, 'GET', '/v1/notifications/preferences');
    expect(prefs.body).toMatchObject({ push_enabled: false, email_enabled: true });
    const saved = await api<{ push_enabled: boolean; events_enabled: boolean }>(user, 'PATCH', '/v1/notifications/preferences', { push_enabled: true, events_enabled: false });
    expect(saved.body).toMatchObject({ push_enabled: true, events_enabled: false });
  });

  it('moves a push token to the account that registered it last', async () => {
    const [a, b] = [await createUser(), await createUser()];
    const device = { token: 'ExponentPushToken[shared-phone]', device_name: 'Pixel', platform: 'android' };
    await api(a, 'POST', '/v1/notifications/push-devices', device);
    await api(b, 'POST', '/v1/notifications/push-devices', device);
    const owner = await env.DB.prepare('select user_id, active from push_devices where expo_push_token = ?').bind(device.token).first();
    expect(owner).toEqual({ user_id: b.id, active: 1 });
    expect((await api(a, 'POST', '/v1/notifications/push-devices', { ...device, platform: 'windows' })).status).toBe(400);
  });
});

describe('admin broadcasts (queue_admin_notification)', () => {
  it('is admin-only, targets the chosen audience, and ignores exact repeats', async () => {
    const admin = await createUser({ admin: true });
    const member = await createUser();
    await env.DB.prepare("update memberships set status = 'verified' where user_id = ?").bind(member.id).run();
    const appUser = await createUser();
    const broadcast = { title: `Members update ${crypto.randomUUID()}`, body: 'See you Friday', audience: 'members', channels: ['in_app', 'push'] };
    expect((await api(appUser, 'POST', '/v1/admin/notifications/broadcast', broadcast)).status).toBe(403);
    const first = await api<{ queued: number }>(admin, 'POST', '/v1/admin/notifications/broadcast', { ...broadcast, scheduled_for: '2030-01-01T09:00:00Z' });
    const rows = await env.DB.prepare("select user_id, channel from notification_outbox where template_key = 'admin_broadcast' and json_extract(payload, '$.title') = ?")
      .bind(broadcast.title).all<{ user_id: string; channel: string }>();
    expect(rows.results.some((r) => r.user_id === member.id)).toBe(true);
    expect(rows.results.some((r) => r.user_id === appUser.id)).toBe(false);
    expect(first.body.queued).toBe(rows.results.length);
    const repeat = await api<{ queued: number }>(admin, 'POST', '/v1/admin/notifications/broadcast', { ...broadcast, scheduled_for: '2030-01-01T09:00:00Z' });
    expect(repeat.body.queued).toBe(0);
    const overview = await api<{ counts: Record<string, number> }>(admin, 'GET', '/v1/admin/notifications/overview');
    expect(overview.body.counts.pending).toBeGreaterThanOrEqual(rows.results.length);
  });
});
