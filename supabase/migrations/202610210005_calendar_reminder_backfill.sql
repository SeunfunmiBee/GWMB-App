-- Existing upcoming records should receive the same Admin reminders as newly published ones.
with calendar_events as (
  select 'content_items'::text source_table,id::text source_id,title,starts_at,'/admin/calendar'::text route
  from public.content_items where status='published' and starts_at>now()
  union all
  select 'mentorship_sessions',id,title,starts_at,'/admin/mentorship-session/'||id
  from public.mentorship_sessions where status in ('published','upcoming','live') and starts_at>now()
  union all
  select 'local_activities',id::text,title,starts_at,'/admin/calendar'
  from public.local_activities where status='published' and starts_at>now()
), reminders as (
  select a.user_id,e.*,'in_app'::text channel,'admin_calendar_24h'::text template,greatest(now(),e.starts_at-interval '24 hours') scheduled from public.app_admins a cross join calendar_events e
  union all select a.user_id,e.*,'push','admin_calendar_24h',greatest(now(),e.starts_at-interval '24 hours') from public.app_admins a cross join calendar_events e
  union all select a.user_id,e.*,'in_app','admin_calendar_1h',greatest(now(),e.starts_at-interval '1 hour') from public.app_admins a cross join calendar_events e
  union all select a.user_id,e.*,'push','admin_calendar_1h',greatest(now(),e.starts_at-interval '1 hour') from public.app_admins a cross join calendar_events e
)
insert into public.notification_outbox(user_id,channel,template_key,payload,scheduled_for,dedupe_key)
select user_id,channel,template,
  jsonb_build_object(
    'title',case when template='admin_calendar_24h' then 'Tomorrow: '||title else 'Starting soon: '||title end,
    'body','Open the Admin calendar for the latest operational details.','route',route
  ),scheduled,'admin-calendar:'||source_table||':'||source_id||':'||channel||':'||template
from reminders
on conflict(dedupe_key) where dedupe_key is not null do nothing;
