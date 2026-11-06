-- Notification side effects kept in the database, ported from Supabase triggers:
--   notify_content_publication (202610280003), queue_event_notifications (202610140005),
--   queue_admin_calendar_reminders (202610210004, on content_items, mentorship_sessions, local_activities).
-- They only write user_notifications / notification_outbox; delivery is the dispatcher's job.
-- Timestamps are UTC ISO text, so string comparison and max() follow time order.

-- ---------- content publication: notify everyone who can see it ----------
create trigger content_publication_notify_insert after insert on content_items
when new.status = 'published' and new.visible = 1
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id,
    'published_' || case new.area when 'courses' then 'course' when 'resources' then 'resource' when 'opportunities' then 'opportunity'
      when 'member-wins' then 'member_spotlight' when 'community' then 'community' else 'event' end,
    case new.area when 'courses' then 'New course available' when 'resources' then 'New resource available'
      when 'opportunities' then 'New opportunity added' when 'member-wins' then 'New Member Spotlight'
      when 'community' then 'New in your community' else 'New GWMB event' end,
    new.title || case when nullif(new.summary, '') is not null then ' · ' || new.summary else '' end,
    coalesce(nullif(new.route, ''), case new.area when 'courses' then '/course/' || new.slug when 'resources' then '/resource/' || new.slug
      when 'opportunities' then '/opportunity/' || new.slug when 'community' then '/community' when 'member-wins' then '/member-wins'
      else '/event/' || new.slug end)
  from profiles p
  left join memberships m on m.user_id = p.id
  left join notification_preferences pref on pref.user_id = p.id
  where (new.access_level <> 'members' or m.status = 'verified')
    and case when new.area in ('courses', 'resources', 'grow-learning') then coalesce(pref.learning_enabled, 1)
      when new.area = 'opportunities' then coalesce(pref.opportunities_enabled, 1)
      when new.area in ('community', 'member-wins') then coalesce(pref.community_enabled, 1)
      else coalesce(pref.events_enabled, 1) end = 1;

  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select p.id, 'push',
    'published_' || case new.area when 'courses' then 'course' when 'resources' then 'resource' when 'opportunities' then 'opportunity'
      when 'member-wins' then 'member_spotlight' when 'community' then 'community' else 'event' end,
    json_object(
      'title', case new.area when 'courses' then 'New course available' when 'resources' then 'New resource available'
        when 'opportunities' then 'New opportunity added' when 'member-wins' then 'New Member Spotlight'
        when 'community' then 'New in your community' else 'New GWMB event' end,
      'body', new.title || case when nullif(new.summary, '') is not null then ' · ' || new.summary else '' end,
      'route', coalesce(nullif(new.route, ''), case new.area when 'courses' then '/course/' || new.slug when 'resources' then '/resource/' || new.slug
        when 'opportunities' then '/opportunity/' || new.slug when 'community' then '/community' when 'member-wins' then '/member-wins'
        else '/event/' || new.slug end),
      'category', case when new.area in ('courses', 'resources', 'grow-learning') then 'learning' when new.area = 'opportunities' then 'opportunities'
        when new.area in ('community', 'member-wins') then 'community' else 'events' end,
      'content_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'publication:' || new.id || ':push:' || p.id
  from profiles p
  left join memberships m on m.user_id = p.id
  join notification_preferences pref on pref.user_id = p.id and pref.push_enabled = 1
  where (new.access_level <> 'members' or m.status = 'verified')
    and case when new.area in ('courses', 'resources', 'grow-learning') then pref.learning_enabled
      when new.area = 'opportunities' then pref.opportunities_enabled
      when new.area in ('community', 'member-wins') then pref.community_enabled
      else pref.events_enabled end = 1;
end;

-- Same as above for an update that newly publishes (or un-hides) an item.
create trigger content_publication_notify_update after update of status, visible on content_items
when new.status = 'published' and new.visible = 1 and not (old.status = 'published' and old.visible = 1)
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id,
    'published_' || case new.area when 'courses' then 'course' when 'resources' then 'resource' when 'opportunities' then 'opportunity'
      when 'member-wins' then 'member_spotlight' when 'community' then 'community' else 'event' end,
    case new.area when 'courses' then 'New course available' when 'resources' then 'New resource available'
      when 'opportunities' then 'New opportunity added' when 'member-wins' then 'New Member Spotlight'
      when 'community' then 'New in your community' else 'New GWMB event' end,
    new.title || case when nullif(new.summary, '') is not null then ' · ' || new.summary else '' end,
    coalesce(nullif(new.route, ''), case new.area when 'courses' then '/course/' || new.slug when 'resources' then '/resource/' || new.slug
      when 'opportunities' then '/opportunity/' || new.slug when 'community' then '/community' when 'member-wins' then '/member-wins'
      else '/event/' || new.slug end)
  from profiles p
  left join memberships m on m.user_id = p.id
  left join notification_preferences pref on pref.user_id = p.id
  where (new.access_level <> 'members' or m.status = 'verified')
    and case when new.area in ('courses', 'resources', 'grow-learning') then coalesce(pref.learning_enabled, 1)
      when new.area = 'opportunities' then coalesce(pref.opportunities_enabled, 1)
      when new.area in ('community', 'member-wins') then coalesce(pref.community_enabled, 1)
      else coalesce(pref.events_enabled, 1) end = 1;

  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select p.id, 'push',
    'published_' || case new.area when 'courses' then 'course' when 'resources' then 'resource' when 'opportunities' then 'opportunity'
      when 'member-wins' then 'member_spotlight' when 'community' then 'community' else 'event' end,
    json_object(
      'title', case new.area when 'courses' then 'New course available' when 'resources' then 'New resource available'
        when 'opportunities' then 'New opportunity added' when 'member-wins' then 'New Member Spotlight'
        when 'community' then 'New in your community' else 'New GWMB event' end,
      'body', new.title || case when nullif(new.summary, '') is not null then ' · ' || new.summary else '' end,
      'route', coalesce(nullif(new.route, ''), case new.area when 'courses' then '/course/' || new.slug when 'resources' then '/resource/' || new.slug
        when 'opportunities' then '/opportunity/' || new.slug when 'community' then '/community' when 'member-wins' then '/member-wins'
        else '/event/' || new.slug end),
      'category', case when new.area in ('courses', 'resources', 'grow-learning') then 'learning' when new.area = 'opportunities' then 'opportunities'
        when new.area in ('community', 'member-wins') then 'community' else 'events' end,
      'content_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'publication:' || new.id || ':push:' || p.id
  from profiles p
  left join memberships m on m.user_id = p.id
  join notification_preferences pref on pref.user_id = p.id and pref.push_enabled = 1
  where (new.access_level <> 'members' or m.status = 'verified')
    and case when new.area in ('courses', 'resources', 'grow-learning') then pref.learning_enabled
      when new.area = 'opportunities' then pref.opportunities_enabled
      when new.area in ('community', 'member-wins') then pref.community_enabled
      else pref.events_enabled end = 1;
end;

-- ---------- event registrations ----------
-- Cancelling skips the pending reminders for that registration.
create trigger event_registration_cancelled after update of status on event_registrations
when new.status = 'cancelled'
begin
  update notification_outbox set status = 'skipped', error_message = 'Registration cancelled'
  where status = 'pending' and json_extract(payload, '$.registration_id') = new.id;
end;

-- New or changed (non-cancelled) registration: confirmation + scheduled reminders.
create trigger event_registration_notify_insert after insert on event_registrations
when new.status <> 'cancelled'
begin
  insert into user_notifications (user_id, kind, title, body, route) values (
    new.user_id, 'event_registration_' || new.status,
    case when new.status = 'waitlisted' then 'You are on the event waitlist' else 'Your event place is confirmed' end,
    coalesce(new.event_title, 'Your GWMB event') || case when new.status = 'waitlisted'
      then ': we will notify you if a place becomes available.' else ': we will remind you before it begins.' end,
    coalesce(new.event_route, '/events?tab=my'));
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, channel, 'event_registration_' || new.status,
    json_object('registration_id', new.id, 'event_id', new.event_id, 'email', case when channel = 'email' then new.email end,
      'title', case when new.status = 'waitlisted' then 'You are on the event waitlist' else 'Your event place is confirmed' end,
      'body', coalesce(new.event_title, 'Your GWMB event') || case when new.status = 'waitlisted'
        then ': we will notify you if a place becomes available.' else ': we will remind you before it begins.' end,
      'route', coalesce(new.event_route, '/events?tab=my')),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'event:' || new.id || ':' || channel || ':confirmation'
  from (select 'push' as channel union all select 'email');
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, r.channel, r.template_key,
    json_object('registration_id', new.id, 'event_id', new.event_id, 'email', new.email,
      'title', case r.template_key when 'event_reminder_24h' then 'Your GWMB event is tomorrow'
        when 'event_reminder_1h' then 'Your GWMB event starts in one hour' else 'We are live now' end,
      'body', coalesce(new.event_title, 'Your GWMB event') || case r.template_key
        when 'event_reminder_24h' then ' starts tomorrow. Open the app for the latest details.'
        when 'event_reminder_1h' then ' starts in one hour. Get ready to join.' else ' is starting now. Open GWMB to join.' end,
      'route', coalesce(new.event_route, '/events?tab=my')),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.event_starts_at, r.offset)),
    'event:' || new.id || ':' || r.channel || ':' || r.template_key
  from (select column1 as channel, column2 as template_key, column3 as offset from (values
    ('push', 'event_reminder_24h', '-24 hours'), ('in_app', 'event_reminder_24h', '-24 hours'), ('email', 'event_reminder_24h', '-24 hours'),
    ('push', 'event_reminder_1h', '-1 hours'), ('in_app', 'event_reminder_1h', '-1 hours'), ('email', 'event_reminder_1h', '-1 hours'),
    ('push', 'event_reminder_live', '+0 hours'), ('in_app', 'event_reminder_live', '+0 hours'))) r
  where new.status = 'registered' and new.event_starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
