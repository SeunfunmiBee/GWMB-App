-- Complete GWMB mentorship experience, including secure one-to-one booking access.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table if not exists public.mentors (
  id text primary key,
  full_name text not null,
  photo_url text,
  job_title text not null,
  organisation text not null,
  bio text not null,
  industry text not null,
  expertise text[] not null default '{}',
  guidance_topics text[] not null default '{}',
  mentorship_types text[] not null default '{}',
  active boolean not null default true,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentorship_booking_links (
  mentor_id text primary key references public.mentors(id) on delete cascade,
  booking_url text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mentorship_sessions (
  id text primary key,
  title text not null,
  mentorship_type text not null check (mentorship_type in ('discovery', 'industry')),
  industry text not null,
  description text not null,
  starts_at timestamptz not null,
  registration_deadline timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  access_level text not null default 'open' check (access_level in ('open', 'members')),
  meeting_url text,
  replay_url text,
  resources jsonb not null default '[]'::jsonb,
  eligibility text,
  status text not null default 'upcoming' check (status in ('upcoming', 'live', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentorship_session_mentors (
  session_id text not null references public.mentorship_sessions(id) on delete cascade,
  mentor_id text not null references public.mentors(id) on delete cascade,
  primary key (session_id, mentor_id)
);

create table if not exists public.mentorship_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.mentorship_sessions(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'waitlisted', 'cancelled')),
  attendance_status text not null default 'not_recorded' check (attendance_status in ('not_recorded', 'attended', 'absent')),
  reminder_status text not null default 'scheduled' check (reminder_status in ('scheduled', 'sent', 'not_required')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table if not exists public.mentorship_industry_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  industry text not null,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, industry)
);

create table if not exists public.mentorship_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_mentor_id text references public.mentors(id) on delete set null,
  assigned_mentor_id text references public.mentors(id) on delete set null,
  recommend_for_me boolean not null default false,
  industry text not null,
  guidance_request text not null check (char_length(guidance_request) between 10 and 1500),
  desired_outcome text not null check (char_length(desired_outcome) between 10 and 1500),
  career_stage text not null,
  supporting_information text,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'more_information_required', 'approved', 'not_approved', 'completed')),
  admin_comments text,
  preparation_instructions text,
  approved_at timestamptz,
  booking_link_released boolean not null default false,
  completed_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  route text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'in_app')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.marketplace_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  unique (user_id, activity_type, source_id)
);

create index if not exists mentorship_sessions_type_date_idx on public.mentorship_sessions (mentorship_type, starts_at);
create index if not exists mentorship_registrations_user_idx on public.mentorship_registrations (user_id, registered_at desc);
create index if not exists mentorship_applications_user_idx on public.mentorship_applications (user_id, submitted_at desc);
create index if not exists user_notifications_user_idx on public.user_notifications (user_id, created_at desc);

alter table public.mentors enable row level security;
alter table public.mentorship_booking_links enable row level security;
alter table public.mentorship_sessions enable row level security;
alter table public.mentorship_session_mentors enable row level security;
alter table public.mentorship_registrations enable row level security;
alter table public.mentorship_industry_interests enable row level security;
alter table public.mentorship_applications enable row level security;
alter table public.user_notifications enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.marketplace_activity enable row level security;

revoke all on table public.mentors, public.mentorship_booking_links, public.mentorship_sessions,
  public.mentorship_session_mentors, public.mentorship_registrations, public.mentorship_industry_interests,
  public.mentorship_applications, public.user_notifications, public.notification_outbox,
  public.marketplace_activity from anon, authenticated;
grant select on public.mentors, public.mentorship_sessions, public.mentorship_session_mentors to anon, authenticated;
grant insert, update, delete on public.mentors, public.mentorship_booking_links, public.mentorship_sessions, public.mentorship_session_mentors to authenticated;
grant select, insert, update on public.mentorship_registrations, public.mentorship_industry_interests, public.mentorship_applications to authenticated;
grant select, update on public.user_notifications to authenticated;
grant select on public.marketplace_activity to authenticated;

