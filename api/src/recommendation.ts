// Next-step recommendation engine, ported from `get_marketplace_recommendation` and
// `private.marketplace_item_json` (supabase/migrations/202610120001). Pure: all inputs are passed in.

export type InventoryItem = {
  id: string; source_id: string; content_type: string; title: string; summary: string; route: string; access_level: string;
  action_label: string; tone: string; priority: number; starts_at: string | null; deadline_at: string | null;
  career_areas: string[]; readiness_gaps: string[]; career_stages: string[];
};
export type Journey = { primary_goal: string; career_stage: string; interests: string[] };
export type Readiness = {
  career_clarity?: string; skill_readiness?: string; foundational_knowledge?: string; evidence_of_ability?: string;
  opportunity_readiness?: string; has_cv?: boolean | null; cv_reviewed?: boolean | null; interview_preparation_completed?: boolean | null;
} | null;
export type RecommendationInput = {
  journey: Journey; readiness: Readiness; cvProgress: { completed_at: string | null; completed_lesson_ids: string[] } | null;
  isMember: boolean; applicationCount: number; dismissed: string[]; inventory: InventoryItem[]; registeredEventIds: string[]; now: number;
};
type Card = Record<string, unknown> & { key: string; route: string };

const EMPLOYMENT_GOALS = ['first-internship', 'first-job', 'break-into-career', 'improve-profile', 'grow-career'];
const BUSINESS_GOALS = ['start-business', 'grow-business'];
const CV_COURSE = 'workplace-foundations';
const CV_LESSONS = 6;
const WEEK_MS = 7 * 86_400_000;

function itemCard(item: InventoryItem, key: string, eyebrow: string, why: string, icon: string, addresses: string): Card {
  return { key, eyebrow, title: item.title, shortExplanation: item.summary, whyThisNow: why, actionType: item.content_type, linkedItemId: item.source_id,
    cta: item.action_label, route: item.route, accessLevel: item.access_level, icon, tone: item.tone, addresses };
}
const pathway = (key: string, fields: Record<string, unknown> & { route: string }): Card => ({ key, actionType: 'pathway', accessLevel: 'Open Access', ...fields });
const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));
const byDesc = <T>(score: (x: T) => number[]) => (a: T, b: T) => {
  const [sa, sb] = [score(a), score(b)];
  for (let i = 0; i < sa.length; i += 1) if (sa[i] !== sb[i]) return sb[i] - sa[i];
  return 0;
};

