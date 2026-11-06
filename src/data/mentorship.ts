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

export const mentorshipIndustries = ['Product','Data','Software','AI','Marketing','Sales','HR','Finance','Design','Business','Creative'];

export function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }).format(new Date(value));
}
