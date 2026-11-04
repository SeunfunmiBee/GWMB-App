create table if not exists public.clique_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clique_id text not null,
  joined_at timestamptz not null default now(),
  unique (user_id, clique_id)
);

alter table public.clique_memberships enable row level security;

drop policy if exists "Members can read their clique memberships" on public.clique_memberships;
create policy "Members can read their clique memberships" on public.clique_memberships for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Verified members can join cliques" on public.clique_memberships;
create policy "Verified members can join cliques" on public.clique_memberships for insert to authenticated with check (
  auth.uid() = user_id and exists (
    select 1 from public.memberships where memberships.user_id = auth.uid() and memberships.status = 'verified'
  )
);

drop policy if exists "Members can leave their cliques" on public.clique_memberships;
create policy "Members can leave their cliques" on public.clique_memberships for delete to authenticated using (auth.uid() = user_id);
