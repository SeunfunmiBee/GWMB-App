import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { recommend, type InventoryItem, type RecommendationInput } from '../src/recommendation';
import { api, createUser, type TestUser } from './helpers';

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const uid = () => crypto.randomUUID().slice(0, 8);
const MOTIVATION = 'I want this role because it matches my goals and experience.';

async function opportunity(admin: TestUser, overrides: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
  const res = await api<{ id: string; slug: string }>(admin, 'POST', '/v1/admin/content', {
    slug: `opp-${uid()}`, area: 'opportunities', content_type: 'opportunity', title: 'Analyst Internship', access_level: 'account',
    status: 'draft', visible: true, metadata: { deadline: iso(10 * DAY), ...meta }, ...overrides,
  });
  await env.DB.prepare("update content_items set status = 'published' where id = ?").bind(res.body.id).run();
  return res.body;
}

async function cv(user: TestUser) {
  return (await api<{ id: string }>(user, 'PUT', '/v1/cvs', {
    source: 'built', name: 'My CV', target_role: 'Analyst', opportunity_type: 'internship', template: 'classic',
    structured_data: { fullName: 'Ngozi' }, analysis: {}, status: 'ready', original_file_name: null, original_file_path: null, extracted_text: null,
  })).body;
}

describe('opportunity applications (submit_opportunity_application)', () => {
  it('submits once with a reference and a server-side CV snapshot', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const item = await opportunity(admin);
    const mine = await cv(user);
    expect((await api(user, 'POST', `/v1/opportunities/${item.slug}/submit`, { motivation: 'too short' })).status).toBe(400);
    const res = await api<{ status: string; submission_reference: string; cv_snapshot: { name: string; structured_data: { fullName: string } } }>(
      user, 'POST', `/v1/opportunities/${item.slug}/submit`, { motivation: MOTIVATION, cvRecordId: mine.id });
    expect(res.body.status).toBe('submitted');
    expect(res.body.submission_reference).toMatch(/^GWMB-[0-9A-F]{10}$/);
    expect(res.body.cv_snapshot).toMatchObject({ name: 'My CV', structured_data: { fullName: 'Ngozi' } });
    const again = await api<{ error: string }>(user, 'POST', `/v1/opportunities/${item.slug}/submit`, { motivation: MOTIVATION });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already applied/);
    expect((await api(user, 'PUT', `/v1/opportunities/${item.slug}/draft`, { portfolio_url: null, motivation: 'x', cv_record_id: null, completion_percent: 10 })).status).toBe(409);
  });

  it('refuses someone else’s CV, members-only items and closed deadlines', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const other = await createUser();
    const theirs = await cv(other);
    const open = await opportunity(admin);
    expect((await api(user, 'POST', `/v1/opportunities/${open.slug}/submit`, { motivation: MOTIVATION, cvRecordId: theirs.id })).status).toBe(400);
    const members = await opportunity(admin, { access_level: 'members' });
    expect((await api(user, 'POST', `/v1/opportunities/${members.slug}/submit`, { motivation: MOTIVATION })).status).toBe(403);
    expect((await api<{ can_apply: boolean; blocked_reason: string }>(user, 'GET', `/v1/opportunities/${members.slug}/context`)).body)
      .toMatchObject({ can_apply: false, blocked_reason: 'Verified GWMB membership is required for this opportunity.' });
    const closed = await opportunity(admin, {}, { deadline: iso(-DAY) });
    expect((await api(user, 'POST', `/v1/opportunities/${closed.slug}/submit`, { motivation: MOTIVATION })).status).toBe(400);
  });

  it('lets admins review applications and notifies the applicant', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser({ name: 'Ngozi Eze' });
    const item = await opportunity(admin);
    const app = await api<{ id: string }>(user, 'POST', `/v1/opportunities/${item.slug}/submit`, { motivation: MOTIVATION });
    expect((await api(user, 'GET', '/v1/admin/opportunities/applications')).status).toBe(403);
    const list = await api<{ id: string; applicant: { full_name: string } }[]>(admin, 'GET', '/v1/admin/opportunities/applications');
    expect(list.body.find((a) => a.id === app.body.id)?.applicant.full_name).toBe('Ngozi Eze');
    await api(admin, 'PATCH', `/v1/admin/opportunities/applications/${app.body.id}`, { status: 'under_review' });
    const note = await env.DB.prepare("select body from user_notifications where user_id = ? and kind = 'application_status'").bind(user.id).first<{ body: string }>();
    expect(note?.body).toBe('Your application is now under review.');
  });

  it('schedules follow-up reminders and skips them when disabled', async () => {
    const user = await createUser();
    const reminder = { label: 'Check in', days_after_submission: 7, enabled: true, scheduled_for: iso(7 * DAY) };
    await api(user, 'PUT', '/v1/opportunities/reminders', { opportunityId: 'opp-1', reminders: [reminder] });
    const status = () => env.DB.prepare("select status from notification_outbox where user_id = ? and template_key = 'application_follow_up'").bind(user.id).first<{ status: string }>();
    expect((await status())?.status).toBe('pending');
    await api(user, 'PUT', '/v1/opportunities/reminders', { opportunityId: 'opp-1', reminders: [{ ...reminder, enabled: false }] });
    expect((await status())?.status).toBe('skipped');
  });
});

