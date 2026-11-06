import type { ImageSourcePropType } from 'react-native';

export type EventAccess = 'Open Access' | 'Members Only';
export type EventLifecycle = 'upcoming' | 'past';
export type EventBookingMode = 'register' | 'waitlist' | 'closed';

export type GwmbEvent = {
  id: string;
  type: string;
  title: string;
  copy: string;
  date: string;
  dateShort: string;
  startsAt?: string;
  day: string;
  month: string;
  location: string;
  access: EventAccess;
  lifecycle: EventLifecycle;
  bookingMode: EventBookingMode;
  speaker: string;
  role: string;
  initials: string;
  tone: string;
  about: string;
  speakerAbout: string;
  eligibility: string;
  agenda: string[];
  prep: string[];
  image?: ImageSourcePropType;
};
