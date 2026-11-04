create extension if not exists pgcrypto;

create table if not exists public.cv_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('built','uploaded')),
  name text not null default 'My CV',
  target_role text,
  opportunity_type text,
  template text not null default 'classic' check (template in ('classic','modern')),
  original_file_path text,
  generated_file_path text,
  original_file_name text,
  extracted_text text,
  structured_data jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready','reviewed')),
  is_primary boolean not null default false,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cv_records_one_primary_per_user on public.cv_records(user_id) where is_primary;
create index if not exists cv_records_user_updated_idx on public.cv_records(user_id, updated_at desc);
alter table public.cv_records enable row level security;

drop policy if exists "users manage own cvs" on public.cv_records;
create policy "users manage own cvs" on public.cv_records for all to authenticated
using (auth.uid() = user_id or public.is_app_admin())
with check (auth.uid() = user_id or public.is_app_admin());

alter table public.opportunity_applications add column if not exists cv_record_id uuid references public.cv_records(id) on delete set null;
alter table public.opportunity_applications add column if not exists cv_snapshot jsonb;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('private-cvs','private-cvs',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "users upload own cv files" on storage.objects;
create policy "users upload own cv files" on storage.objects for insert to authenticated
with check (bucket_id='private-cvs' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "users read own cv files" on storage.objects;
create policy "users read own cv files" on storage.objects for select to authenticated
using (bucket_id='private-cvs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_app_admin()));
drop policy if exists "users update own cv files" on storage.objects;
create policy "users update own cv files" on storage.objects for update to authenticated
using (bucket_id='private-cvs' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='private-cvs' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "users delete own cv files" on storage.objects;
create policy "users delete own cv files" on storage.objects for delete to authenticated
using (bucket_id='private-cvs' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.set_primary_cv(p_cv_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.cv_records set is_primary=false where user_id=auth.uid();
  update public.cv_records set is_primary=true,updated_at=now() where id=p_cv_id and user_id=auth.uid();
end; $$;
grant execute on function public.set_primary_cv(uuid) to authenticated;
