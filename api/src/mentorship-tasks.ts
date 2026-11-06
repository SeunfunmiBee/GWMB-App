// Rebuilds the admin mentorship "control centre" tasks from current state.
// Ported from `refresh_mentorship_operations_tasks` (202610230002). Each statement is an idempotent upsert keyed
// by dedupe_key, so running it on every admin load is safe.
import type { Env } from './env';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const ACTIVE_SESSION = "s.status in ('scheduled', 'published', 'upcoming')";
const iso = (expr: string, modifier: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${expr}, '${modifier}')`;

const STATEMENTS = [
  // Mentors whose availability needs reconfirming within 14 days.
  `insert into mentorship_operations_tasks (dedupe_key, mentor_id, kind, title, detail, due_at, priority)
   select 'mentor:' || ops.mentor_id || ':availability', ops.mentor_id, 'availability_confirmation', 'Reconfirm availability', m.full_name,
     coalesce(${iso('ops.availability_confirmation_due', '+0 days')}, ${NOW}), 'high'
   from mentor_operations ops join mentors m on m.id = ops.mentor_id
   where ops.status in ('confirmed', 'active') and (ops.availability_confirmation_due is null or ops.availability_confirmation_due <= date('now', '+14 days'))
   on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, status = 'open'`,
  // New mentor submissions to review.
  `insert into mentorship_operations_tasks (dedupe_key, mentor_id, kind, title, detail, priority)
   select 'mentor:' || ops.mentor_id || ':review', ops.mentor_id, 'mentor_review', 'Review new mentor submission', m.full_name, 'normal'
   from mentor_operations ops join mentors m on m.id = ops.mentor_id where ops.status = 'new_submission'
   on conflict (dedupe_key) do update set detail = excluded.detail, status = 'open'`,
  // One-on-one capacity nearly used.
  `insert into mentorship_operations_tasks (dedupe_key, mentor_id, kind, title, detail, priority)
   select 'mentor:' || ops.mentor_id || ':capacity', ops.mentor_id, 'one_on_one_capacity', 'One-on-One capacity almost full',
     m.full_name || ' · ' || count(a.id) || ' of ' || ops.one_on_one_capacity || ' assigned', 'high'
   from mentor_operations ops join mentors m on m.id = ops.mentor_id
   left join mentorship_applications a on a.assigned_mentor_id = ops.mentor_id and a.status not in ('completed', 'not_approved')
   where ops.one_on_one_available = 1 and ops.one_on_one_capacity > 0
   group by ops.mentor_id, m.full_name, ops.one_on_one_capacity
   having count(a.id) >= max(1, ops.one_on_one_capacity - 1)
   on conflict (dedupe_key) do update set detail = excluded.detail, status = 'open'`,
  // Upcoming sessions without a meeting link.
  `insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
   select 'session:' || s.id || ':meeting-link', s.id, 'missing_meeting_link', 'Add meeting link', s.title, ${iso('s.starts_at', '-24 hours')}, 'urgent'
   from mentorship_sessions s where ${ACTIVE_SESSION} and s.starts_at > ${NOW} and nullif(s.meeting_url, '') is null
   on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, priority = excluded.priority, status = 'open'`,
  // Sessions missing audience or notification configuration.
  `insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
   select 'session:' || s.id || ':audience', s.id, 'missing_audience', 'Configure audience and notifications', s.title, ${NOW}, 'high'
   from mentorship_sessions s where ${ACTIVE_SESSION}
     and (json_array_length(s.notification_channels) = 0 or json_array_length(s.distribution_surfaces) = 0
       or (s.audience_type = 'career_field' and json_array_length(s.audience_fields) = 0)
       or (s.audience_type = 'subfield' and json_array_length(s.audience_subfields) = 0)
       or (s.audience_type = 'selected_users' and json_array_length(s.selected_user_ids) = 0))
   on conflict (dedupe_key) do update set detail = excluded.detail, status = 'open'`,
  // Mentor not yet confirmed for an upcoming session.
  `insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
   select 'session:' || s.id || ':mentor-confirmation', s.id, 'mentor_confirmation', 'Confirm mentor for session', s.title,
     max(${NOW}, ${iso('s.starts_at', '-7 days')}), 'high'
   from mentorship_sessions s where ${ACTIVE_SESSION} and s.starts_at > ${NOW} and s.mentor_confirmed_at is null
   on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, status = 'open'`,
  // Finished sessions without recorded attendance.
  `insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
   select 'session:' || s.id || ':attendance', s.id, 'attendance_missing', 'Record attendance', s.title, ${iso('coalesce(s.completed_at, s.starts_at)', '+1 hours')}, 'high'
   from mentorship_sessions s where (s.status = 'completed' or s.starts_at < ${iso("'now'", '-2 hours')}) and s.attendance_recorded_at is null
   on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, status = 'open'`,
  // Completed sessions expecting a replay.
  `insert into mentorship_operations_tasks (dedupe_key, session_id, kind, title, detail, due_at, priority)
   select 'session:' || s.id || ':replay', s.id, 'replay_missing', 'Add session replay', s.title, ${iso('coalesce(s.completed_at, s.starts_at)', '+1 days')}, 'normal'
   from mentorship_sessions s where s.status = 'completed' and s.replay_expected = 1 and nullif(s.replay_url, '') is null
   on conflict (dedupe_key) do update set detail = excluded.detail, due_at = excluded.due_at, status = 'open'`,
  // One-on-one requests still waiting for a mentor.
  `insert into mentorship_operations_tasks (dedupe_key, kind, title, detail, due_at, priority, metadata)
   select 'application:' || a.id || ':assignment', 'one_on_one_assignment', 'Assign mentor', coalesce(p.full_name, 'Member request'), ${NOW}, 'urgent',
     json_object('application_id', a.id)
   from mentorship_applications a left join profiles p on p.id = a.user_id
   where a.status in ('submitted', 'under_review', 'approved') and a.assigned_mentor_id is null
   on conflict (dedupe_key) do update set detail = excluded.detail, status = 'open'`,
];

export async function refreshMentorshipTasks(env: Env) {
  await env.DB.batch(STATEMENTS.map((sql) => env.DB.prepare(sql)));
}
