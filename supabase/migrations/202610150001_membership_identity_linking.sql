-- Separate app identity from official GWMB membership records and link them safely.

alter table public.memberships drop constraint if exists memberships_status_check;
update public.memberships set status = 'non_member' where status = 'guest';
alter table public.memberships
  add constraint memberships_status_check
  check (status in ('non_member', 'pending', 'verified', 'rejected', 'expired'));

create table if not exists public.membership_records (
  id uuid primary key default gen_random_uuid(),
  member_identifier text not null,
  membership_email text not null,
  chapter text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'expired', 'suspended')),
  dues_status text not null default 'unknown'
    check (dues_status in ('current', 'due', 'overdue', 'waived', 'unknown')),
  linked_user_id uuid unique references auth.users(id) on delete set null,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists membership_records_identifier_unique
  on public.membership_records (lower(trim(member_identifier)));
create index if not exists membership_records_email_lookup
  on public.membership_records (lower(trim(membership_email)));

alter table public.memberships
  add column if not exists membership_record_id uuid unique
    references public.membership_records(id) on delete set null;

alter table public.membership_verification_requests
  add column if not exists chapter text,
  add column if not exists membership_record_id uuid
    references public.membership_records(id) on delete set null;

alter table public.membership_verification_requests
  drop constraint if exists membership_verification_requests_status_check;
alter table public.membership_verification_requests
  add constraint membership_verification_requests_status_check
  check (status in ('pending', 'needs_review', 'approved', 'rejected'));

alter table public.membership_records enable row level security;
revoke all on table public.membership_records from anon, authenticated;
grant select, insert, update on table public.membership_records to authenticated;

drop policy if exists "Admins manage official membership records" on public.membership_records;
create policy "Admins manage official membership records"
on public.membership_records for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

drop trigger if exists membership_records_set_updated_at on public.membership_records;
create trigger membership_records_set_updated_at
  before update on public.membership_records
  for each row execute procedure public.set_updated_at();

create or replace function public.submit_membership_link_request(
  p_membership_email text,
  p_member_identifier text,
  p_chapter text default null
)
returns table(result text, request_status text, message text)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed timestamptz;
  v_record public.membership_records%rowtype;
  v_existing_user uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(p_membership_email), '') is null or nullif(trim(p_member_identifier), '') is null then
    raise exception 'Membership email and Member ID are required';
  end if;

  select lower(email), email_confirmed_at into v_user_email, v_email_confirmed
  from auth.users where id = v_user_id;

  select * into v_record
  from public.membership_records
  where lower(trim(member_identifier)) = lower(trim(p_member_identifier))
    and lower(trim(membership_email)) = lower(trim(p_membership_email))
  limit 1;

  if v_record.id is null then
    insert into public.membership_verification_requests(
      user_id, membership_email, member_identifier, chapter, phone, status,
      review_note, submitted_at, updated_at
    ) values (
      v_user_id, lower(trim(p_membership_email)), trim(p_member_identifier),
      nullif(trim(p_chapter), ''), '', 'needs_review',
      'No exact Member ID and membership-email match was found. Check the official membership database.',
      now(), now()
    ) on conflict (user_id) do update set
      membership_email = excluded.membership_email,
      member_identifier = excluded.member_identifier,
      chapter = excluded.chapter,
      membership_record_id = null,
      status = 'needs_review',
      review_note = excluded.review_note,
      submitted_at = now(), updated_at = now();
    update public.memberships set status = 'pending' where user_id = v_user_id;
    return query select 'needs_review', 'needs_review',
      'We found no exact match. A GWMB administrator can review your details.';
    return;
  end if;

  v_existing_user := v_record.linked_user_id;
  if v_existing_user is not null and v_existing_user <> v_user_id then
    return query select 'already_linked', 'rejected',
      'This Member ID is already linked to another app account. Sign in to that account or recover it.';
    return;
  end if;

  if nullif(trim(p_chapter), '') is not null and v_record.chapter is not null
     and lower(trim(p_chapter)) <> lower(trim(v_record.chapter)) then
    insert into public.membership_verification_requests(
      user_id, membership_email, member_identifier, chapter, phone,
      membership_record_id, status, review_note, submitted_at, updated_at
    ) values (
      v_user_id, lower(trim(p_membership_email)), trim(p_member_identifier), trim(p_chapter), '',
      v_record.id, 'needs_review', 'Member ID and email matched, but the chapter needs manual confirmation.', now(), now()
    ) on conflict (user_id) do update set
      membership_email = excluded.membership_email,
      member_identifier = excluded.member_identifier,
      chapter = excluded.chapter,
      membership_record_id = excluded.membership_record_id,
      status = 'needs_review', review_note = excluded.review_note,
      submitted_at = now(), updated_at = now();
    update public.memberships set status = 'pending' where user_id = v_user_id;
    return query select 'needs_review', 'needs_review',
      'Your Member ID and email matched, but the chapter needs review.';
    return;
  end if;

  -- A confirmed app email matching the official membership email proves email ownership.
  if v_email_confirmed is not null and v_user_email = lower(trim(v_record.membership_email)) then
    update public.membership_records set linked_user_id = v_user_id where id = v_record.id;
    update public.memberships set
      membership_record_id = v_record.id,
      status = case when v_record.status = 'active' then 'verified' else 'expired' end,
      verified_at = case when v_record.status = 'active' then now() else verified_at end
    where user_id = v_user_id;
    insert into public.membership_verification_requests(
      user_id, membership_email, member_identifier, chapter, phone,
      membership_record_id, status, review_note, submitted_at, updated_at
    ) values (
      v_user_id, lower(trim(p_membership_email)), trim(p_member_identifier), v_record.chapter, '',
      v_record.id, 'approved', 'Verified using the confirmed app-account email.', now(), now()
    ) on conflict (user_id) do update set
      membership_email = excluded.membership_email,
      member_identifier = excluded.member_identifier,
      chapter = excluded.chapter,
      membership_record_id = excluded.membership_record_id,
      status = 'approved', review_note = excluded.review_note, updated_at = now();
    return query select
      case when v_record.status = 'active' then 'verified' else 'inactive' end,
      'approved',
      case when v_record.status = 'active'
        then 'Membership verified and linked to your app account.'
        else 'Your membership record matched, but it is not currently active.' end;
    return;
  end if;

  -- A different membership email is allowed, but ownership must be reviewed/confirmed.
  insert into public.membership_verification_requests(
    user_id, membership_email, member_identifier, chapter, phone,
    membership_record_id, status, review_note, submitted_at, updated_at
  ) values (
    v_user_id, lower(trim(p_membership_email)), trim(p_member_identifier), v_record.chapter, '',
    v_record.id, 'pending', 'Member ID and email matched. Confirm ownership of the membership email.', now(), now()
  ) on conflict (user_id) do update set
    membership_email = excluded.membership_email,
    member_identifier = excluded.member_identifier,
    chapter = excluded.chapter,
    membership_record_id = excluded.membership_record_id,
    status = 'pending', review_note = excluded.review_note,
    submitted_at = now(), updated_at = now();
  update public.memberships set status = 'pending' where user_id = v_user_id;
  return query select 'email_confirmation_required', 'pending',
    'Your details matched. GWMB needs to confirm ownership of the membership email before linking.';
