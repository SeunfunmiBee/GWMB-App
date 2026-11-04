import { courses } from '@/data/courses';
import { eventById } from '@/data/events';
import type { CourseProgress } from '@/lib/course-progress';
import type { EventRegistration } from '@/lib/event-store';
import {
  fallbackMarketplaceInventory,
  findBestOpportunity,
  findInventoryItem,
  isInventoryItemAvailable,
  type MarketplaceInventoryItem,
} from '@/lib/marketplace-inventory';
import type { MarketplaceJourney } from '@/lib/marketplace-journey';
import type { OpportunityApplication } from '@/lib/opportunity-store';
import { supabase } from '@/lib/supabase';

export type CareerClarity = 'unknown' | 'exploring' | 'selected' | 'established';
export type KnowledgeReadiness = 'unknown' | 'limited' | 'foundational' | 'strong';
export type SkillReadiness = 'unknown' | 'needs_foundation' | 'developing' | 'adequate';
export type EvidenceReadiness = 'unknown' | 'none' | 'limited' | 'adequate';
export type OpportunityReadiness = 'not_ready' | 'developing' | 'reasonably_ready';
export type GuidanceNeed = 'unknown' | 'career_discovery' | 'industry_understanding' | 'long_term' | 'targeted' | 'none';
export type WorkplaceReadiness = 'unknown' | 'developing' | 'adequate';
export type RecommendationConfidence = 'high' | 'medium' | 'low';

export type MarketplaceReadinessProfile = {
  user_id: string;
  career_clarity: CareerClarity;
  foundational_knowledge: KnowledgeReadiness;
  skill_readiness: SkillReadiness;
  evidence_of_ability: EvidenceReadiness;
  has_cv: boolean | null;
  cv_reviewed: boolean | null;
  has_linkedin: boolean | null;
  linkedin_optimised: boolean | null;
  has_portfolio: boolean | null;
  guidance_need: GuidanceNeed;
  opportunity_readiness: OpportunityReadiness;
  has_applied_before: boolean | null;
  active_applications: number;
  interview_preparation_completed: boolean | null;
  mock_interview_attended: boolean | null;
  application_support_completed: boolean | null;
  workplace_readiness: WorkplaceReadiness;
  declared_certifications: string[];
  declared_projects: string[];
  prior_experience: string[];
  created_at: string;
  updated_at: string;
};

export type IntelligenceRecommendation = {
  key: string;
  eyebrow: string;
  title: string;
  shortExplanation: string;
  whyThisNow: string;
  actionType: 'course' | 'event' | 'mentorship' | 'opportunity' | 'career_tool' | 'resource' | 'pathway';
  linkedItemId: string | null;
  cta: string;
  route: string;
  accessLevel: 'Open Access' | 'Members Only';
  icon: 'document-text-outline' | 'play-circle-outline' | 'calendar-outline' | 'briefcase-outline' | 'compass-outline' | 'cash-outline' | 'person-outline' | 'sparkles-outline';
  tone: string;
  addresses: string;
};

export type ContextualQuestion = {
  id: 'career_clarity' | 'has_cv' | 'evidence_of_ability' | 'has_linkedin';
  prompt: string;
  options: { label: string; patch: Partial<MarketplaceReadinessProfile> }[];
};

export type MarketplaceIntelligence = {
  stage: 'explore' | 'prepare' | 'access';
  stageExplanation: string;
  primary: IntelligenceRecommendation;
  forYou: IntelligenceRecommendation[];
  contextualQuestion: ContextualQuestion | null;
  confidence: RecommendationConfidence;
  reasonCodes?: string[];
  generatedAt?: string;
};

export type RecommendationFeedbackAction = 'completed_external' | 'dismissed' | 'alternate_requested';

type EngineInput = {
  journey: MarketplaceJourney;
  readiness: MarketplaceReadinessProfile;
  courseProgress: CourseProgress | null;
  registrations: EventRegistration[];
  applications: OpportunityApplication[];
  isMember: boolean;
  inventory?: MarketplaceInventoryItem[];
  dismissedKeys?: string[];
  now?: Date;
};

const readinessKey = (userId: string) => `gwmb-marketplace-readiness:${userId}`;
const feedbackKey = (userId: string) => `gwmb-recommendation-feedback:${userId}`;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

function writeLocal(key: string, value: unknown) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); }
  catch { /* Supabase remains the source of truth on native. */ }
}

