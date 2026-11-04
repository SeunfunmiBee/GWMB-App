-- High-priority release integrity: publication validation, push receipts and anonymous error intake.

create or replace function public.validate_content_publication()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lesson jsonb;
  v_format text := coalesce(new.metadata->>'format','online');
  v_capacity integer;
begin
  if new.status not in ('published','scheduled') then return new; end if;
  if new.status='scheduled' and (new.publish_at is null or new.publish_at<=now()) then
    raise exception 'Scheduled content requires a future publish date';
  end if;
  if nullif(trim(new.title),'') is null or nullif(trim(coalesce(new.summary,'')),'') is null
     or nullif(trim(coalesce(new.body,'')),'') is null or nullif(trim(coalesce(new.image_url,'')),'') is null
     or nullif(trim(coalesce(new.route,'')),'') is null then
    raise exception 'Complete the title, description, full details, cover image and app route before publishing';
  end if;
  if jsonb_array_length(coalesce(new.metadata->'surfaces','[]'::jsonb))=0
     or nullif(trim(coalesce(new.metadata->>'audience','')),'') is null then
    raise exception 'Choose an audience and at least one app surface before publishing';
  end if;
  if new.metadata->>'audience'='specific-career-fields'
     and nullif(trim(coalesce(new.metadata->>'career_fields','')),'') is null then
    raise exception 'Choose career fields for this audience';
  end if;

  if new.content_type='course' then
    if nullif(trim(coalesce(new.metadata->>'category','')),'') is null
       or nullif(trim(coalesce(new.metadata->>'duration','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{instructor,name}','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{instructor,role}','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{instructor,bio}','')),'') is null then
      raise exception 'Complete course category, duration and lecturer details before publishing';
    end if;
    if jsonb_array_length(coalesce(new.metadata->'lessons','[]'::jsonb))=0 then raise exception 'Add at least one lesson'; end if;
    for v_lesson in select value from jsonb_array_elements(coalesce(new.metadata->'lessons','[]'::jsonb)) loop
      if nullif(trim(coalesce(v_lesson->>'id','')),'') is null
         or nullif(trim(coalesce(v_lesson->>'title','')),'') is null
         or nullif(trim(coalesce(v_lesson->>'summary','')),'') is null
         or nullif(trim(coalesce(v_lesson->>'duration','')),'') is null then
        raise exception 'Every lesson needs an ID, title, summary and duration';
      end if;
      if not exists(select 1 from jsonb_array_elements(coalesce(v_lesson->'sections','[]'::jsonb)) s where nullif(trim(coalesce(s->>'heading','')),'') is not null and nullif(trim(coalesce(s->>'body','')),'') is not null)
         and nullif(trim(coalesce(v_lesson->>'media_url','')),'') is null then
        raise exception 'Every lesson needs complete notes or media';
      end if;
    end loop;
  elsif new.content_type='event' then
    if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at then raise exception 'Add a valid event start and end time'; end if;
    if nullif(trim(coalesce(new.metadata->>'timezone','')),'') is null
       or nullif(trim(coalesce(new.metadata->>'registration_deadline','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{speaker,name}','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{speaker,role}','')),'') is null
       or nullif(trim(coalesce(new.metadata#>>'{speaker,bio}','')),'') is null then
      raise exception 'Complete the time zone, deadline and speaker details before publishing';
    end if;
    begin v_capacity := (new.metadata->>'capacity')::integer; exception when others then raise exception 'Capacity must be a whole number above zero'; end;
    if v_capacity<=0 then raise exception 'Capacity must be a whole number above zero'; end if;
    if (new.metadata->>'registration_deadline')::timestamptz>=new.starts_at then raise exception 'Registration deadline must be before the event starts'; end if;
    if v_format='physical' and nullif(trim(coalesce(new.metadata->>'venue','')),'') is null then raise exception 'Add the physical venue'; end if;
    if v_format in ('online','hybrid') and nullif(trim(coalesce(new.metadata->>'meeting_url','')),'') is null
       and nullif(trim(coalesce(new.metadata->>'registration_url','')),'') is null then
      raise exception 'Add a private meeting link or external registration link';
    end if;
  elsif new.content_type='resource' then
    if nullif(trim(coalesce(new.metadata->>'resource_type','')),'') is null
       or nullif(trim(coalesce(new.metadata->>'url','')),'') is null then
      raise exception 'Choose a resource format and add its upload or link';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_content_publication() from public,anon,authenticated;
drop trigger if exists validate_content_before_publication on public.content_items;
create trigger validate_content_before_publication before insert or update on public.content_items
for each row execute function public.validate_content_publication();

create table if not exists public.notification_push_deliveries(
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  device_id uuid references public.push_devices(id) on delete set null,
  expo_push_token text not null,
  ticket_id text,
  ticket_status text not null default 'pending' check(ticket_status in ('pending','accepted','error')),
  receipt_status text not null default 'pending' check(receipt_status in ('pending','delivered','error','expired')),
  error_code text,
  error_message text,
  sent_at timestamptz,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(outbox_id,expo_push_token)
);
create index if not exists notification_push_receipt_due_idx on public.notification_push_deliveries(receipt_status,sent_at)
where ticket_id is not null;
alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from anon,authenticated;
grant select on public.notification_push_deliveries to authenticated;
create policy "Admins monitor push delivery" on public.notification_push_deliveries for select to authenticated using(public.is_app_admin());

alter table public.app_error_logs add column if not exists platform text, add column if not exists app_version text;
drop policy if exists "Anonymous users log app errors" on public.app_error_logs;
create policy "Anonymous users log app errors" on public.app_error_logs for insert to anon with check(user_id is null);

create or replace function public.log_app_error(p_source text,p_message text,p_severity text default 'error',p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_user uuid:=(select auth.uid());v_client text:=left(coalesce(p_context->>'client_id','unknown'),100);
begin
  if v_user is null and (v_client='unknown' or (select count(*) from public.app_error_logs where user_id is null and context->>'client_id'=v_client and created_at>now()-interval '1 hour')>=20) then
    return null;
  end if;
  insert into public.app_error_logs(user_id,severity,source,message,context,platform,app_version)
  values(v_user,case when p_severity in ('warning','error','fatal') then p_severity else 'error' end,left(p_source,120),left(p_message,2000),coalesce(p_context,'{}'::jsonb),left(p_context->>'platform',40),left(p_context->>'app_version',80)) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_app_error(text,text,text,jsonb) from public;
grant execute on function public.log_app_error(text,text,text,jsonb) to anon,authenticated;