create policy "Active mentors are public" on public.mentors for select using (active);
create policy "Admins can view inactive mentors" on public.mentors for select to authenticated using (public.is_app_admin());
create policy "Published mentorship sessions are public" on public.mentorship_sessions for select using (true);
create policy "Session mentor links are public" on public.mentorship_session_mentors for select using (true);
create policy "Mentorship registrations are owner visible" on public.mentorship_registrations for select to authenticated using ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Users register themselves" on public.mentorship_registrations for insert to authenticated with check ((select auth.uid()) = user_id and status in ('registered', 'waitlisted'));
create policy "Users cancel their registrations" on public.mentorship_registrations for update to authenticated using ((select auth.uid()) = user_id or public.is_app_admin()) with check ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Industry interests are owner visible" on public.mentorship_industry_interests for select to authenticated using ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Users save industry interests" on public.mentorship_industry_interests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update industry interests" on public.mentorship_industry_interests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Applications are owner visible" on public.mentorship_applications for select to authenticated using ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Members create applications" on public.mentorship_applications for insert to authenticated with check (
  (select auth.uid()) = user_id and status = 'submitted' and exists(select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.status = 'verified')
);
create policy "Admins manage applications" on public.mentorship_applications for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Notifications are owner visible" on public.user_notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users mark notifications read" on public.user_notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Activities are owner visible" on public.marketplace_activity for select to authenticated using ((select auth.uid()) = user_id or public.is_app_admin());

create policy "Admins manage mentors" on public.mentors for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage booking links" on public.mentorship_booking_links for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage sessions" on public.mentorship_sessions for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage session mentors" on public.mentorship_session_mentors for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.get_approved_mentorship_booking(p_application_id uuid)
returns table (booking_url text)
language sql
security definer
set search_path = ''
as $$
  select b.booking_url
  from public.mentorship_applications a
  join public.mentorship_booking_links b on b.mentor_id = a.assigned_mentor_id
  where a.id = p_application_id
    and a.user_id = (select auth.uid())
    and a.status = 'approved'
    and a.booking_link_released = true;
$$;
revoke execute on function public.get_approved_mentorship_booking(uuid) from public, anon;
grant execute on function public.get_approved_mentorship_booking(uuid) to authenticated;

create or replace function public.queue_mentorship_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_key text;
begin
  if tg_table_name = 'mentorship_registrations' then
    v_key := 'mentorship_registration_confirmed';
    v_title := 'Mentorship registration confirmed';
    v_body := 'Your place is saved. We will remind you before the session begins.';
  else
    v_key := 'mentorship_application_' || new.status;
    v_title := case new.status when 'approved' then 'Your mentorship request is approved' when 'more_information_required' then 'Your mentorship application needs an update' when 'not_approved' then 'Mentorship application update' else 'Mentorship application received' end;
    v_body := case new.status when 'approved' then 'Open My Mentorship to review your mentor and booking instructions.' when 'more_information_required' then 'Open your application to see what the GWMB team needs.' when 'not_approved' then 'Open your application to review the latest update.' else 'We have received your request and will keep you updated.' end;
  end if;

  if tg_op = 'INSERT' or tg_table_name = 'mentorship_applications' and old.status is distinct from new.status then
    insert into public.user_notifications(user_id, kind, title, body, route)
    values (new.user_id, v_key, v_title, v_body, '/mentorship/my');
    insert into public.notification_outbox(user_id, channel, template_key, payload)
    values (new.user_id, 'email', v_key, jsonb_build_object('record_id', new.id));
  end if;
  return new;
end;
$$;
revoke execute on function public.queue_mentorship_notification() from public, anon, authenticated;

drop trigger if exists mentorship_registration_notification on public.mentorship_registrations;
create trigger mentorship_registration_notification after insert on public.mentorship_registrations for each row execute procedure public.queue_mentorship_notification();
drop trigger if exists mentorship_application_notification on public.mentorship_applications;
create trigger mentorship_application_notification after insert or update of status on public.mentorship_applications for each row execute procedure public.queue_mentorship_notification();

