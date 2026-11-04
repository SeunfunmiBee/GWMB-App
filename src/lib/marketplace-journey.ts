import type { CourseProgress } from '@/lib/course-progress';
import type { EventRegistration } from '@/lib/event-store';
import type { OpportunityApplication } from '@/lib/opportunity-store';
import { supabase } from '@/lib/supabase';

export type JourneyGoal = 'first-internship' | 'first-job' | 'discover-career' | 'break-into-career' | 'learn-skill' | 'improve-profile' | 'grow-career' | 'start-business' | 'grow-business';
export type CareerStage = 'student' | 'nysc' | 'recent-graduate' | 'early-career' | 'entrepreneur' | 'other';
export type JourneyStage = 'explore' | 'prepare' | 'access';

export type MarketplaceJourney = {
  user_id: string;
  primary_goal: JourneyGoal;
  career_stage: CareerStage;
  interests: string[];
  journey_stage: JourneyStage;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type JourneyRecommendation = {
  key: string;
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
  route: string;
  icon: 'document-text-outline' | 'play-circle-outline' | 'calendar-outline' | 'briefcase-outline' | 'compass-outline' | 'cash-outline' | 'person-outline';
  tone: string;
};

export const journeyGoals: { id: JourneyGoal; label: string; shortLabel: string }[] = [
  { id: 'first-internship', label: 'Get my first internship', shortLabel: 'First internship' },
  { id: 'first-job', label: 'Get my first job', shortLabel: 'First job' },
  { id: 'discover-career', label: 'Discover the right career for me', shortLabel: 'Discover my career' },
  { id: 'break-into-career', label: 'Break into a new career or industry', shortLabel: 'Change career' },
  { id: 'learn-skill', label: 'Learn a valuable skill', shortLabel: 'Learn a skill' },
  { id: 'improve-profile', label: 'Improve my professional profile', shortLabel: 'Professional profile' },
  { id: 'grow-career', label: 'Grow in my current career', shortLabel: 'Career growth' },
  { id: 'start-business', label: 'Start a business', shortLabel: 'Start a business' },
  { id: 'grow-business', label: 'Grow my business', shortLabel: 'Grow my business' },
];

export const careerStages: { id: CareerStage; label: string }[] = [
  { id: 'student', label: 'University student' },
  { id: 'nysc', label: 'NYSC corps member' },
  { id: 'recent-graduate', label: 'Recent graduate' },
  { id: 'early-career', label: 'Early-career professional' },
  { id: 'entrepreneur', label: 'Entrepreneur or business owner' },
  { id: 'other', label: 'Other' },
];

export const interestGroups = [
  { title: 'Technology & Digital', items: ['Data', 'Software', 'Product', 'AI', 'Cybersecurity', 'Design'] },
  { title: 'Business & Professional', items: ['Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'Customer Experience', 'Project Management'] },
  { title: 'Creative', items: ['Content Creation', 'Social Media', 'Graphic Design', 'Media', 'Writing'] },
  { title: 'Business & Entrepreneurship', items: ['Entrepreneurship', 'E-commerce', 'Business Growth'] },
] as const;

const localKey = (userId: string) => `gwmb-marketplace-journey:${userId}`;

function readLocal(userId: string) {
  try {
    const value = globalThis.localStorage?.getItem(localKey(userId));
    return value ? JSON.parse(value) as MarketplaceJourney : null;
  } catch { return null; }
}

function writeLocal(journey: MarketplaceJourney) {
  try { globalThis.localStorage?.setItem(localKey(journey.user_id), JSON.stringify(journey)); }
  catch { /* Best-effort preview fallback. */ }
}

export function goalLabel(goal: JourneyGoal) {
  return journeyGoals.find((item) => item.id === goal)?.label ?? 'Build my marketplace journey';
}

export function stageLabel(stage: CareerStage) {
  return careerStages.find((item) => item.id === stage)?.label ?? 'Growing professionally';
}

export function inferJourneyStage(goal: JourneyGoal): JourneyStage {
  if (goal === 'discover-career') return 'explore';
  if (goal === 'start-business' || goal === 'grow-business') return 'prepare';
  return 'prepare';
}

export async function loadMarketplaceJourney(userId: string) {
  const local = readLocal(userId);
  const { data, error } = await supabase.from('marketplace_journeys').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return { journey: local, cloud: false };
  const journey = data as MarketplaceJourney;
  writeLocal(journey);
  return { journey, cloud: true };
}

export async function saveMarketplaceJourney(input: { userId: string; goal: JourneyGoal; stage: CareerStage; interests: string[] }) {
  const now = new Date().toISOString();
  const existing = readLocal(input.userId);
  const payload: MarketplaceJourney = {
    user_id: input.userId,
    primary_goal: input.goal,
    career_stage: input.stage,
    interests: input.interests.slice(0, 5),
    journey_stage: inferJourneyStage(input.goal),
    onboarding_completed: true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('marketplace_journeys').upsert(payload, { onConflict: 'user_id' }).select('*').single();
  const journey = !error && data ? data as MarketplaceJourney : payload;
  writeLocal(journey);
  return { journey, cloud: !error };
}

type RecommendationInput = {
  journey: MarketplaceJourney;
  courseProgress: CourseProgress | null;
  registrations: EventRegistration[];
  applications: OpportunityApplication[];
};

export function getNextMove({ journey, courseProgress, registrations, applications }: RecommendationInput): JourneyRecommendation {
  const completedLessons = courseProgress?.completed_lesson_ids.length ?? 0;
  const courseComplete = Boolean(courseProgress?.completed_at) || completedLessons >= 6;
  const activeRegistration = registrations.find((item) => item.status !== 'cancelled');

  if (courseProgress && !courseComplete) {
    return { key: 'continue-cv', eyebrow: 'CONTINUE YOUR JOURNEY', title: 'Finish building a CV that gets noticed', copy: `You have completed ${completedLessons} of 6 lessons. Keep the momentum going.`, action: 'Continue course', route: '/course/workplace-foundations', icon: 'play-circle-outline', tone: '#111011' };
  }

  if (activeRegistration) {
    return { key: 'registered-event', eyebrow: 'YOUR NEXT COMMITMENT', title: 'Get ready for your upcoming GWMB event', copy: 'Your place is saved. Review the event details and arrive prepared.', action: 'View my event', route: `/event/${activeRegistration.event_id}`, icon: 'calendar-outline', tone: '#3150E8' };
  }

  if (journey.primary_goal === 'discover-career') {
    return { key: 'discover-product', eyebrow: 'YOUR NEXT MOVE', title: 'Explore a career direction through conversation', copy: 'Start with an honest career discovery session and learn what the work actually involves.', action: 'Explore the session', route: '/event/product-manager', icon: 'compass-outline', tone: '#7A35D1' };
  }

  if (journey.primary_goal === 'start-business' || journey.primary_goal === 'grow-business') {
    return { key: 'business-income', eyebrow: 'YOUR NEXT MOVE', title: 'Turn your idea into a clearer income plan', copy: 'Learn practical lessons about offers, pricing and building a simple sales rhythm.', action: 'Reserve my spot', route: '/event/side-hustle', icon: 'cash-outline', tone: '#C48414' };
  }

  if (journey.primary_goal === 'learn-skill') {
    const moneyInterest = journey.interests.some((item) => ['Finance', 'Entrepreneurship', 'Business Growth'].includes(item));
    return moneyInterest
      ? { key: 'budgeting', eyebrow: 'YOUR NEXT MOVE', title: 'Build a money habit you can actually maintain', copy: 'Start with four focused lessons and create a budget that fits your real life.', action: 'Start course', route: '/course/budgeting', icon: 'cash-outline', tone: '#C48414' }
      : { key: 'self-leadership', eyebrow: 'YOUR NEXT MOVE', title: 'Strengthen how you lead yourself first', copy: 'Build ownership, self-awareness and dependable habits in five focused lessons.', action: 'Start course', route: '/course/self-leadership', icon: 'play-circle-outline', tone: '#111011' };
  }

  if (!courseComplete) {
    return { key: 'build-cv', eyebrow: 'YOUR NEXT MOVE', title: 'Build a CV that is ready for applications', copy: 'Before you apply, make sure your CV clearly communicates your skills and experience.', action: 'Build my CV', route: '/course/workplace-foundations', icon: 'document-text-outline', tone: '#A81455' };
  }

  if (!registrations.some((item) => item.event_id === 'cv-clinic')) {
    return { key: 'cv-review', eyebrow: 'YOUR NEXT MOVE', title: 'Get your CV reviewed before you apply', copy: 'See what recruiters notice and leave with focused improvements you can use immediately.', action: 'Join the waitlist', route: '/event/cv-clinic', icon: 'calendar-outline', tone: '#111011' };
  }

  if (!applications.length) {
    return { key: 'first-application', eyebrow: 'YOU ARE READY TO APPLY', title: 'Explore internships that match your direction', copy: 'Your preparation is taking shape. Find a suitable opportunity and put it into practice.', action: 'Explore opportunities', route: '/opportunities', icon: 'briefcase-outline', tone: '#078765' };
  }

  return { key: 'interview-prep', eyebrow: 'YOUR NEXT MOVE', title: 'Prepare to tell your story with confidence', copy: 'You have applied. Now strengthen the examples and language you will use in an interview.', action: 'Explore career support', route: '/grow/career', icon: 'person-outline', tone: '#3150E8' };
}

export function getForYou(journey: MarketplaceJourney): JourneyRecommendation[] {
  const firstInterest = journey.interests[0] ?? 'your interests';
  const careerItem: JourneyRecommendation = { key: 'career-session', eyebrow: 'LIVE GUIDANCE', title: 'Should You Become a Product Manager?', copy: `A practical discovery conversation selected around ${firstInterest}.`, action: 'View session', route: '/event/product-manager', icon: 'calendar-outline', tone: '#E62B7F' };
  const opportunityItem: JourneyRecommendation = { key: 'opportunity', eyebrow: 'MATCHED OPPORTUNITY', title: 'Graduate Internship Programme', copy: 'A practical early-career opportunity that can move your marketplace journey forward.', action: 'View opportunity', route: '/opportunity/flutterwave', icon: 'briefcase-outline', tone: '#078765' };
  if (journey.primary_goal === 'start-business' || journey.primary_goal === 'grow-business') {
    return [
      { key: 'money', eyebrow: 'SMART MONEY GIRL', title: 'Budgeting Without the Stress', copy: 'Build a calmer financial rhythm for yourself and your business.', action: 'Start learning', route: '/course/budgeting', icon: 'cash-outline', tone: '#C48414' },
      careerItem,
    ];
  }
  return [careerItem, opportunityItem];
}
