import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, createUser, type TestUser } from './helpers';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const uid = () => crypto.randomUUID().slice(0, 8);

async function verified(user: TestUser) {
  await env.DB.prepare("update memberships set status = 'verified' where user_id = ?").bind(user.id).run();
}

async function mentor(admin: TestUser, overrides: Record<string, unknown> = {}) {
  const id = `mentor-${uid()}`;
  await api(admin, 'PUT', '/v1/admin/mentorship/mentors', {
    id, full_name: 'Ada Obi', job_title: 'CFO', organisation: 'GWMB', bio: 'Finance leader', industry: 'Finance',
    expertise: ['budgeting'], guidance_topics: ['careers'], mentorship_types: ['industry', 'one_on_one'], active: true,
    publish_public_profile: true, admin_notes: 'internal only', ...overrides,
  });
  return id;
}

async function session(admin: TestUser, overrides: Record<string, unknown> = {}) {
  const id = `session-${uid()}`;
  const res = await api(admin, 'PUT', '/v1/admin/mentorship/sessions', {
    id, title: 'Finance Circle', mentorship_type: 'industry', industry: 'Finance', description: 'Talk', starts_at: iso(72 * HOUR),
    access_level: 'open', status: 'published', meeting_url: 'https://meet.example/secret', notification_channels: ['in_app', 'push', 'email'],
    distribution_surfaces: ['mentorship'], selected_user_ids: [], ...overrides,
  });
  expect(res.status).toBe(200);
  return id;
}

describe('public mentorship reads', () => {
  it('never exposes meeting links, invited member ids or admin notes', async () => {
    const admin = await createUser({ admin: true });
    const mentorId = await mentor(admin);
    const sessionId = await session(admin, { mentor_id: mentorId });
    const sessions = await api<Record<string, unknown>[]>(null, 'GET', '/v1/mentorship/sessions');
    const found = sessions.body.find((s) => s.id === sessionId) as Record<string, unknown> & { mentors: Record<string, unknown>[] };
    expect(found).toBeDefined();
    expect('meeting_url' in found).toBe(false);
    expect('selected_user_ids' in found).toBe(false);
    expect(found.mentors[0]?.id).toBe(mentorId);
    expect('admin_notes' in found.mentors[0]).toBe(false);
    const mentors = await api<Record<string, unknown>[]>(null, 'GET', '/v1/mentorship/mentors');
    expect(mentors.body.every((m) => !('admin_notes' in m))).toBe(true);
  });

  it('shows members-only sessions to verified members only', async () => {
    const admin = await createUser({ admin: true });
    const sessionId = await session(admin, { access_level: 'members' });
    const user = await createUser();
    const member = await createUser();
    await verified(member);
    const ids = async (u: TestUser | null) => (await api<{ id: string }[]>(u, 'GET', '/v1/mentorship/sessions')).body.map((s) => s.id);
    expect(await ids(null)).not.toContain(sessionId);
    expect(await ids(user)).not.toContain(sessionId);
    expect(await ids(member)).toContain(sessionId);
  });
});

describe('session seats (register_for_mentorship_session)', () => {
  it('saves a seat with reminders, waitlists when full, and skips reminders on cancel', async () => {
    const admin = await createUser({ admin: true });
    const sessionId = await session(admin, { capacity: 1 });
    const [first, second] = [await createUser(), await createUser()];
    expect((await api<{ status: string }>(first, 'POST', `/v1/mentorship/sessions/${sessionId}/register`)).body.status).toBe('registered');
    expect((await api<{ status: string }>(second, 'POST', `/v1/mentorship/sessions/${sessionId}/register`)).body.status).toBe('waitlisted');
    const note = await env.DB.prepare("select title from user_notifications where user_id = ? and kind = 'mentorship_seat_registered'").bind(first.id).first<{ title: string }>();
    expect(note?.title).toBe('Seat Saved ✓');
    const reminders = await env.DB.prepare("select template_key from notification_outbox where user_id = ? and channel = 'in_app'").bind(first.id).all<{ template_key: string }>();
    expect(reminders.results.map((r) => r.template_key)).toEqual(expect.arrayContaining(['mentorship_seat_saved', 'mentorship_session_reminder_24h', 'mentorship_session_live']));
    await api(first, 'POST', `/v1/mentorship/sessions/${sessionId}/cancel`);
    const pending = await env.DB.prepare("select count(*) as n from notification_outbox where user_id = ? and status = 'pending'").bind(first.id).first<{ n: number }>();
    expect(pending?.n).toBe(0);
  });

  it('requires verified membership for members-only sessions', async () => {
    const admin = await createUser({ admin: true });
    const sessionId = await session(admin, { access_level: 'members' });
    const user = await createUser();
    expect((await api(user, 'POST', `/v1/mentorship/sessions/${sessionId}/register`)).status).toBe(403);
  });
});