end;

create trigger event_registration_notify_update after update of status on event_registrations
when new.status <> 'cancelled' and old.status <> new.status
begin
  insert into user_notifications (user_id, kind, title, body, route) values (
    new.user_id, 'event_registration_' || new.status,
    case when new.status = 'waitlisted' then 'You are on the event waitlist' else 'Your event place is confirmed' end,
    coalesce(new.event_title, 'Your GWMB event') || case when new.status = 'waitlisted'
      then ': we will notify you if a place becomes available.' else ': we will remind you before it begins.' end,
    coalesce(new.event_route, '/events?tab=my'));
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, channel, 'event_registration_' || new.status,
    json_object('registration_id', new.id, 'event_id', new.event_id, 'email', case when channel = 'email' then new.email end,
      'title', case when new.status = 'waitlisted' then 'You are on the event waitlist' else 'Your event place is confirmed' end,
      'body', coalesce(new.event_title, 'Your GWMB event') || case when new.status = 'waitlisted'
        then ': we will notify you if a place becomes available.' else ': we will remind you before it begins.' end,
      'route', coalesce(new.event_route, '/events?tab=my')),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'event:' || new.id || ':' || channel || ':confirmation'
  from (select 'push' as channel union all select 'email');
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, r.channel, r.template_key,
    json_object('registration_id', new.id, 'event_id', new.event_id, 'email', new.email,
      'title', case r.template_key when 'event_reminder_24h' then 'Your GWMB event is tomorrow'
        when 'event_reminder_1h' then 'Your GWMB event starts in one hour' else 'We are live now' end,
      'body', coalesce(new.event_title, 'Your GWMB event') || case r.template_key
        when 'event_reminder_24h' then ' starts tomorrow. Open the app for the latest details.'
        when 'event_reminder_1h' then ' starts in one hour. Get ready to join.' else ' is starting now. Open GWMB to join.' end,
      'route', coalesce(new.event_route, '/events?tab=my')),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.event_starts_at, r.offset)),
    'event:' || new.id || ':' || r.channel || ':' || r.template_key
  from (select column1 as channel, column2 as template_key, column3 as offset from (values
    ('push', 'event_reminder_24h', '-24 hours'), ('in_app', 'event_reminder_24h', '-24 hours'), ('email', 'event_reminder_24h', '-24 hours'),
    ('push', 'event_reminder_1h', '-1 hours'), ('in_app', 'event_reminder_1h', '-1 hours'), ('email', 'event_reminder_1h', '-1 hours'),
    ('push', 'event_reminder_live', '+0 hours'), ('in_app', 'event_reminder_live', '+0 hours'))) r
  where new.status = 'registered' and new.event_starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
