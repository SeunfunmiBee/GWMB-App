-- Complete the existing mentorship operations model without introducing a
-- second event system. One session record carries its audience, notification,
-- distribution and completion settings everywhere it is surfaced.

alter table public.mentorship_sessions
  drop constraint if exists mentorship_sessions_mentorship_type_check;
alter table public.mentorship_sessions
  add constraint mentorship_sessions_mentorship_type_check
  check (mentorship_type in ('discovery','industry','webinar_training'));

alter table public.mentorship_sessions
  add column if not exists audience_type text not null default 'everyone',
  add column if not exists audience_fields text[] not null default '{}',
  add column if not exists audience_subfields text[] not null default '{}',
  add column if not exists selected_user_ids uuid[] not null default '{}',
  add column if not exists notification_channels text[] not null default array['in_app']::text[],
  add column if not exists distribution_surfaces text[] not null default array['mentorship']::text[],
  add column if not exists feature_level text not null default 'normal',
  add column if not exists mentor_confirmed_at timestamptz,
  add column if not exists attendance_recorded_at timestamptz,
  add column if not exists replay_expected boolean not null default false;

alter table public.mentorship_sessions drop constraint if exists mentorship_sessions_audience_type_check;
alter table public.mentorship_sessions add constraint mentorship_sessions_audience_type_check
  check (audience_type in ('everyone','members','career_field','subfield','selected_users'));
alter table public.mentorship_sessions drop constraint if exists mentorship_sessions_feature_level_check;
alter table public.mentorship_sessions add constraint mentorship_sessions_feature_level_check
  check (feature_level in ('normal','featured','priority'));
alter table public.mentorship_sessions drop constraint if exists mentorship_sessions_notification_channels_check;
alter table public.mentorship_sessions add constraint mentorship_sessions_notification_channels_check
  check (notification_channels <@ array['in_app','push','email']::text[]);
alter table public.mentorship_sessions drop constraint if exists mentorship_sessions_distribution_surfaces_check;
alter table public.mentorship_sessions add constraint mentorship_sessions_distribution_surfaces_check
  check (distribution_surfaces <@ array['mentorship','learn','home','related_courses']::text[]);

create index if not exists mentorship_sessions_audience_idx
  on public.mentorship_sessions(audience_type, industry, subfield, starts_at);

alter table public.mentor_operations
  add column if not exists availability_status text not null default 'active',
  add column if not exists next_available_period text;
alter table public.mentor_operations drop constraint if exists mentor_operations_availability_status_check;
alter table public.mentor_operations add constraint mentor_operations_availability_status_check
  check (availability_status in ('active','unavailable'));

-- Registered users get only the channels selected on the shared session.
create or replace function public.queue_mentorship_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_start timestamptz;
  v_title text;
  v_route text;
  v_channels text[];
begin
  if tg_table_name='mentorship_registrations' then
    v_route := '/mentorship-session/'||new.session_id;
    if new.status='cancelled' then
      update public.notification_outbox set status='skipped',error_message='Saved seat cancelled'
      where status='pending' and payload->>'registration_id'=new.id::text;
      return new;
    end if;
    if tg_op='UPDATE' and old.status=new.status then return new; end if;
    select starts_at,title,notification_channels into v_start,v_title,v_channels
      from public.mentorship_sessions where id=new.session_id;

    if 'in_app'=any(v_channels) then
      insert into public.user_notifications(user_id,kind,title,body,route)
      values(new.user_id,'mentorship_seat_'||new.status,
        case when new.status='waitlisted' then 'You joined the mentorship waitlist' else 'Seat Saved ✓' end,
        case when new.status='waitlisted' then v_title||': we will notify you if a place opens.' else v_title||': we will remind you before it begins.' end,v_route);
    end if;

    if new.status='registered' and v_start>now() then
      insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
      select new.user_id,reminder.channel,reminder.template_key,
        jsonb_build_object('registration_id',new.id,'session_id',new.session_id,'title',v_title,'route',v_route),
        reminder.scheduled_for,'mentorship:'||new.id||':'||reminder.channel||':'||reminder.template_key
      from (values
        ('in_app','mentorship_seat_saved',now()),
        ('push','mentorship_seat_saved',now()),
        ('email','mentorship_seat_saved',now()),
        ('push','mentorship_session_reminder_24h',greatest(now(),v_start-interval '24 hours')),
        ('in_app','mentorship_session_reminder_24h',greatest(now(),v_start-interval '24 hours')),
        ('email','mentorship_session_reminder_24h',greatest(now(),v_start-interval '24 hours')),
        ('push','mentorship_session_reminder_1h',greatest(now(),v_start-interval '1 hour')),
        ('in_app','mentorship_session_reminder_1h',greatest(now(),v_start-interval '1 hour')),
        ('email','mentorship_session_reminder_1h',greatest(now(),v_start-interval '1 hour')),
        ('push','mentorship_session_live',v_start),
        ('in_app','mentorship_session_live',v_start)
      ) as reminder(channel,template_key,scheduled_for)
      left join public.notification_preferences pref on pref.user_id=new.user_id
      where reminder.channel=any(v_channels)
        and ((reminder.channel='in_app')
          or (reminder.channel='email' and coalesce(pref.email_enabled,true))
          or (reminder.channel='push' and coalesce(pref.push_enabled,false)))
      on conflict (dedupe_key) where dedupe_key is not null
      do update set payload=excluded.payload,scheduled_for=excluded.scheduled_for,
        status=case when public.notification_outbox.status='sent' then 'sent' else 'pending' end;
    end if;
    return new;
  end if;

  if tg_op='INSERT' or old.status is distinct from new.status then
    insert into public.user_notifications(user_id,kind,title,body,route)
    values(new.user_id,'mentorship_application_'||new.status,
      case when new.status='approved' then 'Your mentorship request is approved' else 'One-on-One mentorship update' end,
      case when new.status='approved' then 'Open My Mentorship to book your session.' else 'Open My Mentorship to review your application status.' end,
      '/mentorship/my');
  end if;
  return new;
