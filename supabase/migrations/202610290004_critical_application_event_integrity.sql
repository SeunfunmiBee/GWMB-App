-- Critical launch integrity fixes for opportunity applications and event joining.

alter table public.opportunity_applications
  add column if not exists opportunity_content_id uuid references public.content_items(id) on delete restrict,
  add column if not exists submission_reference text;

update public.opportunity_applications a
set opportunity_content_id=c.id
from public.content_items c
where a.opportunity_content_id is null
  and c.area='opportunities'
  and c.slug=a.opportunity_id;

update public.opportunity_applications
set submission_reference='GWMB-'||upper(substr(replace(id::text,'-',''),1,10))
where submission_reference is null;

create unique index if not exists opportunity_applications_submission_reference_idx
  on public.opportunity_applications(submission_reference)
  where submission_reference is not null;

-- Drafts may be stored directly, but a client can no longer promote a draft to
-- submitted without the server validating the canonical Admin content record.
drop policy if exists "Users can create their own applications" on public.opportunity_applications;
drop policy if exists "Users can update their own draft applications" on public.opportunity_applications;
create policy "Users can create their own application drafts"
on public.opportunity_applications for insert to authenticated
with check((select auth.uid())=user_id and status='draft');
create policy "Users can update their own application drafts"
on public.opportunity_applications for update to authenticated
using((select auth.uid())=user_id and status='draft')
with check((select auth.uid())=user_id and status='draft');

create or replace function public.get_opportunity_application_context(p_opportunity_id text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_item public.content_items%rowtype;
  v_deadline timestamptz;
  v_member boolean;
  v_can_apply boolean:=true;
  v_reason text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to apply'; end if;

  select * into v_item
  from public.content_items
  where area='opportunities' and (id::text=p_opportunity_id or slug=p_opportunity_id)
  limit 1;

  if not found or v_item.status<>'published' or not v_item.visible
     or (v_item.publish_at is not null and v_item.publish_at>now()) then
    return null;
  end if;

  v_member:=exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.status='verified'
  );
  begin
    v_deadline:=nullif(v_item.metadata->>'deadline','')::timestamptz;
  exception when others then
    v_deadline:=null;
  end;

  if v_item.access_level='members' and not v_member then
    v_can_apply:=false;
    v_reason:='Verified GWMB membership is required for this opportunity.';
  elsif v_item.access_level='admin' then
    v_can_apply:=false;
    v_reason:='This opportunity is not open for applications.';
  elsif v_deadline is not null and v_deadline<now() then
    v_can_apply:=false;
    v_reason:='Applications for this opportunity have closed.';
  end if;

  return jsonb_build_object(
    'id',v_item.id,
    'slug',v_item.slug,
    'title',v_item.title,
    'eyebrow',v_item.eyebrow,
    'summary',v_item.summary,
    'access_level',v_item.access_level,
    'metadata',v_item.metadata,
    'can_apply',v_can_apply,
    'blocked_reason',v_reason
  );
end;
$$;
revoke execute on function public.get_opportunity_application_context(text) from public, anon;
grant execute on function public.get_opportunity_application_context(text) to authenticated;

