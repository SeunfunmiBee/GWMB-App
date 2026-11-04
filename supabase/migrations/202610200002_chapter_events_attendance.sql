-- Local chapter operations and backend-confirmed member attendance.

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'city' check (kind in ('city','campus')),
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists chapters_name_unique on public.chapters (lower(trim(name)));

insert into public.chapters(name,kind,location)
select min(trim(chapter)),
  case when lower(min(chapter)) like '%university%' or lower(min(chapter)) like '%campus%' then 'campus' else 'city' end,
  min(trim(chapter))
from public.membership_records
where nullif(trim(chapter),'') is not null
group by lower(trim(chapter))
on conflict do nothing;

create table if not exists public.chapter_admins (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(chapter_id,user_id)
);

create or replace function public.is_chapter_admin(p_chapter_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_app_admin() or exists(
    select 1 from public.chapter_admins
    where chapter_id=p_chapter_id and user_id=auth.uid() and active=true
  );
$$;
revoke execute on function public.is_chapter_admin(uuid) from public,anon;
grant execute on function public.is_chapter_admin(uuid) to authenticated;

create table if not exists public.local_activities (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  kind text not null check(kind in ('event','project')),
  title text not null check(char_length(title) between 3 and 180),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null,
  status text not null default 'published' check(status in ('draft','published','completed','cancelled')),
  members_only boolean not null default true,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists local_activities_chapter_date_idx on public.local_activities(chapter_id,starts_at desc);

create table if not exists public.local_activity_attendance (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.local_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_record_id uuid not null references public.membership_records(id) on delete restrict,
  status text not null check(status in ('attended','absent')),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  note text,
  unique(activity_id,user_id)
);
create index if not exists local_attendance_user_idx on public.local_activity_attendance(user_id,confirmed_at desc);

alter table public.chapters enable row level security;
alter table public.chapter_admins enable row level security;
alter table public.local_activities enable row level security;
alter table public.local_activity_attendance enable row level security;

drop policy if exists "Authenticated users read chapters" on public.chapters;
create policy "Authenticated users read chapters" on public.chapters for select to authenticated using(active or public.is_app_admin());
drop policy if exists "App admins manage chapters" on public.chapters;
create policy "App admins manage chapters" on public.chapters for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());

drop policy if exists "Admins read chapter roles" on public.chapter_admins;
create policy "Admins read chapter roles" on public.chapter_admins for select to authenticated using(user_id=auth.uid() or public.is_app_admin());
drop policy if exists "App admins manage chapter roles" on public.chapter_admins;
create policy "App admins manage chapter roles" on public.chapter_admins for all to authenticated using(public.is_app_admin()) with check(public.is_app_admin());

drop policy if exists "Members read published local activities" on public.local_activities;
create policy "Members read published local activities" on public.local_activities for select to authenticated using(status='published' or public.is_chapter_admin(chapter_id));
drop policy if exists "Chapter admins manage local activities" on public.local_activities;
create policy "Chapter admins manage local activities" on public.local_activities for all to authenticated using(public.is_chapter_admin(chapter_id)) with check(public.is_chapter_admin(chapter_id) and created_by=auth.uid());

drop policy if exists "Members read own confirmed attendance" on public.local_activity_attendance;
create policy "Members read own confirmed attendance" on public.local_activity_attendance for select to authenticated using(user_id=auth.uid());

create or replace function public.get_my_chapter_admin_access()
returns table(chapter_id uuid,chapter_name text,chapter_kind text)
language sql stable security definer set search_path=''
as $$
  select c.id,c.name,c.kind
  from public.chapters c
  where c.active and (public.is_app_admin() or exists(
    select 1 from public.chapter_admins ca where ca.chapter_id=c.id and ca.user_id=auth.uid() and ca.active
  ))
  order by c.name;
$$;
revoke execute on function public.get_my_chapter_admin_access() from public,anon;
grant execute on function public.get_my_chapter_admin_access() to authenticated;

create or replace function public.assign_chapter_admin(p_email text,p_chapter_name text,p_chapter_kind text default 'city')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_user uuid;v_chapter uuid;
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'No app account exists for this email'; end if;
  insert into public.chapters(name,kind,location) values(trim(p_chapter_name),p_chapter_kind,trim(p_chapter_name))
  on conflict ((lower(trim(name)))) do update set active=true
  returning id into v_chapter;
  insert into public.chapter_admins(chapter_id,user_id,created_by,active) values(v_chapter,v_user,auth.uid(),true)
  on conflict(chapter_id,user_id) do update set active=true,created_by=auth.uid();
  return v_chapter;
end;
$$;
revoke execute on function public.assign_chapter_admin(text,text,text) from public,anon;
grant execute on function public.assign_chapter_admin(text,text,text) to authenticated;

create or replace function public.list_chapter_admins()
returns table(id uuid,chapter_id uuid,chapter_name text,chapter_kind text,user_id uuid,full_name text,email text,active boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  return query select ca.id,c.id,c.name,c.kind,ca.user_id,p.full_name,u.email,ca.active
  from public.chapter_admins ca
  join public.chapters c on c.id=ca.chapter_id
  join auth.users u on u.id=ca.user_id
  left join public.profiles p on p.id=ca.user_id
  order by c.name,coalesce(p.full_name,u.email);
end;
$$;
revoke execute on function public.list_chapter_admins() from public,anon;
grant execute on function public.list_chapter_admins() to authenticated;

create or replace function public.set_chapter_admin_active(p_assignment_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  update public.chapter_admins set active=p_active where id=p_assignment_id;
end;
$$;
revoke execute on function public.set_chapter_admin_active(uuid,boolean) from public,anon;
grant execute on function public.set_chapter_admin_active(uuid,boolean) to authenticated;

create or replace function public.create_local_activity(
  p_chapter_id uuid,p_kind text,p_title text,p_description text,p_starts_at timestamptz,p_venue text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not public.is_chapter_admin(p_chapter_id) then raise exception 'Chapter admin access required'; end if;
  if p_kind not in ('event','project') then raise exception 'Activity must be an event or project'; end if;
  insert into public.local_activities(chapter_id,kind,title,description,starts_at,venue,created_by)
  values(p_chapter_id,p_kind,trim(p_title),nullif(trim(p_description),''),p_starts_at,trim(p_venue),auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_local_activity(uuid,text,text,text,timestamptz,text) from public,anon;
grant execute on function public.create_local_activity(uuid,text,text,text,timestamptz,text) to authenticated;

create or replace function public.get_chapter_activity_roster(p_activity_id uuid)
returns table(user_id uuid,full_name text,email text,member_identifier text,attendance_status text,confirmed_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_chapter uuid;v_chapter_name text;
begin
  select a.chapter_id,c.name into v_chapter,v_chapter_name from public.local_activities a join public.chapters c on c.id=a.chapter_id where a.id=p_activity_id;
  if not public.is_chapter_admin(v_chapter) then raise exception 'Chapter admin access required'; end if;
  return query
  select r.linked_user_id,p.full_name,u.email,r.member_identifier,aa.status,aa.confirmed_at
  from public.membership_records r
  join public.memberships m on m.user_id=r.linked_user_id and m.status='verified'
  join auth.users u on u.id=r.linked_user_id
  left join public.profiles p on p.id=r.linked_user_id
  left join public.local_activity_attendance aa on aa.activity_id=p_activity_id and aa.user_id=r.linked_user_id
  where r.linked_user_id is not null and lower(trim(r.chapter))=lower(trim(v_chapter_name))
  order by coalesce(p.full_name,u.email);
end;
$$;
revoke execute on function public.get_chapter_activity_roster(uuid) from public,anon;
grant execute on function public.get_chapter_activity_roster(uuid) to authenticated;

create or replace function public.confirm_local_attendance(p_activity_id uuid,p_user_id uuid,p_attended boolean,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_chapter uuid;v_chapter_name text;v_record uuid;
begin
  select a.chapter_id,c.name into v_chapter,v_chapter_name from public.local_activities a join public.chapters c on c.id=a.chapter_id where a.id=p_activity_id;
  if not public.is_chapter_admin(v_chapter) then raise exception 'Chapter admin access required'; end if;
  select r.id into v_record from public.membership_records r join public.memberships m on m.user_id=r.linked_user_id and m.status='verified'
  where r.linked_user_id=p_user_id and lower(trim(r.chapter))=lower(trim(v_chapter_name)) limit 1;
  if v_record is null then raise exception 'This person is not a verified member of the activity chapter'; end if;
  insert into public.local_activity_attendance(activity_id,user_id,membership_record_id,status,confirmed_by,confirmed_at,note)
  values(p_activity_id,p_user_id,v_record,case when p_attended then 'attended' else 'absent' end,auth.uid(),now(),nullif(trim(p_note),''))
  on conflict(activity_id,user_id) do update set status=excluded.status,confirmed_by=auth.uid(),confirmed_at=now(),note=excluded.note;
end;
$$;
revoke execute on function public.confirm_local_attendance(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.confirm_local_attendance(uuid,uuid,boolean,text) to authenticated;

create or replace function public.get_my_confirmed_attendance()
returns table(id uuid,activity_id uuid,title text,kind text,chapter_name text,starts_at timestamptz,venue text,status text,confirmed_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select aa.id,a.id,a.title,a.kind,c.name,a.starts_at,a.venue,aa.status,aa.confirmed_at
  from public.local_activity_attendance aa
  join public.local_activities a on a.id=aa.activity_id
  join public.chapters c on c.id=a.chapter_id
  where aa.user_id=auth.uid()
  order by a.starts_at desc;
$$;
revoke execute on function public.get_my_confirmed_attendance() from public,anon;
grant execute on function public.get_my_confirmed_attendance() to authenticated;

create trigger chapters_set_updated_at before update on public.chapters for each row execute procedure public.set_updated_at();
create trigger local_activities_set_updated_at before update on public.local_activities for each row execute procedure public.set_updated_at();
