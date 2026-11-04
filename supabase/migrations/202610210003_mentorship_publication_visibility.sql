-- Draft and scheduled sessions remain private to Admin until they are published.
drop policy if exists "Published mentorship sessions are public" on public.mentorship_sessions;

create policy "Published mentorship sessions are public"
on public.mentorship_sessions
for select
using (status in ('published', 'upcoming', 'live', 'completed'));
