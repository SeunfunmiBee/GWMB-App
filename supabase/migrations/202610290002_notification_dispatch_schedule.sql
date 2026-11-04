-- Install automatic notification delivery when the deployment secrets exist.
-- Required Vault secrets:
--   notification_project_url  e.g. https://<project-ref>.supabase.co
--   notification_cron_secret  same value as the Edge Function secret

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.install_notification_dispatch_schedule()
returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_url text;
  v_secret text;
  v_job_id bigint;
begin
  if (select auth.uid()) is not null and not public.is_app_admin() then
    raise exception 'Admin access required';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name='notification_project_url' limit 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name='notification_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then return false; end if;

  select jobid into v_job_id from cron.job where jobname='gwmb-notification-dispatch' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  perform cron.schedule(
    'gwmb-notification-dispatch',
    '* * * * *',
    format(
      $job$select net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$job$,
      rtrim(v_url,'/')||'/functions/v1/notification-dispatch',
      jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret)::text
    )
  );
  return true;
end;
$$;
revoke execute on function public.install_notification_dispatch_schedule() from public, anon;
grant execute on function public.install_notification_dispatch_schedule() to authenticated;

-- Production deployments can seed the Vault secrets before this migration. If
-- they are not present yet, the function remains ready for Admin to run after
-- the Edge Function secret is configured.
do $$ begin perform public.install_notification_dispatch_schedule(); end $$;
