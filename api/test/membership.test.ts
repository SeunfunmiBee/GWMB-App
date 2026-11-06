import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeIdentifier } from '../src/routes/membership';
import { api, createRecord, createUser, membershipOf } from './helpers';

type Link = { result: string; request_status: string; message: string };

describe('normalizers (ported SQL functions)', () => {
  it('matches identifiers regardless of token order, case and separators', () => {
    expect(normalizeIdentifier('GWMB-2026-0012')).toBe(normalizeIdentifier('2026 gwmb 0012'));
    // Same as the SQL: 4-digit tokens sort alphabetically after "gwmb".
    expect(normalizeIdentifier('  gwmb/2026/0012 ')).toBe('gwmb00122026');
    expect(normalizeIdentifier('GWMB-2026-0012')).not.toBe(normalizeIdentifier('GWMB-2026-0013'));
  });
  it('trims emails and drops trailing punctuation', () => {
    expect(normalizeEmail('  Ada@Example.com.; ')).toBe('ada@example.com');
  });
});

describe('/v1/me', () => {
  it('rejects anonymous callers', async () => {
    expect((await api(null, 'GET', '/v1/me')).status).toBe(401);
  });

  it('lets a user edit only their own allowed profile fields', async () => {
    const user = await createUser({ name: 'Ada Obi' });
    const res = await api<{ id: string; full_name: string; city_club: string }>(user, 'PATCH', '/v1/me/profile', { full_name: 'Ada N. Obi', city_club: 'Lagos', id: 'someone-else' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, full_name: 'Ada N. Obi', city_club: 'Lagos' });
    expect((await api(user, 'PATCH', '/v1/me/profile', { avatar_url: 'not a link' })).status).toBe(400);
  });

  it('reports admin access from app_admins', async () => {
    const admin = await createUser({ admin: true });
    expect((await api<{ isAdmin: boolean }>(admin, 'GET', '/v1/me')).body.isAdmin).toBe(true);
  });
});

describe('membership applications', () => {
  it('validates input, stores the application and marks membership pending', async () => {
    const user = await createUser();
    expect((await api(user, 'POST', '/v1/membership/application', { fullName: 'A' })).status).toBe(400);
    const created = await api<{ user_id: string; status: string }>(user, 'POST', '/v1/membership/application', {
      fullName: 'Ada Obi', email: 'ADA@example.com', phone: '+2348000000000', city: 'Lagos', occupation: 'Analyst', motivation: 'I want to grow with GWMB.',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ user_id: user.id, status: 'submitted' });
    expect((await membershipOf(user.id))?.status).toBe('pending');
    expect((await api<{ user_id: string }>(user, 'GET', '/v1/membership/application')).body.user_id).toBe(user.id);
  });

  it('never returns another user’s application', async () => {
    const owner = await createUser();
    const other = await createUser();
    await api(owner, 'POST', '/v1/membership/application', { fullName: 'Ada Obi', email: 'a@example.com', phone: '0800000000', city: 'Lagos', occupation: 'Analyst', motivation: 'I want to grow with GWMB.' });
    expect((await api(other, 'GET', '/v1/membership/application')).body).toBeNull();
  });
});

