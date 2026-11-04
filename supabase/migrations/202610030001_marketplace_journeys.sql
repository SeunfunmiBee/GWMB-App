-- Personal marketplace journeys and recommendation preferences.

create table if not exists public.marketplace_journeys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_goal text not null
    check (primary_goal in (
      'first-internship', 'first-job', 'discover-career', 'break-into-career',
      'learn-skill', 'improve-profile', 'grow-career', 'start-business', 'grow-business'
    )),
  career_stage text not null
    check (career_stage in ('student', 'nysc', 'recent-graduate', 'early-career', 'entrepreneur', 'other')),
  interests text[] not null default '{}',
  journey_stage text not null default 'prepare'
    check (journey_stage in ('explore', 'prepare', 'access')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_journeys_interest_limit check (cardinality(interests) between 1 and 5)
);

alter table public.marketplace_journeys enable row level security;

revoke all on table public.marketplace_journeys from anon, authenticated;
grant select, insert, update on table public.marketplace_journeys to authenticated;

drop policy if exists "Journeys are visible to their owner" on public.marketplace_journeys;
create policy "Journeys are visible to their owner"
on public.marketplace_journeys for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Journeys can be created by their owner" on public.marketplace_journeys;
create policy "Journeys can be created by their owner"
on public.marketplace_journeys for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Journeys are editable by their owner" on public.marketplace_journeys;
create policy "Journeys are editable by their owner"
on public.marketplace_journeys for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop trigger if exists marketplace_journeys_set_updated_at on public.marketplace_journeys;
create trigger marketplace_journeys_set_updated_at
  before update on public.marketplace_journeys
  for each row execute procedure public.set_updated_at();
