-- Safely transfer a physical device token between signed-in accounts and stop delivery on sign-out.

create or replace function public.register_push_device(p_token text, p_device_name text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_platform not in ('android', 'ios') then raise exception 'Unsupported platform'; end if;
  insert into public.push_devices(user_id, expo_push_token, device_name, platform, active, last_seen_at)
  values ((select auth.uid()), p_token, p_device_name, p_platform, true, now())
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      device_name = excluded.device_name,
      platform = excluded.platform,
      active = true,
      last_seen_at = now();
end;
$$;

create or replace function public.deactivate_my_push_devices()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_devices set active = false where user_id = (select auth.uid());
$$;

revoke execute on function public.register_push_device(text,text,text) from public, anon;
revoke execute on function public.deactivate_my_push_devices() from public, anon;
grant execute on function public.register_push_device(text,text,text) to authenticated;
grant execute on function public.deactivate_my_push_devices() to authenticated;
