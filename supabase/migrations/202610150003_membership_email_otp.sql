-- Short-lived, server-only challenges for proving ownership of a different membership email.

create table if not exists public.membership_email_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  membership_record_id uuid not null references public.membership_records(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.membership_email_challenges enable row level security;
revoke all on table public.membership_email_challenges from anon, authenticated;

create index if not exists membership_email_challenges_expiry_idx
  on public.membership_email_challenges (expires_at);

