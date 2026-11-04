create table if not exists public.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  location text not null,
  interest_area text not null,
  availability text not null,
  motivation text not null,
  status text not null default 'submitted' check (status in ('submitted','under_review','accepted','declined','completed')),
  admin_note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volunteer_applications enable row level security;
grant select, insert on public.volunteer_applications to authenticated;
grant update on public.volunteer_applications to authenticated;

create policy "Users submit volunteer applications" on public.volunteer_applications
for insert to authenticated with check (user_id=auth.uid());
create policy "Users read own volunteer applications" on public.volunteer_applications
for select to authenticated using (user_id=auth.uid() or public.is_app_admin());
create policy "Admins manage volunteer applications" on public.volunteer_applications
for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop trigger if exists volunteer_applications_set_updated_at on public.volunteer_applications;
create trigger volunteer_applications_set_updated_at before update on public.volunteer_applications
for each row execute procedure public.set_updated_at();

update public.content_items set route='/volunteer' where area='community' and slug in ('volunteer-update','volunteer-tile');
