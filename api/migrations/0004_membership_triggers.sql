-- Membership invariants kept in the database, ported from Supabase triggers:
--   mark_membership_pending (202610150001), sync_linked_membership_access (202610150002),
--   prevent_inactivity_relink (202610200004).

-- Applying or requesting verification moves an inactive account to "pending".
-- Fix vs. Supabase: verification-request writes only count while the request is still waiting
-- (pending / needs_review). The original fired on every write, so linking an inactive record
-- (request "approved", membership "expired") flipped the membership back to "pending".
create trigger membership_applications_mark_pending after insert on membership_applications
begin
  update memberships set status = 'pending'
  where user_id = new.user_id and status in ('non_member', 'rejected', 'expired');
end;

create trigger membership_verification_mark_pending_insert after insert on membership_verification_requests
when new.status in ('pending', 'needs_review')
begin
  update memberships set status = 'pending'
  where user_id = new.user_id and status in ('non_member', 'rejected', 'expired');
end;

create trigger membership_verification_mark_pending_update after update on membership_verification_requests
when new.status in ('pending', 'needs_review')
begin
  update memberships set status = 'pending'
  where user_id = new.user_id and status in ('non_member', 'rejected', 'expired');
end;

-- A linked official record drives the app membership: active -> verified, anything else -> expired.
create trigger membership_records_sync_insert after insert on membership_records
when new.linked_user_id is not null
begin
  update memberships set
    status = case when new.status = 'active' then 'verified' else 'expired' end,
    membership_record_id = new.id,
    verified_at = case when new.status = 'active' then coalesce(verified_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) else verified_at end
  where user_id = new.linked_user_id;
end;

-- Unlink the previous user first (memberships.membership_record_id is unique), then sync the linked user.
create trigger membership_records_sync_update after update of status, linked_user_id on membership_records
begin
  update memberships set status = 'non_member', membership_record_id = null
  where old.linked_user_id is not null and old.linked_user_id is not new.linked_user_id
    and user_id = old.linked_user_id and membership_record_id = old.id;
  update memberships set
    status = case when new.status = 'active' then 'verified' else 'expired' end,
    membership_record_id = new.id,
    verified_at = case when new.status = 'active' then coalesce(verified_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) else verified_at end
  where new.linked_user_id is not null and user_id = new.linked_user_id;
end;

-- Members downgraded for inactivity must reapply rather than be silently re-verified.
create trigger memberships_prevent_inactivity_relink before update of status on memberships
when new.status = 'verified' and old.status <> 'verified'
  and exists (select 1 from membership_participation_status where user_id = new.user_id and state = 'downgraded')
begin
  select raise(abort, 'Membership reapplication is required after an inactivity downgrade');
end;
