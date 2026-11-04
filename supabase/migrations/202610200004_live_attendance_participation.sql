-- Live attendance requests, administrator confirmation and membership participation policy.

create table if not exists public.local_attendance_requests (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.local_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  unique(activity_id,user_id)
);

create table if not exists public.membership_participation_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'good' check(state in ('good','review','downgraded','reapplied')),
  attended_count integer not null default 0,
  eligible_count integer not null default 0,
  participation_percentage numeric(5,2) not null default 100,
  review_started_at timestamptz,
  downgraded_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.local_attendance_requests enable row level security;
alter table public.membership_participation_status enable row level security;
drop policy if exists "Members read own attendance requests" on public.local_attendance_requests;
create policy "Members read own attendance requests" on public.local_attendance_requests for select to authenticated using(user_id=auth.uid());
drop policy if exists "Members read own participation" on public.membership_participation_status;
create policy "Members read own participation" on public.membership_participation_status for select to authenticated using(user_id=auth.uid());

create or replace function public.get_my_live_local_activities()
returns table(id uuid,title text,kind text,chapter_name text,starts_at timestamptz,venue text,request_status text)
language sql stable security definer set search_path=''
as $$
  select a.id,a.title::text,a.kind::text,c.name::text,a.starts_at,a.venue::text,rq.status::text
  from public.local_activities a
  join public.chapters c on c.id=a.chapter_id
  join public.membership_records mr on mr.linked_user_id=auth.uid() and lower(trim(mr.chapter))=lower(trim(c.name))
  join public.memberships m on m.user_id=auth.uid() and m.status='verified'
  left join public.local_attendance_requests rq on rq.activity_id=a.id and rq.user_id=auth.uid()
  where a.status='published'
    and now() between a.starts_at-interval '30 minutes' and coalesce(a.ends_at,a.starts_at+interval '4 hours')
  order by a.starts_at;
$$;
revoke execute on function public.get_my_live_local_activities() from public,anon;
grant execute on function public.get_my_live_local_activities() to authenticated;

