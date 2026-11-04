-- Re-check newly added official records and tolerate harmless Member ID formatting differences.

create or replace function public.normalize_membership_email(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '[[:space:].,;:]+$', '', 'g'));
$$;

create or replace function public.normalize_member_identifier(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(token, '' order by
    case
      when token = 'gwmb' then 0
      when token ~ '^[a-z]+$' then 1
      when token ~ '^[0-9]{4}$' then 2
      else 3
    end,
    token
  ), '')
  from regexp_split_to_table(lower(trim(coalesce(value, ''))), '[^a-z0-9]+') as token
  where token <> '';
$$;

create index if not exists membership_records_normalized_lookup
  on public.membership_records (
    public.normalize_member_identifier(member_identifier),
    public.normalize_membership_email(membership_email)
  );

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
  v_clean_email text := public.normalize_membership_email(p_membership_email);
  v_clean_identifier text := trim(p_member_identifier);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(v_clean_email, '') is null or nullif(v_clean_identifier, '') is null then
    raise exception 'Membership email and Member ID are required';
  end if;

  select public.normalize_membership_email(email), email_confirmed_at
  into v_user_email, v_email_confirmed
  from auth.users where id = v_user_id;

  select * into v_record
  from public.membership_records
  where public.normalize_member_identifier(member_identifier) = public.normalize_member_identifier(v_clean_identifier)
    and public.normalize_membership_email(membership_email) = v_clean_email
  limit 1;

  if v_record.id is null then
    insert into public.membership_verification_requests(
      user_id, membership_email, member_identifier, chapter, phone, status,
      review_note, submitted_at, updated_at
    ) values (
      v_user_id, v_clean_email, v_clean_identifier,
      nullif(trim(p_chapter), ''), '', 'needs_review',
      'No matching Member ID and membership email were found in the official membership database.',
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
      'No matching official record was found yet. We will check again automatically when an administrator updates the records.';
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
      v_user_id, v_clean_email, v_clean_identifier, trim(p_chapter), '',
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

  if v_email_confirmed is not null
     and v_user_email = public.normalize_membership_email(v_record.membership_email) then
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
      v_user_id, v_clean_email, v_clean_identifier, v_record.chapter, '',
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

  insert into public.membership_verification_requests(
    user_id, membership_email, member_identifier, chapter, phone,
    membership_record_id, status, review_note, submitted_at, updated_at
  ) values (
    v_user_id, v_clean_email, v_clean_identifier, v_record.chapter, '',
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
