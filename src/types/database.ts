export type MembershipStatus = 'non_member' | 'pending' | 'verified' | 'rejected' | 'expired';

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city_club: string | null;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  user_id: string;
  status: MembershipStatus;
  application_reference: string | null;
  membership_record_id: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export type MembershipApplication = {
  id: string;
  user_id: string;
  external_reference: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  occupation: string | null;
  motivation: string | null;
  status: MembershipApplicationStatus;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export type VerificationRequestStatus = 'pending' | 'needs_review' | 'approved' | 'rejected';

export type MembershipVerificationRequest = {
  user_id: string;
  membership_email: string;
  phone: string;
  member_identifier: string | null;
  chapter: string | null;
  membership_record_id: string | null;
  status: VerificationRequestStatus;
  review_note: string | null;
  submitted_at: string;
  updated_at: string;
};

export type MembershipDetails = {
  member_identifier: string;
  membership_email: string;
  chapter: string | null;
  record_status: 'active' | 'inactive' | 'expired' | 'suspended';
  dues_status: 'current' | 'due' | 'overdue' | 'waived' | 'unknown';
};

export type {
  MarketplaceReadinessProfile,
  RecommendationConfidence,
  RecommendationFeedbackAction,
} from '@/lib/marketplace-intelligence';

export type { MarketplaceInventoryItem } from '@/lib/marketplace-inventory';
