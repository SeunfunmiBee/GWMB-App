// Marketplace journey, readiness profile, recommendation feedback, the next-step recommendation
// (`get_marketplace_recommendation`, src/recommendation.ts) and the inventory read.
import { z } from 'zod';
import { publicContent, readableLevels } from '../access';
import { decode, decodeAll, encode } from '../db';
import { body, nowIso, optionalUser, requireUser, router } from '../http';
import { recommend, type InventoryItem } from '../recommendation';

export const marketplace = router();

// ---------- inventory (public; access rules applied per caller) ----------

marketplace.get('/inventory', optionalUser, async (c) => {
  const db = c.env.DB;
  const levels = await readableLevels(c.env, c.get('userId'));
  const sessionLevels = levels.includes('members') ? ['open', 'members'] : ['open'];
  const [inventory, content, sessions, mentors] = await db.batch([
    db.prepare("select * from marketplace_inventory where published = 1 and availability in ('available', 'scheduled') order by priority desc"),
    db.prepare(`select * from content_items where status = 'published' and visible = 1 and (publish_at is null or publish_at <= ?)
                and area in ('courses', 'resources', 'opportunities', 'events', 'grow-learning') and access_level in (${levels.map(() => '?').join(', ')})`).bind(nowIso(), ...levels),
    db.prepare(`select id, title, mentorship_type, industry, subfield, description, starts_at, registration_deadline, capacity, access_level, replay_url, resources,
                eligibility, status, timezone, recording_allowed, published_at, completed_at, cancelled_at, audience_type, audience_fields, audience_subfields,
                notification_channels, distribution_surfaces, feature_level, mentor_confirmed_at, attendance_recorded_at, replay_expected, created_at, updated_at
                from mentorship_sessions where status in ('published', 'upcoming', 'live') and access_level in (${sessionLevels.map(() => '?').join(', ')})`).bind(...sessionLevels),
    // admin_notes is internal and never leaves the admin area.
    db.prepare(`select id, full_name, photo_url, job_title, organisation, bio, industry, expertise, guidance_topics, mentorship_types, subfields, active,
                publish_public_profile, created_at, updated_at from mentors where active = 1 and publish_public_profile = 1`),
  ]);
  return c.json({
    inventory: decodeAll('marketplace_inventory', inventory.results as Record<string, unknown>[]),
    content: decodeAll<{ metadata: unknown }>('content_items', content.results as Record<string, unknown>[]).map(publicContent),
    sessions: decodeAll('mentorship_sessions', sessions.results as Record<string, unknown>[]),
    mentors: decodeAll('mentors', mentors.results as Record<string, unknown>[]),
  });
});

// ---------- the member's own journey data ----------

marketplace.get('/journey', requireUser, async (c) => c.json(decode('marketplace_journeys', await c.env.DB.prepare('select * from marketplace_journeys where user_id = ?').bind(c.get('userId')).first())));

const journeyInput = z.object({
  primary_goal: z.string().trim().min(1).max(80), career_stage: z.string().trim().min(1).max(80),
  interests: z.array(z.string().max(120)).min(1, 'Choose at least one interest.').max(5, 'Choose up to five interests.'),
  journey_stage: z.string().max(80).optional(), onboarding_completed: z.boolean().optional(),
});

marketplace.put('/journey', requireUser, async (c) => {
  const data = encode('marketplace_journeys', await body(c, journeyInput));
  const cols = Object.keys(data);
  const row = await c.env.DB.prepare(
    `insert into marketplace_journeys (user_id, ${cols.join(', ')}, updated_at) values (?, ${cols.map(() => '?').join(', ')}, ?)
     on conflict (user_id) do update set ${cols.map((col) => `${col} = excluded.${col}`).join(', ')}, updated_at = excluded.updated_at returning *`,
  ).bind(c.get('userId'), ...cols.map((col) => data[col]), nowIso()).first();
  return c.json(decode('marketplace_journeys', row));
});

marketplace.get('/readiness', requireUser, async (c) => c.json(decode('marketplace_readiness_profiles', await c.env.DB.prepare('select * from marketplace_readiness_profiles where user_id = ?').bind(c.get('userId')).first())));

const level = z.string().max(60);
const flag = z.boolean().nullable();
const readinessInput = z.object({
  career_clarity: level, foundational_knowledge: level, skill_readiness: level, evidence_of_ability: level, guidance_need: level,
  opportunity_readiness: level, workplace_readiness: level, active_applications: z.number().int().min(0),
  has_cv: flag, cv_reviewed: flag, has_linkedin: flag, linkedin_optimised: flag, has_portfolio: flag, has_applied_before: flag,
  interview_preparation_completed: flag, mock_interview_attended: flag, application_support_completed: flag,
  declared_certifications: z.array(z.string().max(300)).max(50), declared_projects: z.array(z.string().max(300)).max(50), prior_experience: z.array(z.string().max(300)).max(50),
}).partial();

