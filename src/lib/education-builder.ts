import { courses as staticCourses } from "@/data/courses";
import type { EducationKind } from "@/lib/admin-education";
import type { ContentDraft } from "@/lib/admin-content";

export type Lesson = {
  id: string;
  title: string;
  summary: string;
  duration: string;
  media_type: string;
  media_url: string;
  preview: boolean;
  objectives: string[];
  sections: { heading: string; body: string }[];
  reflection: string;
};
export type AdvancedProgramMeta = {
  enabled: boolean;
  title: string;
  partner: string;
  summary: string;
  duration: string;
  format: string;
  certificate: string;
  programme_url: string;
  application_url: string;
  deadline: string;
  intake: string;
  standard_price: string;
  status: string;
  offer_type: string;
  offer_label: string;
  members_only_offer: boolean;
  completion_required: boolean;
};
// Seeded courses store only a lesson *count* in metadata.lessons and keep the real lessons in
// src/data/courses.ts (the app falls back to those too). Start the editor from the same fallback,
// and coerce list fields to arrays so a malformed record can be opened and fixed instead of crashing.
const asList = <T>(value: unknown, fallback: T[]): T[] =>
  Array.isArray(value) ? (value as T[]) : fallback;
export function editableMeta(item: {
  area: string;
  slug: string;
  metadata?: unknown;
}): BuilderMeta {
  const meta = (
    item.metadata && typeof item.metadata === "object" ? item.metadata : {}
  ) as BuilderMeta;
  const listsFixed: BuilderMeta = {
    ...meta,
    surfaces: asList(meta.surfaces, []),
    reminders: asList(meta.reminders, []),
    notification_channels: asList(meta.notification_channels, []),
  };
  if (item.area !== "courses") return listsFixed;
  const course = staticCourses[item.slug];
  const lessons: Lesson[] = (course?.lessons ?? []).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    summary: lesson.summary,
    duration: lesson.duration,
    media_type: lesson.mediaType ?? "none",
    media_url: lesson.mediaUrl ?? "",
    preview: lesson.preview ?? false,
    objectives: lesson.objectives,
    sections: lesson.sections,
    reflection: lesson.reflection,
  }));
  return {
    ...listsFixed,
    lessons: asList(meta.lessons, lessons),
    resources: asList(meta.resources, course?.resources ?? []),
    duration: meta.duration ?? course?.duration,
    category: meta.category ?? course?.category,
    subcategory: meta.subcategory ?? course?.subcategory,
    instructor:
      meta.instructor ??
      (course?.instructor
        ? {
            name: course.instructor.name,
            role: course.instructor.role,
            bio: course.instructor.bio,
            image_url: course.instructor.imageUrl ?? "",
          }
        : undefined),
  };
}

export type BuilderMeta = {
  provider?: string;
  category?: string;
  subcategory?: string;
  duration?: string;
  level?: string;
  certificate?: boolean;
  instructor?: { name: string; role: string; bio: string; image_url: string };
  lessons?: Lesson[];
  resources?: string[];
  advanced_program?: AdvancedProgramMeta;
  program?: string;
  format?: string;
  venue?: string;
  capacity?: string;
  timezone?: string;
  registration_deadline?: string;
  registration_url?: string;
  meeting_url?: string;
  replay_url?: string;
  recording_allowed?: boolean;
  speaker?: { name: string; role: string; bio: string; image_url: string };
  reminders?: string[];
  resource_type?: string;
  delivery?: string;
  url?: string;
  author?: string;
  audience?: string;
  career_fields?: string;
  subfields?: string;
  surfaces?: string[];
  notification_channels?: string[];
  [key: string]: unknown;
};
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
export const areaByType: Record<EducationKind, "courses" | "events" | "resources"> = {
  course: "courses",
  event: "events",
  resource: "resources",
};
export const labels: Record<EducationKind, string> = {
  course: "Course Builder",
  event: "Event Builder",
  resource: "Resource Builder",
};
export const programs = [
  "live-session",
  "career-support",
  "discovery-mentorship",
  "industry-mentorship",
  "personal-growth",
  "smart-money-girl",
  "leadership",
  "clique-fireside",
  "sister-circle",
  "professional-learning",
];