create or replace function public.submit_opportunity_application(
  p_opportunity_id text,
  p_portfolio_url text,
  p_motivation text,
  p_cv_record_id uuid default null,
  p_cv_snapshot jsonb default null
)
returns public.opportunity_applications
language plpgsql security definer set search_path=''
as $$
declare
  v_item public.content_items%rowtype;
  v_existing public.opportunity_applications%rowtype;
  v_result public.opportunity_applications%rowtype;
  v_deadline timestamptz;
  v_reference text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to apply'; end if;
  if char_length(trim(coalesce(p_motivation,''))) not between 30 and 2000 then
    raise exception 'Your motivation must be between 30 and 2000 characters';
  end if;

  select * into v_item
  from public.content_items
  where area='opportunities' and (id::text=p_opportunity_id or slug=p_opportunity_id)
  for update;

  if not found or v_item.status<>'published' or not v_item.visible
     or (v_item.publish_at is not null and v_item.publish_at>now()) then
    raise exception 'This opportunity is not available';
  end if;
  if v_item.access_level='members' and not exists(
    select 1 from public.memberships m
    where m.user_id=(select auth.uid()) and m.status='verified'
  ) then raise exception 'Verified GWMB membership is required'; end if;
  if v_item.access_level='admin' then raise exception 'This opportunity is not open for applications'; end if;

  begin
    v_deadline:=nullif(v_item.metadata->>'deadline','')::timestamptz;
  exception when others then
    v_deadline:=null;
  end;
  if v_deadline is not null and v_deadline<now() then raise exception 'Applications have closed'; end if;

  if p_cv_record_id is not null and not exists(
    select 1 from public.cv_records c
    where c.id=p_cv_record_id and c.user_id=(select auth.uid())
  ) then raise exception 'The selected CV is not available'; end if;

  select * into v_existing
  from public.opportunity_applications
  where user_id=(select auth.uid()) and opportunity_id=v_item.slug;
  if found and v_existing.status<>'draft' then raise exception 'You have already applied for this opportunity'; end if;

  v_reference:=coalesce(v_existing.submission_reference,
    'GWMB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)));

  insert into public.opportunity_applications(
    user_id,opportunity_id,opportunity_content_id,submission_reference,
    portfolio_url,motivation,cv_record_id,cv_snapshot,status,
    completion_percent,submitted_at,updated_at
  ) values (
    (select auth.uid()),v_item.slug,v_item.id,v_reference,
    nullif(trim(coalesce(p_portfolio_url,'')),''),trim(p_motivation),p_cv_record_id,p_cv_snapshot,
    'submitted',100,now(),now()
  )
  on conflict(user_id,opportunity_id) do update set
    opportunity_content_id=excluded.opportunity_content_id,
    submission_reference=excluded.submission_reference,
    portfolio_url=excluded.portfolio_url,
    motivation=excluded.motivation,
    cv_record_id=excluded.cv_record_id,
    cv_snapshot=excluded.cv_snapshot,
    status='submitted',completion_percent=100,submitted_at=now(),updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;
revoke execute on function public.submit_opportunity_application(text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.submit_opportunity_application(text,text,text,uuid,jsonb) to authenticated;

-- A registered attendee receives the link only from 30 minutes before the
-- scheduled start until the configured end (or four hours after start).
drop function if exists public.get_registered_event_meeting(text);
create function public.get_registered_event_meeting(p_event_id text)
returns table(
  meeting_url text,
  starts_at timestamptz,
  available_at timestamptz,
  closes_at timestamptz,
  join_available boolean,
  unavailable_reason text
)
language sql stable security definer set search_path=''
as $$
  select
    case when now() between c.starts_at-interval '30 minutes'
                         and coalesce(c.ends_at,c.starts_at+interval '4 hours')
         then m.meeting_url else null end,
    c.starts_at,
    c.starts_at-interval '30 minutes',
    coalesce(c.ends_at,c.starts_at+interval '4 hours'),
    now() between c.starts_at-interval '30 minutes'
              and coalesce(c.ends_at,c.starts_at+interval '4 hours'),
    case
      when now()<c.starts_at-interval '30 minutes' then 'Joining opens 30 minutes before the event.'
      when now()>coalesce(c.ends_at,c.starts_at+interval '4 hours') then 'The joining window has closed.'
      when nullif(m.meeting_url,'') is null then 'The meeting link has not been added yet.'
      else null
    end
  from public.content_items c
  join public.content_meetings m on m.content_id=c.id and m.status='ready'
  where c.area='events' and (c.id::text=p_event_id or c.slug=p_event_id)
    and c.status='published' and c.visible=true
    and exists(
      select 1 from public.event_registrations r
      where r.event_id=c.id::text and r.user_id=(select auth.uid()) and r.status='registered'
    );
$$;
revoke execute on function public.get_registered_event_meeting(text) from public, anon;
grant execute on function public.get_registered_event_meeting(text) to authenticated;
