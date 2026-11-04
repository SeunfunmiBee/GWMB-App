-- Persist the delivery schedule so a notification worker can send reminders reliably.

alter table public.notification_outbox
  add column if not exists scheduled_for timestamptz not null default now();

create index if not exists notification_outbox_delivery_idx
  on public.notification_outbox (status, scheduled_for);

create or replace function public.queue_mentorship_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_key text;
  v_starts_at timestamptz;
begin
  if tg_table_name = 'mentorship_registrations' then
    v_key := 'mentorship_registration_confirmed';
    v_title := 'Mentorship registration confirmed';
    v_body := 'Your place is saved. We will remind you before the session begins.';

    select starts_at into v_starts_at from public.mentorship_sessions where id = new.session_id;
    insert into public.user_notifications(user_id, kind, title, body, route)
    values (new.user_id, v_key, v_title, v_body, '/mentorship/my');
    insert into public.notification_outbox(user_id, channel, template_key, payload, scheduled_for)
    values
      (new.user_id, 'email', v_key, jsonb_build_object('registration_id', new.id, 'session_id', new.session_id), now()),
      (new.user_id, 'email', 'mentorship_session_reminder_24h', jsonb_build_object('registration_id', new.id, 'session_id', new.session_id), greatest(now(), v_starts_at - interval '24 hours')),
      (new.user_id, 'in_app', 'mentorship_session_reminder_24h', jsonb_build_object('registration_id', new.id, 'session_id', new.session_id), greatest(now(), v_starts_at - interval '24 hours')),
      (new.user_id, 'email', 'mentorship_session_reminder_1h', jsonb_build_object('registration_id', new.id, 'session_id', new.session_id), greatest(now(), v_starts_at - interval '1 hour')),
      (new.user_id, 'in_app', 'mentorship_session_reminder_1h', jsonb_build_object('registration_id', new.id, 'session_id', new.session_id), greatest(now(), v_starts_at - interval '1 hour'));
    return new;
  end if;

  v_key := 'mentorship_application_' || new.status;
  v_title := case new.status when 'approved' then 'Your mentorship request is approved' when 'more_information_required' then 'Your mentorship application needs an update' when 'not_approved' then 'Mentorship application update' else 'Mentorship application received' end;
  v_body := case new.status when 'approved' then 'Open My Mentorship to review your mentor and booking instructions.' when 'more_information_required' then 'Open your application to see what the GWMB team needs.' when 'not_approved' then 'Open your application to review the latest update.' else 'We have received your request and will keep you updated.' end;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.user_notifications(user_id, kind, title, body, route)
    values (new.user_id, v_key, v_title, v_body, '/mentorship/my');
    insert into public.notification_outbox(user_id, channel, template_key, payload, scheduled_for)
    values (new.user_id, 'email', v_key, jsonb_build_object('application_id', new.id), now());
  end if;
  return new;
end;
$$;

revoke execute on function public.queue_mentorship_notification() from public, anon, authenticated;