export function emptyReadinessProfile(userId: string): MarketplaceReadinessProfile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    career_clarity: 'unknown',
    foundational_knowledge: 'unknown',
    skill_readiness: 'unknown',
    evidence_of_ability: 'unknown',
    has_cv: null,
    cv_reviewed: null,
    has_linkedin: null,
    linkedin_optimised: null,
    has_portfolio: null,
    guidance_need: 'unknown',
    opportunity_readiness: 'not_ready',
    has_applied_before: null,
    active_applications: 0,
    interview_preparation_completed: null,
    mock_interview_attended: null,
    application_support_completed: null,
    workplace_readiness: 'unknown',
    declared_certifications: [],
    declared_projects: [],
    prior_experience: [],
    created_at: now,
    updated_at: now,
  };
}

function mergeVerifiedEvidence(profile: MarketplaceReadinessProfile, input: Pick<EngineInput, 'courseProgress' | 'applications'>) {
  const completedCvCourse = Boolean(input.courseProgress?.completed_at) || (input.courseProgress?.completed_lesson_ids.length ?? 0) >= courses['workplace-foundations'].lessons.length;
  return {
    ...profile,
    has_cv: completedCvCourse ? true : profile.has_cv,
    has_applied_before: input.applications.length ? true : profile.has_applied_before,
    active_applications: input.applications.filter((item) => ['submitted', 'under_review'].includes(item.status)).length,
    opportunity_readiness: input.applications.length ? 'reasonably_ready' as const : profile.opportunity_readiness,
  };
}

