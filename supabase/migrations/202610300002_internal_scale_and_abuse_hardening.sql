-- Internal launch hardening: authoritative user submissions, idempotency,
-- rate limits and safer attendance/registration state transitions.

create table if not exists public.user_action_rate_limits (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (actor_user_id, action_key, window_started_at)
);

alter table public.user_action_rate_limits enable row level security;
revoke all on public.user_action_rate_limits from public, anon, authenticated;

create or replace function public.enforce_user_action_rate_limit(
  p_action_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then raise exception 'Sign in to continue'; end if;
  if nullif(trim(p_action_key),'') is null
     or p_max_requests not between 1 and 1000
     or p_window_seconds not between 60 and 604800 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.user_action_rate_limits(
    actor_user_id, action_key, window_started_at, request_count, updated_at
  ) values (
    v_user, left(trim(p_action_key),100), v_window, 1, now()
  )
  on conflict(actor_user_id,action_key,window_started_at) do update
    set request_count=public.user_action_rate_limits.request_count+1,
        updated_at=now()
    where public.user_action_rate_limits.request_count < p_max_requests
  returning request_count into v_count;

  if v_count is null then
    raise exception 'Too many attempts. Please wait and try again.' using errcode='P0001';
  end if;
end;
$$;
revoke execute on function public.enforce_user_action_rate_limit(text,integer,integer) from public,anon,authenticated;

-- Requests must use the guarded RPCs; ordinary clients cannot bypass their
-- duplicate and frequency checks with a direct table insert.
revoke insert on public.account_requests, public.support_requests from authenticated;
drop policy if exists "Users create own account requests" on public.account_requests;
drop policy if exists "Users create own support requests" on public.support_requests;

create or replace function public.submit_support_request(
  p_type text,
  p_subject text,
  p_message text,
  p_route text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_email text;
  v_subject text := trim(coalesce(p_subject,''));
  v_message text := trim(coalesce(p_message,''));
begin
  if (select auth.uid()) is null then raise exception 'Sign in to contact support'; end if;
  if p_type not in ('support','problem','feedback') then raise exception 'Unsupported request type'; end if;
  if length(v_subject)<3 or length(v_message)<10 then raise exception 'Add a subject and a little more detail'; end if;

  select id into v_id
  from public.support_requests
  where user_id=(select auth.uid())
    and request_type=p_type
    and lower(subject)=lower(v_subject)
    and message=v_message
    and created_at>now()-interval '10 minutes'
  order by created_at desc
  limit 1;
  if v_id is not null then return v_id; end if;

  perform public.enforce_user_action_rate_limit('support_request',5,3600);
  select email into v_email from auth.users where id=(select auth.uid());
  insert into public.support_requests(user_id,email,request_type,subject,message,route)
  values((select auth.uid()),v_email,p_type,left(v_subject,180),left(v_message,5000),nullif(left(trim(coalesce(p_route,'')),240),''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.submit_support_request(text,text,text,text) from public,anon;
grant execute on function public.submit_support_request(text,text,text,text) to authenticated;

-- Error intake is intentionally available before sign-in, but duplicates do
-- not grow the log and authenticated clients have a bounded hourly budget too.
revoke insert on public.app_error_logs from anon,authenticated;
create or replace function public.log_app_error(
  p_source text,
  p_message text,
  p_severity text default 'error',
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_user uuid := (select auth.uid());
  v_source text := left(coalesce(nullif(trim(p_source),''),'unknown'),120);
  v_message text := left(coalesce(nullif(trim(p_message),''),'Unknown application error'),2000);
  v_client text := left(coalesce(p_context->>'client_id','unknown'),100);
begin
  select id into v_id
  from public.app_error_logs
  where user_id is not distinct from v_user
    and source=v_source
    and message=v_message
    and (v_user is not null or context->>'client_id'=v_client)
    and created_at>now()-interval '2 minutes'
  order by created_at desc
  limit 1;
  if v_id is not null then return v_id; end if;

  if v_user is null then
    if v_client='unknown' or (
      select count(*) from public.app_error_logs
      where user_id is null and context->>'client_id'=v_client
        and created_at>now()-interval '1 hour'
    )>=20 then return null; end if;
  else
    perform public.enforce_user_action_rate_limit('app_error_log',60,3600);
  end if;

  insert into public.app_error_logs(user_id,severity,source,message,context,platform,app_version)
  values(
    v_user,
    case when p_severity in ('warning','error','fatal') then p_severity else 'error' end,
    v_source,v_message,coalesce(p_context,'{}'::jsonb),
    left(p_context->>'platform',40),left(p_context->>'app_version',80)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_app_error(text,text,text,jsonb) from public;
grant execute on function public.log_app_error(text,text,text,jsonb) to anon,authenticated;

-- Mentorship seats are allocated atomically on the server. A client cannot
-- claim a confirmed seat, bypass members-only access, or overbook capacity.
drop policy if exists "Users register themselves" on public.mentorship_registrations;
drop policy if exists "Users cancel their registrations" on public.mentorship_registrations;
drop policy if exists "Users cancel own mentorship registrations" on public.mentorship_registrations;
drop policy if exists "Admins update mentorship registrations" on public.mentorship_registrations;
revoke insert on public.mentorship_registrations from authenticated;

create policy "Users cancel own mentorship registrations"
on public.mentorship_registrations for update to authenticated
using (
  user_id=(select auth.uid()) and attendance_status='not_recorded'
)
with check (
  user_id=(select auth.uid()) and status='cancelled' and attendance_status='not_recorded'
);

create policy "Admins update mentorship registrations"
on public.mentorship_registrations for update to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.register_for_mentorship_session(p_session_id text)
returns public.mentorship_registrations
language plpgsql
security definer
set search_path=''
as $$
declare
  v_session public.mentorship_sessions%rowtype;
  v_existing public.mentorship_registrations%rowtype;
  v_result public.mentorship_registrations%rowtype;
  v_registered integer;
  v_status text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to save your seat'; end if;

  select * into v_session
  from public.mentorship_sessions
  where id=p_session_id
  for update;
  if not found or v_session.status not in ('published','upcoming') then
    raise exception 'This mentorship session is not open for registration';
  end if;
  if v_session.registration_deadline is not null and v_session.registration_deadline<now() then
    raise exception 'Registration has closed';
  end if;
  if v_session.starts_at<=now() then raise exception 'This session has already started'; end if;
  if v_session.access_level='members' and not exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.status='verified'
  ) then raise exception 'Verified GWMB membership is required'; end if;

  select * into v_existing
  from public.mentorship_registrations
  where user_id=(select auth.uid()) and session_id=p_session_id;
  if found and v_existing.status<>'cancelled' then return v_existing; end if;

  perform public.enforce_user_action_rate_limit('mentorship_session_registration',30,3600);
  select count(*) into v_registered
  from public.mentorship_registrations
  where session_id=p_session_id and status='registered';
  v_status:=case
    when v_session.capacity is not null and v_registered>=v_session.capacity then 'waitlisted'
    else 'registered'
  end;

  insert into public.mentorship_registrations(
    user_id,session_id,status,attendance_status,reminder_status,registered_at,updated_at
  ) values (
    (select auth.uid()),p_session_id,v_status,'not_recorded',
    case when v_status='registered' then 'scheduled' else 'not_required' end,now(),now()
  )
  on conflict(user_id,session_id) do update set
    status=excluded.status,attendance_status='not_recorded',
    reminder_status=excluded.reminder_status,registered_at=now(),updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.register_for_mentorship_session(text) from public,anon;
grant execute on function public.register_for_mentorship_session(text) to authenticated;

-- One active one-to-one request is returned idempotently. New requests are
-- member-checked and frequency-limited before insertion.
drop policy if exists "Members create applications" on public.mentorship_applications;
revoke insert on public.mentorship_applications from authenticated;

create or replace function public.submit_mentorship_application(
  p_requested_mentor_id text,
  p_recommend_for_me boolean,
  p_industry text,
  p_guidance_request text,
  p_desired_outcome text,
  p_career_stage text,
  p_supporting_information text
)
returns public.mentorship_applications
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing public.mentorship_applications%rowtype;
  v_result public.mentorship_applications%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to apply'; end if;
  if not exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.status='verified'
  ) then raise exception 'Verified GWMB membership is required'; end if;

  select * into v_existing
  from public.mentorship_applications
  where user_id=(select auth.uid())
    and status not in ('not_approved','completed')
  order by submitted_at desc
  limit 1;
  if found then return v_existing; end if;

  if char_length(trim(coalesce(p_industry,'')))<2
     or char_length(trim(coalesce(p_guidance_request,''))) not between 10 and 1500
     or char_length(trim(coalesce(p_desired_outcome,''))) not between 10 and 1500
     or char_length(trim(coalesce(p_career_stage,'')))<2 then
    raise exception 'Complete your career field, guidance need, desired outcome and career stage';
  end if;
  if not coalesce(p_recommend_for_me,false) and p_requested_mentor_id is null then
    raise exception 'Choose a mentor or ask GWMB to recommend one';
  end if;
  if p_requested_mentor_id is not null and not exists(
    select 1 from public.mentors m
    where m.id=p_requested_mentor_id and m.active=true and 'one_on_one'=any(m.mentorship_types)
  ) then raise exception 'The selected mentor is not available for one-on-one mentorship'; end if;

  perform public.enforce_user_action_rate_limit('mentorship_application',3,86400);
  insert into public.mentorship_applications(
    user_id,requested_mentor_id,assigned_mentor_id,recommend_for_me,industry,
    guidance_request,desired_outcome,career_stage,supporting_information,status
  ) values (
    (select auth.uid()),p_requested_mentor_id,null,coalesce(p_recommend_for_me,false),
    trim(p_industry),trim(p_guidance_request),trim(p_desired_outcome),trim(p_career_stage),
    nullif(trim(coalesce(p_supporting_information,'')),''),'submitted'
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.submit_mentorship_application(text,boolean,text,text,text,text,text) from public,anon;
grant execute on function public.submit_mentorship_application(text,boolean,text,text,text,text,text) to authenticated;

-- Career-review documents are accepted only through a consent-aware RPC.
drop policy if exists "Career reviews owner submit" on public.career_review_submissions;
revoke insert on public.career_review_submissions from authenticated;

create or replace function public.submit_career_review(
  p_review_type text,
  p_cv_record_id uuid,
  p_uploaded_file_path text,
  p_uploaded_file_name text,
  p_linkedin_url text,
  p_target_role text,
  p_company_name text,
  p_job_description_url text,
  p_job_description_text text,
  p_career_field text,
  p_career_stage text,
  p_feedback_focus text,
  p_clinic_event_id uuid,
  p_consent_authorized_review boolean,
  p_consent_group_review boolean,
  p_anonymize_for_session boolean
)
returns public.career_review_submissions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing public.career_review_submissions%rowtype;
  v_result public.career_review_submissions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to submit for review'; end if;
  if p_review_type not in ('cv','linkedin','job_application','career_profile') then raise exception 'Choose a valid review type'; end if;
  if not coalesce(p_consent_authorized_review,false) then raise exception 'Review consent is required'; end if;
  if nullif(trim(coalesce(p_career_field,'')),'') is null
     or nullif(trim(coalesce(p_target_role,'')),'') is null
     or nullif(trim(coalesce(p_career_stage,'')),'') is null then
    raise exception 'Complete your career field, target role and career stage';
  end if;
  if p_review_type in ('cv','career_profile') and p_cv_record_id is null and nullif(trim(coalesce(p_uploaded_file_path,'')),'') is null then
    raise exception 'Choose a CV or upload a document';
  end if;
  if p_review_type='linkedin' and nullif(trim(coalesce(p_linkedin_url,'')),'') is null then raise exception 'Add your LinkedIn URL'; end if;
  if p_cv_record_id is not null and not exists(
    select 1 from public.cv_records c where c.id=p_cv_record_id and c.user_id=(select auth.uid())
  ) then raise exception 'The selected CV is not available'; end if;
  if p_uploaded_file_path is not null
     and p_uploaded_file_path not like ((select auth.uid())::text||'/%') then
    raise exception 'The uploaded document does not belong to this account';
  end if;
  if p_clinic_event_id is not null and not exists(
    select 1 from public.content_items c
    where c.id=p_clinic_event_id and c.area='events' and c.status='published' and c.visible=true
      and (c.publish_at is null or c.publish_at<=now())
  ) then raise exception 'The selected clinic is not available'; end if;

  select * into v_existing
  from public.career_review_submissions
  where user_id=(select auth.uid())
    and review_type=p_review_type
    and clinic_event_id is not distinct from p_clinic_event_id
    and status in ('submitted','under_review','selected')
  order by created_at desc
  limit 1;
  if found then return v_existing; end if;

  perform public.enforce_user_action_rate_limit('career_review_submission',5,86400);
  insert into public.career_review_submissions(
    user_id,review_type,cv_record_id,uploaded_file_path,uploaded_file_name,
    linkedin_url,target_role,company_name,job_description_url,job_description_text,
    career_field,career_stage,feedback_focus,clinic_event_id,future_clinic_interest,
    consent_authorized_review,consent_group_review,anonymize_for_session,status
  ) values (
    (select auth.uid()),p_review_type,p_cv_record_id,nullif(trim(coalesce(p_uploaded_file_path,'')),''),
    nullif(left(trim(coalesce(p_uploaded_file_name,'')),240),''),nullif(left(trim(coalesce(p_linkedin_url,'')),500),''),
    left(trim(p_target_role),180),nullif(left(trim(coalesce(p_company_name,'')),180),''),
    nullif(left(trim(coalesce(p_job_description_url,'')),1000),''),nullif(left(trim(coalesce(p_job_description_text,'')),12000),''),
    left(trim(p_career_field),180),left(trim(p_career_stage),100),nullif(left(trim(coalesce(p_feedback_focus,'')),2000),''),
    p_clinic_event_id,p_clinic_event_id is null,true,coalesce(p_consent_group_review,false),
    coalesce(p_anonymize_for_session,true),'submitted'
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.submit_career_review(text,uuid,text,text,text,text,text,text,text,text,text,text,uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.submit_career_review(text,uuid,text,text,text,text,text,text,text,text,text,text,uuid,boolean,boolean,boolean) to authenticated;

-- Volunteer applications use the authenticated account identity and return an
-- existing active application when a user retries a timed-out submission.
drop policy if exists "Users submit volunteer applications" on public.volunteer_applications;
revoke insert on public.volunteer_applications from authenticated;

create or replace function public.submit_volunteer_application(
  p_full_name text,
  p_location text,
  p_interest_area text,
  p_availability text,
  p_motivation text
)
returns public.volunteer_applications
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing public.volunteer_applications%rowtype;
  v_result public.volunteer_applications%rowtype;
  v_email text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to volunteer'; end if;

  select * into v_existing
  from public.volunteer_applications
  where user_id=(select auth.uid()) and status in ('submitted','under_review','accepted')
  order by submitted_at desc
  limit 1;
  if found then return v_existing; end if;

  if char_length(trim(coalesce(p_full_name,'')))<2
     or char_length(trim(coalesce(p_location,'')))<2
     or char_length(trim(coalesce(p_interest_area,'')))<2
     or char_length(trim(coalesce(p_availability,'')))<3
     or char_length(trim(coalesce(p_motivation,'')))<20 then
    raise exception 'Complete every field and add a little more detail';
  end if;

  perform public.enforce_user_action_rate_limit('volunteer_application',3,86400);
  select email into v_email from auth.users where id=(select auth.uid());
  insert into public.volunteer_applications(
    user_id,full_name,email,location,interest_area,availability,motivation,status
  ) values (
    (select auth.uid()),left(trim(p_full_name),180),v_email,left(trim(p_location),180),
    left(trim(p_interest_area),180),left(trim(p_availability),1000),left(trim(p_motivation),5000),'submitted'
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.submit_volunteer_application(text,text,text,text,text) from public,anon;
grant execute on function public.submit_volunteer_application(text,text,text,text,text) to authenticated;

-- Attendance requests are truly idempotent: a repeat tap cannot reset an
-- administrator's confirmed or rejected decision back to pending.
create or replace function public.request_live_attendance(p_activity_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_activity public.local_activities%rowtype;
  v_chapter text;
  v_existing text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to request attendance'; end if;
  select a into v_activity from public.local_activities a where a.id=p_activity_id;
  select c.name into v_chapter from public.chapters c where c.id=v_activity.chapter_id;
  if v_activity.id is null or v_activity.status<>'published'
     or now() not between v_activity.starts_at-interval '30 minutes'
                          and coalesce(v_activity.ends_at,v_activity.starts_at+interval '4 hours') then
    raise exception 'Attendance opens 30 minutes before the activity and closes when it ends';
  end if;
  if not exists(
    select 1 from public.memberships m
    join public.membership_records r on r.id=m.membership_record_id
    where m.user_id=(select auth.uid()) and m.status='verified'
      and lower(trim(r.chapter))=lower(trim(v_chapter))
  ) then raise exception 'Verified membership in this chapter is required'; end if;

  select status into v_existing
  from public.local_attendance_requests
  where activity_id=p_activity_id and user_id=(select auth.uid());
  if v_existing is not null then return v_existing; end if;

  insert into public.local_attendance_requests(activity_id,user_id)
  values(p_activity_id,(select auth.uid()));
  return 'pending';
end;
$$;
revoke execute on function public.request_live_attendance(uuid) from public,anon;
grant execute on function public.request_live_attendance(uuid) to authenticated;

-- Supporting indexes for high-volume Admin queues and duplicate checks.
create index if not exists membership_records_created_idx on public.membership_records(created_at desc);
create index if not exists membership_verification_submitted_idx on public.membership_verification_requests(submitted_at desc);
create index if not exists membership_applications_submitted_idx on public.membership_applications(submitted_at desc);
create index if not exists cv_records_updated_idx on public.cv_records(updated_at desc);
create index if not exists volunteer_applications_user_status_idx on public.volunteer_applications(user_id,status,submitted_at desc);
create index if not exists support_requests_user_recent_idx on public.support_requests(user_id,created_at desc);
create index if not exists app_error_logs_user_recent_idx on public.app_error_logs(user_id,created_at desc);
