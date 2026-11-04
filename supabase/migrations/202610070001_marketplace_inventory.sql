-- Central, inventory-aware catalogue for Marketplace Intelligence recommendations.

create table if not exists public.marketplace_inventory (
  id text primary key,
  source_id text not null,
  content_type text not null check (content_type in ('course', 'event', 'mentorship', 'opportunity', 'resource', 'career_tool', 'pathway')),
  title text not null,
  summary text not null default '',
  route text not null,
  career_areas text[] not null default '{}',
  skills text[] not null default '{}',
  journey_stages text[] not null default '{}',
  readiness_gaps text[] not null default '{}',
  career_stages text[] not null default '{}',
  access_level text not null default 'Open Access' check (access_level in ('Open Access', 'Members Only')),
  location text,
  starts_at timestamptz,
  deadline_at timestamptz,
  availability text not null default 'available' check (availability in ('draft', 'scheduled', 'available', 'full', 'closed', 'archived')),
  prerequisites text[] not null default '{}',
  action_label text not null default 'View details',
  tone text not null default '#A81455',
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, source_id)
);

create index if not exists marketplace_inventory_matching_idx
  on public.marketplace_inventory (content_type, availability, published, priority desc);
create index if not exists marketplace_inventory_career_areas_idx
  on public.marketplace_inventory using gin (career_areas);
create index if not exists marketplace_inventory_readiness_gaps_idx
  on public.marketplace_inventory using gin (readiness_gaps);

alter table public.marketplace_inventory enable row level security;
revoke all on table public.marketplace_inventory from anon, authenticated;
grant select on table public.marketplace_inventory to anon, authenticated;

drop policy if exists "Published marketplace inventory is readable" on public.marketplace_inventory;
create policy "Published marketplace inventory is readable" on public.marketplace_inventory
  for select to anon, authenticated using (published = true and availability <> 'draft');

drop trigger if exists marketplace_inventory_set_updated_at on public.marketplace_inventory;
create trigger marketplace_inventory_set_updated_at
  before update on public.marketplace_inventory
  for each row execute procedure public.set_updated_at();

insert into public.marketplace_inventory
  (id, source_id, content_type, title, summary, route, career_areas, skills, journey_stages, readiness_gaps, career_stages, access_level, location, starts_at, deadline_at, availability, prerequisites, action_label, tone, priority, metadata)
