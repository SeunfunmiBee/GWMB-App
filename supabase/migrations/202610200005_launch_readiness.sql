-- Launch-readiness operations: privacy requests, support, errors, audit logs and beta controls.

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  request_type text not null check (request_type in ('data_export','account_deletion')),
  status text not null default 'submitted' check (status in ('submitted','in_review','completed','cancelled')),
  details text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  request_type text not null default 'support' check (request_type in ('support','problem','feedback')),
  subject text not null,
  message text not null,
  route text,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  severity text not null default 'error' check (severity in ('warning','error','fatal')),
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  label text not null,
  description text,
  enabled boolean not null default false,
  beta_only boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.beta_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('app_user','member','chapter_admin','central_admin')),
  active boolean not null default true,
  notes text,
  added_by uuid,
  added_at timestamptz not null default now()
);

insert into public.feature_flags(key,label,description,enabled,beta_only) values
  ('attendance_participation','Attendance & participation','Member attendance requests, confirmation and participation percentage.',true,true),
  ('application_assistant','Application assistant','Reusable opportunity application profile and guided answers.',true,true),
  ('clique_sessions','Clique sessions','Clique membership, session seats and reminders.',true,true),
  ('one_to_one_mentorship','One-on-one mentorship','Member applications and mentor matching workflow.',true,true)
on conflict(key) do nothing;

alter table public.account_requests enable row level security;
alter table public.support_requests enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.feature_flags enable row level security;
alter table public.beta_testers enable row level security;

create policy "Users read own account requests" on public.account_requests for select to authenticated using(user_id=auth.uid());
create policy "Users create own account requests" on public.account_requests for insert to authenticated with check(user_id=auth.uid());
create policy "Admins manage account requests" on public.account_requests for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
create policy "Users read own support requests" on public.support_requests for select to authenticated using(user_id=auth.uid());
create policy "Users create own support requests" on public.support_requests for insert to authenticated with check(user_id=auth.uid());
create policy "Admins manage support requests" on public.support_requests for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
create policy "Authenticated users log app errors" on public.app_error_logs for insert to authenticated with check(user_id=auth.uid() or user_id is null);
create policy "Admins read app errors" on public.app_error_logs for select to authenticated using(public.is_app_admin());
create policy "Admins update app errors" on public.app_error_logs for update to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
create policy "Admins read audit logs" on public.admin_audit_logs for select to authenticated using(public.is_app_admin());
create policy "Everyone reads enabled feature flags" on public.feature_flags for select using(enabled=true or public.is_app_admin());
create policy "Admins manage feature flags" on public.feature_flags for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());
create policy "Beta testers read own status" on public.beta_testers for select to authenticated using(user_id=auth.uid() or public.is_app_admin());
create policy "Admins manage beta testers" on public.beta_testers for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());

create or replace function public.request_account_action(p_request_type text,p_details text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_email text;
begin
  if p_request_type not in ('data_export','account_deletion') then raise exception 'Unsupported account request'; end if;
  select email into v_email from auth.users where id=auth.uid();
  if exists(select 1 from public.account_requests where user_id=auth.uid() and request_type=p_request_type and status in ('submitted','in_review')) then
    raise exception 'You already have an active request of this type';
  end if;
  insert into public.account_requests(user_id,email,request_type,details) values(auth.uid(),v_email,p_request_type,nullif(trim(p_details),'')) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.request_account_action(text,text) from public,anon;
grant execute on function public.request_account_action(text,text) to authenticated;

create or replace function public.cancel_account_deletion()
returns void language sql security definer set search_path=''
as $$ update public.account_requests set status='cancelled' where user_id=auth.uid() and request_type='account_deletion' and status='submitted'; $$;
revoke execute on function public.cancel_account_deletion() from public,anon;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function public.submit_support_request(p_type text,p_subject text,p_message text,p_route text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_email text;
begin
  if p_type not in ('support','problem','feedback') then raise exception 'Unsupported request type'; end if;
  if length(trim(p_subject))<3 or length(trim(p_message))<10 then raise exception 'Add a subject and a little more detail'; end if;
  select email into v_email from auth.users where id=auth.uid();
  insert into public.support_requests(user_id,email,request_type,subject,message,route) values(auth.uid(),v_email,p_type,trim(p_subject),trim(p_message),nullif(trim(p_route),'')) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.submit_support_request(text,text,text,text) from public,anon;
grant execute on function public.submit_support_request(text,text,text,text) to authenticated;

create or replace function public.log_app_error(p_source text,p_message text,p_severity text default 'error',p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  insert into public.app_error_logs(user_id,severity,source,message,context) values(auth.uid(),case when p_severity in ('warning','error','fatal') then p_severity else 'error' end,left(p_source,120),left(p_message,2000),coalesce(p_context,'{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_app_error(text,text,text,jsonb) from public,anon;
grant execute on function public.log_app_error(text,text,text,jsonb) to authenticated;

create or replace function public.add_beta_tester_by_email(p_email text,p_role text default 'member',p_notes text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  if p_role not in ('app_user','member','chapter_admin','central_admin') then raise exception 'Unsupported beta role'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email));
  if v_user is null then raise exception 'No app account found for this email'; end if;
  insert into public.beta_testers(user_id,role,notes,added_by) values(v_user,p_role,nullif(trim(p_notes),''),auth.uid())
  on conflict(user_id) do update set role=excluded.role,notes=excluded.notes,active=true,added_by=auth.uid(),added_at=now();
  return v_user;
end;
$$;
revoke execute on function public.add_beta_tester_by_email(text,text,text) from public,anon;
grant execute on function public.add_beta_tester_by_email(text,text,text) to authenticated;

create or replace function public.audit_admin_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_target jsonb;v_id text;
begin
  if not public.is_app_admin() then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  v_target:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id:=coalesce(v_target->>'id',v_target->>'user_id',v_target->>'key');
  insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),lower(tg_op),tg_table_name,v_id,jsonb_build_object('status',v_target->>'status'));
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_membership_records on public.membership_records;
create trigger audit_membership_records after insert or update or delete on public.membership_records for each row execute procedure public.audit_admin_change();
drop trigger if exists audit_membership_applications on public.membership_applications;
create trigger audit_membership_applications after insert or update or delete on public.membership_applications for each row execute procedure public.audit_admin_change();
drop trigger if exists audit_feature_flags on public.feature_flags;
create trigger audit_feature_flags after insert or update or delete on public.feature_flags for each row execute procedure public.audit_admin_change();
drop trigger if exists audit_beta_testers on public.beta_testers;
create trigger audit_beta_testers after insert or update or delete on public.beta_testers for each row execute procedure public.audit_admin_change();
