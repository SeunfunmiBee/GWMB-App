-- One calendar feed over the existing source records. Nothing is duplicated.

create or replace function public.get_admin_calendar_feed(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now() + interval '365 days'
)
returns table(
  source_type text, source_id text, title text, starts_at timestamptz,
  ends_at timestamptz, status text, category text, access_level text,
  location text, route text, relevance text, metadata jsonb
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  return query
  select
    case when c.area='courses' or c.content_type='course' then 'content_course'
         when c.area='events' or c.content_type in ('event','webinar','live_session') then 'content_event'
         else 'content_other' end,
    c.id::text,c.title,c.starts_at,c.ends_at,c.status,c.area,c.access_level,
    coalesce(c.metadata->>'location','Online'),
    coalesce(c.route,'/admin/builder?type=event&id='||c.id::text),
    'operations',c.metadata
  from public.content_items c
  where c.starts_at between p_from and p_to and c.status<>'archived'
  union all
  select 'mentorship',m.id,m.title,m.starts_at,null::timestamptz,m.status,
    'mentorship',m.access_level,coalesce(m.timezone,'Africa/Lagos'),
    '/mentorship-session/'||m.id,'operations',
    jsonb_build_object('industry',m.industry,'mentorship_type',m.mentorship_type,'subfield',m.subfield)
  from public.mentorship_sessions m
  where m.starts_at between p_from and p_to and m.status<>'cancelled'
  union all
  select 'local_'||a.kind,a.id::text,a.title,a.starts_at,a.ends_at,a.status,
    a.kind,case when a.members_only then 'members' else 'open' end,
    coalesce(a.venue,c.name),'/chapter-admin','operations',
    jsonb_build_object('chapter_id',a.chapter_id,'chapter_name',c.name,'chapter_kind',c.kind)
  from public.local_activities a join public.chapters c on c.id=a.chapter_id
  where a.starts_at between p_from and p_to and a.status<>'cancelled'
  order by starts_at;
end;
$$;

revoke execute on function public.get_admin_calendar_feed(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_admin_calendar_feed(timestamptz,timestamptz) to authenticated;

create or replace function public.get_my_calendar_feed(
  p_from timestamptz default now() - interval '7 days',
  p_to timestamptz default now() + interval '180 days'
)
returns table(
  source_type text, source_id text, title text, starts_at timestamptz,
  ends_at timestamptz, status text, category text, access_level text,
  location text, route text, relevance text, metadata jsonb
)
language sql stable security definer set search_path=''
as $$
  with journey as (
    select interests,primary_goal from public.marketplace_journeys where user_id=auth.uid()
  ), feed(source_type,source_id,title,starts_at,ends_at,status,category,access_level,location,route,relevance,metadata) as (
    select 'content_event'::text,c.id::text,c.title,c.starts_at,c.ends_at,
      c.status,c.area,c.access_level,coalesce(c.metadata->>'location','Online'),
      coalesce(c.route,'/event/'||c.slug),'saved'::text,
      c.metadata||jsonb_build_object('registration_status',r.status)
    from public.event_registrations r
    join public.content_items c on c.slug=r.event_id or c.id::text=r.event_id
    where r.user_id=auth.uid() and r.status<>'cancelled'
      and c.starts_at between p_from and p_to

    union all
    select 'content_event',r.event_id,coalesce(r.event_title,'GWMB event'),r.event_starts_at,
      null::timestamptz,'published','events','account','Online',
      coalesce(r.event_route,'/event/'||r.event_id),'saved',
      jsonb_build_object('registration_status',r.status)
    from public.event_registrations r
    where r.user_id=auth.uid() and r.status<>'cancelled'
      and r.event_starts_at between p_from and p_to
      and not exists(select 1 from public.content_items c where c.slug=r.event_id or c.id::text=r.event_id)

    union all
    select case when c.area='courses' or c.content_type='course' then 'content_course' else 'content_event' end,
      c.id::text,c.title,c.starts_at,c.ends_at,c.status,c.area,c.access_level,
      coalesce(c.metadata->>'location','Online'),coalesce(c.route,'/event/'||c.slug),
      'recommended',c.metadata||jsonb_build_object('goal',(select primary_goal from journey limit 1))
    from public.content_items c
    where c.status='published' and c.visible and c.starts_at between p_from and p_to
      and c.content_type in ('event','webinar','live_session','course')
      and not exists(select 1 from public.event_registrations r where r.user_id=auth.uid() and r.status<>'cancelled' and (r.event_id=c.slug or r.event_id=c.id::text))
      and (
        c.featured or c.metadata->'career_areas' is null
        or jsonb_typeof(c.metadata->'career_areas')<>'array'
        or jsonb_array_length(c.metadata->'career_areas')=0
        or exists(
          select 1 from journey j, unnest(j.interests) interest
          where lower(c.title||' '||coalesce(c.summary,'')||' '||c.metadata::text) like '%'||lower(interest)||'%'
        )
      )

    union all
    select 'mentorship',m.id,m.title,m.starts_at,null::timestamptz,m.status,'mentorship',
      m.access_level,coalesce(m.timezone,'Africa/Lagos'),'/mentorship-session/'||m.id,
      'saved',jsonb_build_object('industry',m.industry,'mentorship_type',m.mentorship_type,'registration_status',r.status)
    from public.mentorship_registrations r join public.mentorship_sessions m on m.id=r.session_id
    where r.user_id=auth.uid() and r.status<>'cancelled' and m.starts_at between p_from and p_to

    union all
    select 'mentorship',m.id,m.title,m.starts_at,null::timestamptz,m.status,'mentorship',
      m.access_level,coalesce(m.timezone,'Africa/Lagos'),'/mentorship-session/'||m.id,
      'recommended',jsonb_build_object('industry',m.industry,'mentorship_type',m.mentorship_type)
    from public.mentorship_sessions m
    where m.status in ('published','upcoming','live') and m.starts_at between p_from and p_to
      and not exists(select 1 from public.mentorship_registrations r where r.user_id=auth.uid() and r.session_id=m.id and r.status<>'cancelled')
      and (m.mentorship_type='discovery'
        or exists(select 1 from journey j,unnest(j.interests) interest where lower(m.industry||' '||coalesce(m.subfield,'')) like '%'||lower(interest)||'%')
        or exists(select 1 from public.mentorship_industry_interests i where i.user_id=auth.uid() and i.notifications_enabled and lower(m.industry||' '||coalesce(m.subfield,'')) like '%'||lower(i.industry)||'%'))

    union all
    select 'local_'||a.kind,a.id::text,a.title,a.starts_at,a.ends_at,a.status,a.kind,
      case when a.members_only then 'members' else 'open' end,coalesce(a.venue,c.name),
      '/events','chapter',jsonb_build_object('chapter_name',c.name,'chapter_kind',c.kind)
    from public.local_activities a join public.chapters c on c.id=a.chapter_id
    where a.status='published' and a.starts_at between p_from and p_to
      and exists(select 1 from public.membership_records r where r.linked_user_id=auth.uid() and lower(trim(r.chapter))=lower(trim(c.name)))
  )
  select distinct on (f.source_type,f.source_id)
    f.source_type,f.source_id,f.title,f.starts_at,f.ends_at,f.status,f.category,
    f.access_level,f.location,f.route,f.relevance,f.metadata
  from feed f
  order by f.source_type,f.source_id,
    case f.relevance when 'saved' then 1 when 'chapter' then 2 else 3 end;
$$;

revoke execute on function public.get_my_calendar_feed(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_my_calendar_feed(timestamptz,timestamptz) to authenticated;

-- Admin calendar reminders use the existing notification outbox and dispatcher.
create or replace function public.queue_admin_calendar_reminders()
returns trigger language plpgsql security definer set search_path=''
as $$
declare payload jsonb:=to_jsonb(new);v_start timestamptz;v_title text;v_route text;v_status text;admin_id uuid;
begin
  v_start:=nullif(payload->>'starts_at','')::timestamptz;
  v_title:=coalesce(payload->>'title','GWMB calendar item');
  v_status:=coalesce(payload->>'status','');
  if v_start is null or v_start<=now() then return new; end if;
  if tg_table_name='content_items' and v_status<>'published' then return new; end if;
  if tg_table_name='mentorship_sessions' and v_status not in ('published','upcoming','live') then return new; end if;
  if tg_table_name='local_activities' and v_status<>'published' then return new; end if;
  v_route:=case tg_table_name when 'mentorship_sessions' then '/admin/mentorship-session/'||(payload->>'id') when 'local_activities' then '/admin/calendar' else '/admin/calendar' end;
  for admin_id in select user_id from public.app_admins loop
    insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
    select admin_id,channel,template,
      jsonb_build_object('title',case when template='admin_calendar_24h' then 'Tomorrow: '||v_title else 'Starting soon: '||v_title end,'body','Open the Admin calendar for the latest operational details.','route',v_route),
      scheduled,'admin-calendar:'||tg_table_name||':'||(payload->>'id')||':'||channel||':'||template
    from (values
      ('in_app','admin_calendar_24h',greatest(now(),v_start-interval '24 hours')),
      ('push','admin_calendar_24h',greatest(now(),v_start-interval '24 hours')),
      ('in_app','admin_calendar_1h',greatest(now(),v_start-interval '1 hour')),
      ('push','admin_calendar_1h',greatest(now(),v_start-interval '1 hour'))
    ) reminder(channel,template,scheduled)
    on conflict(dedupe_key) where dedupe_key is not null do update
      set payload=excluded.payload,scheduled_for=excluded.scheduled_for,status='pending',error_message=null,sent_at=null;
  end loop;
  return new;
end;
$$;

revoke execute on function public.queue_admin_calendar_reminders() from public,anon,authenticated;
drop trigger if exists content_admin_calendar_reminders on public.content_items;
create trigger content_admin_calendar_reminders after insert or update of title,starts_at,status on public.content_items for each row execute procedure public.queue_admin_calendar_reminders();
drop trigger if exists mentorship_admin_calendar_reminders on public.mentorship_sessions;
create trigger mentorship_admin_calendar_reminders after insert or update of title,starts_at,status on public.mentorship_sessions for each row execute procedure public.queue_admin_calendar_reminders();
drop trigger if exists local_admin_calendar_reminders on public.local_activities;
create trigger local_admin_calendar_reminders after insert or update of title,starts_at,status on public.local_activities for each row execute procedure public.queue_admin_calendar_reminders();
