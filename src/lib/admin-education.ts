import { cliqueSessions } from '@/data/cliques';
import { courses } from '@/data/courses';
import { eventList } from '@/data/events';
import { demoMentorshipSessions } from '@/data/mentorship';

export type EducationKind = 'course' | 'event' | 'resource';

export type AdminEducationPlaceholder = {
  id: string;
  kind: EducationKind;
  title: string;
  eyebrow: string;
  summary: string;
  access: 'open' | 'members';
  startsAt?: string;
  sourceLabel: string;
  metadata: Record<string, unknown>;
};

export const coursePlaceholders: AdminEducationPlaceholder[] = Object.values(courses).map(course => ({
  id: course.id,
  kind: 'course',
  title: course.title,
  eyebrow: course.eyebrow,
  summary: course.promise,
  access: course.access === 'MEMBERS ONLY' ? 'members' : 'open',
  sourceLabel: course.source,
  metadata: {
    provider: course.source,
    category: course.category,
    subcategory: course.subcategory,
    duration: course.duration,
    level: course.benefits.includes('Beginner') ? 'Beginner' : 'All levels',
    certificate: course.benefits.includes('Certificate'),
    tone: course.tone,
    instructor: { name: '', role: '', bio: '', image_url: '' },
    lessons: course.lessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      duration: lesson.duration,
      media_type: 'youtube',
      media_url: '',
      preview: false,
    })),
    resources: course.resources,
  },
}));

const coreEvents: AdminEducationPlaceholder[] = eventList.map(event => ({
  id: event.id,
  kind: 'event',
  title: event.title,
  eyebrow: event.type,
  summary: event.copy,
  access: event.access === 'Members Only' ? 'members' : 'open',
  startsAt: event.startsAt,
  sourceLabel: 'Live Sessions',
  metadata: {
    program: event.type.toLowerCase().includes('money') ? 'smart-money-girl' : event.type.toLowerCase().includes('career') ? 'career-support' : 'live-session',
    format: event.location.toLowerCase().includes('live') || event.location.toLowerCase().includes('zoom') || event.location.toLowerCase().includes('meet') ? 'online' : 'physical',
    venue: event.location,
    speaker: { name: event.speaker, role: event.role, bio: event.speakerAbout, image_url: '' },
    capacity: '', registration_url: '', meeting_url: '',
    reminders: ['24 hours before', '1 hour before', 'When live'],
  },
}));

const mentorshipEvents: AdminEducationPlaceholder[] = demoMentorshipSessions.map(session => ({
  id: session.id,
  kind: 'event',
  title: session.title,
  eyebrow: session.mentorship_type === 'discovery' ? 'DISCOVERY MENTORSHIP' : 'INDUSTRY MENTORSHIP',
  summary: session.description,
  access: session.access_level,
  startsAt: session.starts_at,
  sourceLabel: 'Mentorship',
  metadata: {
    program: session.mentorship_type === 'discovery' ? 'discovery-mentorship' : 'industry-mentorship',
    format: 'online', venue: 'Online', capacity: session.capacity ? String(session.capacity) : '',
    registration_url: '', meeting_url: session.meeting_url ?? '', replay_url: session.replay_url ?? '',
    speaker: { name: session.mentors?.[0]?.full_name ?? '', role: session.mentors?.[0]?.job_title ?? '', bio: session.mentors?.[0]?.bio ?? '', image_url: '' },
    reminders: ['24 hours before', '1 hour before', 'When live'],
  },
}));

const communityEvents: AdminEducationPlaceholder[] = cliqueSessions.map(session => ({
  id: session.id,
  kind: 'event',
  title: session.title,
  eyebrow: session.kind.toUpperCase(),
  summary: session.topic,
  access: 'members',
  startsAt: session.startsAt,
  sourceLabel: 'Community',
  metadata: {
    program: session.kind === 'National Fireside' ? 'clique-fireside' : 'sister-circle',
    format: session.mode === 'Online' ? 'online' : 'physical', venue: session.location,
    clique_id: session.cliqueId, industry: session.industry, capacity: '', registration_url: '', meeting_url: '',
    speaker: { name: '', role: '', bio: '', image_url: '' },
    reminders: ['24 hours before', '1 hour before', 'When live'],
  },
}));

export const eventPlaceholders = [...coreEvents, ...mentorshipEvents, ...communityEvents];

export const resourcePlaceholders: AdminEducationPlaceholder[] = [
  ['cv-application-guide', 'GUIDE', 'The CV Application Guide', 'PDF · 9 pages'],
  ['weekly-planning', 'TEMPLATE', 'The Weekly Planning Template', 'PDF · 5 pages'],
  ['monthly-budget-workbook', 'WORKBOOK', 'Your Monthly Money Workbook', 'Editable · 12 pages'],
  ['first-job-playbook', 'BOOK', 'The First Job Playbook', 'Digital book · 28 pages'],
  ['presentation-practice', 'WORKBOOK', 'Presentation Practice Planner', 'PDF · 8 pages'],
  ['better-goals', 'GUIDE', 'A Better Way to Set Goals', '8 min read'],
  ['conflict-guide', 'GUIDE', 'Communicating Through Conflict', '12 min read'],
].map(([id, eyebrow, title, summary]) => ({ id, kind: 'resource', title, eyebrow, summary, access: 'open', sourceLabel: 'Learn Resources', metadata: { resource_type: eyebrow.toLowerCase(), delivery: 'upload', url: '', author: 'GWMB' } }));

export function getEducationPlaceholder(kind: EducationKind, id: string) {
  const source = kind === 'course' ? coursePlaceholders : kind === 'event' ? eventPlaceholders : resourcePlaceholders;
  return source.find(item => item.id === id);
}

