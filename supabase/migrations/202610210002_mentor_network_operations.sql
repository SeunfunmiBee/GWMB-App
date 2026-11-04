-- GWMB Mentor Network operations: private intake/availability, operational tasks,
-- unified session lifecycle and mentor communications. Public profile fields stay
-- in public.mentors; private contact and booking data stays in admin-only tables.

alter table public.mentors
  add column if not exists subfields text[] not null default '{}',
  add column if not exists publish_public_profile boolean not null default false;

drop policy if exists "Active mentors are public" on public.mentors;
create policy "Published mentors are public" on public.mentors for select
  using (active and publish_public_profile);

create table if not exists public.mentor_operations (
  mentor_id text primary key references public.mentors(id) on delete cascade,
  email text not null,
  phone text,
  linkedin_url text,
  status text not null default 'new_submission' check (status in ('new_submission','under_review','confirmed','active','paused','inactive')),
  source text not null default 'admin',
  external_identifier text,
  preferred_frequency text,
  preferred_days text[] not null default '{}',
  preferred_times text[] not null default '{}',
  general_availability text,
  discovery_available boolean not null default false,
  industry_available boolean not null default false,
  one_on_one_available boolean not null default false,
  one_on_one_capacity integer not null default 0 check (one_on_one_capacity >= 0),
  private_booking_url text,
  available_dates jsonb not null default '[]'::jsonb,
  recording_consent boolean not null default false,
  limitations text,
  internal_notes text,
  submitted_at timestamptz not null default now(),
  availability_last_confirmed_at timestamptz,
  availability_confirmed_until date,
  availability_confirmation_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mentor_operations_email_unique on public.mentor_operations(lower(email));
create index if not exists mentor_operations_status_idx on public.mentor_operations(status, availability_confirmation_due);

create table if not exists public.mentor_availability_submissions (
  id uuid primary key default gen_random_uuid(),
  mentor_id text not null references public.mentors(id) on delete cascade,
  source text not null,
  preferred_days text[] not null default '{}',
  preferred_times text[] not null default '{}',
  general_availability text,
  available_dates jsonb not null default '[]'::jsonb,
  discovery_available boolean,
  industry_available boolean,
  one_on_one_available boolean,
  one_on_one_capacity integer,
  confirmed_until date,
  raw_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create table if not exists public.mentorship_operations_tasks (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text unique,
  mentor_id text references public.mentors(id) on delete cascade,
  session_id text references public.mentorship_sessions(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','completed','dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mentorship_operations_tasks_open_idx on public.mentorship_operations_tasks(status, due_at);

create table if not exists public.mentor_communication_outbox (
  id uuid primary key default gen_random_uuid(),
  mentor_id text not null references public.mentors(id) on delete cascade,
  session_id text references public.mentorship_sessions(id) on delete cascade,
  recipient_email text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  dedupe_key text unique,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mentor_communication_due_idx on public.mentor_communication_outbox(status, scheduled_for);

alter table public.mentorship_sessions
  add column if not exists timezone text not null default 'Africa/Lagos',
  add column if not exists recording_allowed boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.mentorship_sessions drop constraint if exists mentorship_sessions_status_check;
alter table public.mentorship_sessions add constraint mentorship_sessions_status_check
  check (status in ('draft','scheduled','published','upcoming','live','completed','cancelled'));

alter table public.mentorship_applications drop constraint if exists mentorship_applications_status_check;
alter table public.mentorship_applications add constraint mentorship_applications_status_check
  check (status in ('submitted','under_review','more_information_required','approved','mentor_assigned','booking_access_released','not_approved','completed'));

create or replace function public.get_approved_mentorship_booking(p_application_id uuid)
returns table (booking_url text)
language sql security definer set search_path=''
as $$
  select b.booking_url from public.mentorship_applications a
  join public.mentorship_booking_links b on b.mentor_id=a.assigned_mentor_id
  where a.id=p_application_id and a.user_id=(select auth.uid())
    and a.status in ('approved','booking_access_released') and a.booking_link_released=true;
$$;

alter table public.mentor_operations enable row level security;
alter table public.mentor_availability_submissions enable row level security;
alter table public.mentorship_operations_tasks enable row level security;
alter table public.mentor_communication_outbox enable row level security;
revoke all on public.mentor_operations, public.mentor_availability_submissions, public.mentorship_operations_tasks, public.mentor_communication_outbox from anon, authenticated;
grant select, insert, update, delete on public.mentor_operations, public.mentor_availability_submissions, public.mentorship_operations_tasks, public.mentor_communication_outbox to authenticated;
create policy "Admins manage mentor operations" on public.mentor_operations for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage mentor availability" on public.mentor_availability_submissions for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage mentorship tasks" on public.mentorship_operations_tasks for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins manage mentor communications" on public.mentor_communication_outbox for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.schedule_mentor_session_operations()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_mentor_id text;
  v_email text;
begin
  if new.status in ('scheduled','published','upcoming') then
    for v_mentor_id, v_email in
      select link.mentor_id, ops.email from public.mentorship_session_mentors link
      join public.mentor_operations ops on ops.mentor_id=link.mentor_id
      where link.session_id=new.id
    loop
      insert into public.mentor_communication_outbox(mentor_id,session_id,recipient_email,template_key,payload,scheduled_for,dedupe_key)
      values
        (v_mentor_id,new.id,v_email,'mentor_session_confirmed',jsonb_build_object('title',new.title,'starts_at',new.starts_at,'meeting_url',new.meeting_url),now(),'mentor:'||new.id||':'||v_mentor_id||':confirmed'),
        (v_mentor_id,new.id,v_email,'mentor_session_reminder_7d',jsonb_build_object('title',new.title,'starts_at',new.starts_at,'meeting_url',new.meeting_url),greatest(now(),new.starts_at-interval '7 days'),'mentor:'||new.id||':'||v_mentor_id||':7d'),
        (v_mentor_id,new.id,v_email,'mentor_session_reminder_24h',jsonb_build_object('title',new.title,'starts_at',new.starts_at,'meeting_url',new.meeting_url),greatest(now(),new.starts_at-interval '24 hours'),'mentor:'||new.id||':'||v_mentor_id||':24h'),
        (v_mentor_id,new.id,v_email,'mentor_session_reminder_1h',jsonb_build_object('title',new.title,'starts_at',new.starts_at,'meeting_url',new.meeting_url),greatest(now(),new.starts_at-interval '1 hour'),'mentor:'||new.id||':'||v_mentor_id||':1h'),
        (v_mentor_id,new.id,v_email,'mentor_session_thank_you',jsonb_build_object('title',new.title,'starts_at',new.starts_at),new.starts_at+interval '2 hours','mentor:'||new.id||':'||v_mentor_id||':thank-you')
      on conflict (dedupe_key) do update set payload=excluded.payload,scheduled_for=excluded.scheduled_for,status=case when public.mentor_communication_outbox.status='sent' then 'sent' else 'pending' end;
    end loop;
    if nullif(new.meeting_url,'') is null then
      insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
      values('session:'||new.id||':meeting-link',new.id,'missing_meeting_link','Add meeting link',new.title,new.starts_at-interval '25 hours','high')
      on conflict (dedupe_key) do update set due_at=excluded.due_at,status='open';
    else
      update public.mentorship_operations_tasks set status='completed',completed_at=now() where dedupe_key='session:'||new.id||':meeting-link' and status='open';
    end if;
  end if;
  if new.status='cancelled' then
    if tg_op='INSERT' or old.status is distinct from new.status then
      update public.mentor_communication_outbox set status='skipped',error_message='Session cancelled' where session_id=new.id and status='pending';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists mentorship_session_operations on public.mentorship_sessions;
create trigger mentorship_session_operations after insert or update on public.mentorship_sessions for each row execute procedure public.schedule_mentor_session_operations();

create or replace function public.notify_matching_mentorship_interests()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('published','upcoming') and new.mentorship_type='industry'
    and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.user_notifications(user_id,kind,title,body,route)
    select interest.user_id,'mentorship_interest_match','A relevant mentorship just opened',new.title||' matches your saved '||coalesce(nullif(interest.subfield,''),interest.industry)||' interest.','/mentorship-session/'||new.id
    from public.mentorship_industry_interests interest
    where interest.notifications_enabled and (interest.industry=new.industry or (new.subfield<>'' and interest.subfield=new.subfield));
  end if;
  return new;
end $$;
drop trigger if exists mentorship_interest_match_notification on public.mentorship_sessions;
create trigger mentorship_interest_match_notification after insert or update of status on public.mentorship_sessions for each row execute procedure public.notify_matching_mentorship_interests();

create or replace function public.schedule_linked_mentor_communications()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session public.mentorship_sessions%rowtype; v_email text;
begin
  select * into v_session from public.mentorship_sessions where id=new.session_id;
  select email into v_email from public.mentor_operations where mentor_id=new.mentor_id;
  if v_email is not null and v_session.status in ('scheduled','published','upcoming') then
    insert into public.mentor_communication_outbox(mentor_id,session_id,recipient_email,template_key,payload,scheduled_for,dedupe_key)
    values
      (new.mentor_id,new.session_id,v_email,'mentor_session_confirmed',jsonb_build_object('title',v_session.title,'starts_at',v_session.starts_at,'meeting_url',v_session.meeting_url),now(),'mentor:'||new.session_id||':'||new.mentor_id||':confirmed'),
      (new.mentor_id,new.session_id,v_email,'mentor_session_reminder_7d',jsonb_build_object('title',v_session.title,'starts_at',v_session.starts_at,'meeting_url',v_session.meeting_url),greatest(now(),v_session.starts_at-interval '7 days'),'mentor:'||new.session_id||':'||new.mentor_id||':7d'),
      (new.mentor_id,new.session_id,v_email,'mentor_session_reminder_24h',jsonb_build_object('title',v_session.title,'starts_at',v_session.starts_at,'meeting_url',v_session.meeting_url),greatest(now(),v_session.starts_at-interval '24 hours'),'mentor:'||new.session_id||':'||new.mentor_id||':24h'),
      (new.mentor_id,new.session_id,v_email,'mentor_session_reminder_1h',jsonb_build_object('title',v_session.title,'starts_at',v_session.starts_at,'meeting_url',v_session.meeting_url),greatest(now(),v_session.starts_at-interval '1 hour'),'mentor:'||new.session_id||':'||new.mentor_id||':1h'),
      (new.mentor_id,new.session_id,v_email,'mentor_session_thank_you',jsonb_build_object('title',v_session.title,'starts_at',v_session.starts_at),v_session.starts_at+interval '2 hours','mentor:'||new.session_id||':'||new.mentor_id||':thank-you')
    on conflict (dedupe_key) do update set payload=excluded.payload,scheduled_for=excluded.scheduled_for,status=case when public.mentor_communication_outbox.status='sent' then 'sent' else 'pending' end;
  end if;
  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,session_id,kind,title,detail,due_at,priority)
  values('session:'||new.session_id||':mentor:'||new.mentor_id||':confirmation',new.mentor_id,new.session_id,'mentor_confirmation','Confirm mentor for session',v_session.title,greatest(now(),v_session.starts_at-interval '7 days'),'high')
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';
  return new;
end $$;
drop trigger if exists mentorship_session_mentor_communications on public.mentorship_session_mentors;
create trigger mentorship_session_mentor_communications after insert or update on public.mentorship_session_mentors for each row execute procedure public.schedule_linked_mentor_communications();

create or replace function public.refresh_mentorship_operations_tasks()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,due_at,priority)
  select 'mentor:'||ops.mentor_id||':availability',ops.mentor_id,'availability_confirmation','Confirm mentor availability',m.full_name,coalesce(ops.availability_confirmation_due::timestamptz,now()),'high'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id
  where ops.status in ('confirmed','active') and (ops.availability_confirmation_due is null or ops.availability_confirmation_due<=current_date+interval '14 days')
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,priority)
  select 'mentor:'||ops.mentor_id||':review',ops.mentor_id,'mentor_review','Review new mentor submission',m.full_name,'normal'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id where ops.status='new_submission'
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,priority)
  select 'mentor:'||ops.mentor_id||':capacity',ops.mentor_id,'one_on_one_capacity','One-on-One mentor capacity almost full',m.full_name||' · '||count(a.id)||' of '||ops.one_on_one_capacity||' assigned','high'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id
  left join public.mentorship_applications a on a.assigned_mentor_id=ops.mentor_id and a.status not in ('completed','not_approved')
  where ops.one_on_one_available and ops.one_on_one_capacity>0
  group by ops.mentor_id,m.full_name,ops.one_on_one_capacity
  having count(a.id)>=greatest(1,ops.one_on_one_capacity-1)
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';
end $$;
revoke execute on function public.refresh_mentorship_operations_tasks() from public, anon;
grant execute on function public.refresh_mentorship_operations_tasks() to authenticated;

do $$ begin
  if exists(select 1 from pg_proc where proname='set_updated_at' and pronamespace='public'::regnamespace) then
    create trigger mentor_operations_set_updated_at before update on public.mentor_operations for each row execute procedure public.set_updated_at();
    create trigger mentorship_operations_tasks_set_updated_at before update on public.mentorship_operations_tasks for each row execute procedure public.set_updated_at();
  end if;
exception when duplicate_object then null;
end $$;

-- Existing approved public mentors remain visible and become fully manageable.
update public.mentors set publish_public_profile=true where active=true;
insert into public.mentor_operations(mentor_id,email,status,source,discovery_available,industry_available,one_on_one_available,one_on_one_capacity,availability_confirmation_due)
select id, id||'@mentor.pending','active','legacy',
  'discovery'=any(mentorship_types),'industry'=any(mentorship_types),'one_on_one'=any(mentorship_types),
  case when 'one_on_one'=any(mentorship_types) then 4 else 0 end,current_date+interval '90 days'
from public.mentors
on conflict (mentor_id) do nothing;
