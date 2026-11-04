create table if not exists public.career_review_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('cv','linkedin','job_application','career_profile')),
  cv_record_id uuid references public.cv_records(id) on delete set null,
  uploaded_file_path text,
  uploaded_file_name text,
  linkedin_url text,
  target_role text,
  company_name text,
  job_description_url text,
  job_description_text text,
  career_field text,
  career_stage text,
  feedback_focus text,
  clinic_event_id uuid references public.content_items(id) on delete set null,
  future_clinic_interest boolean not null default false,
  consent_authorized_review boolean not null default false,
  consent_group_review boolean not null default false,
  anonymize_for_session boolean not null default true,
  status text not null default 'submitted' check (status in ('submitted','under_review','selected','reviewed','not_selected')),
  admin_feedback text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_practice_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  response_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, question_id)
);

create table if not exists public.career_saved_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, content_id)
);

create index if not exists career_reviews_user_idx on public.career_review_submissions(user_id, created_at desc);
create index if not exists career_reviews_queue_idx on public.career_review_submissions(status, created_at desc);
create index if not exists career_practice_user_idx on public.career_practice_responses(user_id, updated_at desc);

alter table public.career_review_submissions enable row level security;
alter table public.career_practice_responses enable row level security;
alter table public.career_saved_resources enable row level security;

grant select, insert, update on public.career_review_submissions to authenticated;
grant select, insert, update, delete on public.career_practice_responses to authenticated;
grant select, insert, delete on public.career_saved_resources to authenticated;

create policy "Career reviews owner read" on public.career_review_submissions for select to authenticated
using ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Career reviews owner submit" on public.career_review_submissions for insert to authenticated
with check ((select auth.uid()) = user_id and consent_authorized_review = true);
create policy "Career reviews admin update" on public.career_review_submissions for update to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());

create policy "Practice owner read" on public.career_practice_responses for select to authenticated using ((select auth.uid()) = user_id or public.is_app_admin());
create policy "Practice owner insert" on public.career_practice_responses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Practice owner update" on public.career_practice_responses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Practice owner delete" on public.career_practice_responses for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Saved resources owner read" on public.career_saved_resources for select to authenticated using ((select auth.uid()) = user_id);
create policy "Saved resources owner insert" on public.career_saved_resources for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Saved resources owner delete" on public.career_saved_resources for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.notify_career_review_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status in ('selected','reviewed','not_selected') then
    insert into public.user_notifications(user_id, kind, title, body, route)
    values (
      new.user_id,
      'career_readiness',
      case new.status when 'selected' then 'You were selected for a Career Readiness clinic' when 'reviewed' then 'Your career review is ready' else 'Career review update' end,
      case new.status when 'selected' then 'Open Career Readiness to see your selected clinic.' when 'reviewed' then 'Open your submission to read the feedback from the GWMB team.' else 'This submission was not selected for this clinic. You can submit for another session.' end,
      '/career-readiness'
    );
  end if;
  new.updated_at := now();
  if new.status = 'reviewed' and old.status is distinct from new.status then new.reviewed_at := now(); end if;
  return new;
end $$;

drop trigger if exists career_review_status_notification on public.career_review_submissions;
create trigger career_review_status_notification before update on public.career_review_submissions
for each row execute function public.notify_career_review_status();
