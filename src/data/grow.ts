import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type GrowSlug = 'career' | 'mentorship' | 'learning' | 'money' | 'personal-growth' | 'leadership';
type IconName = ComponentProps<typeof Ionicons>['name'];

export type GrowFeature = { kind:string; access:string; title:string; description:string; meta:string; route:string; tone:'pink'|'dark'|'blue'|'gold'|'purple' };
export type GrowCategory = { slug:GrowSlug; title:string; shortTitle:string; icon:IconName; description:string; kicker:string; heroTitle:string; heroCopy:string; tone:GrowFeature['tone']; filters:string[]; sectionTitle:string; features:GrowFeature[] };

export const growCategoryColors: Record<GrowSlug, string> = {
  career: '#E62B7F',
  mentorship: '#3150E8',
  learning: '#111011',
  money: '#FFC928',
  'personal-growth': '#FF6700',
  leadership: '#7A35D1',
};

export const growCategories: GrowCategory[] = [
  {slug:'career',title:'Career & Marketplace Preparation',shortTitle:'Career',icon:'briefcase-outline',description:'Get prepared for opportunities and the workplace.',kicker:'CAREER & MARKETPLACE PREPARATION',heroTitle:'Show up ready.',heroCopy:'Build a stronger CV, sharpen your interviews and position yourself with confidence.',tone:'pink',filters:['All','Live Clinics','Courses','Replays','Resources'],sectionTitle:'Practical support',features:[
    {kind:'Practical clinic',access:'Members Only',title:'Live CV Review',description:'Get focused feedback and leave with practical improvements.',meta:'05 Oct · 6:30 PM',route:'/event/cv-clinic',tone:'dark'},
    {kind:'Course',access:'Open Access',title:'Build a CV that gets noticed',description:'Six focused lessons with a practical CV checklist.',meta:'6 lessons · 42 min',route:'/course/workplace-foundations',tone:'pink'}]},
  {slug:'mentorship',title:'Mentorship & Guidance',shortTitle:'Mentorship',icon:'people-outline',description:'Discover careers and learn from professionals.',kicker:'MENTORSHIP & GUIDANCE',heroTitle:'Clarity grows in conversation.',heroCopy:'Learn from professionals who can help you understand your industry and plan your next step.',tone:'dark',filters:['All','Discovery','Cohorts','Mentors','Replays'],sectionTitle:'Guidance for your journey',features:[
    {kind:'Mentor profile',access:'Members Only',title:'Meet Tosin Adeniran',description:'Practical guidance on visibility, positioning and social media strategy.',meta:'Board of Mentors',route:'/mentor/tosin-adeniran',tone:'dark'},
    {kind:'Live session',access:'Open Access',title:'Should You Become a Product Manager?',description:'An honest look at the role, skills and early positioning.',meta:'Thu 16 · 7:30 PM',route:'/event/product-manager',tone:'pink'}]},
  {slug:'learning',title:'Learning & Skill Development',shortTitle:'Learning & Skills',icon:'play-circle-outline',description:'Build practical skills beyond the classroom.',kicker:'LEARNING & SKILL DEVELOPMENT',heroTitle:'Learn it. Practise it. Use it.',heroCopy:'Build useful skills at your own pace through focused lessons and practical sessions.',tone:'blue',filters:['All','Courses','Live Sessions','Replays','Resources'],sectionTitle:'Recommended for you',features:[
    {kind:'Course',access:'Members Only',title:'Confident Public Speaking',description:'Structure your message and speak with greater clarity.',meta:'7 lessons · Certificate',route:'/course/public-speaking',tone:'blue'},
    {kind:'Resource',access:'Open Access',title:'The Weekly Planning Template',description:'Turn priorities into a focused plan you can follow.',meta:'PDF · 5 pages',route:'/resource/weekly-planning',tone:'purple'}]},
  {slug:'money',title:'Smart Money Girl',shortTitle:'Smart Money Girl',icon:'wallet-outline',description:'Learn to earn, manage, save and grow money.',kicker:'FINANCIAL LITERACY',heroTitle:'Make money make sense.',heroCopy:'Practical tools and honest conversations for building confident financial habits.',tone:'gold',filters:['All','Courses','Conversations','Tools','Replays'],sectionTitle:'Grow your money confidence',features:[
    {kind:'Course',access:'Open Access',title:'Budgeting Without the Stress',description:'Build a realistic first budget in four short lessons.',meta:'4 lessons · 36 min',route:'/course/budgeting',tone:'gold'},
    {kind:'Live conversation',access:'Members Only',title:'From Side Hustle to Real Income',description:'Practical lessons from women growing sustainable income.',meta:'19 Oct · 6:00 PM',route:'/event/side-hustle',tone:'gold'}]},
  {slug:'personal-growth',title:'Personal Growth & Accountability',shortTitle:'Personal Growth',icon:'locate-outline',description:'Set goals and follow through on your development.',kicker:'GROWTH & ACCOUNTABILITY',heroTitle:'Small actions. Real momentum.',heroCopy:'Create a meaningful goal, name your next action and keep moving.',tone:'purple',filters:['All','Goals','Check-ins','Challenges','Resources'],sectionTitle:'Support your follow-through',features:[
    {kind:'Accountability check-in',access:'Members Only',title:'October Progress Circle',description:'Reflect, reset and name your next committed action.',meta:'31 Oct · 7:00 PM',route:'/event/progress-circle',tone:'pink'},
    {kind:'Resource',access:'Open Access',title:'A Better Way to Set Goals',description:'A short guide to making goals specific and workable.',meta:'8 min read',route:'/resource/better-goals',tone:'purple'}]},
  {slug:'leadership',title:'Leadership Development',shortTitle:'Leadership',icon:'leaf-outline',description:'Build the confidence and skills to lead.',kicker:'LEADERSHIP DEVELOPMENT',heroTitle:'Lead from where you are.',heroCopy:'Build communication, initiative and the courage to turn plans into action.',tone:'dark',filters:['All','Courses','Guides','Live Sessions','Books'],sectionTitle:'Leadership foundations',features:[
    {kind:'Course',access:'Open Access',title:'Leading Yourself First',description:'Build ownership, self-awareness and dependable habits.',meta:'5 lessons · 48 min',route:'/course/self-leadership',tone:'purple'},
    {kind:'Guide',access:'Members Only',title:'Communicating Through Conflict',description:'A practical guide to direct, respectful conversations.',meta:'Guide · 12 min',route:'/resource/conflict-guide',tone:'dark'}]},
];

export const growCategoryBySlug = Object.fromEntries(growCategories.map(item => [item.slug,item])) as Record<GrowSlug,GrowCategory>;
