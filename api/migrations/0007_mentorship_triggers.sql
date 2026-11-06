-- Mentorship notifications, mentor communications and operations tasks kept in the database.
-- Ported from Supabase triggers: notify_public_mentor, notify_mentorship_session_publication (202610270001),
-- record_completed_mentorship (202610130001), queue_mentorship_notification, queue_mentorship_replay_notification,
-- mark_mentorship_attendance_recorded (202610230002), schedule_mentor_session_operations,
-- schedule_linked_mentor_communications, notify_matching_mentorship_interests (202610210002).
-- SQLite has no shared trigger functions, so insert and update variants repeat the same body.

-- ---------- mentor profile published ----------
create trigger mentor_publication_notify_insert after insert on mentors
when new.active = 1 and new.publish_public_profile = 1
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id, 'published_mentor', 'Meet a new GWMB mentor',
    new.full_name || ' · ' || new.job_title || case when nullif(new.organisation, '') is not null then ' at ' || new.organisation else '' end, '/mentor/' || new.id
  from profiles p left join notification_preferences pref on pref.user_id = p.id where coalesce(pref.events_enabled, 1) = 1;
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select p.id, 'push', 'published_mentor',
    json_object('title', 'Meet a new GWMB mentor', 'body', new.full_name || ' · ' || new.job_title || case when nullif(new.organisation, '') is not null then ' at ' || new.organisation else '' end,
      'route', '/mentor/' || new.id, 'category', 'mentorship', 'mentor_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'mentor-publication:' || new.id || ':push:' || p.id
  from profiles p join notification_preferences pref on pref.user_id = p.id and pref.push_enabled = 1 and pref.events_enabled = 1;
end;

create trigger mentor_publication_notify_update after update of active, publish_public_profile on mentors
when new.active = 1 and new.publish_public_profile = 1 and not (old.active = 1 and old.publish_public_profile = 1)
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id, 'published_mentor', 'Meet a new GWMB mentor',
    new.full_name || ' · ' || new.job_title || case when nullif(new.organisation, '') is not null then ' at ' || new.organisation else '' end, '/mentor/' || new.id
  from profiles p left join notification_preferences pref on pref.user_id = p.id where coalesce(pref.events_enabled, 1) = 1;
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select p.id, 'push', 'published_mentor',
    json_object('title', 'Meet a new GWMB mentor', 'body', new.full_name || ' · ' || new.job_title || case when nullif(new.organisation, '') is not null then ' at ' || new.organisation else '' end,
      'route', '/mentor/' || new.id, 'category', 'mentorship', 'mentor_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'mentor-publication:' || new.id || ':push:' || p.id
  from profiles p join notification_preferences pref on pref.user_id = p.id and pref.push_enabled = 1 and pref.events_enabled = 1;
end;

-- ---------- session registrations: seat notifications and reminders ----------
create trigger mentorship_registration_cancelled after update of status on mentorship_registrations
when new.status = 'cancelled'
begin
  update notification_outbox set status = 'skipped', error_message = 'Saved seat cancelled'
  where status = 'pending' and json_extract(payload, '$.registration_id') = new.id;
end;

create trigger mentorship_registration_notify_insert after insert on mentorship_registrations
when new.status <> 'cancelled'
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select new.user_id, 'mentorship_seat_' || new.status,
    case when new.status = 'waitlisted' then 'You joined the mentorship waitlist' else 'Seat Saved ✓' end,
    s.title || case when new.status = 'waitlisted' then ': we will notify you if a place opens.' else ': we will remind you before it begins.' end,
    '/mentorship-session/' || new.session_id
  from mentorship_sessions s where s.id = new.session_id and exists (select 1 from json_each(s.notification_channels) c where c.value = 'in_app');
  insert into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, r.column1, r.column2,
    json_object('registration_id', new.id, 'session_id', new.session_id, 'title', s.title, 'route', '/mentorship-session/' || new.session_id),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', s.starts_at, r.column3)),
    'mentorship:' || new.id || ':' || r.column1 || ':' || r.column2
  from (values ('in_app', 'mentorship_seat_saved', '-100 years'), ('push', 'mentorship_seat_saved', '-100 years'), ('email', 'mentorship_seat_saved', '-100 years'),
    ('push', 'mentorship_session_reminder_24h', '-24 hours'), ('in_app', 'mentorship_session_reminder_24h', '-24 hours'), ('email', 'mentorship_session_reminder_24h', '-24 hours'),
    ('push', 'mentorship_session_reminder_1h', '-1 hours'), ('in_app', 'mentorship_session_reminder_1h', '-1 hours'), ('email', 'mentorship_session_reminder_1h', '-1 hours'),
    ('push', 'mentorship_session_live', '+0 hours'), ('in_app', 'mentorship_session_live', '+0 hours')) r
  join mentorship_sessions s on s.id = new.session_id
  left join notification_preferences pref on pref.user_id = new.user_id
  where new.status = 'registered' and s.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    and exists (select 1 from json_each(s.notification_channels) c where c.value = r.column1)
    and (r.column1 = 'in_app' or (r.column1 = 'email' and coalesce(pref.email_enabled, 1) = 1) or (r.column1 = 'push' and coalesce(pref.push_enabled, 0) = 1))
  on conflict (dedupe_key) where dedupe_key is not null do update set payload = excluded.payload, scheduled_for = excluded.scheduled_for,
    status = case when notification_outbox.status = 'sent' then 'sent' else 'pending' end;
end;

create trigger mentorship_registration_notify_update after update of status on mentorship_registrations
when new.status <> 'cancelled' and old.status <> new.status
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select new.user_id, 'mentorship_seat_' || new.status,
    case when new.status = 'waitlisted' then 'You joined the mentorship waitlist' else 'Seat Saved ✓' end,
    s.title || case when new.status = 'waitlisted' then ': we will notify you if a place opens.' else ': we will remind you before it begins.' end,
    '/mentorship-session/' || new.session_id
  from mentorship_sessions s where s.id = new.session_id and exists (select 1 from json_each(s.notification_channels) c where c.value = 'in_app');
  insert into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select new.user_id, r.column1, r.column2,
    json_object('registration_id', new.id, 'session_id', new.session_id, 'title', s.title, 'route', '/mentorship-session/' || new.session_id),
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', s.starts_at, r.column3)),
    'mentorship:' || new.id || ':' || r.column1 || ':' || r.column2
  from (values ('in_app', 'mentorship_seat_saved', '-100 years'), ('push', 'mentorship_seat_saved', '-100 years'), ('email', 'mentorship_seat_saved', '-100 years'),
    ('push', 'mentorship_session_reminder_24h', '-24 hours'), ('in_app', 'mentorship_session_reminder_24h', '-24 hours'), ('email', 'mentorship_session_reminder_24h', '-24 hours'),
    ('push', 'mentorship_session_reminder_1h', '-1 hours'), ('in_app', 'mentorship_session_reminder_1h', '-1 hours'), ('email', 'mentorship_session_reminder_1h', '-1 hours'),
    ('push', 'mentorship_session_live', '+0 hours'), ('in_app', 'mentorship_session_live', '+0 hours')) r
  join mentorship_sessions s on s.id = new.session_id
  left join notification_preferences pref on pref.user_id = new.user_id
  where new.status = 'registered' and s.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    and exists (select 1 from json_each(s.notification_channels) c where c.value = r.column1)
    and (r.column1 = 'in_app' or (r.column1 = 'email' and coalesce(pref.email_enabled, 1) = 1) or (r.column1 = 'push' and coalesce(pref.push_enabled, 0) = 1))
  on conflict (dedupe_key) where dedupe_key is not null do update set payload = excluded.payload, scheduled_for = excluded.scheduled_for,
    status = case when notification_outbox.status = 'sent' then 'sent' else 'pending' end;
end;

-- ---------- attendance: activity record, and session marked recorded once every seat has a decision ----------
create trigger mentorship_attendance_activity after update of attendance_status on mentorship_registrations
when new.attendance_status = 'attended' and old.attendance_status is not new.attendance_status
begin
  insert or ignore into marketplace_activity (user_id, activity_type, source_id, metadata)
  values (new.user_id, 'mentorship_session_completed', new.session_id, json_object('registration_id', new.id));
end;

create trigger mentorship_attendance_completion after update of attendance_status on mentorship_registrations
when not exists (select 1 from mentorship_registrations where session_id = new.session_id and status = 'registered' and attendance_status = 'not_recorded')
begin
  update mentorship_sessions set attendance_recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.session_id;
  update mentorship_operations_tasks set status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where dedupe_key = 'session:' || new.session_id || ':attendance' and status = 'open';
end;

-- ---------- one-on-one applications ----------
create trigger mentorship_application_notify_insert after insert on mentorship_applications
begin
  insert into user_notifications (user_id, kind, title, body, route) values (new.user_id, 'mentorship_application_' || new.status,
    case when new.status = 'approved' then 'Your mentorship request is approved' else 'One-on-One mentorship update' end,
    case when new.status = 'approved' then 'Open My Mentorship to book your session.' else 'Open My Mentorship to review your application status.' end, '/mentorship/my');
end;

create trigger mentorship_application_notify_update after update of status on mentorship_applications
when old.status is not new.status
begin
  insert into user_notifications (user_id, kind, title, body, route) values (new.user_id, 'mentorship_application_' || new.status,
    case when new.status = 'approved' then 'Your mentorship request is approved' else 'One-on-One mentorship update' end,
    case when new.status = 'approved' then 'Open My Mentorship to book your session.' else 'Open My Mentorship to review your application status.' end, '/mentorship/my');
  insert or ignore into marketplace_activity (user_id, activity_type, source_id, metadata)
  select new.user_id, 'one_to_one_mentorship_completed', new.id, json_object('mentor_id', new.assigned_mentor_id) where new.status = 'completed';
end;

-- ---------- sessions: replay, interest matches, publication ----------
create trigger mentorship_replay_notify_insert after insert on mentorship_sessions
when nullif(new.replay_url, '') is not null
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select r.user_id, 'mentorship_replay_available', 'Replay available', new.title || ' is ready to watch.', '/mentorship-session/' || new.id
  from mentorship_registrations r where r.session_id = new.id and r.status = 'registered';
end;

create trigger mentorship_replay_notify_update after update of replay_url on mentorship_sessions
when nullif(new.replay_url, '') is not null and old.replay_url is not new.replay_url
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select r.user_id, 'mentorship_replay_available', 'Replay available', new.title || ' is ready to watch.', '/mentorship-session/' || new.id
  from mentorship_registrations r where r.session_id = new.id and r.status = 'registered';
end;

create trigger mentorship_interest_match_insert after insert on mentorship_sessions
when new.status in ('published', 'upcoming') and new.mentorship_type = 'industry'
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select i.user_id, 'mentorship_interest_match', 'A relevant mentorship just opened',
    new.title || ' matches your saved ' || coalesce(nullif(i.subfield, ''), i.industry) || ' interest.', '/mentorship-session/' || new.id
  from mentorship_industry_interests i
  where i.notifications_enabled = 1 and (i.industry = new.industry or (new.subfield <> '' and i.subfield = new.subfield));
end;

create trigger mentorship_interest_match_update after update of status on mentorship_sessions
when new.status in ('published', 'upcoming') and new.mentorship_type = 'industry' and old.status is not new.status
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select i.user_id, 'mentorship_interest_match', 'A relevant mentorship just opened',
    new.title || ' matches your saved ' || coalesce(nullif(i.subfield, ''), i.industry) || ' interest.', '/mentorship-session/' || new.id
  from mentorship_industry_interests i
  where i.notifications_enabled = 1 and (i.industry = new.industry or (new.subfield <> '' and i.subfield = new.subfield));
end;

create trigger mentorship_session_publication_insert after insert on mentorship_sessions
when new.status in ('published', 'upcoming')
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id, 'published_mentorship_session', 'New mentorship session', new.title || ' · ' || coalesce(new.industry, 'Mentorship'), '/mentorship-session/' || new.id
  from profiles p
  left join memberships m on m.user_id = p.id
  left join notification_preferences pref on pref.user_id = p.id
  where coalesce(pref.events_enabled, 1) = 1
    and (new.access_level <> 'members' or m.status = 'verified')
    and (new.audience_type = 'everyone'
      or (new.audience_type = 'members' and m.status = 'verified')
      or (new.audience_type = 'selected_users' and p.id in (select value from json_each(new.selected_user_ids)))
      or (new.audience_type = 'career_field' and (
        exists (select 1 from marketplace_journeys j, json_each(j.interests) a, json_each(new.audience_fields) b where j.user_id = p.id and a.value = b.value)
        or exists (select 1 from mentorship_industry_interests i, json_each(new.audience_fields) b where i.user_id = p.id and i.notifications_enabled = 1 and lower(b.value) = lower(i.industry))))
      or (new.audience_type = 'subfield' and (
        exists (select 1 from marketplace_journeys j, json_each(j.interests) a, json_each(new.audience_subfields) b where j.user_id = p.id and a.value = b.value)
        or exists (select 1 from mentorship_industry_interests i, json_each(new.audience_subfields) b where i.user_id = p.id and i.notifications_enabled = 1 and lower(b.value) = lower(i.subfield)))));
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select distinct n.user_id, 'push', 'published_mentorship_session',
    json_object('title', 'New mentorship session', 'body', new.title || ' · ' || coalesce(new.industry, 'Mentorship'), 'route', '/mentorship-session/' || new.id,
      'category', 'mentorship', 'session_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'mentorship-publication:' || new.id || ':push:' || n.user_id
  from user_notifications n join notification_preferences pref on pref.user_id = n.user_id and pref.push_enabled = 1 and pref.events_enabled = 1
  where n.kind = 'published_mentorship_session' and n.route = '/mentorship-session/' || new.id
    and n.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minutes');
end;

create trigger mentorship_session_publication_update after update of status on mentorship_sessions
when new.status in ('published', 'upcoming') and old.status not in ('published', 'upcoming')
begin
  insert into user_notifications (user_id, kind, title, body, route)
  select p.id, 'published_mentorship_session', 'New mentorship session', new.title || ' · ' || coalesce(new.industry, 'Mentorship'), '/mentorship-session/' || new.id
  from profiles p
  left join memberships m on m.user_id = p.id
  left join notification_preferences pref on pref.user_id = p.id
  where coalesce(pref.events_enabled, 1) = 1
    and (new.access_level <> 'members' or m.status = 'verified')
    and (new.audience_type = 'everyone'
      or (new.audience_type = 'members' and m.status = 'verified')
      or (new.audience_type = 'selected_users' and p.id in (select value from json_each(new.selected_user_ids)))
      or (new.audience_type = 'career_field' and (
        exists (select 1 from marketplace_journeys j, json_each(j.interests) a, json_each(new.audience_fields) b where j.user_id = p.id and a.value = b.value)
        or exists (select 1 from mentorship_industry_interests i, json_each(new.audience_fields) b where i.user_id = p.id and i.notifications_enabled = 1 and lower(b.value) = lower(i.industry))))
      or (new.audience_type = 'subfield' and (
        exists (select 1 from marketplace_journeys j, json_each(j.interests) a, json_each(new.audience_subfields) b where j.user_id = p.id and a.value = b.value)
        or exists (select 1 from mentorship_industry_interests i, json_each(new.audience_subfields) b where i.user_id = p.id and i.notifications_enabled = 1 and lower(b.value) = lower(i.subfield)))));
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  select distinct n.user_id, 'push', 'published_mentorship_session',
    json_object('title', 'New mentorship session', 'body', new.title || ' · ' || coalesce(new.industry, 'Mentorship'), 'route', '/mentorship-session/' || new.id,
      'category', 'mentorship', 'session_id', new.id),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'mentorship-publication:' || new.id || ':push:' || n.user_id
  from user_notifications n join notification_preferences pref on pref.user_id = n.user_id and pref.push_enabled = 1 and pref.events_enabled = 1
  where n.kind = 'published_mentorship_session' and n.route = '/mentorship-session/' || new.id
    and n.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minutes');
end;

-- ---------- mentor communications and session operations tasks ----------
-- Every linked mentor gets confirmation, 7d/24h/1h reminders and a thank-you; sent messages stay sent.
create trigger mentorship_session_operations_insert after insert on mentorship_sessions
when new.status in ('scheduled', 'published', 'upcoming')
begin
  insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
  select 'session:' || new.id || ':meeting-link', new.id, 'missing_meeting_link', 'Add meeting link', new.title, strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, '-25 hours'), 'high'
  where nullif(new.meeting_url, '') is null
  on conflict (dedupe_key) do update set due_at = excluded.due_at, status = 'open';
end;

create trigger mentorship_session_operations_update after update on mentorship_sessions
begin
  insert into mentor_communication_outbox (mentor_id, session_id, recipient_email, template_key, payload, scheduled_for, dedupe_key)
  select link.mentor_id, new.id, ops.email, r.column1,
    case when r.column1 = 'mentor_session_thank_you' then json_object('title', new.title, 'starts_at', new.starts_at)
      else json_object('title', new.title, 'starts_at', new.starts_at, 'meeting_url', new.meeting_url) end,
    case when r.column1 = 'mentor_session_thank_you' then strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, '+2 hours')
      else max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, r.column2)) end,
    'mentor:' || new.id || ':' || link.mentor_id || ':' || r.column3
  from mentorship_session_mentors link join mentor_operations ops on ops.mentor_id = link.mentor_id,
    (values ('mentor_session_confirmed', '-100 years', 'confirmed'), ('mentor_session_reminder_7d', '-7 days', '7d'),
      ('mentor_session_reminder_24h', '-24 hours', '24h'), ('mentor_session_reminder_1h', '-1 hours', '1h'), ('mentor_session_thank_you', '+2 hours', 'thank-you')) r
  where link.session_id = new.id and new.status in ('scheduled', 'published', 'upcoming')
  on conflict (dedupe_key) do update set payload = excluded.payload, scheduled_for = excluded.scheduled_for,
    status = case when mentor_communication_outbox.status = 'sent' then 'sent' else 'pending' end;

  insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
  select 'session:' || new.id || ':meeting-link', new.id, 'missing_meeting_link', 'Add meeting link', new.title, strftime('%Y-%m-%dT%H:%M:%fZ', new.starts_at, '-25 hours'), 'high'
  where new.status in ('scheduled', 'published', 'upcoming') and nullif(new.meeting_url, '') is null
  on conflict (dedupe_key) do update set due_at = excluded.due_at, status = 'open';
  update mentorship_operations_tasks set status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where new.status in ('scheduled', 'published', 'upcoming') and nullif(new.meeting_url, '') is not null
    and dedupe_key = 'session:' || new.id || ':meeting-link' and status = 'open';

  update mentor_communication_outbox set status = 'skipped', error_message = 'Session cancelled'
  where new.status = 'cancelled' and old.status is not new.status and session_id = new.id and status = 'pending';
