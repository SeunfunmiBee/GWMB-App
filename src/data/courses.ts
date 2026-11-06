export type Lesson = {
  id: string;
  title: string;
  duration: string;
  summary: string;
  objectives: string[];
  sections: { heading: string; body: string }[];
  reflection: string;
  mediaType?: "youtube" | "upload" | "external" | "none";
  mediaUrl?: string;
  preview?: boolean;
};

export type CourseInstructor = {
  name: string;
  role: string;
  bio: string;
  imageUrl?: string;
};

export type AdvancedProgram = {
  enabled: boolean;
  title: string;
  partner: string;
  summary: string;
  duration?: string;
  format?: string;
  certificate?: string;
  programmeUrl: string;
  applicationUrl: string;
  deadline?: string;
  intake?: string;
  standardPrice?: string;
  status: "open" | "closing-soon" | "closed" | "coming-soon";
  offerType:
    | "none"
    | "discount"
    | "partial-scholarship"
    | "full-scholarship"
    | "fee-waiver";
  offerLabel?: string;
  membersOnlyOffer: boolean;
  completionRequired: boolean;
};

export type Course = {
  id: string;
  eyebrow: string;
  title: string;
  promise: string;
  duration: string;
  rating: string;
  tone: string;
  access: "OPEN ACCESS" | "MEMBERS ONLY";
  overview: string;
  resources: string[];
  lessons: Lesson[];
  category:
    | "tech"
    | "digital"
    | "creative"
    | "business"
    | "professional"
    | "personal-growth"
    | "smart-money"
    | "leadership";
  subcategory: string;
  source: "GWMB" | "Tech School Africa" | "Learning Partner";
  benefits: string[];
  certificate?: boolean;
  instructor?: CourseInstructor;
  imageUrl?: string;
  resourceLinks?: Record<string, string>;
  advancedProgram?: AdvancedProgram;
};
