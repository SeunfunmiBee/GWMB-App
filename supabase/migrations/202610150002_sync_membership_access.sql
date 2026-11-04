-- Keep app permissions in sync when an official membership becomes active or inactive.

create or replace function public.sync_linked_membership_access()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.linked_user_id is not null then
    update public.memberships
    set status = case when new.status = 'active' then 'verified' else 'expired' end,
        membership_record_id = new.id,
        verified_at = case when new.status = 'active' then coalesce(verified_at, now()) else verified_at end
    where user_id = new.linked_user_id;
  end if;
  if tg_op = 'UPDATE' then
    if old.linked_user_id is not null and old.linked_user_id is distinct from new.linked_user_id then
      update public.memberships
      set status = 'non_member', membership_record_id = null
      where user_id = old.linked_user_id and membership_record_id = old.id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_linked_membership_access() from public, anon, authenticated;
drop trigger if exists membership_records_sync_access on public.membership_records;
create trigger membership_records_sync_access
  after insert or update of status, linked_user_id on public.membership_records
  for each row execute function public.sync_linked_membership_access();
