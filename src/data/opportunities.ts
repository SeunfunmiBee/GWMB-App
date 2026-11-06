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