export function publicationIssues(
  type: EducationKind,
  draft: ContentDraft,
  meta: BuilderMeta,
) {
  if (!["published", "scheduled"].includes(draft.status)) return [];
  const issues: string[] = [];
  const required = (value: unknown, label: string) => {
    if (!String(value ?? "").trim()) issues.push(label);
  };
  required(draft.title, "Title");
  required(draft.summary, "Short description");
  required(draft.body, "Full details");
  required(draft.image_url, "Cover image");
  required(draft.route, "App route");
  if (draft.status === "scheduled") {
    required(draft.publish_at, "Publish date and time");
    if (draft.publish_at && new Date(draft.publish_at) <= new Date())
      issues.push("Publish date must be in the future");
  }
  if (!meta.surfaces?.length) issues.push("At least one app surface");
  required(meta.audience, "Audience");
  if (
    meta.audience === "specific-career-fields" &&
    !String(meta.career_fields ?? "").trim()
  )
    issues.push("Career fields for the selected audience");
  if (type === "course") {
    required(meta.category, "Course category");
    required(meta.duration, "Total duration");
    required(meta.instructor?.name, "Lecturer name");
    required(meta.instructor?.role, "Lecturer role / organisation");
    required(meta.instructor?.bio, "Lecturer biography");
    const lessons = meta.lessons ?? [];
    if (!lessons.length) issues.push("At least one lesson");
    if (new Set(lessons.map((lesson) => lesson.id)).size !== lessons.length)
      issues.push("Unique lesson IDs");
    lessons.forEach((lesson, index) => {
      const prefix = `Lesson ${index + 1}`;
      required(lesson.id, `${prefix} ID`);
      required(lesson.title, `${prefix} title`);
      required(lesson.summary, `${prefix} summary`);
      required(lesson.duration, `${prefix} duration`);
      const hasNotes = (lesson.sections ?? []).some(
        (section) => section.heading.trim() && section.body.trim(),
      );
      const hasMedia =
        lesson.media_type !== "none" && Boolean(lesson.media_url.trim());
      if (!hasNotes && !hasMedia)
        issues.push(`${prefix} needs complete notes or media`);
      if (lesson.media_type !== "none" && !lesson.media_url.trim())
        issues.push(`${prefix} media URL`);
    });
  }
  if (type === "event") {
    required(draft.starts_at, "Start date and time");
    required(draft.ends_at, "End date and time");
    required(meta.timezone, "Time zone");
    required(meta.capacity, "Capacity");
    required(meta.registration_deadline, "Registration deadline");
    required(meta.speaker?.name, "Speaker name");
    required(meta.speaker?.role, "Speaker role / organisation");
    required(meta.speaker?.bio, "Speaker biography");
    const start = draft.starts_at ? new Date(draft.starts_at) : null;
    const end = draft.ends_at ? new Date(draft.ends_at) : null;
    const deadline = meta.registration_deadline
      ? new Date(meta.registration_deadline)
      : null;
    if (start && end && end <= start)
      issues.push("End time must be after the start time");
    if (start && deadline && deadline >= start)
      issues.push("Registration deadline must be before the event starts");
    if (!Number.isInteger(Number(meta.capacity)) || Number(meta.capacity) <= 0)
      issues.push("Capacity must be a whole number above zero");
    if (meta.format === "physical") required(meta.venue, "Physical venue");
    else if (
      !String(meta.meeting_url ?? "").trim() &&
      !String(meta.registration_url ?? "").trim()
    )
      issues.push("Private meeting link or external registration link");
  }
  if (type === "resource") {
    required(meta.resource_type, "Resource format");
    required(meta.url, "Resource upload or link");
  }
  return [...new Set(issues)];
}

export function blank(type: EducationKind): ContentDraft {
  return {
    slug: "",
    area: areaByType[type],
    content_type: type,
    title: "",
    eyebrow: "",
    summary: "",
    body: "",
    image_url: "",
    route: "",
    access_level: "open",
    status: "draft",
    featured: false,
    visible: true,
    sort_order: 0,
    publish_at: null,
    starts_at: null,
    ends_at: null,
    metadata:
      type === "course"
        ? {
            provider: "GWMB",
            category: "professional",
            subcategory: "",
            duration: "",
            level: "Beginner",
            certificate: false,
            instructor: { name: "", role: "", bio: "", image_url: "" },
            lessons: [],
            resources: [],
            advanced_program: {
              enabled: false,
              title: "",
              partner: "Tech School Africa",
              summary: "",
              duration: "",
              format: "Online",
              certificate: "",
              programme_url: "",
              application_url: "",
              deadline: "",
              intake: "",
              standard_price: "",
              status: "coming-soon",
              offer_type: "none",
              offer_label: "",
              members_only_offer: true,
              completion_required: false,
            },
            audience: "everyone",
            career_fields: "",
            subfields: "",
            surfaces: ["learn", "home"],
            notification_channels: ["in-app"],
          }
        : type === "event"
          ? {
              program: "live-session",
              format: "online",
              venue: "",
              capacity: "",
              timezone: "Africa/Lagos",
              registration_deadline: "",
              registration_url: "",
              meeting_url: "",
              replay_url: "",
              recording_allowed: false,
              speaker: { name: "", role: "", bio: "", image_url: "" },
              reminders: ["24 hours before", "1 hour before", "When live"],
              audience: "everyone",
              career_fields: "",
              subfields: "",
              surfaces: ["home", "learn"],
              notification_channels: ["in-app", "push"],
            }
          : {
              resource_type: "guide",
              delivery: "upload",
              url: "",
              author: "GWMB",
              audience: "everyone",
              career_fields: "",
              subfields: "",
              surfaces: ["learn"],
              notification_channels: ["in-app"],
            },
  };
}
