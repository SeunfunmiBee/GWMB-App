-- Privacy lifecycle hardening: trace request processing and prevent personal
-- support/error records from surviving account deletion as anonymous orphans.

alter table public.account_requests
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_error text,
  add column if not exists export_path text,
  add column if not exists export_schema_version integer,
  add column if not exists storage_objects_removed integer not null default 0;

create index if not exists support_requests_user_id_idx
  on public.support_requests(user_id)
  where user_id is not null;

create index if not exists app_error_logs_user_id_idx
  on public.app_error_logs(user_id)
  where user_id is not null;

-- Support messages contain user-provided contact details and free text. They
-- are account data, not an anonymous operational record, so cascade them.
alter table public.support_requests
  drop constraint if exists support_requests_user_id_fkey;
alter table public.support_requests
  add constraint support_requests_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete cascade not valid;

-- Error context can contain routes and user-entered values. Keep anonymous
-- pre-auth reports, but cascade authenticated reports with the account.
alter table public.app_error_logs
  drop constraint if exists app_error_logs_user_id_fkey;
alter table public.app_error_logs
  add constraint app_error_logs_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete cascade not valid;

-- A chapter administrator can own operational records that must outlive their
-- app login. Those records keep working, while account attribution is removed.
alter table public.local_activities
  alter column created_by drop not null,
  drop constraint if exists local_activities_created_by_fkey;
alter table public.local_activities
  add constraint local_activities_created_by_fkey
  foreign key(created_by) references auth.users(id) on delete set null not valid;

alter table public.local_activity_attendance
  alter column confirmed_by drop not null,
  drop constraint if exists local_activity_attendance_confirmed_by_fkey;
alter table public.local_activity_attendance
  add constraint local_activity_attendance_confirmed_by_fkey
  foreign key(confirmed_by) references auth.users(id) on delete set null not valid;

alter table public.local_attendance_requests
  drop constraint if exists local_attendance_requests_reviewed_by_fkey;
alter table public.local_attendance_requests
  add constraint local_attendance_requests_reviewed_by_fkey
  foreign key(reviewed_by) references auth.users(id) on delete set null not valid;

-- Legacy operational attribution columns did not have foreign keys. Clear the
-- user UUID automatically instead of retaining a permanent account identifier.
alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_actor_user_id_fkey;
alter table public.admin_audit_logs
  add constraint admin_audit_logs_actor_user_id_fkey
  foreign key(actor_user_id) references auth.users(id) on delete set null not valid;

alter table public.feature_flags
  drop constraint if exists feature_flags_updated_by_fkey;
alter table public.feature_flags
  add constraint feature_flags_updated_by_fkey
  foreign key(updated_by) references auth.users(id) on delete set null not valid;

alter table public.beta_testers
  drop constraint if exists beta_testers_added_by_fkey;
alter table public.beta_testers
  add constraint beta_testers_added_by_fkey
  foreign key(added_by) references auth.users(id) on delete set null not valid;

comment on column public.account_requests.export_path is
  'Private object path for completed data exports; cleared during account deletion.';
comment on column public.account_requests.processing_error is
  'Last processing failure shown to administrators; never stores credentials or file contents.';
