-- Release-blocker corrections: public content access, member-only enforcement,
-- private mentorship links and authoritative event registration.

-- Public policies must never call an RPC that anon is not allowed to execute.
drop policy if exists "Published content is publicly readable" on public.content_items;
drop policy if exists "Published open content is publicly readable" on public.content_items;
drop policy if exists "Signed-in users read eligible published content" on public.content_items;

create policy "Published open content is publicly readable"
on public.content_items for select to anon
using (
  status='published' and visible=true and access_level='open'
  and (publish_at is null or publish_at<=now())
);

create policy "Signed-in users read eligible published content"
on public.content_items for select to authenticated
using (
  status='published' and visible=true
  and (publish_at is null or publish_at<=now())
  and (
    access_level in ('open','account')
    or (
      access_level='members'
      and exists (
        select 1 from public.memberships m
        where m.user_id=(select auth.uid()) and m.status='verified'
      )
    )
  )
);

drop policy if exists "Published practice questions are readable" on public.career_practice_questions;
create policy "Published practice questions are readable"
on public.career_practice_questions for select to anon, authenticated
using (active=true);

-- Saving a Clique session is a member benefit at the database boundary.
drop policy if exists "Users manage own clique seats" on public.clique_session_seats;
create policy "Verified members manage own clique seats"
on public.clique_session_seats for all to authenticated
using (
  user_id=(select auth.uid())
  and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.status='verified')
)
with check (
  user_id=(select auth.uid())
  and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.status='verified')
);

-- Do not expose private mentorship meeting links through ordinary public reads.
-- Client reads are limited to every column except meeting_url. Admin obtains the
-- complete record through an admin-checked RPC below.
revoke select on public.mentorship_sessions from anon, authenticated;
grant select (
  id,title,mentorship_type,industry,subfield,description,starts_at,
  registration_deadline,capacity,access_level,replay_url,resources,eligibility,
  status,timezone,recording_allowed,published_at,completed_at,cancelled_at,
  audience_type,audience_fields,audience_subfields,selected_user_ids,
  notification_channels,distribution_surfaces,feature_level,
  mentor_confirmed_at,attendance_recorded_at,replay_expected,created_at,updated_at
) on public.mentorship_sessions to anon, authenticated;

drop policy if exists "Published mentorship sessions are public" on public.mentorship_sessions;
create policy "Published open mentorship sessions are public"
on public.mentorship_sessions for select to anon
using (status in ('published','upcoming','live','completed') and access_level='open');
create policy "Signed-in users read eligible mentorship sessions"
on public.mentorship_sessions for select to authenticated
using (
  status in ('published','upcoming','live','completed')
  and (
    access_level='open'
    or exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.status='verified')
  )
);

create or replace function public.admin_list_mentorship_sessions()
returns setof public.mentorship_sessions
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  return query select * from public.mentorship_sessions order by starts_at desc;
end;
$$;
revoke execute on function public.admin_list_mentorship_sessions() from public, anon;
grant execute on function public.admin_list_mentorship_sessions() to authenticated;

create or replace function public.get_registered_mentorship_meeting(p_session_id text)
returns table(meeting_url text, starts_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select s.meeting_url,s.starts_at
  from public.mentorship_sessions s
  where s.id=p_session_id
    and s.status in ('published','upcoming','live')
    and exists(
      select 1 from public.mentorship_registrations r
      where r.session_id=s.id and r.user_id=(select auth.uid()) and r.status='registered'
    );
$$;
revoke execute on function public.get_registered_mentorship_meeting(text) from public, anon;
grant execute on function public.get_registered_mentorship_meeting(text) to authenticated;

-- Event registration is decided atomically on the server. The client cannot
-- declare itself confirmed or bypass capacity/member access checks.
drop policy if exists "Users can create their own event registrations" on public.event_registrations;
drop policy if exists "Users can update their own event registration" on public.event_registrations;
create policy "Users can cancel their own event registrations"
on public.event_registrations for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and status='cancelled');

create or replace function public.register_for_event(
  p_event_id text,
  p_full_name text,
  p_email text,
  p_learning_goal text default null
)
returns public.event_registrations
language plpgsql security definer set search_path=''
as $$
declare
  v_event public.content_items%rowtype;
  v_existing public.event_registrations%rowtype;
  v_result public.event_registrations%rowtype;
  v_capacity integer;
  v_registered integer;
  v_status text;
  v_deadline timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to register'; end if;
  if char_length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter your full name'; end if;
  if position('@' in coalesce(p_email,''))=0 then raise exception 'Enter a valid email address'; end if;

  select * into v_event from public.content_items
  where area='events' and (id::text=p_event_id or slug=p_event_id)
  for update;
  if not found or v_event.status<>'published' or not v_event.visible then raise exception 'This event is not available'; end if;
  if v_event.publish_at is not null and v_event.publish_at>now() then raise exception 'This event is not available'; end if;
  if v_event.access_level='members' and not exists(
    select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.status='verified'
  ) then raise exception 'Verified GWMB membership is required'; end if;

  begin v_deadline:=nullif(v_event.metadata->>'registration_deadline','')::timestamptz;
  exception when others then v_deadline:=null; end;
  if v_deadline is not null and v_deadline<now() then raise exception 'Registration has closed'; end if;
  if v_event.starts_at is not null and v_event.starts_at<now() then raise exception 'This event has already started'; end if;

  select * into v_existing from public.event_registrations
  where user_id=(select auth.uid()) and event_id=v_event.id::text;
  if found and v_existing.status<>'cancelled' then return v_existing; end if;

  begin v_capacity:=nullif(v_event.metadata->>'capacity','')::integer;
  exception when others then v_capacity:=null; end;
  select count(*) into v_registered from public.event_registrations
  where event_id=v_event.id::text and status='registered';
  v_status:=case
    when lower(coalesce(v_event.metadata->>'bookingMode',''))='waitlist' then 'waitlisted'
    when v_capacity is not null and v_registered>=v_capacity then 'waitlisted'
    else 'registered'
  end;

  insert into public.event_registrations(
    user_id,event_id,event_title,event_starts_at,event_route,
    full_name,email,learning_goal,status,registered_at,updated_at
  ) values (
    (select auth.uid()),v_event.id::text,v_event.title,v_event.starts_at,'/event/'||v_event.slug,
    trim(p_full_name),lower(trim(p_email)),nullif(trim(coalesce(p_learning_goal,'')),''),v_status,now(),now()
  )
  on conflict(user_id,event_id) do update set
    full_name=excluded.full_name,email=excluded.email,learning_goal=excluded.learning_goal,
    status=excluded.status,event_title=excluded.event_title,event_starts_at=excluded.event_starts_at,
    event_route=excluded.event_route,registered_at=now(),updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.register_for_event(text,text,text,text) from public, anon;
grant execute on function public.register_for_event(text,text,text,text) to authenticated;

create or replace function public.get_registered_event_meeting(p_event_slug text)
returns table(meeting_url text, starts_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select m.meeting_url,c.starts_at
  from public.content_items c
  join public.content_meetings m on m.content_id=c.id and m.status='ready'
  where c.area='events' and (c.id::text=p_event_slug or c.slug=p_event_slug)
    and exists(
      select 1 from public.event_registrations r
      where r.event_id=c.id::text and r.user_id=(select auth.uid()) and r.status='registered'
    );
$$;
revoke execute on function public.get_registered_event_meeting(text) from public, anon;
grant execute on function public.get_registered_event_meeting(text) to authenticated;