describe('one-on-one applications (submit_mentorship_application)', () => {
  const application = { recommend_for_me: true, industry: 'Finance', guidance_request: 'Help me plan a move into finance.', desired_outcome: 'A clear six-month plan.', career_stage: 'student' };

  it('requires verified membership, validates the mentor, and returns the open application', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    expect((await api(user, 'POST', '/v1/mentorship/applications', application)).status).toBe(403);
    await verified(user);
    const groupOnly = await mentor(admin, { mentorship_types: ['industry'] });
    expect((await api(user, 'POST', '/v1/mentorship/applications', { ...application, recommend_for_me: false, requested_mentor_id: groupOnly })).status).toBe(400);
    const oneOnOne = await mentor(admin);
    const first = await api<{ id: string }>(user, 'POST', '/v1/mentorship/applications', { ...application, recommend_for_me: false, requested_mentor_id: oneOnOne });
    expect(first.status).toBe(201);
    expect((await api<{ id: string }>(user, 'POST', '/v1/mentorship/applications', application)).body.id).toBe(first.body.id);
    const mine = await api<{ requested_mentor: Record<string, unknown> }[]>(user, 'GET', '/v1/mentorship/applications');
    expect(mine.body[0].requested_mentor.id).toBe(oneOnOne);
    expect('admin_notes' in mine.body[0].requested_mentor).toBe(false);
  });

  it('releases the booking link only after approval, and records completion', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    await verified(user);
    const mentorId = await mentor(admin, { booking_url: 'https://cal.example/ada' });
    const app = await api<{ id: string }>(user, 'POST', '/v1/mentorship/applications', application);
    expect((await api<{ booking_url: string | null }>(user, 'GET', `/v1/mentorship/applications/${app.body.id}/booking`)).body.booking_url).toBeNull();
    await api(admin, 'PATCH', `/v1/admin/mentorship/applications/${app.body.id}`, { status: 'approved', assigned_mentor_id: mentorId, booking_link_released: true });
    expect((await api<{ booking_url: string }>(user, 'GET', `/v1/mentorship/applications/${app.body.id}/booking`)).body.booking_url).toBe('https://cal.example/ada');
    const other = await createUser();
    expect((await api<{ booking_url: string | null }>(other, 'GET', `/v1/mentorship/applications/${app.body.id}/booking`)).body.booking_url).toBeNull();
    const note = await env.DB.prepare("select title from user_notifications where user_id = ? and kind = 'mentorship_application_approved'").bind(user.id).first<{ title: string }>();
    expect(note?.title).toBe('Your mentorship request is approved');
    await api(admin, 'PATCH', `/v1/admin/mentorship/applications/${app.body.id}`, { status: 'completed' });
    const activity = await env.DB.prepare("select activity_type from marketplace_activity where user_id = ?").bind(user.id).first<{ activity_type: string }>();
    expect(activity?.activity_type).toBe('one_to_one_mentorship_completed');
  });
});

describe('admin operations', () => {
  it('is admin-only and builds tasks for missing meeting links and unassigned requests', async () => {
    const user = await createUser();
    expect((await api(user, 'GET', '/v1/admin/mentorship')).status).toBe(403);
    const admin = await createUser({ admin: true });
    const sessionId = await session(admin, { meeting_url: null });
    const res = await api<{ tasks: { kind: string; session_id: string | null }[]; mentors: Record<string, unknown>[] }>(admin, 'GET', '/v1/admin/mentorship');
    expect(res.body.tasks.some((t) => t.kind === 'missing_meeting_link' && t.session_id === sessionId)).toBe(true);
    await session(admin);
    expect(res.body.mentors.every((m) => 'admin_notes' in m)).toBe(true);
  });

  it('emails linked mentors and stops those emails when the session is cancelled', async () => {
    const admin = await createUser({ admin: true });
    const mentorId = await mentor(admin);
    await api(admin, 'PUT', `/v1/admin/mentorship/mentors/${mentorId}/operations`, { email: `${mentorId}@example.com`, status: 'active' });
    const sessionId = await session(admin, { mentor_id: mentorId });
    const outbox = () => env.DB.prepare('select template_key, status from mentor_communication_outbox where session_id = ?').bind(sessionId).all<{ template_key: string; status: string }>();
    expect((await outbox()).results.map((r) => r.template_key).sort()).toEqual(
      ['mentor_session_confirmed', 'mentor_session_reminder_1h', 'mentor_session_reminder_24h', 'mentor_session_reminder_7d', 'mentor_session_thank_you']);
    await session(admin, { id: sessionId, status: 'cancelled', mentor_id: mentorId });
    expect((await outbox()).results.every((r) => r.status === 'skipped')).toBe(true);
  });

  it('marks attendance complete once every seat is recorded', async () => {
    const admin = await createUser({ admin: true });
    const sessionId = await session(admin);
    const [a, b] = [await createUser(), await createUser()];
    const regA = await api<{ id: string }>(a, 'POST', `/v1/mentorship/sessions/${sessionId}/register`);
    const regB = await api<{ id: string }>(b, 'POST', `/v1/mentorship/sessions/${sessionId}/register`);
    const recorded = () => env.DB.prepare('select attendance_recorded_at from mentorship_sessions where id = ?').bind(sessionId).first<{ attendance_recorded_at: string | null }>();
    await api(admin, 'PATCH', `/v1/admin/mentorship/registrations/${regA.body.id}/attendance`, { attendance_status: 'attended' });
    expect((await recorded())?.attendance_recorded_at).toBeNull();
    await api(admin, 'PATCH', `/v1/admin/mentorship/registrations/${regB.body.id}/attendance`, { attendance_status: 'absent' });
    expect((await recorded())?.attendance_recorded_at).toBeTruthy();
    expect((await api(a, 'POST', `/v1/mentorship/sessions/${sessionId}/cancel`)).status).toBe(404);
  });

  it('notifies members whose saved interest matches a new industry session', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const industry = `Industry-${uid()}`;
    await api(user, 'PUT', '/v1/mentorship/interests', { industry });
    await session(admin, { industry });
    const note = await env.DB.prepare("select body from user_notifications where user_id = ? and kind = 'mentorship_interest_match'").bind(user.id).first<{ body: string }>();
    expect(note?.body).toContain(industry);
  });
});
