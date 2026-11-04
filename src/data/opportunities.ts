export type Opportunity = {
  id: string;
  initials: string;
  title: string;
  org: string;
  type: string;
  location: string;
  deadline: string;
  deadlineAt?: string;
  source: string;
  access: 'Open Access' | 'Members Only';
  summary: string;
  aiAssistance: 'allowed' | 'restricted';
  aiPolicy?: string;
};

export const opportunities: Opportunity[] = [
  {
    id: 'flutterwave',
    initials: 'FL',
    title: 'Graduate Internship Programme',
    org: 'Flutterwave',
    type: 'Internship',
    location: 'Lagos · Hybrid',
    deadline: 'Closes 04 Oct',
    deadlineAt: '2026-10-04T23:59:00+01:00',
    source: 'GWMB Partner',
    access: 'Members Only',
    summary: 'Build practical experience on meaningful projects in a fast-moving fintech environment.',
    aiAssistance: 'restricted',
    aiPolicy: 'This employer asks applicants to write personal responses without AI assistance.',
  },
  {
    id: 'women-tech',
    initials: 'WT',
    title: 'Women in Tech Scholarship',
    org: 'Future Skills Africa',
    type: 'Scholarship',
    location: 'Remote',
    deadline: 'Closes 12 Oct',
    deadlineAt: '2026-10-12T23:59:00+01:00',
    source: 'Third Party',
    access: 'Open Access',
    summary: 'Access supported digital-skills training and build a portfolio for your next opportunity.',
    aiAssistance: 'allowed',
  },
  {
    id: 'gwmb-fund',
    initials: 'GW',
    title: 'Emerging Leaders Fellowship',
    org: 'Girls Who Mean Business',
    type: 'Fellowship',
    location: 'Nigeria',
    deadline: 'Rolling',
    source: 'GWMB Sponsored',
    access: 'Members Only',
    summary: 'Grow your leadership confidence through guided learning, projects and a supportive cohort.',
    aiAssistance: 'allowed',
  },
];

export const opportunityById = Object.fromEntries(opportunities.map((item) => [item.id, item])) as Record<string, Opportunity>;
