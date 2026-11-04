-- One notification centre for newly published learning, mentors, sessions,
-- opportunities and community activity. Existing rows are not backfilled, so
-- applying this migration does not flood members with historical content.

create or replace function public.notify_content_publication()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_kind text;
  v_title text;
  v_body text;
  v_route text;
  v_category text;
begin
  if new.status<>'published' or not new.visible then return new; end if;
  if tg_op='UPDATE' and old.status='published' and old.visible then return new; end if;

  v_category := case
    when new.area in ('courses','resources','grow-learning') then 'learning'
    when new.area='opportunities' then 'opportunities'
    when new.area in ('community','member-wins') then 'community'
    else 'events'
  end;
  v_kind := 'published_'||case
    when new.area='courses' then 'course'
    when new.area='resources' then 'resource'
    when new.area='opportunities' then 'opportunity'
    when new.area='member-wins' then 'member_win'
    when new.area='community' then 'community'
    else 'event'
  end;
  v_title := case
    when new.area='courses' then 'New course available'
    when new.area='resources' then 'New resource available'
    when new.area='opportunities' then 'New opportunity added'
    when new.area='member-wins' then 'A new GWMB win'
    when new.area='community' then 'New in your community'
    else 'New GWMB event'
  end;
  v_body := new.title||case when nullif(new.summary,'') is not null then ' · '||new.summary else '' end;
  v_route := coalesce(nullif(new.route,''),case
    when new.area='courses' then '/course/'||new.slug
    when new.area='resources' then '/resource/'||new.slug
    when new.area='opportunities' then '/opportunity/'||new.slug
    when new.area='community' then '/community'
    when new.area='member-wins' then '/member-wins'
    else '/event/'||new.slug
  end);

  insert into public.user_notifications(user_id,kind,title,body,route)
  select p.id,v_kind,v_title,v_body,v_route
  from public.profiles p
  left join public.memberships m on m.user_id=p.id
  left join public.notification_preferences pref on pref.user_id=p.id
  where (new.access_level<>'members' or m.status='verified')
    and case v_category
      when 'learning' then coalesce(pref.learning_enabled,true)
      when 'opportunities' then coalesce(pref.opportunities_enabled,true)
      when 'community' then coalesce(pref.community_enabled,true)
      else coalesce(pref.events_enabled,true)
    end;

  insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
  select p.id,'push',v_kind,jsonb_build_object('title',v_title,'body',v_body,'route',v_route,'category',v_category,'content_id',new.id),now(),'publication:'||new.id||':push:'||p.id
  from public.profiles p
  left join public.memberships m on m.user_id=p.id
  join public.notification_preferences pref on pref.user_id=p.id and pref.push_enabled
  where (new.access_level<>'members' or m.status='verified')
    and case v_category
      when 'learning' then pref.learning_enabled
      when 'opportunities' then pref.opportunities_enabled
      when 'community' then pref.community_enabled
      else pref.events_enabled
    end
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

revoke execute on function public.notify_content_publication() from public,anon,authenticated;
drop trigger if exists content_publication_notifications on public.content_items;
create trigger content_publication_notifications
after insert or update of status,visible on public.content_items
for each row execute procedure public.notify_content_publication();

create or replace function public.notify_public_mentor()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_title text := 'Meet a new GWMB mentor';
  v_body text;
  v_route text;
begin
  if not new.active or not new.publish_public_profile then return new; end if;
  if tg_op='UPDATE' and old.active and old.publish_public_profile then return new; end if;
  v_body := new.full_name||' · '||new.job_title||case when nullif(new.organisation,'') is not null then ' at '||new.organisation else '' end;
  v_route := '/mentor/'||new.id;

  insert into public.user_notifications(user_id,kind,title,body,route)
  select p.id,'published_mentor',v_title,v_body,v_route from public.profiles p
  left join public.notification_preferences pref on pref.user_id=p.id
  where coalesce(pref.events_enabled,true);

  insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
  select p.id,'push','published_mentor',jsonb_build_object('title',v_title,'body',v_body,'route',v_route,'category','mentorship','mentor_id',new.id),now(),'mentor-publication:'||new.id||':push:'||p.id
  from public.profiles p join public.notification_preferences pref on pref.user_id=p.id and pref.push_enabled and pref.events_enabled
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

revoke execute on function public.notify_public_mentor() from public,anon,authenticated;
drop trigger if exists mentor_publication_notifications on public.mentors;
create trigger mentor_publication_notifications
after insert or update of active,publish_public_profile on public.mentors
for each row execute procedure public.notify_public_mentor();

create or replace function public.notify_mentorship_session_publication()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_title text := 'New mentorship session';
  v_body text := new.title||' · '||coalesce(new.industry,'Mentorship');
  v_route text := '/mentorship-session/'||new.id;
begin
  if new.status not in ('published','upcoming') then return new; end if;
  if tg_op='UPDATE' and old.status in ('published','upcoming') then return new; end if;

  insert into public.user_notifications(user_id,kind,title,body,route)
  select p.id,'published_mentorship_session',v_title,v_body,v_route
  from public.profiles p
  left join public.memberships m on m.user_id=p.id
  left join public.marketplace_journeys j on j.user_id=p.id
  left join public.mentorship_industry_interests i on i.user_id=p.id and i.notifications_enabled
  left join public.notification_preferences pref on pref.user_id=p.id
  where coalesce(pref.events_enabled,true)
    and (new.access_level<>'members' or m.status='verified')
    and (
      new.audience_type='everyone'
      or (new.audience_type='members' and m.status='verified')
      or (new.audience_type='selected_users' and p.id=any(new.selected_user_ids))
      or (new.audience_type='career_field' and (j.interests&&new.audience_fields or exists(select 1 from unnest(new.audience_fields) x where lower(x)=lower(coalesce(i.industry,'')))))
      or (new.audience_type='subfield' and (j.interests&&new.audience_subfields or exists(select 1 from unnest(new.audience_subfields) x where lower(x)=lower(coalesce(i.subfield,'')))))
    )
  group by p.id;

  insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
  select distinct n.user_id,'push','published_mentorship_session',jsonb_build_object('title',v_title,'body',v_body,'route',v_route,'category','mentorship','session_id',new.id),now(),'mentorship-publication:'||new.id||':push:'||n.user_id
  from public.user_notifications n join public.notification_preferences pref on pref.user_id=n.user_id and pref.push_enabled and pref.events_enabled
  where n.kind='published_mentorship_session' and n.route=v_route and n.created_at>=now()-interval '1 minute'
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

revoke execute on function public.notify_mentorship_session_publication() from public,anon,authenticated;
drop trigger if exists mentorship_session_publication_notifications on public.mentorship_sessions;
create trigger mentorship_session_publication_notifications
after insert or update of status on public.mentorship_sessions
for each row execute procedure public.notify_mentorship_session_publication();
