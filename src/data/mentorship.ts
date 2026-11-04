import type { ImageSourcePropType } from 'react-native';

export type MentorshipType = 'discovery' | 'industry' | 'one_on_one';
export type MentorshipSessionType = 'discovery' | 'industry' | 'webinar_training';
export type MentorshipAudienceType = 'everyone' | 'members' | 'career_field' | 'subfield' | 'selected_users';
export type MentorshipNotificationChannel = 'in_app' | 'push' | 'email' | 'sms' | 'whatsapp';
export type MentorshipSurface = 'mentorship' | 'learn' | 'home' | 'related_courses';
export type MentorStatus = 'new_submission' | 'under_review' | 'confirmed' | 'active' | 'paused' | 'inactive';
export type Mentor = {
  id: string;
  full_name: string;
  photo_url: string | null;
  job_title: string;
  organisation: string;
  bio: string;
  industry: string;
  subfield?: string;
  subfields?: string[];
  expertise: string[];
  guidance_topics: string[];
  mentorship_types: MentorshipType[];
  active: boolean;
  publish_public_profile?: boolean;
};

export type MentorshipSession = {
  id: string;
  title: string;
  mentorship_type: MentorshipSessionType;
  industry: string;
  description: string;
  starts_at: string;
  registration_deadline: string | null;
  capacity: number | null;
  registration_count?: number;
  access_level: 'open' | 'members';
  meeting_url: string | null;
  replay_url: string | null;
  resources: { label: string; url: string }[];
  eligibility: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'upcoming' | 'live' | 'completed' | 'cancelled';
  subfield?: string;
  timezone?: string;
  recording_allowed?: boolean;
  audience_type?: MentorshipAudienceType;
  audience_fields?: string[];
  audience_subfields?: string[];
  selected_user_ids?: string[];
  notification_channels?: MentorshipNotificationChannel[];
  distribution_surfaces?: MentorshipSurface[];
  feature_level?: 'normal' | 'featured' | 'priority';
  mentor_confirmed_at?: string | null;
  attendance_recorded_at?: string | null;
  replay_expected?: boolean;
  published_at?: string | null;
  completed_at?: string | null;
  mentors?: Mentor[];
};

export const mentorImages: Record<string, ImageSourcePropType> = {
  'tosin-adeniran': require('../../assets/media/tosin-mentor.png'),
  'adeola-balogun': require('../../assets/media/adeola-mentorship.png'),
};

export const demoMentors: Mentor[] = [
  { id:'tosin-adeniran', full_name:'Tosin Adeniran', photo_url:null, job_title:'Social Media Strategist', organisation:'GWMB Board of Mentors', bio:'Tosin helps young women build professional visibility, communicate their value and approach their careers with clarity.', industry:'Marketing', expertise:['Social media strategy','Professional visibility','Career positioning'], guidance_topics:['Building a professional brand','Communicating your value','Growing with intention'], mentorship_types:['discovery','industry','one_on_one'], active:true },
  { id:'adeola-balogun', full_name:'Adeola Balogun', photo_url:null, job_title:'Senior Product Manager', organisation:'Technology', bio:'Adeola supports emerging professionals who want an honest view of product careers and practical guidance for breaking in.', industry:'Product', expertise:['Product management','Career transitions','Stakeholder communication'], guidance_topics:['Exploring product careers','Building product experience','Interview preparation'], mentorship_types:['discovery','industry','one_on_one'], active:true },
];

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

export const demoMentorshipSessions: MentorshipSession[] = [
  { id:'product-manager-conversation', title:'Should You Become a Product Manager?', mentorship_type:'discovery', industry:'Product', description:'An honest conversation about the role, the skills it requires and how to decide whether it fits you.', starts_at:future(21), registration_deadline:future(20), capacity:250, access_level:'open', meeting_url:null, replay_url:null, resources:[], eligibility:'Open to Guests and Members who are exploring product careers.', status:'upcoming', mentors:[demoMentors[1]] },
  { id:'marketing-career-room', title:'Building a Career in Marketing', mentorship_type:'industry', industry:'Marketing', description:'Go deeper into early-career marketing paths, practical skill-building and professional positioning.', starts_at:future(45), registration_deadline:future(43), capacity:80, access_level:'members', meeting_url:null, replay_url:null, resources:[], eligibility:'Verified GWMB Members interested in marketing.', status:'upcoming', mentors:[demoMentors[0]] },
  { id:'data-analyst-replay', title:'Should You Become a Data Analyst?', mentorship_type:'discovery', industry:'Data', description:'A practical introduction to data careers, everyday work and the skills that matter.', starts_at:past(30), registration_deadline:past(31), capacity:null, access_level:'open', meeting_url:null, replay_url:'https://girlswhomeanbusiness.org/', resources:[], eligibility:'Open Access', status:'completed', mentors:[demoMentors[1]] },
];

export const mentorshipIndustries = ['Product','Data','Software','AI','Marketing','Sales','HR','Finance','Design','Business','Creative'];

export function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }).format(new Date(value));
}