describe('CV records', () => {
  it('keeps CVs private, enforces own file paths and a single primary CV', async () => {
    const user = await createUser();
    const other = await createUser();
    const [a, b] = [await cv(user), await cv(user)];
    expect((await api<unknown[]>(other, 'GET', '/v1/cvs')).body).toEqual([]);
    expect((await api(other, 'POST', `/v1/cvs/${a.id}/primary`)).status).toBe(404);
    await api(user, 'POST', `/v1/cvs/${a.id}/primary`);
    await api(user, 'POST', `/v1/cvs/${b.id}/primary`);
    const primaries = (await api<{ id: string; is_primary: boolean }[]>(user, 'GET', '/v1/cvs')).body.filter((x) => x.is_primary);
    expect(primaries.map((x) => x.id)).toEqual([b.id]);
    expect((await api(user, 'PATCH', `/v1/cvs/${a.id}/generated-file`, { path: `${other.id}/generated/x.pdf` })).status).toBe(400);
    expect((await api(other, 'GET', `/v1/cvs/${a.id}/files`)).body).toBeNull();
  });
});

describe('career readiness (submit_career_review)', () => {
  const review = { review_type: 'linkedin', linkedin_url: 'https://linkedin.com/in/x', target_role: 'Analyst', career_field: 'Finance', career_stage: 'student', consent_authorized_review: true };

  it('requires consent, deduplicates open submissions and rate limits', async () => {
    const user = await createUser();
    expect((await api(user, 'POST', '/v1/career/reviews', { ...review, consent_authorized_review: false })).status).toBe(400);
    const first = await api<{ id: string }>(user, 'POST', '/v1/career/reviews', review);
    expect(first.status).toBe(201);
    expect((await api<{ id: string }>(user, 'POST', '/v1/career/reviews', review)).body.id).toBe(first.body.id);
    for (let i = 0; i < 4; i += 1) {
      await env.DB.prepare("update career_review_submissions set status = 'reviewed' where user_id = ?").bind(user.id).run();
      expect((await api(user, 'POST', '/v1/career/reviews', review)).status).toBe(201);
    }
    await env.DB.prepare("update career_review_submissions set status = 'reviewed' where user_id = ?").bind(user.id).run();
    expect((await api(user, 'POST', '/v1/career/reviews', review)).status).toBe(429);
  });

  it('notifies on review decisions and stamps reviewed_at', async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    const sub = await api<{ id: string }>(user, 'POST', '/v1/career/reviews', review);
    expect((await api(user, 'PATCH', `/v1/admin/career/reviews/${sub.body.id}`, { status: 'reviewed' })).status).toBe(403);
    const done = await api<{ status: string; reviewed_at: string | null; reviewed_by: string }>(admin, 'PATCH', `/v1/admin/career/reviews/${sub.body.id}`, { status: 'reviewed', admin_feedback: 'Great' });
    expect(done.body).toMatchObject({ status: 'reviewed', reviewed_by: admin.id });
    expect(done.body.reviewed_at).toBeTruthy();
    const note = await env.DB.prepare("select title from user_notifications where user_id = ? and kind = 'career_readiness'").bind(user.id).first<{ title: string }>();
    expect(note?.title).toBe('Your career review is ready');
    expect((await api<Record<string, number>>(admin, 'GET', '/v1/admin/career/reviews/counts')).body.reviewed).toBeGreaterThan(0);
  });

  it('shows only active practice questions publicly', async () => {
    const admin = await createUser({ admin: true });
    const q = { category: 'Behavioural', question: 'Tell me about yourself', guidance: 'Be brief', framework: null, career_areas: ['finance'], sort_order: 1 };
    await api(admin, 'PUT', '/v1/admin/career/questions', { ...q, id: `on-${uid()}`, active: true });
    const hidden = `off-${uid()}`;
    await api(admin, 'PUT', '/v1/admin/career/questions', { ...q, id: hidden, active: false });
    const list = await api<{ id: string; career_areas: string[] }[]>(null, 'GET', '/v1/career/public/questions');
    expect(list.body.some((x) => x.id === hidden)).toBe(false);
    expect(list.body[0]?.career_areas).toEqual(['finance']);
  });
});