end;

-- ---------- admin calendar reminders (24h and 1h before, in-app + push, per admin) ----------
create trigger content_admin_calendar_reminders after insert on content_items
when new.status = 'published' and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/calendar'),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:content_items:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;

create trigger content_admin_calendar_reminders_update after update of title, starts_at, status on content_items
when new.status = 'published' and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/calendar'),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:content_items:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;

create trigger mentorship_admin_calendar_reminders after insert on mentorship_sessions
when new.status in ('published', 'upcoming', 'live') and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/mentorship-session/' || new.id),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:mentorship_sessions:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;

create trigger mentorship_admin_calendar_reminders_update after update of title, starts_at, status on mentorship_sessions
when new.status in ('published', 'upcoming', 'live') and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/mentorship-session/' || new.id),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:mentorship_sessions:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;

create trigger local_admin_calendar_reminders after insert on local_activities
when new.status = 'published' and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/calendar'),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:local_activities:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;

create trigger local_admin_calendar_reminders_update after update of title, starts_at, status on local_activities
when new.status = 'published' and new.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select a.user_id, r.channel, r.template,
    json_object('title', case r.template when 'admin_calendar_24h' then 'Tomorrow: ' else 'Starting soon: ' end || coalesce(new.title, 'GWMB calendar item'),
      'body', 'Open the Admin calendar for the latest operational details.', 'route', '/admin/calendar'),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.offset)),
    'admin-calendar:local_activities:' || new.id || ':' || r.channel || ':' || r.template, 'pending'
  from app_admins a, (select column1 as channel, column2 as template, column3 as offset from (values
    ('in_app', 'admin_calendar_24h', '-24 hours'), ('push', 'admin_calendar_24h', '-24 hours'),
    ('in_app', 'admin_calendar_1h', '-1 hours'), ('push', 'admin_calendar_1h', '-1 hours'))) r;
end;
