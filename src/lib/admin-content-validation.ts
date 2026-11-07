import type { ContentDraft } from '@/lib/admin-content';

export type EducationKind = 'course' | 'event' | 'resource';

type PublicationLesson = {
  id?: string;
  title?: string;
  summary?: string;
  duration?: string;
  media_type?: string;
  media_url?: string;
  sections?: { heading?: string; body?: string }[];
};

export type PublicationMeta = {
  surfaces?: string[];
  audience?: string;
  career_fields?: string;
  category?: string;
  duration?: string;
  instructor?: { name?: string; role?: string; bio?: string };
  lessons?: PublicationLesson[];
  timezone?: string;
  capacity?: string | number;
  registration_deadline?: string;
  speaker?: { name?: string; role?: string; bio?: string };
  format?: string;
  venue?: string;
  meeting_url?: string;
  registration_url?: string;
  resource_type?: string;
  url?: string;
  [key: string]: unknown;
};

/**
 * Client-side mirror of the database publication boundary. Drafts may be
 * incomplete, but anything scheduled or published must be usable everywhere
 * the Admin selects. Keeping this pure makes the same rules executable in CI.
 */
export function publicationIssues(
  type: EducationKind,
  draft: ContentDraft,
  meta: PublicationMeta,
  now = new Date(),
) {
  if (!['published', 'scheduled'].includes(draft.status)) return [];
  const issues: string[] = [];
  const required = (value: unknown, label: string) => {
    if (!String(value ?? '').trim()) issues.push(label);
  };

  required(draft.title, 'Title');
  required(draft.summary, 'Short description');
  required(draft.body, 'Full details');
  required(draft.image_url, 'Cover image');
  required(draft.route, 'App route');
  if (draft.status === 'scheduled') {
    required(draft.publish_at, 'Publish date and time');
    if (draft.publish_at && new Date(draft.publish_at) <= now) issues.push('Publish date must be in the future');
  }
  if (!meta.surfaces?.length) issues.push('At least one app surface');
  required(meta.audience, 'Audience');
  if (meta.audience === 'specific-career-fields' && !String(meta.career_fields ?? '').trim()) {
    issues.push('Career fields for the selected audience');
  }

  if (type === 'course') {
    required(meta.category, 'Course category');
    required(meta.duration, 'Total duration');
    required(meta.instructor?.name, 'Lecturer name');
    required(meta.instructor?.role, 'Lecturer role / organisation');
    required(meta.instructor?.bio, 'Lecturer biography');
    const lessons = meta.lessons ?? [];
    if (!lessons.length) issues.push('At least one lesson');
    lessons.forEach((lesson, index) => {
      const prefix = `Lesson ${index + 1}`;
      required(lesson.id, `${prefix} ID`);
      required(lesson.title, `${prefix} title`);
      required(lesson.summary, `${prefix} summary`);
      required(lesson.duration, `${prefix} duration`);
      const hasNotes = (lesson.sections ?? []).some(
        section => Boolean(section.heading?.trim() && section.body?.trim()),
      );
      const hasMedia = lesson.media_type !== 'none' && Boolean(lesson.media_url?.trim());
      if (!hasNotes && !hasMedia) issues.push(`${prefix} needs complete notes or media`);
      if (lesson.media_type !== 'none' && !lesson.media_url?.trim()) issues.push(`${prefix} media URL`);
    });
  }

  if (type === 'event') {
    required(draft.starts_at, 'Start date and time');
    required(draft.ends_at, 'End date and time');
    required(meta.timezone, 'Time zone');
    required(meta.capacity, 'Capacity');
    required(meta.registration_deadline, 'Registration deadline');
    required(meta.speaker?.name, 'Speaker name');
    required(meta.speaker?.role, 'Speaker role / organisation');
    required(meta.speaker?.bio, 'Speaker biography');
    const start = draft.starts_at ? new Date(draft.starts_at) : null;
    const end = draft.ends_at ? new Date(draft.ends_at) : null;
    const deadline = meta.registration_deadline ? new Date(meta.registration_deadline) : null;
    if (start && end && end <= start) issues.push('End time must be after the start time');
    if (start && deadline && deadline >= start) issues.push('Registration deadline must be before the event starts');
    if (!Number.isInteger(Number(meta.capacity)) || Number(meta.capacity) <= 0) {
      issues.push('Capacity must be a whole number above zero');
    }
    if (meta.format === 'physical') required(meta.venue, 'Physical venue');
    else if (!String(meta.meeting_url ?? '').trim() && !String(meta.registration_url ?? '').trim()) {
      issues.push('Private meeting link or external registration link');
    }
  }

  if (type === 'resource') {
    required(meta.resource_type, 'Resource format');
    required(meta.url, 'Resource upload or link');
  }

  return [...new Set(issues)];
}
