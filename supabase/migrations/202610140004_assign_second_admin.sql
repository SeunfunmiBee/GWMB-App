-- Assign the second confirmed GWMB administrator account.
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('bolarinwaseunfunmi@gmail.com')
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user exists for bolarinwaseunfunmi@gmail.com';
  end if;

  insert into public.app_admins (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end
$$;
