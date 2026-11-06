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
  {slug:'career',title:'Career & Marketplace Preparation',shortTitle:'Career',icon:'briefcase-outline',description:'Get prepared for opportunities and the workplace.',kicker:'CAREER & MARKETPLACE PREPARATION',heroTitle:'Show up ready.',heroCopy:'Build a stronger CV, sharpen your interviews and position yourself with confidence.',tone:'pink',filters:['All','Live Clinics','Courses','Replays','Resources'],sectionTitle:'Practical support',features:[]},
  {slug:'mentorship',title:'Mentorship & Guidance',shortTitle:'Mentorship',icon:'people-outline',description:'Discover careers and learn from professionals.',kicker:'MENTORSHIP & GUIDANCE',heroTitle:'Clarity grows in conversation.',heroCopy:'Learn from professionals who can help you understand your industry and plan your next step.',tone:'dark',filters:['All','Discovery','Cohorts','Mentors','Replays'],sectionTitle:'Guidance for your journey',features:[]},
  {slug:'learning',title:'Learning & Skill Development',shortTitle:'Learning & Skills',icon:'play-circle-outline',description:'Build practical skills beyond the classroom.',kicker:'LEARNING & SKILL DEVELOPMENT',heroTitle:'Learn it. Practise it. Use it.',heroCopy:'Build useful skills at your own pace through focused lessons and practical sessions.',tone:'blue',filters:['All','Courses','Live Sessions','Replays','Resources'],sectionTitle:'Recommended for you',features:[]},
  {slug:'money',title:'Smart Money Girl',shortTitle:'Smart Money Girl',icon:'wallet-outline',description:'Learn to earn, manage, save and grow money.',kicker:'FINANCIAL LITERACY',heroTitle:'Make money make sense.',heroCopy:'Practical tools and honest conversations for building confident financial habits.',tone:'gold',filters:['All','Courses','Conversations','Tools','Replays'],sectionTitle:'Grow your money confidence',features:[]},
  {slug:'personal-growth',title:'Personal Growth & Accountability',shortTitle:'Personal Growth',icon:'locate-outline',description:'Set goals and follow through on your development.',kicker:'GROWTH & ACCOUNTABILITY',heroTitle:'Small actions. Real momentum.',heroCopy:'Create a meaningful goal, name your next action and keep moving.',tone:'purple',filters:['All','Goals','Check-ins','Challenges','Resources'],sectionTitle:'Support your follow-through',features:[]},
  {slug:'leadership',title:'Leadership Development',shortTitle:'Leadership',icon:'leaf-outline',description:'Build the confidence and skills to lead.',kicker:'LEADERSHIP DEVELOPMENT',heroTitle:'Lead from where you are.',heroCopy:'Build communication, initiative and the courage to turn plans into action.',tone:'dark',filters:['All','Courses','Guides','Live Sessions','Books'],sectionTitle:'Leadership foundations',features:[]},
];

export const growCategoryBySlug = Object.fromEntries(growCategories.map(item => [item.slug,item])) as Record<GrowSlug,GrowCategory>;