describe('POST /v1/membership/link (submit_membership_link_request)', () => {
  it('queues manual review when no official record matches', async () => {
    const user = await createUser();
    const res = await api<Link>(user, 'POST', '/v1/membership/link', { membershipEmail: 'nobody@example.com', memberIdentifier: 'GWMB-0000' });
    expect(res.body).toMatchObject({ result: 'needs_review', request_status: 'needs_review' });
    expect((await membershipOf(user.id))?.status).toBe('pending');
  });

  it('verifies immediately when the confirmed app email is the membership email', async () => {
    const user = await createUser();
    const recordId = await createRecord({ identifier: 'GWMB-2026-0012', email: user.email.toUpperCase(), chapter: 'Lagos' });
    const res = await api<Link>(user, 'POST', '/v1/membership/link', { membershipEmail: `${user.email}.`, memberIdentifier: '2026 gwmb 0012', chapter: 'lagos' });
    expect(res.body).toMatchObject({ result: 'verified', request_status: 'approved' });
    expect(await membershipOf(user.id)).toEqual({ status: 'verified', membership_record_id: recordId });
    expect((await api<{ member_identifier: string; record_status: string }>(user, 'GET', '/v1/membership/details')).body).toMatchObject({ member_identifier: 'GWMB-2026-0012', record_status: 'active' });
  });

  it('links but marks expired when the official record is inactive', async () => {
    const user = await createUser();
    await createRecord({ identifier: 'GWMB-2026-0020', email: user.email, status: 'expired' });
    const res = await api<Link>(user, 'POST', '/v1/membership/link', { membershipEmail: user.email, memberIdentifier: 'GWMB-2026-0020' });
    expect(res.body.result).toBe('inactive');
    expect((await membershipOf(user.id))?.status).toBe('expired');
  });

  it('refuses a record already linked to another account', async () => {
    const owner = await createUser();
    const other = await createUser();
    await createRecord({ identifier: 'GWMB-2026-0030', email: other.email, linkedUserId: owner.id });
    const res = await api<Link>(other, 'POST', '/v1/membership/link', { membershipEmail: other.email, memberIdentifier: 'GWMB-2026-0030' });
    expect(res.body).toMatchObject({ result: 'already_linked', request_status: 'rejected' });
    expect((await membershipOf(other.id))?.status).toBe('non_member');
  });

  it('sends a chapter mismatch to review', async () => {
    const user = await createUser();
    await createRecord({ identifier: 'GWMB-2026-0040', email: user.email, chapter: 'Abuja' });
    const res = await api<Link>(user, 'POST', '/v1/membership/link', { membershipEmail: user.email, memberIdentifier: 'GWMB-2026-0040', chapter: 'Lagos' });
    expect(res.body.result).toBe('needs_review');
  });

  it('blocks re-verification after an inactivity downgrade', async () => {
    const user = await createUser();
    await env.DB.prepare("insert into membership_participation_status (user_id, state) values (?, 'downgraded')").bind(user.id).run();
    await createRecord({ identifier: 'GWMB-2026-0050', email: user.email });
    const res = await api<{ error: string }>(user, 'POST', '/v1/membership/link', { membershipEmail: user.email, memberIdentifier: 'GWMB-2026-0050' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/reapplication/);
    expect((await membershipOf(user.id))?.status).not.toBe('verified');
  });
});

describe('membership email ownership code', () => {
  async function pendingLink() {
    const user = await createUser();
    const identifier = `GWMB-2026-${user.id.slice(0, 6)}`;
    const recordId = await createRecord({ identifier, email: `official-${user.id}@example.com` });
    const res = await api<Link>(user, 'POST', '/v1/membership/link', { membershipEmail: `official-${user.id}@example.com`, memberIdentifier: identifier });
    expect(res.body.result).toBe('email_confirmation_required');
    return { user, recordId };
  }

  async function plantCode(userId: string, recordId: string, code: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${code}:test-signing`));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('update membership_email_challenges set code_hash = ? where user_id = ? and membership_record_id = ?').bind(hash, userId, recordId).run();
  }

  it('sends a code once per minute', async () => {
    const { user } = await pendingLink();
    expect((await api(user, 'POST', '/v1/membership/email-code/send')).status).toBe(200);
    expect((await api(user, 'POST', '/v1/membership/email-code/send')).status).toBe(429);
  });

  it('counts wrong codes and links the record on the right one', async () => {
    const { user, recordId } = await pendingLink();
    await api(user, 'POST', '/v1/membership/email-code/send');
    await plantCode(user.id, recordId, '424242');
    expect((await api(user, 'POST', '/v1/membership/email-code/verify', { code: '111111' })).status).toBe(400);
    const ok = await api<{ status: string }>(user, 'POST', '/v1/membership/email-code/verify', { code: '424242' });
    expect(ok.body.status).toBe('verified');
    expect(await membershipOf(user.id)).toEqual({ status: 'verified', membership_record_id: recordId });
  });

  it('locks out after five wrong attempts', async () => {
    const { user } = await pendingLink();
    await api(user, 'POST', '/v1/membership/email-code/send');
    for (let i = 0; i < 5; i += 1) await api(user, 'POST', '/v1/membership/email-code/verify', { code: '000000' });
    expect((await api(user, 'POST', '/v1/membership/email-code/verify', { code: '000000' })).status).toBe(429);
  });
});

describe('membership record triggers', () => {
  it('moves access to the new user and resets the old one when an admin re-links a record', async () => {
    const first = await createUser();
    const second = await createUser();
    const recordId = await createRecord({ identifier: 'GWMB-2026-0070', email: 'shared@example.com', linkedUserId: first.id });
    expect((await membershipOf(first.id))?.status).toBe('verified');
    await env.DB.prepare('update membership_records set linked_user_id = ? where id = ?').bind(second.id, recordId).run();
    expect(await membershipOf(first.id)).toEqual({ status: 'non_member', membership_record_id: null });
    expect(await membershipOf(second.id)).toEqual({ status: 'verified', membership_record_id: recordId });
  });
});
