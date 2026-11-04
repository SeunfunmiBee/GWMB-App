-- Secure claims and member benefits for partner-hosted advanced programmes.

-- Course media and downloadable resources share the existing Admin-managed bucket.
update storage.buckets set
  file_size_limit=262144000,
  allowed_mime_types=array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime','video/x-m4v',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
where id='content-media';

create table if not exists public.advanced_program_offers (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  benefit_code text,
  max_claims integer check (max_claims is null or max_claims > 0),
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advanced_program_claims (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_status text not null,
  offer_type text not null,
  benefit_label text,
  claimed_code text,
  status text not null default 'claimed' check (status in ('claimed','application_opened','enrolled','accepted','declined','expired')),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(content_id,user_id)
);

alter table public.advanced_program_offers enable row level security;
alter table public.advanced_program_claims enable row level security;
revoke all on table public.advanced_program_offers, public.advanced_program_claims from anon, authenticated;
grant select,insert,update,delete on table public.advanced_program_offers to authenticated;
grant select,update on table public.advanced_program_claims to authenticated;

create policy "Admins manage advanced programme offers" on public.advanced_program_offers
  for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Users read their advanced programme claims" on public.advanced_program_claims
  for select to authenticated using ((select auth.uid())=user_id or public.is_app_admin());
create policy "Admins update advanced programme claims" on public.advanced_program_claims
  for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop trigger if exists advanced_program_offers_set_updated_at on public.advanced_program_offers;
create trigger advanced_program_offers_set_updated_at before update on public.advanced_program_offers
  for each row execute procedure public.set_updated_at();
drop trigger if exists advanced_program_claims_set_updated_at on public.advanced_program_claims;
create trigger advanced_program_claims_set_updated_at before update on public.advanced_program_claims
  for each row execute procedure public.set_updated_at();

create or replace function public.claim_advanced_program_benefit(p_course_slug text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_content public.content_items%rowtype;
  v_offer public.advanced_program_offers%rowtype;
  v_config jsonb;
  v_membership_status text := 'non_member';
  v_claim public.advanced_program_claims%rowtype;
  v_claim_count integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  select * into v_content from public.content_items
    where area='courses' and slug=p_course_slug and status='published' and visible=true;
  if v_content.id is null then raise exception 'Advanced programme not found'; end if;
  v_config := coalesce(v_content.metadata->'advanced_program','{}'::jsonb);
  if coalesce((v_config->>'enabled')::boolean,false)=false then raise exception 'Advanced programme is not enabled'; end if;

  select status into v_membership_status from public.memberships where user_id=v_user;
  v_membership_status := coalesce(v_membership_status,'non_member');
  if coalesce((v_config->>'members_only_offer')::boolean,true) and v_membership_status<>'verified' then
    raise exception 'Verified GWMB membership is required for this benefit';
  end if;
  if coalesce((v_config->>'completion_required')::boolean,false) and not exists (
    select 1 from public.course_progress where user_id=v_user and course_id=p_course_slug and completed_at is not null
  ) then raise exception 'Complete the GWMB course before claiming this benefit'; end if;

  select * into v_offer from public.advanced_program_offers where content_id=v_content.id and active=true for update;
  if v_offer.content_id is null then raise exception 'This benefit is not ready to claim'; end if;
  select count(*) into v_claim_count from public.advanced_program_claims where content_id=v_content.id and status<>'expired';
  if v_offer.max_claims is not null and v_claim_count>=v_offer.max_claims then raise exception 'All available benefits have been claimed'; end if;

  insert into public.advanced_program_claims(content_id,user_id,membership_status,offer_type,benefit_label,claimed_code)
  values(v_content.id,v_user,v_membership_status,coalesce(v_config->>'offer_type','none'),v_config->>'offer_label',v_offer.benefit_code)
  on conflict(content_id,user_id) do update set updated_at=now()
  returning * into v_claim;

  return jsonb_build_object('claimId',v_claim.id,'status',v_claim.status,'code',v_claim.claimed_code,
    'offerType',v_claim.offer_type,'offerLabel',v_claim.benefit_label,
    'applicationUrl',coalesce(v_config->>'application_url',v_config->>'programme_url'));
end;
$$;
revoke execute on function public.claim_advanced_program_benefit(text) from public,anon;
grant execute on function public.claim_advanced_program_benefit(text) to authenticated;

create or replace function public.get_my_advanced_program_claim(p_course_slug text)
returns jsonb
language sql stable security definer set search_path=''
as $$
  select case when c.id is null then null else jsonb_build_object(
    'claimId',c.id,'status',c.status,'code',c.claimed_code,'offerType',c.offer_type,
    'offerLabel',c.benefit_label,'claimedAt',c.claimed_at,
    'applicationUrl',coalesce(i.metadata->'advanced_program'->>'application_url',i.metadata->'advanced_program'->>'programme_url')
  ) end
  from public.content_items i
  left join public.advanced_program_claims c on c.content_id=i.id and c.user_id=(select auth.uid())
  where i.area='courses' and i.slug=p_course_slug
  limit 1;
$$;
revoke execute on function public.get_my_advanced_program_claim(text) from public,anon;
grant execute on function public.get_my_advanced_program_claim(text) to authenticated;
