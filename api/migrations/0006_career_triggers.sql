-- Opportunity and career-readiness notifications kept in the database, ported from Supabase triggers:
--   queue_application_reminder, notify_application_status (202610210001), notify_career_review_status (202610280002).

-- Application follow-up reminders: (re)schedule when enabled, skip when disabled.
create trigger application_reminder_insert after insert on application_reminders
when new.enabled = 1
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  values (new.user_id, 'in_app', 'application_follow_up',
    json_object('title', new.label, 'body', 'Review your application progress and choose your next useful step.',
      'route', '/opportunities?tab=applications', 'category', 'opportunities', 'opportunity_id', new.opportunity_id),
    new.scheduled_for, 'application:' || new.user_id || ':' || new.opportunity_id || ':' || new.days_after_submission, 'pending');
end;

create trigger application_reminder_update after update of enabled, scheduled_for on application_reminders
begin
  insert or replace into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key, status)
  select new.user_id, 'in_app', 'application_follow_up',
    json_object('title', new.label, 'body', 'Review your application progress and choose your next useful step.',
      'route', '/opportunities?tab=applications', 'category', 'opportunities', 'opportunity_id', new.opportunity_id),
    new.scheduled_for, 'application:' || new.user_id || ':' || new.opportunity_id || ':' || new.days_after_submission, 'pending'
  where new.enabled = 1;
  update notification_outbox set status = 'skipped', error_message = 'Reminder disabled'
  where new.enabled = 0 and status = 'pending'
    and dedupe_key = 'application:' || new.user_id || ':' || new.opportunity_id || ':' || new.days_after_submission;
end;

-- Application status changes (by admins) notify the applicant.
create trigger opportunity_application_status_notify after update of status on opportunity_applications
when old.status is not new.status and new.status <> 'draft'
begin
  insert into user_notifications (user_id, kind, title, body, route)
  values (new.user_id, 'application_status', 'Your application status changed',
    'Your application is now ' || replace(new.status, '_', ' ') || '.', '/opportunities?tab=applications');
  insert or ignore into notification_outbox (user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  values (new.user_id, 'push', 'application_status',
    json_object('title', 'Your application status changed', 'body', 'Your application is now ' || replace(new.status, '_', ' ') || '.',
      'route', '/opportunities?tab=applications', 'category', 'opportunities'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'application-status:' || new.id || ':' || new.status);
end;

-- Career review decisions notify the member; "reviewed" stamps reviewed_at.
-- (Supabase used a BEFORE trigger that edited NEW; SQLite does this as an AFTER trigger.)
create trigger career_review_status_notify after update of status on career_review_submissions
when old.status is not new.status and new.status in ('selected', 'reviewed', 'not_selected')
begin
  insert into user_notifications (user_id, kind, title, body, route)
  values (new.user_id, 'career_readiness',
    case new.status when 'selected' then 'You were selected for a Career Readiness clinic'
      when 'reviewed' then 'Your career review is ready' else 'Career review update' end,
    case new.status when 'selected' then 'Open Career Readiness to see your selected clinic.'
      when 'reviewed' then 'Open your submission to read the feedback from the GWMB team.'
      else 'This submission was not selected for this clinic. You can submit for another session.' end,
    '/career-readiness');
  update career_review_submissions set reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where id = new.id and new.status = 'reviewed';
end;
