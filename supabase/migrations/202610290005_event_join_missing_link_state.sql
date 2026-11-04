-- Return a protected joining state even before Admin adds the meeting record.
create or replace function public.get_registered_event_meeting(p_event_id text)
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
    case when nullif(m.meeting_url,'') is not null
                   and now() between c.starts_at-interval '30 minutes'
                                     and coalesce(c.ends_at,c.starts_at+interval '4 hours')
         then m.meeting_url else null end,
    c.starts_at,
    c.starts_at-interval '30 minutes',
    coalesce(c.ends_at,c.starts_at+interval '4 hours'),
    nullif(m.meeting_url,'') is not null
      and now() between c.starts_at-interval '30 minutes'
                    and coalesce(c.ends_at,c.starts_at+interval '4 hours'),
    case
      when nullif(m.meeting_url,'') is null then 'The meeting link has not been added yet.'
      when now()<c.starts_at-interval '30 minutes' then 'Joining opens 30 minutes before the event.'
      when now()>coalesce(c.ends_at,c.starts_at+interval '4 hours') then 'The joining window has closed.'
      else null
    end
  from public.content_items c
  left join public.content_meetings m on m.content_id=c.id and m.status='ready'
  where c.area='events' and (c.id::text=p_event_id or c.slug=p_event_id)
    and c.status='published' and c.visible=true
    and exists(
      select 1 from public.event_registrations r
      where r.event_id=c.id::text and r.user_id=(select auth.uid()) and r.status='registered'
    );
$$;
revoke execute on function public.get_registered_event_meeting(text) from public, anon;
grant execute on function public.get_registered_event_meeting(text) to authenticated;
