-- Account notification preferences, device tokens and event reminder delivery.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  events_enabled boolean not null default true,
  opportunities_enabled boolean not null default true,
  learning_enabled boolean not null default true,
  community_enabled boolean not null default true,
  newsletter_enabled boolean not null default true,
  reminder_24h boolean not null default true,
  reminder_1h boolean not null default true,
  reminder_live boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  device_name text,
  platform text not null check (platform in ('android', 'ios')),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists push_devices_user_idx on public.push_devices (user_id, active);

alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
revoke all on table public.notification_preferences, public.push_devices from anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.push_devices to authenticated;
grant select on table public.notification_outbox to authenticated;

create policy "Users manage notification preferences"
on public.notification_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their push devices"
on public.push_devices for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Admins monitor notification delivery"
on public.notification_outbox for select to authenticated
using (public.is_app_admin());

alter table public.event_registrations
  add column if not exists event_title text,
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_route text;

alter table public.notification_outbox
  add column if not exists scheduled_for timestamptz not null default now(),
  add column if not exists dedupe_key text,
  add column if not exists error_message text;

create unique index if not exists notification_outbox_dedupe_idx
  on public.notification_outbox (dedupe_key) where dedupe_key is not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_outbox'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.notification_outbox drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_outbox'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.notification_outbox drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.notification_outbox
  add constraint notification_outbox_channel_check
    check (channel in ('email', 'in_app', 'push', 'sms', 'whatsapp')),
  add constraint notification_outbox_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

create or replace function public.queue_event_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_route text;
  v_start timestamptz;
begin
  if new.status = 'cancelled' then
    update public.notification_outbox
      set status = 'skipped', error_message = 'Registration cancelled'
    where status = 'pending'
      and payload ->> 'registration_id' = new.id::text;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  v_title := case when new.status = 'waitlisted' then 'You are on the event waitlist' else 'Your event place is confirmed' end;
  v_body := case when new.status = 'waitlisted'
    then coalesce(new.event_title, 'Your GWMB event') || ': we will notify you if a place becomes available.'
    else coalesce(new.event_title, 'Your GWMB event') || ': we will remind you before it begins.' end;
  v_route := coalesce(new.event_route, '/events?tab=my');
  v_start := new.event_starts_at;

  insert into public.user_notifications(user_id, kind, title, body, route)
  values (new.user_id, 'event_registration_' || new.status, v_title, v_body, v_route);

  insert into public.notification_outbox(user_id, channel, template_key, payload, scheduled_for, dedupe_key)
  values
    (new.user_id, 'push', 'event_registration_' || new.status,
      jsonb_build_object('registration_id', new.id, 'event_id', new.event_id, 'title', v_title, 'body', v_body, 'route', v_route),
      now(), 'event:' || new.id || ':push:confirmation'),
    (new.user_id, 'email', 'event_registration_' || new.status,
      jsonb_build_object('registration_id', new.id, 'event_id', new.event_id, 'email', new.email, 'title', v_title, 'body', v_body, 'route', v_route),
      now(), 'event:' || new.id || ':email:confirmation')
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  if new.status = 'registered' and v_start is not null and v_start > now() then
    insert into public.notification_outbox(user_id, channel, template_key, payload, scheduled_for, dedupe_key)
    select new.user_id, channel, template_key,
      jsonb_build_object('registration_id', new.id, 'event_id', new.event_id, 'email', new.email,
        'title', case template_key
          when 'event_reminder_24h' then 'Your GWMB event is tomorrow'
          when 'event_reminder_1h' then 'Your GWMB event starts in one hour'
          else 'We are live now' end,
        'body', coalesce(new.event_title, 'Your GWMB event') || case template_key
          when 'event_reminder_24h' then ' starts tomorrow. Open the app for the latest details.'
          when 'event_reminder_1h' then ' starts in one hour. Get ready to join.'
          else ' is starting now. Open GWMB to join.' end,
        'route', v_route),
      scheduled_for,
      'event:' || new.id || ':' || channel || ':' || template_key
    from (values
      ('push', 'event_reminder_24h', greatest(now(), v_start - interval '24 hours')),
      ('in_app', 'event_reminder_24h', greatest(now(), v_start - interval '24 hours')),
      ('email', 'event_reminder_24h', greatest(now(), v_start - interval '24 hours')),
      ('push', 'event_reminder_1h', greatest(now(), v_start - interval '1 hour')),
      ('in_app', 'event_reminder_1h', greatest(now(), v_start - interval '1 hour')),
      ('email', 'event_reminder_1h', greatest(now(), v_start - interval '1 hour')),
      ('push', 'event_reminder_live', v_start),
      ('in_app', 'event_reminder_live', v_start)
    ) as reminders(channel, template_key, scheduled_for)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.queue_event_notifications() from public, anon, authenticated;

drop trigger if exists event_registration_notifications on public.event_registrations;
create trigger event_registration_notifications
after insert or update of status on public.event_registrations
for each row execute procedure public.queue_event_notifications();

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute procedure public.set_updated_at();