export function recommend(input: RecommendationInput) {
  const { journey, readiness, cvProgress, isMember, applicationCount, dismissed, now } = input;
  const live = input.inventory.filter((i) => !i.deadline_at || Date.parse(i.deadline_at) >= now);
  const accessible = (i: InventoryItem) => i.access_level === 'Open Access' || isMember;
  const open = (i: InventoryItem) => (i.access_level === 'Open Access' ? 1 : 0);

  const careerClarity = readiness?.career_clarity ?? 'unknown';
  const skillReadiness = readiness?.skill_readiness ?? 'unknown';
  const evidence = readiness?.evidence_of_ability ?? 'unknown';
  const opportunityReadiness = applicationCount > 0 ? 'reasonably_ready' : readiness?.opportunity_readiness ?? 'not_ready';
  const cvLessons = cvProgress?.completed_lesson_ids.length ?? 0;
  let hasCv = readiness?.has_cv ?? null;
  const cvReviewed = readiness?.cv_reviewed ?? null;
  const interviewPrepared = readiness?.interview_preparation_completed ?? null;
  if (cvProgress?.completed_at || cvLessons >= CV_LESSONS) hasCv = true;
  const employment = EMPLOYMENT_GOALS.includes(journey.primary_goal);
  const business = BUSINESS_GOALS.includes(journey.primary_goal);

  let stage = 'prepare';
  let stageExplanation = 'You’re currently preparing for opportunities.';
  if (opportunityReadiness === 'reasonably_ready' || applicationCount > 0) {
    stage = 'access';
    stageExplanation = 'You’re ready to access and act on suitable opportunities.';
  } else if (journey.primary_goal === 'discover-career' || careerClarity === 'exploring') {
    stage = 'explore';
    stageExplanation = 'You’re currently exploring your direction.';
  }

  let confidence = 'medium';
  let question: Record<string, unknown> | null = null;
  if ((journey.primary_goal === 'discover-career' || employment) && careerClarity === 'unknown') {
    question = { id: 'career_clarity', prompt: journey.primary_goal === 'discover-career' ? 'Do you already know the kind of career you want to explore?' : 'Do you already know the role or career you want to work towards?',
      options: [{ label: 'Yes', patch: { career_clarity: 'selected' } }, { label: 'Still exploring', patch: { career_clarity: 'exploring', guidance_need: 'career_discovery' } }] };
    confidence = 'low';
  } else if (employment && hasCv === null) {
    question = { id: 'has_cv', prompt: 'Do you already have a CV you would confidently use for your target role?',
      options: [{ label: 'Yes', patch: { has_cv: true } }, { label: 'Not yet', patch: { has_cv: false } }, { label: 'I’m not sure', patch: { has_cv: true, cv_reviewed: false } }] };
    confidence = 'low';
  } else if (employment && skillReadiness !== 'unknown' && evidence === 'unknown') {
    question = { id: 'evidence_of_ability', prompt: 'Have you completed a practical project or relevant piece of work yet?',
      options: [{ label: 'Yes', patch: { evidence_of_ability: 'limited' } }, { label: 'Not yet', patch: { evidence_of_ability: 'none' } }] };
    confidence = 'low';
  }
  const highUnlessAsking = () => (question === null ? 'high' : confidence);

  let primary: Card | null = null;
  let reasons: string[] = [];
  const cvCourse = () => input.inventory.find((i) => i.content_type === 'course' && i.source_id === CV_COURSE);

  // Priority 1: continue important unfinished work.
  if (employment && cvProgress && !cvProgress.completed_at && cvLessons < CV_LESSONS && !dismissed.includes('continue-cv')) {
    const item = cvCourse();
    if (item) {
      primary = { ...itemCard(item, 'continue-cv', 'CONTINUE YOUR JOURNEY', 'Finishing an important action you have started is more useful than adding another activity.', 'play-circle-outline', 'professional_positioning'),
        title: `Finish ${item.title}`, shortExplanation: `You have completed ${cvLessons} of ${CV_LESSONS} lessons. Complete the next one while the work is still fresh.`, cta: 'Continue course' };
      reasons = ['unfinished_relevant_action', 'verified_course_progress'];
      confidence = highUnlessAsking();
    }
  }

  // Priority 2: an approaching event the user has already committed to.
  if (!primary && !dismissed.includes('registered-event')) {
    const next = input.inventory
      .filter((i) => i.content_type === 'event' && input.registeredEventIds.includes(i.source_id) && i.starts_at && Date.parse(i.starts_at) > now)
      .sort((a, b) => Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at)))[0];
    if (next && Date.parse(String(next.starts_at)) <= now + WEEK_MS) {
      primary = { ...itemCard(next, 'registered-event', 'YOUR NEXT COMMITMENT', 'The event is approaching and preparation will help you get more value from it.', 'calendar-outline', 'time_sensitive'),
        title: `Get ready for ${next.title}`, shortExplanation: 'Your place is saved. Review the details and arrive prepared to participate.' };
      reasons = ['time_sensitive', 'registered_event'];
      confidence = highUnlessAsking();
    }
  }

  // Priority 3/4: resolve the largest blocking readiness gap (first matching branch only, as in the SQL elsif chain).
  if (!primary && business) {
    const item = live.filter((i) => (i.readiness_gaps.includes('business_finance') || i.readiness_gaps.includes('business_growth')) && accessible(i) && !dismissed.includes(`business-${i.source_id}`))
      .sort(byDesc((i) => [open(i), i.priority]))[0];
    if (item) {
      primary = itemCard(item, `business-${item.source_id}`, 'BUILD YOUR BUSINESS', 'This is the strongest available match for the business capability you are building now.',
        item.content_type === 'course' ? 'cash-outline' : 'calendar-outline', item.readiness_gaps[0] ?? 'business_growth');
      reasons = ['business_path', 'inventory_match'];
    }
  } else if (!primary && (journey.primary_goal === 'discover-career' || ['unknown', 'exploring'].includes(careerClarity)) && !dismissed.includes('career-discovery')) {
    const item = live.filter((i) => i.readiness_gaps.includes('career_clarity') && accessible(i) && (i.career_areas.length === 0 || overlaps(i.career_areas, journey.interests)))
      .sort(byDesc((i) => [overlaps(i.career_areas, journey.interests) ? 1 : 0, i.priority]))[0];
    if (item) {
      primary = itemCard(item, 'career-discovery', 'DISCOVER YOUR DIRECTION', 'A clearer direction will make every learning and opportunity decision more useful.', 'compass-outline', 'career_clarity');
      reasons = ['career_clarity_gap', 'inventory_match'];
    } else {
      primary = pathway('career-discovery', { eyebrow: 'DISCOVER YOUR DIRECTION', title: 'Explore a career before you commit to it', shortExplanation: 'Explore guidance and resources that help you understand the work before choosing a path.',
        whyThisNow: 'A clearer direction will make every learning and opportunity decision more useful.', linkedItemId: null, cta: 'Explore career guidance', route: '/grow/mentorship', icon: 'compass-outline', tone: '#7A35D1', addresses: 'career_clarity' });
      reasons = ['career_clarity_gap', 'generic_intervention_no_inventory_match'];
    }
  } else if (!primary && journey.primary_goal === 'learn-skill' && !dismissed.includes('foundational-learning')) {
    primary = pathway('foundational-learning', { eyebrow: 'BUILD THE FOUNDATION', title: `Start building practical ${journey.interests[0] ?? 'professional'} skills`,
      shortExplanation: 'Choose focused beginner learning that helps you understand the work and practise the essentials.', whyThisNow: 'You have a direction. The next useful step is building the foundation required to act on it.',
      linkedItemId: 'learning', cta: 'Explore skill pathways', route: '/grow/learning', icon: 'play-circle-outline', tone: '#3150E8', addresses: 'skill_readiness' });
    reasons = ['skill_goal', 'foundational_learning'];
  } else if (!primary && evidence === 'none' && !dismissed.includes('practical-evidence')) {
    primary = pathway('practical-evidence', { eyebrow: 'SHOW WHAT YOU CAN DO', title: 'Create one practical piece of evidence', shortExplanation: 'Turn what you know into a project, portfolio sample or real piece of work you can discuss.',
      whyThisNow: 'Evidence makes your skills easier for an employer, client or mentor to understand.', linkedItemId: 'learning', cta: 'Find practical learning', route: '/grow/learning', icon: 'sparkles-outline', tone: '#078765', addresses: 'evidence_of_ability' });
    reasons = ['evidence_gap'];
  } else if (!primary && employment && hasCv !== true && !dismissed.includes('build-cv')) {
    const item = cvCourse();
    if (item) {
      primary = { ...itemCard(item, 'build-cv', 'POSITION YOUR EXPERIENCE', 'An appropriate CV is a core requirement for most internship and job applications.', 'document-text-outline', 'professional_positioning'),
        title: 'Build a CV that is ready for applications' };
      reasons = ['professional_positioning_gap', 'inventory_match'];
    }
  } else if (!primary && employment && cvReviewed !== true && !dismissed.includes('cv-review')) {
    primary = pathway('cv-review', { eyebrow: 'REFINE YOUR POSITIONING', title: 'Get focused feedback on your CV', shortExplanation: 'Use GWMB career support to identify the changes that will make your CV clearer and more relevant.',
      whyThisNow: 'You already have a CV. Feedback is more useful now than starting it again.', linkedItemId: 'career', cta: 'Explore career support', route: '/grow/career', icon: 'person-outline', tone: '#111011', addresses: 'cv_reviewed' });
    reasons = ['cv_review_gap'];
  } else if (!primary && applicationCount > 0 && interviewPrepared !== true && !dismissed.includes('interview-prep')) {
    primary = pathway('interview-prep', { eyebrow: 'PREPARE FOR THE CONVERSATION', title: 'Practise telling your story with confidence', shortExplanation: 'Prepare examples that show how your skills, choices and experience connect to the role.',
      whyThisNow: 'You have started applying, so interview preparation is now more useful than another general course.', linkedItemId: 'career', cta: 'Prepare for interviews', route: '/grow/career', icon: 'person-outline', tone: '#3150E8', addresses: 'interview_readiness' });
    reasons = ['active_application', 'interview_readiness_gap'];
  }

  // Priority 5: opportunity access, also the safe final fallback.
  if (!primary) {
    const item = live.filter((i) => i.content_type === 'opportunity' && accessible(i) && (i.career_stages.length === 0 || i.career_stages.includes(journey.career_stage)) && !dismissed.includes(`opportunity-${i.source_id}`))
      .sort(byDesc((i) => [overlaps(i.career_areas, journey.interests) ? 1 : 0, open(i), i.priority]))[0];
    if (item) {
      primary = itemCard(item, `opportunity-${item.source_id}`, 'A MATCH FOR YOUR NEXT STEP', 'More preparation should not delay a suitable application when you are reasonably ready.', 'briefcase-outline', 'opportunity_readiness');
      reasons = ['opportunity_access', 'eligibility_match', 'inventory_match'];
      confidence = highUnlessAsking();
    } else {
      primary = pathway('explore-opportunities', { eyebrow: 'KEEP EXPLORING', title: 'Explore current opportunities', shortExplanation: 'Review what is available and focus on opportunities whose requirements match your current stage.',
        whyThisNow: 'Seeing real requirements can help you choose the most useful preparation.', linkedItemId: null, cta: 'Explore opportunities', route: '/opportunities', icon: 'briefcase-outline', tone: '#078765', addresses: 'opportunity_readiness' });
      reasons = ['no_live_eligible_inventory_match'];
    }
  }

  // Supporting recommendations: live inventory only, never duplicating the primary route.
  const eyebrow: Record<string, string> = { opportunity: 'MATCHED OPPORTUNITY', event: 'LIVE GUIDANCE', mentorship: 'GUIDANCE FOR YOU', course: 'RECOMMENDED LEARNING' };
  const icon: Record<string, string> = { opportunity: 'briefcase-outline', event: 'calendar-outline', mentorship: 'person-outline', course: 'play-circle-outline' };
  const score = (i: InventoryItem) => i.priority + (overlaps(i.career_areas, journey.interests) ? 30 : 0)
    + (i.career_stages.includes(journey.career_stage) || i.career_stages.length === 0 ? 15 : -30) + (accessible(i) ? 15 : -5);
  const forYou = live.filter((i) => i.route !== primary.route && !dismissed.includes(`inventory-${i.id}`))
    .map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s).slice(0, 2)
    .map(({ i }) => itemCard(i, `inventory-${i.id}`, eyebrow[i.content_type] ?? 'FOR YOUR JOURNEY', 'This complements your primary next move without repeating it.', icon[i.content_type] ?? 'sparkles-outline', i.readiness_gaps[0] ?? 'journey_support'));

  return { stage, stageExplanation, primary, forYou, contextualQuestion: question, confidence, reasonCodes: reasons };
}
