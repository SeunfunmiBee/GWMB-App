import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { validatePublication } from '../src/content-rules';
import { api, createUser, type TestUser } from './helpers';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const uid = () => crypto.randomUUID().slice(0, 8);

function eventPayload(overrides: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  return {
    slug: `event-${uid()}`, area: 'events', content_type: 'event', title: 'Founders Clinic', summary: 'A clinic', body: 'Full details',
    image_url: 'https://img.example/x.png', route: '/event/x', access_level: 'account', status: 'published', featured: true, visible: true,
    starts_at: iso(48 * HOUR), ends_at: iso(50 * HOUR),
    metadata: { surfaces: ['events'], audience: 'everyone', timezone: 'Africa/Lagos', registration_deadline: iso(24 * HOUR),
      speaker: { name: 'Ada', role: 'Founder', bio: 'Builds things' }, capacity: 100, format: 'online', meeting_url: 'https://meet.example/abc', ...meta },
    ...overrides,
  };
}

async function publish(admin: TestUser, overrides: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  const res = await api<{ id: string; slug: string }>(admin, 'POST', '/v1/admin/content', eventPayload(overrides, meta));
  expect(res.status).toBe(201);
  return res.body;
}

describe('publication rules (validate_content_publication)', () => {
  const base = { status: 'published', title: 'T', summary: 'S', body: 'B', image_url: 'i', route: '/r', metadata: { surfaces: ['home'], audience: 'everyone' } };
  it('allows drafts with missing fields', () => {
    expect(validatePublication({ status: 'draft', content_type: 'course', title: '' })).toBeNull();
  });
  it('requires lessons with notes or media for courses', () => {
    const course = { ...base, content_type: 'course', metadata: { ...base.metadata, category: 'c', duration: '1h', instructor: { name: 'n', role: 'r', bio: 'b' } } };
    expect(validatePublication(course)).toBe('Add at least one lesson');
    const lesson = { id: 'l1', title: 't', summary: 's', duration: '5m', sections: [{ heading: 'h', body: '' }] };
    expect(validatePublication({ ...course, metadata: { ...course.metadata, lessons: [lesson] } })).toBe('Every lesson needs complete notes or media');
    expect(validatePublication({ ...course, metadata: { ...course.metadata, lessons: [{ ...lesson, media_url: 'https://v' }] } })).toBeNull();
  });
  it('requires scheduled items to have a future publish date', () => {
    expect(validatePublication({ ...base, status: 'scheduled', content_type: 'page', publish_at: iso(-HOUR) })).toMatch(/future publish date/);
  });
});

describe('content access', () => {
  it('shows each audience only what it may see', async () => {
    const admin = await createUser({ admin: true });
    const member = await createUser();
    await env.DB.prepare("update memberships set status = 'verified' where user_id = ?").bind(member.id).run();
    const regular = await createUser();
    const area = 'resources';
    const make = (access: string, extra: Record<string, unknown> = {}) => api(admin, 'POST', '/v1/admin/content', {
      slug: `r-${access}-${uid()}`, area, content_type: 'page', title: access, access_level: access, status: 'draft', visible: true, ...extra,
    });
    for (const access of ['open', 'account', 'members']) {
      const created = await make(access);
      await env.DB.prepare("update content_items set status = 'published' where id = ?").bind((created.body as { id: string }).id).run();
    }
    const titles = async (user: TestUser | null) => (await api<{ title: string }[]>(user, 'GET', `/v1/content?area=${area}`)).body.map((i) => i.title).sort();
    expect(await titles(null)).toEqual(['open']);
    expect(await titles(regular)).toEqual(['account', 'open']);
    expect(await titles(member)).toEqual(['account', 'members', 'open']);
  });

  it('keeps the admin builder admin-only and round-trips booleans and JSON', async () => {
    const user = await createUser();
    expect((await api(user, 'GET', '/v1/admin/content')).status).toBe(403);
    const admin = await createUser({ admin: true });
    const created = await api<{ featured: boolean; visible: boolean; metadata: { surfaces: string[] } }>(admin, 'POST', '/v1/admin/content', eventPayload({ status: 'draft' }));
    expect(created.body.featured).toBe(true);
    expect(created.body.metadata.surfaces).toEqual(['events']);
  });

  it('rejects incomplete publication with the original message and logs changes', async () => {
    const admin = await createUser({ admin: true });
    const bad = await api<{ error: string }>(admin, 'POST', '/v1/admin/content', eventPayload({}, { speaker: { name: 'Ada' } }));
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Complete the time zone, deadline and speaker details before publishing');
    const event = await publish(admin);
    const log = await env.DB.prepare('select action, actor_id from content_audit_log where content_id = ?').bind(event.id).all();
    expect(log.results).toEqual([{ action: 'insert', actor_id: admin.id }]);
  });

  it('notifies users when content is published', async () => {
    const admin = await createUser({ admin: true });
    const reader = await createUser();
    const event = await publish(admin, { title: 'Pitch Night' });
    const note = await env.DB.prepare("select title, body, route from user_notifications where user_id = ? and kind = 'published_event'").bind(reader.id).first();
    expect(note).toMatchObject({ title: 'New GWMB event', route: '/event/x' });
    expect(String((note as { body: string }).body)).toContain('Pitch Night');
    expect(event.id).toBeTruthy();
  });
});

