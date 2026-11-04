-- Close the remaining cross-device flow gaps and make launch controls fail-safe.

drop policy if exists "Everyone reads enabled feature flags" on public.feature_flags;
drop policy if exists "Everyone reads feature flags" on public.feature_flags;
create policy "Everyone reads feature flags"
on public.feature_flags for select
to anon, authenticated
using (true);
grant select on public.feature_flags to anon, authenticated;

create table if not exists public.application_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  professional_bio text not null default '',
  career_direction text not null default '',
  strengths text[] not null default '{}',
  achievements text[] not null default '{}',
  reusable_motivation text not null default '',
  linkedin_url text not null default '',
  portfolio_url text not null default '',
  preferred_location text not null default '',
  refinement_count integer not null default 0 check (refinement_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null,
  label text not null,
  days_after_submission integer not null check (days_after_submission between 0 and 365),
  enabled boolean not null default true,
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now(),
  unique(user_id, opportunity_id, days_after_submission)
);

create table if not exists public.clique_session_seats (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  status text not null default 'saved' check (status in ('saved','cancelled')),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, session_id)
);

create table if not exists public.community_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_type text not null check (member_type in ('student','graduate','professional')),
  location text not null,
  campus text,
  updated_at timestamptz not null default now()
);

alter table public.application_profiles enable row level security;
alter table public.application_reminders enable row level security;
alter table public.clique_session_seats enable row level security;
alter table public.community_preferences enable row level security;

grant select, insert, update on public.application_profiles, public.application_reminders, public.clique_session_seats, public.community_preferences to authenticated;
grant delete on public.application_reminders, public.clique_session_seats to authenticated;

create policy "Users manage own application profile" on public.application_profiles
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Users manage own application reminders" on public.application_reminders
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Users manage own clique seats" on public.clique_session_seats
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "Users manage own community preferences" on public.community_preferences
for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

alter table public.opportunity_applications
  add column if not exists completion_percent integer not null default 100 check (completion_percent between 0 and 100);
do $$ begin
  alter table public.opportunity_applications add constraint opportunity_applications_profile_fkey
    foreign key(user_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

alter table public.opportunity_applications drop constraint if exists opportunity_applications_motivation_check;
alter table public.opportunity_applications add constraint opportunity_applications_motivation_check
  check (status='draft' or char_length(motivation) between 30 and 2000);

grant update on public.opportunity_applications to authenticated;
drop policy if exists "Users can submit their own applications" on public.opportunity_applications;
create policy "Users can create their own applications" on public.opportunity_applications
for insert to authenticated
with check(auth.uid()=user_id and status in ('draft','submitted'));
create policy "Users can update their own draft applications" on public.opportunity_applications
for update to authenticated
using(auth.uid()=user_id and status='draft')
with check(auth.uid()=user_id and status in ('draft','submitted'));
create policy "Admins read all applications" on public.opportunity_applications
for select to authenticated using(public.is_app_admin());
create policy "Admins update application statuses" on public.opportunity_applications
for update to authenticated using(public.is_app_admin()) with check(public.is_app_admin());

create or replace function public.queue_application_reminder()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.enabled then
    insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
    values(
      new.user_id,
      'in_app',
      'application_follow_up',
      jsonb_build_object(
        'title',new.label,
        'body','Review your application progress and choose your next useful step.',
        'route','/opportunities?tab=applications',
        'category','opportunities',
        'opportunity_id',new.opportunity_id
      ),
      new.scheduled_for,
      'application:'||new.user_id||':'||new.opportunity_id||':'||new.days_after_submission
    ) on conflict(dedupe_key) where dedupe_key is not null do update
      set scheduled_for=excluded.scheduled_for,status='pending',error_message=null,sent_at=null,payload=excluded.payload;
  else
    update public.notification_outbox set status='skipped',error_message='Reminder disabled'
    where dedupe_key='application:'||new.user_id||':'||new.opportunity_id||':'||new.days_after_submission and status='pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.queue_application_reminder() from public, anon, authenticated;
drop trigger if exists application_reminder_notification on public.application_reminders;
create trigger application_reminder_notification
after insert or update of enabled,scheduled_for on public.application_reminders
for each row execute procedure public.queue_application_reminder();

create or replace function public.notify_application_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.status<>'draft' then
    insert into public.user_notifications(user_id,kind,title,body,route)
    values(new.user_id,'application_status','Your application status changed','Your application is now '||replace(new.status,'_',' ')||'.','/opportunities?tab=applications');
    insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
    values(new.user_id,'push','application_status',jsonb_build_object('title','Your application status changed','body','Your application is now '||replace(new.status,'_',' ')||'.','route','/opportunities?tab=applications','category','opportunities'),now(),'application-status:'||new.id||':'||new.status)
    on conflict(dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_application_status() from public,anon,authenticated;
drop trigger if exists opportunity_application_status_notification on public.opportunity_applications;
create trigger opportunity_application_status_notification after update of status on public.opportunity_applications
for each row execute procedure public.notify_application_status();

drop trigger if exists application_profiles_set_updated_at on public.application_profiles;
create trigger application_profiles_set_updated_at before update on public.application_profiles
for each row execute procedure public.set_updated_at();
drop trigger if exists clique_session_seats_set_updated_at on public.clique_session_seats;
create trigger clique_session_seats_set_updated_at before update on public.clique_session_seats
for each row execute procedure public.set_updated_at();
drop trigger if exists community_preferences_set_updated_at on public.community_preferences;
create trigger community_preferences_set_updated_at before update on public.community_preferences
for each row execute procedure public.set_updated_at();

drop trigger if exists audit_application_profiles on public.application_profiles;
create trigger audit_application_profiles after insert or update or delete on public.application_profiles
for each row execute procedure public.audit_admin_change();
drop trigger if exists audit_opportunity_applications on public.opportunity_applications;
create trigger audit_opportunity_applications after insert or update or delete on public.opportunity_applications
for each row execute procedure public.audit_admin_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('privacy-exports','privacy-exports',false,10485760,array['application/json'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/json'];