end;

-- Linking a mentor to a session schedules that mentor's messages and a confirmation task.
create trigger mentorship_session_mentor_link after insert on mentorship_session_mentors
begin
  insert into mentor_communication_outbox (mentor_id, session_id, recipient_email, template_key, payload, scheduled_for, dedupe_key)
  select new.mentor_id, s.id, ops.email, r.column1,
    case when r.column1 = 'mentor_session_thank_you' then json_object('title', s.title, 'starts_at', s.starts_at)
      else json_object('title', s.title, 'starts_at', s.starts_at, 'meeting_url', s.meeting_url) end,
    case when r.column1 = 'mentor_session_thank_you' then strftime('%Y-%m-%dT%H:%M:%fZ', s.starts_at, '+2 hours')
      else max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', s.starts_at, r.column2)) end,
    'mentor:' || s.id || ':' || new.mentor_id || ':' || r.column3
  from mentorship_sessions s join mentor_operations ops on ops.mentor_id = new.mentor_id,
    (values ('mentor_session_confirmed', '-100 years', 'confirmed'), ('mentor_session_reminder_7d', '-7 days', '7d'),
      ('mentor_session_reminder_24h', '-24 hours', '24h'), ('mentor_session_reminder_1h', '-1 hours', '1h'), ('mentor_session_thank_you', '+2 hours', 'thank-you')) r
  where s.id = new.session_id and s.status in ('scheduled', 'published', 'upcoming')
  on conflict (dedupe_key) do update set payload = excluded.payload, scheduled_for = excluded.scheduled_for,
    status = case when mentor_communication_outbox.status = 'sent' then 'sent' else 'pending' end;
  insert into mentorship_operations_tasks (dedupe_key, mentor_id, session_id, kind, title, detail, due_at, priority)
  select 'session:' || s.id || ':mentor:' || new.mentor_id || ':confirmation', new.mentor_id, s.id, 'mentor_confirmation', 'Confirm mentor for session', s.title,
    max(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', s.starts_at, '-7 days')), 'high'
  from mentorship_sessions s where s.id = new.session_id
  on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, status = 'open';
end;
