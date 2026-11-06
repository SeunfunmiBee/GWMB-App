import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, createRecord, createUser, membershipOf, type TestUser } from './helpers';

const MINUTE = 60_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const uid = () => crypto.randomUUID().slice(0, 8);

/** A verified member of `chapter` (linked official record; the trigger syncs the membership). */
async function chapterMember(chapter: string) {
  const user = await createUser();
  await createRecord({ identifier: `GWMB-${uid()}`, email: user.email, chapter, linkedUserId: user.id });
  return user;
}

async function chapterWithAdmin() {
  const admin = await createUser({ admin: true });
  const lead = await createUser();
  const name = `Chapter ${uid()}`;
  const res = await api<{ chapter_id: string }>(admin, 'POST', '/v1/admin/chapter-admins', { email: lead.email, chapterName: name, chapterKind: 'city' });
  expect(res.status).toBe(201);
  return { admin, lead, name, chapterId: res.body.chapter_id };
}

async function activity(lead: TestUser, chapterId: string, startsAt = iso(10 * MINUTE)) {
  const res = await api<{ id: string }>(lead, 'POST', `/v1/chapters/${chapterId}/activities`, { kind: 'event', title: 'Monthly meetup', startsAt, venue: 'Hub' });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe('cliques, preferences and volunteering', () => {
  it('lets only verified members join cliques', async () => {
    const user = await createUser();
    expect((await api(user, 'PUT', '/v1/community/cliques/finance-circle')).status).toBe(403);
    await env.DB.prepare("update memberships set status = 'verified' where user_id = ?").bind(user.id).run();
    await api(user, 'PUT', '/v1/community/cliques/finance-circle');
    expect((await api<string[]>(user, 'GET', '/v1/community/cliques')).body).toEqual(['finance-circle']);
  });

  it('stores community preferences and rejects unknown member types', async () => {
    const user = await createUser();
    expect((await api(user, 'PUT', '/v1/community/preferences', { member_type: 'alien', location: 'Lagos' })).status).toBe(400);
    await api(user, 'PUT', '/v1/community/preferences', { member_type: 'student', location: 'Lagos', campus: 'UNILAG' });
    expect((await api(user, 'GET', '/v1/community/preferences')).body).toEqual({ member_type: 'student', location: 'Lagos', campus: 'UNILAG' });
  });

  it('validates volunteer applications, uses the account email, and returns the open one', async () => {
    const user = await createUser();
    const application = { full_name: 'Ngozi Eze', location: 'Lagos', interest_area: 'Events', availability: 'Weekends', motivation: 'I want to support other women in business.' };
    expect((await api(user, 'POST', '/v1/community/volunteer', { ...application, motivation: 'short' })).status).toBe(400);
    const first = await api<{ id: string; email: string }>(user, 'POST', '/v1/community/volunteer', application);
    expect(first.body.email).toBe(user.email);
    expect((await api<{ id: string }>(user, 'POST', '/v1/community/volunteer', application)).body.id).toBe(first.body.id);
  });
});

describe('chapter administration', () => {
  it('restricts assignments to app admins and activities to chapter admins', async () => {
    const { admin, lead, chapterId } = await chapterWithAdmin();
    const outsider = await createUser();
    expect((await api(outsider, 'GET', '/v1/admin/chapter-admins')).status).toBe(403);
    const list = await api<{ email: string; active: boolean }[]>(admin, 'GET', '/v1/admin/chapter-admins');
    expect(list.body.find((a) => a.email === lead.email)?.active).toBe(true);
    expect((await api(outsider, 'POST', `/v1/chapters/${chapterId}/activities`, { kind: 'event', title: 'Meetup', startsAt: iso(MINUTE), venue: 'Hub' })).status).toBe(403);
    await activity(lead, chapterId);
    expect((await api<unknown[]>(lead, 'GET', `/v1/chapters/${chapterId}/activities`)).body).toHaveLength(1);
  });

  it('handles live attendance requests and confirmations', async () => {
    const { lead, name, chapterId } = await chapterWithAdmin();
    const member = await chapterMember(name);
    const elsewhere = await chapterMember(`Other ${uid()}`);
    const activityId = await activity(lead, chapterId);
    expect((await api<{ id: string }[]>(member, 'GET', '/v1/community/live-activities')).body.map((a) => a.id)).toContain(activityId);
    expect((await api(elsewhere, 'POST', `/v1/community/activities/${activityId}/attendance-request`)).status).toBe(403);
    expect((await api<{ status: string }>(member, 'POST', `/v1/community/activities/${activityId}/attendance-request`)).body.status).toBe('pending');
    const roster = await api<{ user_id: string; attendance_request_status: string }[]>(lead, 'GET', `/v1/chapters/activities/${activityId}/roster`);
    expect(roster.body.find((r) => r.user_id === member.id)?.attendance_request_status).toBe('pending');
    await api(lead, 'POST', `/v1/chapters/activities/${activityId}/attendance`, { userId: member.id, attended: true });
    const mine = await api<{ activity_id: string; status: string }[]>(member, 'GET', '/v1/community/attendance');
    expect(mine.body.find((a) => a.activity_id === activityId)?.status).toBe('attended');
    expect((await api(lead, 'POST', `/v1/chapters/activities/${activityId}/attendance`, { userId: elsewhere.id, attended: true })).status).toBe(400);
    const later = await activity(lead, chapterId, iso(5 * 60 * MINUTE));
    expect((await api(member, 'POST', `/v1/community/activities/${later}/attendance-request`)).status).toBe(400);
  });
});

describe('participation (complete_local_activity)', () => {
  // Only activities starting after a member was verified count towards their participation.
  it('marks absences, puts low attenders in review, and downgrades repeat absentees', async () => {
    const { lead, name, chapterId } = await chapterWithAdmin();
    const regular = await chapterMember(name);
    const absent = await chapterMember(name);
    const participation = (u: TestUser) => api<{ state: string; attended_count: number; eligible_count: number }>(u, 'GET', '/v1/community/participation');

    const first = await activity(lead, chapterId, iso(MINUTE));
    await api(lead, 'POST', `/v1/chapters/activities/${first}/attendance`, { userId: regular.id, attended: true });
    await api(lead, 'POST', `/v1/chapters/activities/${first}/complete`);
    expect((await participation(regular)).body).toMatchObject({ state: 'good', attended_count: 1, eligible_count: 1 });
    expect((await participation(absent)).body).toMatchObject({ state: 'review', attended_count: 0, eligible_count: 1 });
    expect((await api<{ status: string }[]>(absent, 'GET', '/v1/community/attendance')).body[0]?.status).toBe('absent');

    const second = await activity(lead, chapterId, iso(MINUTE));
    await api(lead, 'POST', `/v1/chapters/activities/${second}/attendance`, { userId: regular.id, attended: true });
    await api(lead, 'POST', `/v1/chapters/activities/${second}/complete`);
    expect((await participation(absent)).body.state).toBe('downgraded');
    expect((await membershipOf(absent.id))?.status).toBe('non_member');
    expect((await membershipOf(regular.id))?.status).toBe('verified');
  });

  it('only lets a chapter admin close activities', async () => {
    const { lead, name, chapterId } = await chapterWithAdmin();
    const member = await chapterMember(name);
    const activityId = await activity(lead, chapterId);
    expect((await api(member, 'POST', `/v1/chapters/activities/${activityId}/complete`)).status).toBe(403);
  });
});
