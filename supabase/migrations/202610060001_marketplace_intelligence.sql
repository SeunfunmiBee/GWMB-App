-- Persistent readiness and feedback data for the GWMB Marketplace Intelligence engine.

create table if not exists public.marketplace_readiness_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  career_clarity text not null default 'unknown' check (career_clarity in ('unknown', 'exploring', 'selected', 'established')),
  foundational_knowledge text not null default 'unknown' check (foundational_knowledge in ('unknown', 'limited', 'foundational', 'strong')),
  skill_readiness text not null default 'unknown' check (skill_readiness in ('unknown', 'needs_foundation', 'developing', 'adequate')),
  evidence_of_ability text not null default 'unknown' check (evidence_of_ability in ('unknown', 'none', 'limited', 'adequate')),
  has_cv boolean,
  cv_reviewed boolean,
  has_linkedin boolean,
  linkedin_optimised boolean,
  has_portfolio boolean,
  guidance_need text not null default 'unknown' check (guidance_need in ('unknown', 'career_discovery', 'industry_understanding', 'long_term', 'targeted', 'none')),
  opportunity_readiness text not null default 'not_ready' check (opportunity_readiness in ('not_ready', 'developing', 'reasonably_ready')),
  has_applied_before boolean,
  active_applications integer not null default 0 check (active_applications >= 0),
  interview_preparation_completed boolean,
  mock_interview_attended boolean,
  application_support_completed boolean,
  workplace_readiness text not null default 'unknown' check (workplace_readiness in ('unknown', 'developing', 'adequate')),
  declared_certifications text[] not null default '{}',
  declared_projects text[] not null default '{}',
  prior_experience text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_key text not null,
  action text not null check (action in ('completed_external', 'dismissed', 'alternate_requested')),
  created_at timestamptz not null default now()
);

create index if not exists marketplace_recommendation_feedback_user_created_idx
  on public.marketplace_recommendation_feedback (user_id, created_at desc);

alter table public.marketplace_readiness_profiles enable row level security;
alter table public.marketplace_recommendation_feedback enable row level security;

revoke all on table public.marketplace_readiness_profiles from anon, authenticated;
revoke all on table public.marketplace_recommendation_feedback from anon, authenticated;
grant select, insert, update on table public.marketplace_readiness_profiles to authenticated;
grant select, insert on table public.marketplace_recommendation_feedback to authenticated;

drop policy if exists "Readiness is visible to its owner" on public.marketplace_readiness_profiles;
create policy "Readiness is visible to its owner" on public.marketplace_readiness_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Readiness can be created by its owner" on public.marketplace_readiness_profiles;
create policy "Readiness can be created by its owner" on public.marketplace_readiness_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Readiness is editable by its owner" on public.marketplace_readiness_profiles;
create policy "Readiness is editable by its owner" on public.marketplace_readiness_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Recommendation feedback is visible to its owner" on public.marketplace_recommendation_feedback;
create policy "Recommendation feedback is visible to its owner" on public.marketplace_recommendation_feedback
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Recommendation feedback can be created by its owner" on public.marketplace_recommendation_feedback;
create policy "Recommendation feedback can be created by its owner" on public.marketplace_recommendation_feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop trigger if exists marketplace_readiness_profiles_set_updated_at on public.marketplace_readiness_profiles;
create trigger marketplace_readiness_profiles_set_updated_at
  before update on public.marketplace_readiness_profiles
  for each row execute procedure public.set_updated_at();
