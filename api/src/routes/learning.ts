// Course progress (course_progress RLS: owner only) and advanced programme benefits
// (`get_my_advanced_program_claim`, `claim_advanced_program_benefit`, 202610280001).
import { z } from 'zod';
import { decode, decodeAll, encode } from '../db';
import { body, HttpError, nowIso, requireUser, router } from '../http';

export const learning = router();
learning.use('*', requireUser);

learning.get('/progress', async (c) => {
  const { results } = await c.env.DB.prepare('select * from course_progress where user_id = ? order by updated_at desc').bind(c.get('userId')).all();
  return c.json(decodeAll('course_progress', results));
});

learning.get('/progress/:courseId', async (c) => {
  const row = await c.env.DB.prepare('select * from course_progress where user_id = ? and course_id = ?').bind(c.get('userId'), c.req.param('courseId')).first();
  return c.json(decode('course_progress', row));
});

const progressInput = z.object({
  completed_lesson_ids: z.array(z.string().max(160)).max(500),
  current_lesson_id: z.string().max(160).nullable(),
  started_at: z.string().optional(),
  completed_at: z.string().nullable(),
});

learning.put('/progress/:courseId', async (c) => {
  const input = await body(c, progressInput);
  const data = encode('course_progress', { ...input, completed_lesson_ids: [...new Set(input.completed_lesson_ids)] });
  const now = nowIso();
  const row = await c.env.DB.prepare(
    `insert into course_progress (user_id, course_id, completed_lesson_ids, current_lesson_id, started_at, completed_at, updated_at)
     values (?1, ?2, ?3, ?4, coalesce(?5, ?7), ?6, ?7)
     on conflict (user_id, course_id) do update set completed_lesson_ids = excluded.completed_lesson_ids,
       current_lesson_id = excluded.current_lesson_id, completed_at = excluded.completed_at, updated_at = excluded.updated_at
     returning *`,
  ).bind(c.get('userId'), c.req.param('courseId'), data.completed_lesson_ids, data.current_lesson_id ?? null, data.started_at ?? null, data.completed_at ?? null, now).first();
  return c.json(decode('course_progress', row));
});

// ---------- advanced programmes ----------

type Course = { id: string; metadata: string };
const config = (course: Course) => {
  try { return (JSON.parse(course.metadata || '{}').advanced_program ?? {}) as Record<string, unknown>; } catch { return {}; }
};
const applicationUrl = (cfg: Record<string, unknown>) => (cfg.application_url ?? cfg.programme_url ?? null) as string | null;
const flag = (value: unknown, fallback: boolean) => (value === undefined || value === null ? fallback : value === true || value === 'true');

learning.get('/:slug/advanced-claim', async (c) => {
  const course = await c.env.DB.prepare("select id, metadata from content_items where area = 'courses' and slug = ? limit 1").bind(c.req.param('slug')).first<Course>();
  if (!course) return c.json(null);
  const claim = await c.env.DB.prepare('select * from advanced_program_claims where content_id = ? and user_id = ?').bind(course.id, c.get('userId'))
    .first<{ id: string; status: string; claimed_code: string | null; offer_type: string; benefit_label: string | null; claimed_at: string }>();
  if (!claim) return c.json(null);
  return c.json({ claimId: claim.id, status: claim.status, code: claim.claimed_code, offerType: claim.offer_type, offerLabel: claim.benefit_label, claimedAt: claim.claimed_at, applicationUrl: applicationUrl(config(course)) });
});

learning.post('/:slug/advanced-claim', async (c) => {
  const userId = c.get('userId');
  const slug = c.req.param('slug');
  const course = await c.env.DB.prepare("select id, metadata from content_items where area = 'courses' and slug = ? and status = 'published' and visible = 1").bind(slug).first<Course>();
  if (!course) throw new HttpError(404, 'Advanced programme not found');
  const cfg = config(course);
  if (!flag(cfg.enabled, false)) throw new HttpError(400, 'Advanced programme is not enabled');
  const membership = (await c.env.DB.prepare('select status from memberships where user_id = ?').bind(userId).first<{ status: string }>())?.status ?? 'non_member';
  if (flag(cfg.members_only_offer, true) && membership !== 'verified') throw new HttpError(403, 'Verified GWMB membership is required for this benefit');
  if (flag(cfg.completion_required, false)) {
    const done = await c.env.DB.prepare('select 1 from course_progress where user_id = ? and course_id = ? and completed_at is not null').bind(userId, slug).first();
    if (!done) throw new HttpError(400, 'Complete the GWMB course before claiming this benefit');
  }
  const offer = await c.env.DB.prepare('select benefit_code, max_claims from advanced_program_offers where content_id = ? and active = 1').bind(course.id)
    .first<{ benefit_code: string | null; max_claims: number | null }>();
  if (!offer) throw new HttpError(400, 'This benefit is not ready to claim');

  // The cap is enforced inside the insert itself, so concurrent claims cannot exceed max_claims.
  const claim = await c.env.DB.prepare(
    `insert into advanced_program_claims (content_id, user_id, membership_status, offer_type, benefit_label, claimed_code)
     select ?1, ?2, ?3, ?4, ?5, ?6
     where exists (select 1 from advanced_program_claims where content_id = ?1 and user_id = ?2)
        or ?7 is null or (select count(*) from advanced_program_claims where content_id = ?1 and status <> 'expired') < ?7
     on conflict (content_id, user_id) do update set updated_at = ?8
     returning *`,
  ).bind(course.id, userId, membership, String(cfg.offer_type ?? 'none'), (cfg.offer_label as string | undefined) ?? null, offer.benefit_code, offer.max_claims, nowIso())
    .first<{ id: string; status: string; claimed_code: string | null; offer_type: string; benefit_label: string | null }>();
  if (!claim) throw new HttpError(409, 'All available benefits have been claimed');
  return c.json({ claimId: claim.id, status: claim.status, code: claim.claimed_code, offerType: claim.offer_type, offerLabel: claim.benefit_label, applicationUrl: applicationUrl(cfg) });
});