export async function loadReadinessProfile(userId: string) {
  const local = readLocal(readinessKey(userId), emptyReadinessProfile(userId));
  const { data, error } = await supabase.from('marketplace_readiness_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return { profile: local, cloud: false };
  const profile = data as MarketplaceReadinessProfile;
  writeLocal(readinessKey(userId), profile);
  return { profile, cloud: true };
}

export async function saveReadinessPatch(userId: string, patch: Partial<MarketplaceReadinessProfile>) {
  const current = (await loadReadinessProfile(userId)).profile;
  const payload = { ...current, ...patch, user_id: userId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('marketplace_readiness_profiles').upsert(payload, { onConflict: 'user_id' }).select('*').single();
  const profile = !error && data ? data as MarketplaceReadinessProfile : payload;
  writeLocal(readinessKey(userId), profile);
  return { profile, cloud: !error };
}

export async function loadRecommendationFeedback(userId: string) {
  const local = readLocal<{ recommendation_key: string; action: RecommendationFeedbackAction }[]>(feedbackKey(userId), []);
  const { data, error } = await supabase.from('marketplace_recommendation_feedback').select('recommendation_key,action').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return local;
  const feedback = (data ?? []) as { recommendation_key: string; action: RecommendationFeedbackAction }[];
  writeLocal(feedbackKey(userId), feedback);
  return feedback;
}

export async function recordRecommendationFeedback(userId: string, recommendationKey: string, action: RecommendationFeedbackAction) {
  const current = readLocal<{ recommendation_key: string; action: RecommendationFeedbackAction }[]>(feedbackKey(userId), []);
  const entry = { recommendation_key: recommendationKey, action };
  writeLocal(feedbackKey(userId), [entry, ...current]);
  await supabase.from('marketplace_recommendation_feedback').insert({ user_id: userId, recommendation_key: recommendationKey, action });
}

export async function loadServerMarketplaceIntelligence() {
  const { data, error } = await supabase.rpc('get_marketplace_recommendation');
  if (error || !data || typeof data !== 'object') return { intelligence: null, server: false };
  const response = data as Partial<MarketplaceIntelligence> & { configured?: boolean };
  if (response.configured === false || !response.primary || !response.stage || !Array.isArray(response.forYou)) {
    return { intelligence: null, server: false };
  }
  return { intelligence: response as MarketplaceIntelligence, server: true };
}

function isBusinessGoal(goal: MarketplaceJourney['primary_goal']) {
  return goal === 'start-business' || goal === 'grow-business';
}

function isEmploymentGoal(goal: MarketplaceJourney['primary_goal']) {
  return ['first-internship', 'first-job', 'break-into-career', 'improve-profile', 'grow-career'].includes(goal);
}

function recommendationCatalog(input: Pick<EngineInput, 'journey' | 'inventory' | 'isMember' | 'now'>): Record<string, IntelligenceRecommendation> {
  const { journey } = input;
  const inventory = input.inventory?.length ? input.inventory : fallbackMarketplaceInventory;
  const now = input.now ?? new Date();
  const firstInterest = journey.interests[0] ?? 'your chosen field';
  const interestSet = new Set(journey.interests.map((interest) => interest.toLowerCase()));
  const discoveryItem = inventory
    .filter((item) => isInventoryItemAvailable(item, now) && ['event', 'mentorship', 'resource'].includes(item.content_type) && item.readiness_gaps.includes('career_clarity'))
    .map((item) => ({ item, matches: item.career_areas.filter((area) => interestSet.has(area.toLowerCase())).length }))
    .filter(({ item, matches }) => matches > 0 || item.career_areas.length === 0)
    .sort((a, b) => b.matches - a.matches || b.item.priority - a.item.priority)[0]?.item ?? null;
  const cvCourse = findInventoryItem(inventory, 'course', 'workplace-foundations', now);
  const businessMoneyCourse = findInventoryItem(inventory, 'course', 'budgeting', now);
  const businessLiveEvent = findInventoryItem(inventory, 'event', 'side-hustle', now);
  const leadershipCourse = findInventoryItem(inventory, 'course', 'self-leadership', now);
  const matchedOpportunity = findBestOpportunity(inventory, { interests: journey.interests, careerStage: journey.career_stage, isMember: input.isMember, now });
  return {
    'career-discovery': { key: 'career-discovery', eyebrow: 'DISCOVER YOUR DIRECTION', title: discoveryItem?.title ?? 'Explore a career before you commit to it', shortExplanation: discoveryItem?.summary ?? `Explore guidance and career resources that help you understand what working in ${firstInterest} could really involve.`, whyThisNow: 'A clearer direction will make every learning and opportunity decision more useful.', actionType: discoveryItem?.content_type === 'event' ? 'event' : discoveryItem?.content_type === 'mentorship' ? 'mentorship' : 'pathway', linkedItemId: discoveryItem?.source_id ?? null, cta: discoveryItem?.action_label ?? 'Explore career guidance', route: discoveryItem?.route ?? '/grow/mentorship', accessLevel: discoveryItem?.access_level ?? 'Open Access', icon: 'compass-outline', tone: discoveryItem?.tone ?? '#7A35D1', addresses: 'career_clarity' },
    'foundational-learning': { key: 'foundational-learning', eyebrow: 'BUILD THE FOUNDATION', title: `Start building practical ${firstInterest} skills`, shortExplanation: 'Choose focused beginner learning that helps you understand the work and practise the essentials.', whyThisNow: 'You have a direction. The next useful step is building the foundation required to act on it.', actionType: 'pathway', linkedItemId: 'learning', cta: 'Explore skill pathways', route: '/grow/learning', accessLevel: 'Open Access', icon: 'play-circle-outline', tone: '#3150E8', addresses: 'skill_readiness' },
    'practical-evidence': { key: 'practical-evidence', eyebrow: 'SHOW WHAT YOU CAN DO', title: 'Create one practical piece of evidence', shortExplanation: 'Turn what you know into a project, portfolio sample or real piece of work you can discuss.', whyThisNow: 'Evidence makes your skills easier for an employer, client or mentor to understand.', actionType: 'pathway', linkedItemId: 'learning', cta: 'Find practical learning', route: '/grow/learning', accessLevel: 'Open Access', icon: 'sparkles-outline', tone: '#078765', addresses: 'evidence_of_ability' },
    'continue-cv': { key: 'continue-cv', eyebrow: 'CONTINUE YOUR JOURNEY', title: `Finish ${cvCourse?.title ?? 'building a CV that gets noticed'}`, shortExplanation: 'Your course is already in progress. Complete the next lesson while the work is still fresh.', whyThisNow: 'Finishing an important action you have started is more useful than adding another activity.', actionType: 'course', linkedItemId: cvCourse?.source_id ?? 'workplace-foundations', cta: 'Continue course', route: cvCourse?.route ?? '/course/workplace-foundations', accessLevel: cvCourse?.access_level ?? 'Open Access', icon: 'play-circle-outline', tone: '#111011', addresses: 'professional_positioning' },
    'build-cv': { key: 'build-cv', eyebrow: 'POSITION YOUR EXPERIENCE', title: 'Build a CV that is ready for applications', shortExplanation: 'Create a clear professional CV from scratch, or review the one you already have.', whyThisNow: 'An appropriate CV is a core requirement for most internship and job applications.', actionType: 'career_tool', linkedItemId: 'cv-tool', cta: 'Open CV Tool', route: '/cv', accessLevel: 'Open Access', icon: 'document-text-outline', tone: '#A81455', addresses: 'professional_positioning' },
    'cv-review': { key: 'cv-review', eyebrow: 'REFINE YOUR POSITIONING', title: 'Review and improve your CV', shortExplanation: 'Upload your CV and get a focused review for the role you are targeting.', whyThisNow: 'You already have a CV. Feedback is more useful now than starting it again.', actionType: 'career_tool', linkedItemId: 'cv-tool', cta: 'Review my CV', route: '/cv/review', accessLevel: 'Open Access', icon: 'document-text-outline', tone: '#111011', addresses: 'cv_reviewed' },
    'apply-opportunity': { key: 'apply-opportunity', eyebrow: 'A MATCH FOR YOUR NEXT STEP', title: matchedOpportunity?.title ?? 'Explore opportunities that match your direction', shortExplanation: matchedOpportunity?.summary ?? 'Your preparation is taking shape. Find an eligible opportunity and put it into practice.', whyThisNow: 'More preparation should not delay a suitable application when you are reasonably ready.', actionType: 'opportunity', linkedItemId: matchedOpportunity?.source_id ?? null, cta: matchedOpportunity?.action_label ?? 'Explore opportunities', route: matchedOpportunity?.route ?? '/opportunities', accessLevel: matchedOpportunity?.access_level ?? 'Open Access', icon: 'briefcase-outline', tone: matchedOpportunity?.tone ?? '#078765', addresses: 'opportunity_readiness' },
    'interview-prep': { key: 'interview-prep', eyebrow: 'PREPARE FOR THE CONVERSATION', title: 'Practise telling your story with confidence', shortExplanation: 'Prepare examples that show how your skills, choices and experience connect to the role.', whyThisNow: 'You have started applying, so interview preparation is now more useful than another general course.', actionType: 'pathway', linkedItemId: 'career', cta: 'Prepare for interviews', route: '/grow/career', accessLevel: 'Open Access', icon: 'person-outline', tone: '#3150E8', addresses: 'interview_readiness' },
    'business-money': { key: 'business-money', eyebrow: 'SMART MONEY GIRL', title: 'Build a clearer money rhythm for your business', shortExplanation: businessMoneyCourse?.summary ?? 'Strengthen how you plan, price, save and make financial decisions.', whyThisNow: 'A practical money foundation supports a business at every stage.', actionType: 'course', linkedItemId: businessMoneyCourse?.source_id ?? 'budgeting', cta: businessMoneyCourse?.action_label ?? 'Start learning', route: businessMoneyCourse?.route ?? '/course/budgeting', accessLevel: businessMoneyCourse?.access_level ?? 'Open Access', icon: 'cash-outline', tone: businessMoneyCourse?.tone ?? '#C48414', addresses: 'business_finance' },
    'business-live': { key: 'business-live', eyebrow: 'LIVE BUSINESS GUIDANCE', title: businessLiveEvent?.title ?? 'Explore practical business guidance', shortExplanation: businessLiveEvent?.summary ?? 'Find guidance on offers, pricing, sales and building more consistent business systems.', whyThisNow: 'Practical guidance can help you turn a broad business goal into a clearer next action.', actionType: businessLiveEvent ? 'event' : 'pathway', linkedItemId: businessLiveEvent?.source_id ?? null, cta: businessLiveEvent?.action_label ?? 'Explore Smart Money Girl', route: businessLiveEvent?.route ?? '/grow/money', accessLevel: businessLiveEvent?.access_level ?? 'Open Access', icon: businessLiveEvent ? 'calendar-outline' : 'cash-outline', tone: businessLiveEvent?.tone ?? '#C48414', addresses: 'business_growth' },
    'self-leadership': { key: 'self-leadership', eyebrow: 'GROW IN YOUR CAREER', title: 'Strengthen how you lead yourself first', shortExplanation: leadershipCourse?.summary ?? 'Build ownership, self-awareness and dependable habits in five focused lessons.', whyThisNow: 'Stronger self-leadership supports your progress and performance in your current career.', actionType: 'course', linkedItemId: leadershipCourse?.source_id ?? 'self-leadership', cta: leadershipCourse?.action_label ?? 'Start course', route: leadershipCourse?.route ?? '/course/self-leadership', accessLevel: leadershipCourse?.access_level ?? 'Open Access', icon: 'play-circle-outline', tone: leadershipCourse?.tone ?? '#111011', addresses: 'workplace_readiness' },
    'registered-event': { key: 'registered-event', eyebrow: 'YOUR NEXT COMMITMENT', title: 'Get ready for your upcoming GWMB event', shortExplanation: 'Your place is saved. Review the details and arrive prepared to participate.', whyThisNow: 'The event is approaching and preparation will help you get more value from it.', actionType: 'event', linkedItemId: null, cta: 'View my event', route: '/events?tab=my', accessLevel: 'Open Access', icon: 'calendar-outline', tone: '#3150E8', addresses: 'time_sensitive' },
  };
}

function contextualQuestion(journey: MarketplaceJourney, profile: MarketplaceReadinessProfile): ContextualQuestion | null {
  if ((journey.primary_goal === 'discover-career' || isEmploymentGoal(journey.primary_goal)) && profile.career_clarity === 'unknown') {
    return { id: 'career_clarity', prompt: journey.primary_goal === 'discover-career' ? 'Do you already know the kind of career you want to explore?' : 'Do you already know the role or career you want to work towards?', options: [
      { label: 'Yes', patch: { career_clarity: 'selected' } },
      { label: 'Still exploring', patch: { career_clarity: 'exploring', guidance_need: 'career_discovery' } },
    ] };
  }
  if (isEmploymentGoal(journey.primary_goal) && profile.has_cv === null) {
    return { id: 'has_cv', prompt: 'Do you already have a CV you would confidently use for your target role?', options: [
      { label: 'Yes', patch: { has_cv: true } },
      { label: 'Not yet', patch: { has_cv: false } },
      { label: 'I’m not sure', patch: { has_cv: true, cv_reviewed: false } },
    ] };
  }
  if (isEmploymentGoal(journey.primary_goal) && profile.skill_readiness !== 'unknown' && profile.evidence_of_ability === 'unknown') {
    return { id: 'evidence_of_ability', prompt: `Have you completed a practical ${journey.interests[0] ?? 'career'} project or relevant work yet?`, options: [
      { label: 'Yes', patch: { evidence_of_ability: 'limited' } },
      { label: 'Not yet', patch: { evidence_of_ability: 'none' } },
    ] };
  }
  return null;
}

function choosePrimary(input: EngineInput, profile: MarketplaceReadinessProfile, dismissed: Set<string>) {
  const catalog = recommendationCatalog(input);
  const inventory = input.inventory?.length ? input.inventory : fallbackMarketplaceInventory;
  const now = input.now ?? new Date();
  const lessons = input.courseProgress?.completed_lesson_ids.length ?? 0;
  const courseStarted = Boolean(input.courseProgress) && lessons < courses['workplace-foundations'].lessons.length && !input.courseProgress?.completed_at;
  const cvCourseRelevant = isEmploymentGoal(input.journey.primary_goal) || input.journey.primary_goal === 'first-internship' || input.journey.primary_goal === 'first-job';
  const upcomingRegistration = input.registrations.find((registration) => {
    const event = eventById[registration.event_id];
    return registration.status !== 'cancelled' && event?.startsAt && new Date(event.startsAt) > now;
  });
  const hasBusinessLiveEvent = Boolean(findInventoryItem(inventory, 'event', 'side-hustle', now));
  const candidates: string[] = [];

  if (courseStarted && cvCourseRelevant) candidates.push('continue-cv');
  if (upcomingRegistration) candidates.push('registered-event');

  if (input.journey.primary_goal === 'discover-career' || profile.career_clarity === 'exploring') candidates.push('career-discovery');
  else if (isBusinessGoal(input.journey.primary_goal)) candidates.push(input.isMember && hasBusinessLiveEvent ? 'business-live' : 'business-money');
  else if (input.journey.primary_goal === 'learn-skill') candidates.push('foundational-learning');
  else if (input.journey.primary_goal === 'grow-career') candidates.push('self-leadership');
  else if (profile.career_clarity === 'unknown') candidates.push('career-discovery');
  else if (profile.skill_readiness === 'needs_foundation' || profile.foundational_knowledge === 'limited') candidates.push('foundational-learning');
  else if (profile.evidence_of_ability === 'none') candidates.push('practical-evidence');
  else if (profile.has_cv === false || profile.has_cv === null) candidates.push('build-cv');
  else if (profile.cv_reviewed === false || profile.cv_reviewed === null) candidates.push('cv-review');
  else if (input.applications.length && !profile.interview_preparation_completed) candidates.push('interview-prep');
  else candidates.push('apply-opportunity');

  candidates.push('foundational-learning', 'career-discovery', 'self-leadership', 'apply-opportunity');
  const selectedKey = candidates.find((key) => !dismissed.has(key)) ?? candidates[0];
  const selected = { ...catalog[selectedKey] };
  if (selected.key === 'continue-cv') selected.shortExplanation = `You have completed ${lessons} of ${courses['workplace-foundations'].lessons.length} lessons. Complete the next one while the work is still fresh.`;
  if (selected.key === 'registered-event' && upcomingRegistration) {
    selected.linkedItemId = upcomingRegistration.event_id;
    selected.route = `/event/${upcomingRegistration.event_id}`;
    selected.title = `Get ready for ${eventById[upcomingRegistration.event_id]?.title ?? 'your upcoming event'}`;
    selected.accessLevel = eventById[upcomingRegistration.event_id]?.access ?? 'Open Access';
  }
  return selected;
}

function complementaryRecommendations(input: EngineInput, primary: IntelligenceRecommendation, dismissed: Set<string>) {
  const catalog = recommendationCatalog(input);
  const keys = isBusinessGoal(input.journey.primary_goal)
    ? ['business-money', 'business-live', 'self-leadership']
    : input.journey.primary_goal === 'discover-career'
      ? ['career-discovery', 'foundational-learning', 'self-leadership']
      : ['foundational-learning', 'career-discovery', 'apply-opportunity', 'self-leadership'];
  return keys
    .filter((key) => key !== primary.key && !dismissed.has(key))
    .map((key) => catalog[key])
    .filter((item, index, items) => items.findIndex((candidate) => candidate.route === item.route) === index)
    .sort((a, b) => Number(a.accessLevel === 'Members Only' && !input.isMember) - Number(b.accessLevel === 'Members Only' && !input.isMember))
    .slice(0, 2);
}

export function runMarketplaceIntelligence(input: EngineInput): MarketplaceIntelligence {
  const profile = mergeVerifiedEvidence(input.readiness, input);
  const dismissed = new Set(input.dismissedKeys ?? []);
  const question = contextualQuestion(input.journey, profile);
  const primary = choosePrimary(input, profile, dismissed);
  const stage = profile.opportunity_readiness === 'reasonably_ready' || input.applications.length
    ? 'access'
    : input.journey.primary_goal === 'discover-career' || profile.career_clarity === 'exploring'
      ? 'explore'
      : 'prepare';
  const stageExplanation = stage === 'explore'
    ? 'You’re currently exploring your direction.'
    : stage === 'access'
      ? 'You’re ready to access and act on suitable opportunities.'
      : 'You’re currently preparing for opportunities.';
  const confidence: RecommendationConfidence = question ? 'low' : primary.key === 'apply-opportunity' || primary.key === 'continue-cv' ? 'high' : 'medium';
  return { stage, stageExplanation, primary, forYou: complementaryRecommendations(input, primary, dismissed), contextualQuestion: question, confidence };
}

export function completionPatchFor(recommendation: IntelligenceRecommendation): Partial<MarketplaceReadinessProfile> {
  switch (recommendation.addresses) {
    case 'career_clarity': return { career_clarity: 'selected', guidance_need: 'none' };
    case 'skill_readiness': return { foundational_knowledge: 'foundational', skill_readiness: 'developing' };
    case 'evidence_of_ability': return { evidence_of_ability: 'limited' };
    case 'professional_positioning': return { has_cv: true };
    case 'cv_reviewed': return { has_cv: true, cv_reviewed: true };
    case 'opportunity_readiness': return { has_applied_before: true, opportunity_readiness: 'reasonably_ready' };
    case 'interview_readiness': return { interview_preparation_completed: true };
    case 'workplace_readiness': return { workplace_readiness: 'developing' };
    default: return {};
  }
}
