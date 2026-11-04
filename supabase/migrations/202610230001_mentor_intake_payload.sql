-- Retain the complete source form submission for audit and for answers that do
-- not yet have a dedicated mentor profile field. Normalized fields continue to
-- populate the editable mentor record.

alter table public.mentor_operations
  add column if not exists intake_payload jsonb not null default '{}'::jsonb;

