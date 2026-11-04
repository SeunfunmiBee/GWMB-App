-- Keep security-definer RPC return columns exact across auth schema types.

create or replace function public.list_chapter_admins()
returns table(id uuid,chapter_id uuid,chapter_name text,chapter_kind text,user_id uuid,full_name text,email text,active boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  return query select ca.id,c.id,c.name::text,c.kind::text,ca.user_id,p.full_name::text,u.email::text,ca.active
  from public.chapter_admins ca
  join public.chapters c on c.id=ca.chapter_id
  join auth.users u on u.id=ca.user_id
  left join public.profiles p on p.id=ca.user_id
  order by c.name,coalesce(p.full_name,u.email);
end;
$$;

create or replace function public.get_chapter_activity_roster(p_activity_id uuid)
returns table(user_id uuid,full_name text,email text,member_identifier text,attendance_status text,confirmed_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_chapter uuid;v_chapter_name text;
begin
  select a.chapter_id,c.name into v_chapter,v_chapter_name from public.local_activities a join public.chapters c on c.id=a.chapter_id where a.id=p_activity_id;
  if not public.is_chapter_admin(v_chapter) then raise exception 'Chapter admin access required'; end if;
  return query
  select r.linked_user_id,p.full_name::text,u.email::text,r.member_identifier::text,aa.status::text,aa.confirmed_at
  from public.membership_records r
  join public.memberships m on m.user_id=r.linked_user_id and m.status='verified'
  join auth.users u on u.id=r.linked_user_id
  left join public.profiles p on p.id=r.linked_user_id
  left join public.local_activity_attendance aa on aa.activity_id=p_activity_id and aa.user_id=r.linked_user_id
  where r.linked_user_id is not null and lower(trim(r.chapter))=lower(trim(v_chapter_name))
  order by coalesce(p.full_name,u.email);
end;
$$;