end $$;

-- Adding a replay updates every registered participant from this same record.
create or replace function public.queue_mentorship_replay_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(new.replay_url,'') is not null and (tg_op='INSERT' or old.replay_url is distinct from new.replay_url) then
    insert into public.user_notifications(user_id,kind,title,body,route)
    select r.user_id,'mentorship_replay_available','Replay available',new.title||' is ready to watch.','/mentorship-session/'||new.id
    from public.mentorship_registrations r
    where r.session_id=new.id and r.status='registered'
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists mentorship_replay_notification on public.mentorship_sessions;
create trigger mentorship_replay_notification after insert or update of replay_url on public.mentorship_sessions
for each row execute procedure public.queue_mentorship_replay_notification();

-- Rebuild the morning control centre from current operational state.
create or replace function public.refresh_mentorship_operations_tasks()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;

  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,due_at,priority)
  select 'mentor:'||ops.mentor_id||':availability',ops.mentor_id,'availability_confirmation','Reconfirm availability',m.full_name,coalesce(ops.availability_confirmation_due::timestamptz,now()),'high'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id
  where ops.status in ('confirmed','active') and (ops.availability_confirmation_due is null or ops.availability_confirmation_due<=current_date+interval '14 days')
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,priority)
  select 'mentor:'||ops.mentor_id||':review',ops.mentor_id,'mentor_review','Review new mentor submission',m.full_name,'normal'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id where ops.status='new_submission'
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,mentor_id,kind,title,detail,priority)
  select 'mentor:'||ops.mentor_id||':capacity',ops.mentor_id,'one_on_one_capacity','One-on-One capacity almost full',m.full_name||' · '||count(a.id)||' of '||ops.one_on_one_capacity||' assigned','high'
  from public.mentor_operations ops join public.mentors m on m.id=ops.mentor_id
  left join public.mentorship_applications a on a.assigned_mentor_id=ops.mentor_id and a.status not in ('completed','not_approved')
  where ops.one_on_one_available and ops.one_on_one_capacity>0
  group by ops.mentor_id,m.full_name,ops.one_on_one_capacity
  having count(a.id)>=greatest(1,ops.one_on_one_capacity-1)
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
  select 'session:'||s.id||':meeting-link',s.id,'missing_meeting_link','Add meeting link',s.title,s.starts_at-interval '24 hours','urgent'
  from public.mentorship_sessions s where s.status in ('scheduled','published','upcoming') and s.starts_at>now() and nullif(s.meeting_url,'') is null
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,priority=excluded.priority,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
  select 'session:'||s.id||':audience',s.id,'missing_audience','Configure audience and notifications',s.title,now(),'high'
  from public.mentorship_sessions s where s.status in ('scheduled','published','upcoming')
    and (cardinality(s.notification_channels)=0 or cardinality(s.distribution_surfaces)=0
      or (s.audience_type='career_field' and cardinality(s.audience_fields)=0)
      or (s.audience_type='subfield' and cardinality(s.audience_subfields)=0)
      or (s.audience_type='selected_users' and cardinality(s.selected_user_ids)=0))
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
  select 'session:'||s.id||':mentor-confirmation',s.id,'mentor_confirmation','Confirm mentor for session',s.title,greatest(now(),s.starts_at-interval '7 days'),'high'
  from public.mentorship_sessions s where s.status in ('scheduled','published','upcoming') and s.starts_at>now() and s.mentor_confirmed_at is null
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
  select 'session:'||s.id||':attendance',s.id,'attendance_missing','Record attendance',s.title,coalesce(s.completed_at,s.starts_at)+interval '1 hour','high'
  from public.mentorship_sessions s where (s.status='completed' or s.starts_at<now()-interval '2 hours') and s.attendance_recorded_at is null
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,session_id,kind,title,detail,due_at,priority)
  select 'session:'||s.id||':replay',s.id,'replay_missing','Add session replay',s.title,coalesce(s.completed_at,s.starts_at)+interval '1 day','normal'
  from public.mentorship_sessions s where s.status='completed' and s.replay_expected and nullif(s.replay_url,'') is null
  on conflict (dedupe_key) do update set detail=excluded.detail,due_at=excluded.due_at,status='open';

  insert into public.mentorship_operations_tasks(dedupe_key,kind,title,detail,due_at,priority,metadata)
  select 'application:'||a.id||':assignment','one_on_one_assignment','Assign mentor',coalesce(p.full_name,'Member request'),now(),'urgent',jsonb_build_object('application_id',a.id)
  from public.mentorship_applications a left join public.profiles p on p.id=a.user_id
  where a.status in ('submitted','under_review','approved') and a.assigned_mentor_id is null
  on conflict (dedupe_key) do update set detail=excluded.detail,status='open';
end $$;

-- Attendance is considered operationally complete once every active seat has a decision.
create or replace function public.mark_mentorship_attendance_recorded()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(
    select 1 from public.mentorship_registrations
    where session_id=new.session_id and status='registered' and attendance_status='not_recorded'
  ) then
    update public.mentorship_sessions set attendance_recorded_at=now() where id=new.session_id;
    update public.mentorship_operations_tasks set status='completed',completed_at=now()
      where dedupe_key='session:'||new.session_id||':attendance' and status='open';
  end if;
  return new;
end $$;
drop trigger if exists mentorship_attendance_completion on public.mentorship_registrations;
create trigger mentorship_attendance_completion after update of attendance_status on public.mentorship_registrations
for each row execute procedure public.mark_mentorship_attendance_recorded();