describe('marketplace', () => {
  it('hides mentor admin notes and members-only sessions from the inventory', async () => {
    const user = await createUser();
    await env.DB.prepare(`insert into mentors (id, full_name, job_title, organisation, bio, industry, admin_notes, publish_public_profile)
      values (?, 'Ada', 'CEO', 'GWMB', 'Bio', 'Finance', 'internal note', 1)`).bind(`m-${uid()}`).run();
    await env.DB.prepare(`insert into mentorship_sessions (id, title, mentorship_type, industry, description, starts_at, access_level, status)
      values (?, 'Members circle', 'industry', 'Finance', 'Desc', ?, 'members', 'published')`).bind(`s-${uid()}`, iso(DAY)).run();
    const res = await api<{ mentors: Record<string, unknown>[]; sessions: { title: string }[] }>(user, 'GET', '/v1/marketplace/inventory');
    expect(res.body.mentors.length).toBeGreaterThan(0);
    expect(res.body.mentors.every((m) => !('admin_notes' in m))).toBe(true);
    expect(res.body.sessions.some((s) => s.title === 'Members circle')).toBe(false);
  });

  it('rejects values the database does not allow with a 400', async () => {
    const user = await createUser();
    const res = await api<{ error: string }>(user, 'PUT', '/v1/marketplace/journey', { primary_goal: 'first-job', career_stage: 'not-a-stage', interests: ['finance'] });
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/constraint|career_stage/i);
  });

  it('requires a completed journey and records each recommendation once', async () => {
    const user = await createUser();
    expect((await api<{ configured: boolean }>(user, 'GET', '/v1/marketplace/recommendation')).body.configured).toBe(false);
    await api(user, 'PUT', '/v1/marketplace/journey', { primary_goal: 'first-job', career_stage: 'recent-graduate', interests: ['finance'], onboarding_completed: true });
    const first = await api<{ configured: boolean; primary: { key: string } }>(user, 'GET', '/v1/marketplace/recommendation');
    expect(first.body.configured).toBe(true);
    await api(user, 'GET', '/v1/marketplace/recommendation');
    const runs = await env.DB.prepare('select count(*) as n from marketplace_recommendation_runs where user_id = ?').bind(user.id).first<{ n: number }>();
    expect(runs?.n).toBe(1);
  });
});

describe('recommendation engine (get_marketplace_recommendation)', () => {
  const now = Date.now();
  const item = (over: Partial<InventoryItem>): InventoryItem => ({
    id: uid(), source_id: uid(), content_type: 'opportunity', title: 'Item', summary: 'Summary', route: `/r/${uid()}`, access_level: 'Open Access',
    action_label: 'View', tone: '#000', priority: 0, starts_at: null, deadline_at: null, career_areas: [], readiness_gaps: [], career_stages: [], ...over,
  });
  const base = (over: Partial<RecommendationInput> = {}): RecommendationInput => ({
    journey: { primary_goal: 'first-job', career_stage: 'graduate', interests: ['finance'] },
    readiness: { career_clarity: 'selected', has_cv: true, cv_reviewed: true }, cvProgress: null, isMember: false,
    applicationCount: 0, dismissed: [], inventory: [], registeredEventIds: [], now, ...over,
  });

  it('puts unfinished CV work first', () => {
    const course = item({ content_type: 'course', source_id: 'workplace-foundations', title: 'Workplace Foundations' });
    const r = recommend(base({ cvProgress: { completed_at: null, completed_lesson_ids: ['a', 'b'] }, inventory: [course] }));
    expect(r.primary).toMatchObject({ key: 'continue-cv', title: 'Finish Workplace Foundations' });
    expect(r.primary.shortExplanation).toContain('2 of 6 lessons');
  });

  it('prioritises a registered event happening within a week', () => {
    const event = item({ content_type: 'event', source_id: 'evt-1', starts_at: new Date(now + 2 * DAY).toISOString() });
    expect(recommend(base({ inventory: [event], registeredEventIds: ['evt-1'] })).primary.key).toBe('registered-event');
  });

  it('asks about career clarity and falls back to opportunity access', () => {
    const r = recommend(base({ readiness: null }));
    expect(r.contextualQuestion).toMatchObject({ id: 'career_clarity' });
    expect(r.primary.key).toBe('career-discovery');
    const fallback = recommend(base());
    expect(fallback.primary.key).toBe('explore-opportunities');
  });

  it('prefers matching, accessible opportunities and never repeats the primary in supporting cards', () => {
    const match = item({ career_areas: ['finance'], priority: 1 });
    const other = item({ priority: 50 });
    const r = recommend(base({ inventory: [other, match] }));
    expect(r.primary.key).toBe(`opportunity-${match.source_id}`);
    expect(r.forYou.every((card) => card.route !== r.primary.route)).toBe(true);
  });
});