values
  ('course-workplace-foundations', 'workplace-foundations', 'course', 'Build a CV That Gets Noticed', 'Six practical lessons for creating a clearer, stronger application CV.', '/course/workplace-foundations', '{}', array['CV Writing','Professional Positioning'], array['prepare'], array['professional_positioning'], array['student','nysc','recent-graduate','early-career'], 'Open Access', 'Online', null, null, 'available', '{}', 'Build my CV', '#A81455', 90, '{"lesson_count":6,"certificate":true}'::jsonb),
  ('course-budgeting', 'budgeting', 'course', 'Budgeting Without the Stress', 'Build a realistic budget and a calmer weekly money rhythm.', '/course/budgeting', array['Finance','Entrepreneurship','Business Growth'], array['Budgeting','Money Management'], array['prepare'], array['business_finance','foundational_knowledge'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Open Access', 'Online', null, null, 'available', '{}', 'Start learning', '#C48414', 70, '{"lesson_count":4,"certificate":false}'::jsonb),
  ('course-self-leadership', 'self-leadership', 'course', 'Leading Yourself First', 'Build ownership, self-awareness and dependable professional habits.', '/course/self-leadership', '{}', array['Leadership','Self Management','Professional Habits'], array['prepare'], array['workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Open Access', 'Online', null, null, 'available', '{}', 'Start course', '#111011', 65, '{"lesson_count":5,"certificate":false}'::jsonb),
  ('course-public-speaking', 'public-speaking', 'course', 'Confident Public Speaking', 'Structure your message and speak with greater clarity.', '/course/public-speaking', '{}', array['Communication','Public Speaking'], array['prepare'], array['skill_readiness','workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', null, null, 'available', '{}', 'View course', '#3150E8', 55, '{"lesson_count":7,"certificate":true}'::jsonb),
  ('event-product-manager', 'product-manager', 'event', 'Should You Become a Product Manager?', 'An honest career-discovery conversation about product management.', '/event/product-manager', array['Product'], array['Career Discovery','Product Management'], array['explore'], array['career_clarity','industry_understanding'], array['student','nysc','recent-graduate','early-career'], 'Open Access', 'Online', '2027-04-16T19:30:00+01:00', null, 'scheduled', '{}', 'Explore the session', '#E62B7F', 80, '{"format":"live","speaker":"Adeola Adeyemi"}'::jsonb),
  ('event-cv-clinic', 'cv-clinic', 'event', 'Live CV Review', 'Focused recruiter feedback and practical CV improvements.', '/event/cv-clinic', '{}', array['CV Review','Professional Positioning'], array['prepare'], array['cv_reviewed','professional_positioning'], array['student','nysc','recent-graduate','early-career'], 'Members Only', 'Online', '2026-10-05T18:30:00+01:00', null, 'archived', array['Existing CV'], 'View career support', '#111011', 85, '{"format":"live"}'::jsonb),
  ('event-side-hustle', 'side-hustle', 'event', 'From Side Hustle to Real Income', 'Practical lessons about offers, pricing and building a sales rhythm.', '/event/side-hustle', array['Entrepreneurship','Business Growth'], array['Pricing','Sales','Business Systems'], array['prepare'], array['business_growth','business_finance'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', '2026-10-19T18:00:00+01:00', null, 'scheduled', '{}', 'View the session', '#C48414', 80, '{"format":"live"}'::jsonb),
  ('event-progress-circle', 'progress-circle', 'event', 'October Progress Circle', 'Reflect, reset and choose the next action for your goal.', '/event/progress-circle', '{}', array['Goal Setting','Accountability'], array['prepare'], array['workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', '2026-10-31T19:00:00+01:00', null, 'scheduled', '{}', 'View event', '#5939C8', 45, '{"format":"live"}'::jsonb),
  ('event-sister-circle', 'sister-circle', 'event', 'September Sister Circle', 'A member experience for peer learning, reflection and connection.', '/event/sister-circle', '{}', array['Community','Peer Support'], array['prepare'], array['guidance'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Lagos', '2026-09-28T15:00:00+01:00', null, 'archived', '{}', 'View event', '#111011', 30, '{"format":"in_person"}'::jsonb),
  ('mentor-tosin-adeniran', 'tosin-adeniran', 'mentorship', 'Meet Tosin Adeniran', 'Practical guidance on visibility, positioning and social media strategy.', '/mentor/tosin-adeniran', array['Marketing','Content Creation','Social Media'], array['Professional Visibility','Social Media Strategy'], array['explore','prepare'], array['industry_understanding','guidance'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', null, null, 'available', '{}', 'Meet Tosin', '#A81455', 55, '{"mentorship_type":"one_on_one"}'::jsonb),
  ('opportunity-flutterwave', 'flutterwave', 'opportunity', 'Graduate Internship Programme', 'Build practical experience on meaningful fintech projects.', '/opportunity/flutterwave', array['Finance','Software','Product','Operations'], '{}', array['access'], array['opportunity_access'], array['student','nysc','recent-graduate'], 'Members Only', 'Lagos · Hybrid', null, '2026-10-04T23:59:00+01:00', 'closed', array['CV'], 'View opportunity', '#078765', 75, '{"organisation":"Flutterwave","opportunity_type":"Internship"}'::jsonb),
  ('opportunity-women-tech', 'women-tech', 'opportunity', 'Women in Tech Scholarship', 'Supported digital-skills training with a practical portfolio pathway.', '/opportunity/women-tech', array['Data','Software','AI','Cybersecurity','Product','Design'], array['Digital Skills'], array['prepare','access'], array['skill_readiness','opportunity_access'], array['student','nysc','recent-graduate','early-career'], 'Open Access', 'Remote', null, '2026-10-12T23:59:00+01:00', 'available', '{}', 'View opportunity', '#3150E8', 85, '{"organisation":"Future Skills Africa","opportunity_type":"Scholarship"}'::jsonb),
  ('opportunity-emerging-leaders', 'gwmb-fund', 'opportunity', 'Emerging Leaders Fellowship', 'Guided learning, projects and a supportive leadership cohort.', '/opportunity/gwmb-fund', '{}', array['Leadership','Project Leadership'], array['prepare','access'], array['skill_readiness','evidence_of_ability','opportunity_access'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Nigeria', null, null, 'available', '{}', 'View fellowship', '#5939C8', 60, '{"organisation":"Girls Who Mean Business","opportunity_type":"Fellowship"}'::jsonb),
  ('resource-weekly-planning', 'weekly-planning', 'resource', 'The Weekly Planning Template', 'A reusable five-page template for turning priorities into a realistic week.', '/resource/weekly-planning', '{}', array['Planning','Productivity'], array['prepare'], array['workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Open Access', 'Online', null, null, 'available', '{}', 'Open resource', '#5939C8', 35, '{"format":"PDF"}'::jsonb),
  ('resource-better-goals', 'better-goals', 'resource', 'A Better Way to Set Goals', 'A short guide to making goals specific and workable.', '/resource/better-goals', '{}', array['Goal Setting','Planning'], array['prepare'], array['workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Open Access', 'Online', null, null, 'available', '{}', 'Read guide', '#5939C8', 30, '{"format":"Article"}'::jsonb),
  ('resource-conflict-guide', 'conflict-guide', 'resource', 'Communicating Through Conflict', 'A practical guide to direct and respectful workplace conversations.', '/resource/conflict-guide', '{}', array['Communication','Conflict Management'], array['prepare'], array['workplace_readiness'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', null, null, 'available', '{}', 'Read guide', '#111011', 30, '{"format":"Guide"}'::jsonb)
on conflict (id) do update set
  source_id = excluded.source_id,
  content_type = excluded.content_type,
  title = excluded.title,
  summary = excluded.summary,
  route = excluded.route,
  career_areas = excluded.career_areas,
  skills = excluded.skills,
  journey_stages = excluded.journey_stages,
  readiness_gaps = excluded.readiness_gaps,
  career_stages = excluded.career_stages,
  access_level = excluded.access_level,
  location = excluded.location,
  starts_at = excluded.starts_at,
  deadline_at = excluded.deadline_at,
  availability = excluded.availability,
  prerequisites = excluded.prerequisites,
  action_label = excluded.action_label,
  tone = excluded.tone,
  priority = excluded.priority,
  metadata = excluded.metadata,
  published = true;
