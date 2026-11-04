-- Keep mentorship interests specific enough for relevant session matching.

alter table public.mentorship_industry_interests
  add column if not exists subfield text not null default '';

alter table public.mentorship_sessions
  add column if not exists subfield text not null default '';

alter table public.mentorship_industry_interests
  drop constraint if exists mentorship_industry_interests_pkey;

alter table public.mentorship_industry_interests
  add primary key (user_id, industry, subfield);

create index if not exists mentorship_interest_match_idx
  on public.mentorship_industry_interests (industry, subfield)
  where notifications_enabled = true;

create or replace function public.queue_mentorship_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_title text;
  v_route text;
begin
  if tg_table_name = 'mentorship_registrations' then
    v_route := '/mentorship-session/' || new.session_id;
    if new.status = 'cancelled' then
      update public.notification_outbox set status='skipped', error_message='Saved seat cancelled'
      where status='pending' and payload ->> 'registration_id'=new.id::text;
      return new;
    end if;
    if tg_op='UPDATE' and old.status=new.status then return new; end if;
    select starts_at,title into v_start,v_title from public.mentorship_sessions where id=new.session_id;
    insert into public.user_notifications(user_id,kind,title,body,route)
    values(new.user_id,'mentorship_seat_'||new.status,
      case when new.status='waitlisted' then 'You joined the mentorship waitlist' else 'Seat Saved ✓' end,
      case when new.status='waitlisted' then v_title||': we will notify you if a place opens.' else v_title||': we will remind you before it begins.' end,
      v_route);
    insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
    values(new.user_id,'email','mentorship_seat_'||new.status,jsonb_build_object('registration_id',new.id,'session_id',new.session_id,'title',v_title,'route',v_route),now(),'mentorship:'||new.id||':email:confirmation')
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    if new.status='registered' and v_start>now() then
      insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
      select new.user_id,reminder.channel,reminder.template_key,
        jsonb_build_object('registration_id',new.id,'session_id',new.session_id,'title',v_title,'route',v_route),
        reminder.scheduled_for,'mentorship:'||new.id||':'||reminder.channel||':'||reminder.template_key
      from (values
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
      where (reminder.channel='in_app')
         or (reminder.channel='email' and coalesce(pref.email_enabled,true))
         or (reminder.channel='push' and coalesce(pref.push_enabled,false))
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
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
end;
$$;

drop trigger if exists mentorship_registration_notification on public.mentorship_registrations;
create trigger mentorship_registration_notification after insert or update of status on public.mentorship_registrations for each row execute procedure public.queue_mentorship_notification();

create or replace function public.notify_matching_mentorship_interests()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='upcoming' and new.mentorship_type='industry' then
    insert into public.user_notifications(user_id,kind,title,body,route)
    select interest.user_id,'mentorship_interest_match','A relevant mentorship just opened',new.title||' matches your saved '||coalesce(nullif(interest.subfield,''),interest.industry)||' interest.','/mentorship-session/'||new.id
    from public.mentorship_industry_interests interest
    where interest.notifications_enabled and (interest.industry=new.industry or (new.subfield<>'' and interest.subfield=new.subfield));
  end if;
  return new;
end;
$$;

drop trigger if exists mentorship_interest_match_notification on public.mentorship_sessions;
create trigger mentorship_interest_match_notification after insert on public.mentorship_sessions for each row execute procedure public.notify_matching_mentorship_interests();