create or replace function public.record_completed_mentorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'mentorship_registrations' and new.attendance_status = 'attended' and old.attendance_status is distinct from new.attendance_status then
    insert into public.marketplace_activity(user_id, activity_type, source_id, metadata)
    values(new.user_id, 'mentorship_session_completed', new.session_id, jsonb_build_object('registration_id', new.id)) on conflict do nothing;
  elsif tg_table_name = 'mentorship_applications' and new.status = 'completed' and old.status is distinct from new.status then
    insert into public.marketplace_activity(user_id, activity_type, source_id, metadata)
    values(new.user_id, 'one_to_one_mentorship_completed', new.id::text, jsonb_build_object('mentor_id', new.assigned_mentor_id)) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.record_completed_mentorship() from public, anon, authenticated;

drop trigger if exists mentorship_registration_activity on public.mentorship_registrations;
create trigger mentorship_registration_activity after update of attendance_status on public.mentorship_registrations for each row execute procedure public.record_completed_mentorship();
drop trigger if exists mentorship_application_activity on public.mentorship_applications;
create trigger mentorship_application_activity after update of status on public.mentorship_applications for each row execute procedure public.record_completed_mentorship();

do $$ begin
  if exists(select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace) then
    create trigger mentors_set_updated_at before update on public.mentors for each row execute procedure public.set_updated_at();
    create trigger mentorship_sessions_set_updated_at before update on public.mentorship_sessions for each row execute procedure public.set_updated_at();
    create trigger mentorship_registrations_set_updated_at before update on public.mentorship_registrations for each row execute procedure public.set_updated_at();
    create trigger mentorship_industry_interests_set_updated_at before update on public.mentorship_industry_interests for each row execute procedure public.set_updated_at();
    create trigger mentorship_applications_set_updated_at before update on public.mentorship_applications for each row execute procedure public.set_updated_at();
  end if;
end $$;

insert into public.mentors (id, full_name, job_title, organisation, bio, industry, expertise, guidance_topics, mentorship_types)
values
  ('tosin-adeniran', 'Tosin Adeniran', 'Social Media Strategist', 'Board of Mentors', 'Tosin helps young women build professional visibility, communicate their value and approach their careers with clarity.', 'Marketing', array['Social media strategy','Professional visibility','Career positioning'], array['Building a professional brand','Communicating your value','Growing with intention'], array['discovery','industry','one_on_one']),
  ('adeola-balogun', 'Adeola Balogun', 'Senior Product Manager', 'Technology', 'Adeola supports emerging professionals who want an honest view of product careers and practical guidance for breaking in.', 'Product', array['Product management','Career transitions','Stakeholder communication'], array['Exploring product careers','Building product experience','Interview preparation'], array['discovery','industry','one_on_one'])
on conflict (id) do update set full_name=excluded.full_name, job_title=excluded.job_title, organisation=excluded.organisation, bio=excluded.bio, industry=excluded.industry, expertise=excluded.expertise, guidance_topics=excluded.guidance_topics, mentorship_types=excluded.mentorship_types;

insert into public.mentorship_sessions (id, title, mentorship_type, industry, description, starts_at, registration_deadline, capacity, access_level, eligibility, status)
values
  ('product-manager-conversation', 'Should You Become a Product Manager?', 'discovery', 'Product', 'An honest conversation about the role, the skills it requires and how to decide whether it fits you.', now() + interval '21 days', now() + interval '20 days', 250, 'open', 'Open to Guests and Members who are exploring product careers.', 'upcoming'),
  ('marketing-career-room', 'Building a Career in Marketing', 'industry', 'Marketing', 'Go deeper into early-career marketing paths, practical skill-building and professional positioning.', now() + interval '45 days', now() + interval '43 days', 80, 'members', 'Verified GWMB Members interested in marketing.', 'upcoming'),
  ('data-analyst-replay', 'Should You Become a Data Analyst?', 'discovery', 'Data', 'A practical introduction to data careers, everyday work and the skills that matter.', now() - interval '30 days', now() - interval '31 days', null, 'open', 'Open Access', 'completed')
on conflict (id) do nothing;

insert into public.mentorship_session_mentors(session_id, mentor_id)
values ('product-manager-conversation','adeola-balogun'), ('marketing-career-room','tosin-adeniran'), ('data-analyst-replay','adeola-balogun')
on conflict do nothing;