marketplace.put('/readiness', requireUser, async (c) => {
  const data = encode('marketplace_readiness_profiles', await body(c, readinessInput));
  const cols = Object.keys(data);
  const updates = cols.map((col) => `${col} = excluded.${col}`);
  const row = await c.env.DB.prepare(
    `insert into marketplace_readiness_profiles (user_id${cols.map((col) => `, ${col}`).join('')}, updated_at) values (?${cols.map(() => ', ?').join('')}, ?)
     on conflict (user_id) do update set ${[...updates, 'updated_at = excluded.updated_at'].join(', ')} returning *`,
  ).bind(c.get('userId'), ...cols.map((col) => data[col]), nowIso()).first();
  return c.json(decode('marketplace_readiness_profiles', row));
});

marketplace.get('/feedback', requireUser, async (c) => {
  const { results } = await c.env.DB.prepare('select recommendation_key, action from marketplace_recommendation_feedback where user_id = ? order by created_at desc').bind(c.get('userId')).all();
  return c.json(results);
});

marketplace.post('/feedback', requireUser, async (c) => {
  const input = await body(c, z.object({ recommendation_key: z.string().trim().min(1).max(200), action: z.string().trim().min(1).max(60) }));
  await c.env.DB.prepare('insert into marketplace_recommendation_feedback (user_id, recommendation_key, action) values (?, ?, ?)').bind(c.get('userId'), input.recommendation_key, input.action).run();
  return c.json({ ok: true }, 201);
});

marketplace.get('/recommendation', requireUser, async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const journey = decode<{ primary_goal: string; career_stage: string; interests: string[] }>('marketplace_journeys',
    await db.prepare('select * from marketplace_journeys where user_id = ? and onboarding_completed = 1').bind(userId).first());
  if (!journey) return c.json({ configured: false, reason: 'marketplace_journey_required' });
  const [readiness, progress, member, applications, feedback, inventory, registrations] = await db.batch([
    db.prepare('select * from marketplace_readiness_profiles where user_id = ?').bind(userId),
    db.prepare("select completed_at, completed_lesson_ids from course_progress where user_id = ? and course_id = 'workplace-foundations'").bind(userId),
    db.prepare("select 1 from memberships where user_id = ? and status = 'verified'").bind(userId),
    db.prepare("select count(*) as n from opportunity_applications where user_id = ? and status in ('submitted', 'under_review', 'successful')").bind(userId),
    db.prepare("select distinct recommendation_key from marketplace_recommendation_feedback where user_id = ? and action in ('dismissed', 'alternate_requested')").bind(userId),
    db.prepare("select * from marketplace_inventory where published = 1 and availability in ('available', 'scheduled')"),
    db.prepare("select event_id from event_registrations where user_id = ? and status <> 'cancelled'").bind(userId),
  ]);
  const now = Date.now();
  const result = recommend({
    journey: { ...journey, interests: journey.interests ?? [] },
    readiness: decode('marketplace_readiness_profiles', readiness.results[0] as Record<string, unknown> | undefined),
    cvProgress: decode('course_progress', progress.results[0] as Record<string, unknown> | undefined),
    isMember: member.results.length > 0,
    applicationCount: (applications.results[0] as { n: number }).n,
    dismissed: (feedback.results as { recommendation_key: string }[]).map((r) => r.recommendation_key),
    inventory: decodeAll<InventoryItem>('marketplace_inventory', inventory.results as Record<string, unknown>[]),
    registeredEventIds: (registrations.results as { event_id: string }[]).map((r) => r.event_id),
    now,
  });
  const recommendation = JSON.stringify(result.primary);
  await db.prepare(
    `insert into marketplace_recommendation_runs (user_id, marketplace_stage, primary_key, confidence, reason_codes, recommendation)
     select ?1, ?2, ?3, ?4, ?5, ?6 where not exists (select 1 from marketplace_recommendation_runs
       where user_id = ?1 and primary_key = ?3 and recommendation = ?6 and created_at > ?7)`,
  ).bind(userId, result.stage, result.primary.key, result.confidence, JSON.stringify(result.reasonCodes), recommendation, new Date(now - 5 * 60_000).toISOString()).run();
  return c.json({ configured: true, ...result, generatedAt: new Date(now).toISOString() });
});

