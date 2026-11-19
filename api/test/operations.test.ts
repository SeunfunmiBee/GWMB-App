import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, BASE, createRecord, createUser, membershipOf } from './helpers';

describe('account requests and support', () => {
  it('allows one active request per type and lets members cancel a deletion', async () => {
    const user = await createUser();
    expect((await api(user, 'POST', '/v1/account/requests', { type: 'account_deletion' })).status).toBe(201);
    expect((await api(user, 'POST', '/v1/account/requests', { type: 'account_deletion' })).status).toBe(409);
    await api(user, 'POST', '/v1/account/requests/cancel-deletion');
    const mine = await api<{ request_type: string; status: string }[]>(user, 'GET', '/v1/account/requests');
    expect(mine.body[0]).toMatchObject({ request_type: 'account_deletion', status: 'cancelled' });
    expect((await api(user, 'POST', '/v1/account/requests', { type: 'account_deletion' })).status).toBe(201);
  });

  it('deduplicates repeated support messages and stores the account email', async () => {
    const user = await createUser();
    const message = { type: 'problem', subject: 'Cannot upload', message: 'The CV upload spins forever on Android.' };
    const first = await api<{ id: string }>(user, 'POST', '/v1/account/support', message);
    expect((await api<{ id: string }>(user, 'POST', '/v1/account/support', message)).body.id).toBe(first.body.id);
    const row = await env.DB.prepare('select email from support_requests where id = ?').bind(first.body.id).first<{ email: string }>();
    expect(row?.email).toBe(user.email);
  });
});

describe('error reporting (log_app_error)', () => {
  it('accepts anonymous reports with a client id, deduplicates, and drops ones without', async () => {
    const report = { source: 'home', message: 'TypeError: x is undefined', context: { client_id: `client-${crypto.randomUUID()}`, platform: 'android' } };
    const first = await api<{ id: string }>(null, 'POST', '/v1/errors', report);
    expect(first.body.id).toBeTruthy();
    expect((await api<{ id: string }>(null, 'POST', '/v1/errors', report)).body.id).toBe(first.body.id);
    expect((await api<{ id: string | null }>(null, 'POST', '/v1/errors', { ...report, context: {} })).body.id).toBeNull();
  });
});

describe('membership approvals console (admin_resolve_membership_link)', () => {
  it('adds official records, rejects duplicates, and approves matched requests', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const identifier = `GWMB-${crypto.randomUUID().slice(0, 8)}`;
    const added = await api<{ id: string }>(admin, 'POST', '/v1/admin/memberships/records', { member_identifier: identifier, membership_email: `official-${user.id}@example.com` });
    expect(added.status).toBe(201);
    expect((await api(admin, 'POST', '/v1/admin/memberships/records', { member_identifier: identifier, membership_email: 'x@example.com' })).status).toBe(409);
    await api(user, 'POST', '/v1/membership/link', { membershipEmail: `official-${user.id}@example.com`, memberIdentifier: identifier });
    const queue = await api<{ items: { user_id: string; status: string }[] }>(admin, 'GET', '/v1/admin/memberships/requests');
    expect(queue.body.items.find((r) => r.user_id === user.id)?.status).toBe('pending');
    expect((await api(user, 'POST', `/v1/admin/memberships/requests/${user.id}/resolve`, { approved: true })).status).toBe(403);
    await api(admin, 'POST', `/v1/admin/memberships/requests/${user.id}/resolve`, { approved: true });
    expect(await membershipOf(user.id)).toEqual({ status: 'verified', membership_record_id: added.body.id });
  });

  it('rejects requests back to non-member and refuses approval without a matched record', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    await api(user, 'POST', '/v1/membership/link', { membershipEmail: 'nobody@example.com', memberIdentifier: 'GWMB-NONE' });
    expect((await api(admin, 'POST', `/v1/admin/memberships/requests/${user.id}/resolve`, { approved: true })).status).toBe(400);
    await api(admin, 'POST', `/v1/admin/memberships/requests/${user.id}/resolve`, { approved: false });
    expect((await membershipOf(user.id))?.status).toBe('non_member');
    await createRecord({ identifier: `GWMB-${crypto.randomUUID().slice(0, 6)}`, email: 'unused@example.com' });
  });
});

describe('admin realtime topic', () => {
  it('is only granted to admins', async () => {
    const [admin, user] = [await createUser({ admin: true }), await createUser()];
    const ready = async (who: typeof admin) => {
      const { ticket } = (await api<{ ticket: string }>(who, 'POST', '/v1/live/ticket')).body;
      const res = await SELF.fetch(`${BASE}/v1/live?topics=admin,content&ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: 'websocket' } });
      const ws = res.webSocket!;
      ws.accept();
      const first = await new Promise<{ topics: string[] }>((resolve) => ws.addEventListener('message', (e) => resolve(JSON.parse(String(e.data))), { once: true }));
      ws.close();
      return first.topics;
    };
    expect(await ready(admin)).toEqual(['admin', 'content', `user:${admin.id}`]);
    expect(await ready(user)).toEqual(['content', `user:${user.id}`]);
  });
});
