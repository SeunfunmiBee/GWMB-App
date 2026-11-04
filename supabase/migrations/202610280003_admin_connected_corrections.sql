-- Editable Career Readiness question inventory and manual notification scheduling.

create table if not exists public.career_practice_questions (
  id text primary key,
  category text not null,
  question text not null,
  guidance text not null,
  framework text,
  career_areas text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_practice_questions enable row level security;
grant select on public.career_practice_questions to anon, authenticated;
grant insert, update, delete on public.career_practice_questions to authenticated;
create policy "Published practice questions are readable" on public.career_practice_questions for select using (active or public.is_app_admin());
create policy "Admins manage practice questions" on public.career_practice_questions for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

insert into public.career_practice_questions(id,category,question,guidance,framework,career_areas,sort_order)
values
('tell-me-about-yourself','General Interview Questions','Tell me about yourself.','Connect where you are now, the evidence that supports your direction and why this opportunity is the logical next step.','Present → Past → Future','{}',10),
('why-this-role','Career Motivation & Goals','Why are you interested in this role?','Show that you understand the work, connect it to your strengths and explain the contribution you hope to make.',null,'{}',20),
('challenge-overcame','Behavioural Questions','Tell me about a challenge you overcame.','Choose a real example and make your actions and the result specific.','STAR · Situation → Task → Action → Result','{}',30),
('worked-in-team','Behavioural Questions','Describe a time you worked in a team.','Explain your personal contribution, how you worked with others and what the team achieved.','STAR · Situation → Task → Action → Result','{}',40),
('strengths-weaknesses','General Interview Questions','What are your strengths and weaknesses?','Support your strength with evidence. Choose an honest development area and show what you are doing about it.',null,'{}',50),
('why-hire-you','Internship & Graduate Interviews','Why should we hire you?','Match two or three relevant strengths to what the role needs. Use evidence from projects, volunteering, school or work.',null,'{}',60),
('limited-experience','Internship & Graduate Interviews','You have limited experience. What can you bring to this role?','Translate projects, volunteering, leadership and coursework into evidence of useful skills and learning speed.',null,'{}',70),
('workplace-conflict','Workplace Scenarios','How would you handle a disagreement with a teammate?','Demonstrate calm communication, curiosity, shared goals and an appropriate path to resolution.',null,'{}',80),
('product-priorities','Role-Specific Questions','How would you decide what a product team should build next?','Show how you balance user evidence, business goals, feasibility and expected impact.',null,array['Product','Product Management'],90)
on conflict (id) do nothing;

create or replace function public.queue_admin_notification(
  p_title text,
  p_body text,
  p_route text,
  p_scheduled_for timestamptz,
  p_audience text,
  p_channels text[]
) returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  if trim(coalesce(p_title,''))='' or trim(coalesce(p_body,''))='' then raise exception 'Title and message are required'; end if;
  insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
  select u.id,channel,'admin_broadcast',jsonb_build_object('title',p_title,'body',p_body,'route',coalesce(p_route,'/notifications')),
    coalesce(p_scheduled_for,now()),'admin-broadcast:'||md5(p_title||p_body||coalesce(p_scheduled_for,now())::text)||':'||u.id||':'||channel
  from auth.users u
  cross join unnest(p_channels) channel
  left join public.memberships m on m.user_id=u.id
  where channel in ('in_app','push','email','sms','whatsapp')
    and (p_audience='everyone' or (p_audience='members' and m.status='verified') or (p_audience='app-users' and coalesce(m.status::text,'non_member')<>'verified'))
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;
grant execute on function public.queue_admin_notification(text,text,text,timestamptz,text,text[]) to authenticated;

update public.content_items set content_type='member_spotlight', eyebrow=case when eyebrow='GWMB GIRLS MAKING MOVES' then 'MEMBER SPOTLIGHT' else eyebrow end where area='member-wins';

-- Keep the established content publication pipeline, with the updated
-- Member Spotlight language and record type used everywhere going forward.
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
    when new.area='member-wins' then 'member_spotlight'
    when new.area='community' then 'community'
    else 'event'
  end;
  v_title := case
    when new.area='courses' then 'New course available'
    when new.area='resources' then 'New resource available'
    when new.area='opportunities' then 'New opportunity added'
    when new.area='member-wins' then 'New Member Spotlight'
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

update public.user_notifications
set kind='published_member_spotlight', title='New Member Spotlight'
where kind='published_member_win';