create or replace function public.request_live_attendance(p_activity_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare v_activity public.local_activities%rowtype;v_chapter text;
begin
  select a into v_activity from public.local_activities a where a.id=p_activity_id;
  select c.name into v_chapter from public.chapters c where c.id=v_activity.chapter_id;
  if v_activity.id is null or v_activity.status<>'published' or now() not between v_activity.starts_at-interval '30 minutes' and coalesce(v_activity.ends_at,v_activity.starts_at+interval '4 hours') then
    raise exception 'Attendance opens 30 minutes before the activity and closes when it ends';
  end if;
  if not exists(select 1 from public.memberships m join public.membership_records r on r.id=m.membership_record_id where m.user_id=auth.uid() and m.status='verified' and lower(trim(r.chapter))=lower(trim(v_chapter))) then
    raise exception 'Verified membership in this chapter is required';
  end if;
  insert into public.local_attendance_requests(activity_id,user_id) values(p_activity_id,auth.uid())
  on conflict(activity_id,user_id) do update set status='pending',requested_at=now(),reviewed_by=null,reviewed_at=null;
  return 'pending';
end;
$$;
revoke execute on function public.request_live_attendance(uuid) from public,anon;
grant execute on function public.request_live_attendance(uuid) to authenticated;

drop function if exists public.get_chapter_activity_roster(uuid);
create function public.get_chapter_activity_roster(p_activity_id uuid)
returns table(user_id uuid,full_name text,email text,member_identifier text,attendance_status text,attendance_request_status text,confirmed_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_chapter uuid;v_chapter_name text;
begin
  select a.chapter_id,c.name into v_chapter,v_chapter_name from public.local_activities a join public.chapters c on c.id=a.chapter_id where a.id=p_activity_id;
  if not public.is_chapter_admin(v_chapter) then raise exception 'Chapter admin access required'; end if;
  return query
  select r.linked_user_id,p.full_name::text,u.email::text,r.member_identifier::text,aa.status::text,rq.status::text,aa.confirmed_at
  from public.membership_records r
  join public.memberships m on m.user_id=r.linked_user_id and m.status='verified'
  join auth.users u on u.id=r.linked_user_id
  left join public.profiles p on p.id=r.linked_user_id
  left join public.local_activity_attendance aa on aa.activity_id=p_activity_id and aa.user_id=r.linked_user_id
  left join public.local_attendance_requests rq on rq.activity_id=p_activity_id and rq.user_id=r.linked_user_id
  where r.linked_user_id is not null and lower(trim(r.chapter))=lower(trim(v_chapter_name))
  order by (rq.status='pending') desc,coalesce(p.full_name,u.email);
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
  update public.local_attendance_requests set status=case when p_attended then 'confirmed' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now()
  where activity_id=p_activity_id and user_id=p_user_id;
end;
$$;

create or replace function public.complete_local_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_chapter uuid;v_chapter_name text;v_member record;v_attended integer;v_eligible integer;v_percentage numeric;v_previous text;v_current_attended boolean;
begin
  select a.chapter_id,c.name into v_chapter,v_chapter_name from public.local_activities a join public.chapters c on c.id=a.chapter_id where a.id=p_activity_id;
  if not public.is_chapter_admin(v_chapter) then raise exception 'Chapter admin access required'; end if;
  update public.local_activities set status='completed' where id=p_activity_id;
  for v_member in
    select m.user_id,m.membership_record_id,m.verified_at
    from public.memberships m join public.membership_records r on r.id=m.membership_record_id
    where m.status='verified' and lower(trim(r.chapter))=lower(trim(v_chapter_name))
  loop
    insert into public.local_activity_attendance(activity_id,user_id,membership_record_id,status,confirmed_by,confirmed_at,note)
    values(p_activity_id,v_member.user_id,v_member.membership_record_id,'absent',auth.uid(),now(),'No confirmed attendance before activity close.')
    on conflict(activity_id,user_id) do nothing;
    select count(*),count(*) filter(where aa.status='attended') into v_eligible,v_attended
    from public.local_activities a
    left join public.local_activity_attendance aa on aa.activity_id=a.id and aa.user_id=v_member.user_id
    where a.chapter_id=v_chapter and a.status='completed' and a.members_only
      and a.starts_at>=coalesce(v_member.verified_at,'epoch'::timestamptz);
    v_percentage:=case when v_eligible=0 then 100 else round((v_attended::numeric/v_eligible::numeric)*100,2) end;
    select state into v_previous from public.membership_participation_status where user_id=v_member.user_id;
    select exists(select 1 from public.local_activity_attendance where activity_id=p_activity_id and user_id=v_member.user_id and status='attended') into v_current_attended;
    if v_percentage<70 and v_previous='review' and not v_current_attended then
      insert into public.membership_participation_status(user_id,state,attended_count,eligible_count,participation_percentage,downgraded_at,updated_at)
      values(v_member.user_id,'downgraded',v_attended,v_eligible,v_percentage,now(),now())
      on conflict(user_id) do update set state='downgraded',attended_count=excluded.attended_count,eligible_count=excluded.eligible_count,participation_percentage=excluded.participation_percentage,downgraded_at=now(),updated_at=now();
      update public.memberships set status='non_member',verified_at=null where user_id=v_member.user_id;
    elsif v_percentage<70 then
      insert into public.membership_participation_status(user_id,state,attended_count,eligible_count,participation_percentage,review_started_at,updated_at)
      values(v_member.user_id,'review',v_attended,v_eligible,v_percentage,now(),now())
      on conflict(user_id) do update set state='review',attended_count=excluded.attended_count,eligible_count=excluded.eligible_count,participation_percentage=excluded.participation_percentage,review_started_at=coalesce(public.membership_participation_status.review_started_at,now()),updated_at=now();
    else
      insert into public.membership_participation_status(user_id,state,attended_count,eligible_count,participation_percentage,updated_at)
      values(v_member.user_id,'good',v_attended,v_eligible,v_percentage,now())
      on conflict(user_id) do update set state='good',attended_count=excluded.attended_count,eligible_count=excluded.eligible_count,participation_percentage=excluded.participation_percentage,review_started_at=null,updated_at=now();
    end if;
  end loop;
end;
$$;
revoke execute on function public.complete_local_activity(uuid) from public,anon;
grant execute on function public.complete_local_activity(uuid) to authenticated;

create or replace function public.get_my_participation_summary()
returns table(state text,attended_count integer,eligible_count integer,participation_percentage numeric,review_started_at timestamptz,downgraded_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select coalesce(s.state,'good')::text,coalesce(s.attended_count,0),coalesce(s.eligible_count,0),coalesce(s.participation_percentage,100),s.review_started_at,s.downgraded_at
  from (select auth.uid() as user_id) me left join public.membership_participation_status s on s.user_id=me.user_id;
$$;
revoke execute on function public.get_my_participation_summary() from public,anon;
grant execute on function public.get_my_participation_summary() to authenticated;

create or replace function public.prevent_inactivity_relink()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='verified' and old.status<>'verified' and exists(select 1 from public.membership_participation_status where user_id=new.user_id and state='downgraded') then
    raise exception 'Membership reapplication is required after an inactivity downgrade';
  end if;
  return new;
end;
$$;
drop trigger if exists memberships_prevent_inactivity_relink on public.memberships;
create trigger memberships_prevent_inactivity_relink before update of status on public.memberships for each row execute procedure public.prevent_inactivity_relink();