describe('event registration (register_for_event)', () => {
  it('confirms, queues reminders, and skips them on cancel', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const event = await publish(admin);
    const reg = await api<{ id: string; status: string }>(user, 'POST', `/v1/events/${event.slug}/register`, { fullName: 'Ngozi Eze', email: 'N@example.com' });
    expect(reg.body.status).toBe('registered');
    const outbox = await env.DB.prepare('select template_key, status from notification_outbox where user_id = ? order by template_key').bind(user.id).all<{ template_key: string; status: string }>();
    expect(outbox.results.map((r) => r.template_key)).toEqual(expect.arrayContaining(['event_registration_registered', 'event_reminder_24h', 'event_reminder_1h', 'event_reminder_live']));
    await api(user, 'POST', `/v1/events/${event.id}/cancel`);
    const pending = await env.DB.prepare("select count(*) as n from notification_outbox where user_id = ? and status = 'pending' and template_key like 'event_reminder%'").bind(user.id).first<{ n: number }>();
    expect(pending?.n).toBe(0);
  });

  it('waitlists once capacity is reached', async () => {
    const admin = await createUser({ admin: true });
    const event = await publish(admin, {}, { capacity: 1 });
    const first = await createUser();
    const second = await createUser();
    expect((await api<{ status: string }>(first, 'POST', `/v1/events/${event.id}/register`, { fullName: 'First One', email: 'a@example.com' })).body.status).toBe('registered');
    expect((await api<{ status: string }>(second, 'POST', `/v1/events/${event.id}/register`, { fullName: 'Second One', email: 'b@example.com' })).body.status).toBe('waitlisted');
  });

  it('requires verified membership for members-only events', async () => {
    const admin = await createUser({ admin: true });
    const event = await publish(admin, { access_level: 'members' });
    const user = await createUser();
    const res = await api<{ error: string }>(user, 'POST', `/v1/events/${event.id}/register`, { fullName: 'Ngozi Eze', email: 'n@example.com' });
    expect(res.status).toBe(403);
  });

  it('only reveals the meeting link to registered users inside the join window', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const event = await publish(admin);
    await env.DB.prepare("insert into content_meetings (content_id, meeting_url, status) values (?, 'https://meet.example/abc', 'ready')").bind(event.id).run();
    expect((await api(user, 'GET', `/v1/events/${event.id}/meeting`)).body).toBeNull();
    await api(user, 'POST', `/v1/events/${event.id}/register`, { fullName: 'Ngozi Eze', email: 'n@example.com' });
    const early = await api<{ join_available: boolean; meeting_url: string | null; unavailable_reason: string }>(user, 'GET', `/v1/events/${event.id}/meeting`);
    expect(early.body).toMatchObject({ join_available: false, meeting_url: null, unavailable_reason: 'Joining opens 30 minutes before the event.' });
    await env.DB.prepare('update content_items set starts_at = ?, ends_at = ? where id = ?').bind(iso(10 * 60_000), iso(2 * HOUR), event.id).run();
    const open = await api<{ join_available: boolean; meeting_url: string }>(user, 'GET', `/v1/events/${event.id}/meeting`);
    expect(open.body).toMatchObject({ join_available: true, meeting_url: 'https://meet.example/abc' });
  });
});

describe('course progress and advanced programmes', () => {
  it('stores progress per user', async () => {
    const user = await createUser();
    const other = await createUser();
    const saved = await api<{ completed_lesson_ids: string[] }>(user, 'PUT', '/v1/courses/progress/money-101', { completed_lesson_ids: ['l1', 'l1', 'l2'], current_lesson_id: 'l3', completed_at: null });
    expect(saved.body.completed_lesson_ids).toEqual(['l1', 'l2']);
    expect((await api(other, 'GET', '/v1/courses/progress/money-101')).body).toBeNull();
  });

  it('enforces membership and the claim limit', async () => {
    const admin = await createUser({ admin: true });
    const slug = `adv-${uid()}`;
    const course = await api<{ id: string }>(admin, 'POST', '/v1/admin/content', {
      slug, area: 'courses', content_type: 'page', title: 'Advanced', access_level: 'open', status: 'draft', visible: true,
      metadata: { advanced_program: { enabled: true, offer_type: 'discount', offer_label: '50% off', application_url: 'https://apply.example' } },
    });
    await env.DB.prepare("update content_items set status = 'published' where id = ?").bind(course.body.id).run();
    await api(admin, 'PUT', `/v1/admin/content/${course.body.id}/advanced-offer`, { benefit_code: 'GWMB50', max_claims: 1, active: true });

    const guest = await createUser();
    expect((await api(guest, 'POST', `/v1/courses/${slug}/advanced-claim`)).status).toBe(403);

    const [first, second] = [await createUser(), await createUser()];
    for (const u of [first, second]) await env.DB.prepare("update memberships set status = 'verified' where user_id = ?").bind(u.id).run();
    const claim = await api<{ code: string; applicationUrl: string }>(first, 'POST', `/v1/courses/${slug}/advanced-claim`);
    expect(claim.body).toMatchObject({ code: 'GWMB50', applicationUrl: 'https://apply.example' });
    expect((await api(first, 'POST', `/v1/courses/${slug}/advanced-claim`)).status).toBe(200);
    expect((await api(second, 'POST', `/v1/courses/${slug}/advanced-claim`)).status).toBe(409);
  });
});

describe('calendar feeds', () => {
  it('includes a registered event in my feed and keeps the admin feed admin-only', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const event = await publish(admin);
    await api(user, 'POST', `/v1/events/${event.id}/register`, { fullName: 'Ngozi Eze', email: 'n@example.com' });
    const feed = await api<{ source_id: string; relevance: string; metadata: { registration_status: string } }[]>(user, 'GET', '/v1/calendar');
    expect(feed.body.find((i) => i.source_id === event.id)).toMatchObject({ relevance: 'saved', metadata: { registration_status: 'registered' } });
    expect((await api(user, 'GET', '/v1/admin/calendar')).status).toBe(403);
    expect((await api<unknown[]>(admin, 'GET', '/v1/admin/calendar')).body.length).toBeGreaterThan(0);
  });
});