end;
$$;

revoke execute on function public.submit_membership_link_request(text,text,text) from public, anon;
grant execute on function public.submit_membership_link_request(text,text,text) to authenticated;

create or replace function public.admin_resolve_membership_link(
  p_user_id uuid,
  p_approved boolean,
  p_review_note text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_request public.membership_verification_requests%rowtype;
  v_record public.membership_records%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  select * into v_request from public.membership_verification_requests where user_id = p_user_id for update;
  if v_request.user_id is null then raise exception 'Verification request not found'; end if;

  if not p_approved then
    update public.membership_verification_requests
      set status = 'rejected', review_note = coalesce(nullif(trim(p_review_note), ''), 'The membership details could not be verified.')
      where user_id = p_user_id;
    update public.memberships set status = 'non_member' where user_id = p_user_id and status = 'pending';
    return;
  end if;

  if v_request.membership_record_id is null then
    raise exception 'Match this request to an official membership record before approval';
  end if;
  select * into v_record from public.membership_records where id = v_request.membership_record_id for update;
  if v_record.linked_user_id is not null and v_record.linked_user_id <> p_user_id then
    raise exception 'This Member ID is already linked to another account';
  end if;

  update public.membership_records set linked_user_id = p_user_id where id = v_record.id;
  update public.memberships set
    membership_record_id = v_record.id,
    status = case when v_record.status = 'active' then 'verified' else 'expired' end,
    verified_at = case when v_record.status = 'active' then now() else verified_at end
  where user_id = p_user_id;
  update public.membership_verification_requests
    set status = 'approved', review_note = coalesce(nullif(trim(p_review_note), ''), 'Membership manually verified by GWMB.')
    where user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_resolve_membership_link(uuid,boolean,text) from public, anon;
grant execute on function public.admin_resolve_membership_link(uuid,boolean,text) to authenticated;

create or replace function public.get_my_membership_details()
returns table(
  member_identifier text,
  membership_email text,
  chapter text,
  record_status text,
  dues_status text
)
language sql stable security definer set search_path = '' as $$
  select r.member_identifier, r.membership_email, r.chapter, r.status, r.dues_status
  from public.memberships m
  join public.membership_records r on r.id = m.membership_record_id
  where m.user_id = (select auth.uid());
$$;

revoke execute on function public.get_my_membership_details() from public, anon;
grant execute on function public.get_my_membership_details() to authenticated;

-- New app accounts are app users/non-members until a membership record is linked.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', trim(concat(new.raw_user_meta_data ->> 'first_name', ' ', new.raw_user_meta_data ->> 'last_name'))));
  insert into public.memberships (user_id, status) values (new.id, 'non_member');
  return new;
end;
$$;

create or replace function public.mark_membership_pending()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.memberships set status = 'pending'
  where user_id = new.user_id and status in ('non_member', 'rejected', 'expired');
  return new;
end;
$$;

