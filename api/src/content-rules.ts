// Publication rules for content_items, ported from the `validate_content_publication` trigger
// (supabase/migrations/202610290006). Returns the first problem, or null when the item may be saved.

type Json = Record<string, unknown>;
export type ContentForValidation = {
  status: string; content_type: string; title: string; summary?: string | null; body?: string | null;
  image_url?: string | null; route?: string | null; publish_at?: string | null; starts_at?: string | null;
  ends_at?: string | null; metadata?: Json | null;
};

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function validatePublication(item: ContentForValidation, now = Date.now()): string | null {
  if (item.status !== 'published' && item.status !== 'scheduled') return null;
  const meta = obj(item.metadata);
  if (item.status === 'scheduled' && (!item.publish_at || Date.parse(item.publish_at) <= now)) return 'Scheduled content requires a future publish date';
  if (blank(item.title) || blank(item.summary) || blank(item.body) || blank(item.image_url) || blank(item.route)) {
    return 'Complete the title, description, full details, cover image and app route before publishing';
  }
  if (arr(meta.surfaces).length === 0 || blank(meta.audience)) return 'Choose an audience and at least one app surface before publishing';
  if (meta.audience === 'specific-career-fields' && blank(meta.career_fields)) return 'Choose career fields for this audience';

  if (item.content_type === 'course') {
    const instructor = obj(meta.instructor);
    if (blank(meta.category) || blank(meta.duration) || blank(instructor.name) || blank(instructor.role) || blank(instructor.bio)) {
      return 'Complete course category, duration and lecturer details before publishing';
    }
    const lessons = arr(meta.lessons);
    if (lessons.length === 0) return 'Add at least one lesson';
    for (const raw of lessons) {
      const lesson = obj(raw);
      if (blank(lesson.id) || blank(lesson.title) || blank(lesson.summary) || blank(lesson.duration)) return 'Every lesson needs an ID, title, summary and duration';
      const hasNotes = arr(lesson.sections).some((s) => !blank(obj(s).heading) && !blank(obj(s).body));
      if (!hasNotes && blank(lesson.media_url)) return 'Every lesson needs complete notes or media';
    }
  } else if (item.content_type === 'event') {
    const start = item.starts_at ? Date.parse(item.starts_at) : NaN;
    const end = item.ends_at ? Date.parse(item.ends_at) : NaN;
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 'Add a valid event start and end time';
    const speaker = obj(meta.speaker);
    if (blank(meta.timezone) || blank(meta.registration_deadline) || blank(speaker.name) || blank(speaker.role) || blank(speaker.bio)) {
      return 'Complete the time zone, deadline and speaker details before publishing';
    }
    const capacity = Number(meta.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) return 'Capacity must be a whole number above zero';
    const deadline = Date.parse(String(meta.registration_deadline));
    if (Number.isNaN(deadline) || deadline >= start) return 'Registration deadline must be before the event starts';
    const format = typeof meta.format === 'string' ? meta.format : 'online';
    if (format === 'physical' && blank(meta.venue)) return 'Add the physical venue';
    if ((format === 'online' || format === 'hybrid') && blank(meta.meeting_url) && blank(meta.registration_url)) {
      return 'Add a private meeting link or external registration link';
    }
  } else if (item.content_type === 'resource') {
    if (blank(meta.resource_type) || blank(meta.url)) return 'Choose a resource format and add its upload or link';
  }
  return null;
}
