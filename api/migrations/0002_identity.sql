-- Identity and membership foundation (ported from supabase/migrations/202609240001, 202610130001, 202610150001).
-- Conventions for every D1 migration: ids are UUID text generated in the Worker (crypto.randomUUID),
-- timestamps are ISO-8601 UTC text, booleans are 0/1 integers, JSON is text, enums are CHECK constraints.
-- Row access rules (formerly RLS) are enforced in the Worker, not here.

create table profiles (
  id text primary key references "user"(id) on delete cascade,
  full_name text,
  avatar_url text,
  city_club text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table membership_records (
  id text primary key,
  member_identifier text not null,
  membership_email text not null,
  chapter text,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired', 'suspended')),
  dues_status text not null default 'unknown' check (dues_status in ('current', 'due', 'overdue', 'waived', 'unknown')),
  linked_user_id text unique references "user"(id) on delete set null,
  source_reference text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index membership_records_identifier_unique on membership_records (lower(trim(member_identifier)));
create index membership_records_email_lookup on membership_records (lower(trim(membership_email)));
create index membership_records_created_idx on membership_records (created_at desc);

create table memberships (
  user_id text primary key references "user"(id) on delete cascade,
  status text not null default 'non_member' check (status in ('non_member', 'pending', 'verified', 'rejected', 'expired')),
  application_reference text unique,
  membership_record_id text unique references membership_records(id) on delete set null,
  verified_at text,
  expires_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table app_admins (
  user_id text primary key references "user"(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create trigger profiles_updated_at after update on profiles for each row when new.updated_at = old.updated_at
begin update profiles set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id; end;
create trigger memberships_updated_at after update on memberships for each row when new.updated_at = old.updated_at
begin update memberships set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where user_id = new.user_id; end;
create trigger membership_records_updated_at after update on membership_records for each row when new.updated_at = old.updated_at
begin update membership_records set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id; end;
