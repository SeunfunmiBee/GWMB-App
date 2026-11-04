import type { ImageSourcePropType } from 'react-native';

export type CliqueCategory = 'tech' | 'digital' | 'creative' | 'business' | 'professional';

export type Clique = {
  id: string;
  title: string;
  category: CliqueCategory;
  copy: string;
  image: ImageSourcePropType;
  tone: string;
  meeting: { title: string; date: string; location: string };
};

export type CliqueSession = {
  id: string;
  cliqueId: string | null;
  kind: 'National Fireside' | 'Sister Circle';
  title: string;
  topic: string;
  startsAt: string;
  dateLabel: string;
  location: string;
  mode: 'Online' | 'In person';
  industry: string;
  tone: string;
};

export const cliques: Clique[] = [
  { id:'girls-in-tech', title:'Tech Sistas', category:'tech', copy:'Join ladies like you in your chapter who are building careers in tech.', image:require('../../assets/media/community/member-06.png'), tone:'#1456C7', meeting:{title:'Tech Sistas Sister Circle',date:'Saturday 7 November · 11:00 AM',location:'Live online'} },
  { id:'girls-in-marketing', title:'Girls in Marketing', category:'digital', copy:'For women growing in marketing, content, social media and digital strategy.', image:require('../../assets/media/community/member-01.png'), tone:'#7A35D1', meeting:{title:'Girls in Marketing Sister Circle',date:'Thursday 12 November · 7:00 PM',location:'Live online'} },
  { id:'girls-in-fashion', title:'Girls in Fashion', category:'creative', copy:'A community for women exploring fashion, styling, production and fashion business.', image:require('../../assets/media/community/member-07.png'), tone:'#C32762', meeting:{title:'Girls in Fashion Sister Circle',date:'Saturday 14 November · 1:00 PM',location:'Lagos + online'} },
  { id:'girls-in-photography', title:'Girls in Photography', category:'creative', copy:'Create stronger work, share honest feedback and grow your photography practice.', image:require('../../assets/media/community/member-10.png'), tone:'#222026', meeting:{title:'Girls in Photography Sister Circle',date:'Wednesday 18 November · 6:30 PM',location:'Live online'} },
  { id:'girls-in-design', title:'Girls in Design', category:'creative', copy:'For emerging designers building skills, portfolios and visible creative careers.', image:require('../../assets/media/community/member-08.png'), tone:'#1B65A7', meeting:{title:'Girls in Design Sister Circle',date:'Saturday 21 November · 12:00 PM',location:'Live online'} },
  { id:'smart-money-girls', title:'Smart Money Girls', category:'business', copy:'Talk honestly about earning, saving, business and building financial confidence.', image:require('../../assets/media/community/member-05.png'), tone:'#9A6100', meeting:{title:'Smart Money Girl Session',date:'Thursday 26 November · 7:00 PM',location:'Live online'} },
  { id:'corporate-girlies', title:'Corporate Girlies', category:'professional', copy:'Navigate work, confidence and career growth with women who understand the journey.', image:require('../../assets/media/community/member-04.png'), tone:'#A81455', meeting:{title:'Corporate Girlies Sister Circle',date:'Saturday 28 November · 11:00 AM',location:'Live online'} },
];

export const cliqueById = Object.fromEntries(cliques.map(clique => [clique.id, clique])) as Record<string, Clique>;
export const cliquesByCategory = (category: CliqueCategory) => cliques.filter(clique => clique.category === category);

const interestCliqueMap: Record<string,string> = {
  Data:'girls-in-tech', Software:'girls-in-tech', Product:'girls-in-tech', AI:'girls-in-tech', Cybersecurity:'girls-in-tech',
  Design:'girls-in-design', 'Graphic Design':'girls-in-design',
  Marketing:'girls-in-marketing', 'Social Media':'girls-in-marketing', 'Content Creation':'girls-in-marketing', Media:'girls-in-marketing', Writing:'girls-in-marketing',
  Finance:'smart-money-girls', Entrepreneurship:'smart-money-girls', 'E-commerce':'smart-money-girls', 'Business Growth':'smart-money-girls',
  Sales:'corporate-girlies', HR:'corporate-girlies', Operations:'corporate-girlies', 'Customer Experience':'corporate-girlies', 'Project Management':'corporate-girlies',
};

export function recommendedCliqueIds(interests:string[]) {
  return Array.from(new Set(interests.map(interest=>interestCliqueMap[interest]).filter(Boolean)));
}

export const cliqueSessions: CliqueSession[] = [
  {id:'fireside-november',cliqueId:'girls-in-tech',kind:'National Fireside',title:'Breaking Into Tech Without a Traditional Background',topic:'A candid industry conversation about transferable skills, first roles and building credibility.',startsAt:'2026-11-05T19:00:00+01:00',dateLabel:'Thu 5 Nov · 7:00 PM',location:'GWMB Live',mode:'Online',industry:'Technology',tone:'#5B4DE8'},
  {id:'tech-sistas-circle-november',cliqueId:'girls-in-tech',kind:'Sister Circle',title:'Your First 90 Days in Tech',topic:'A practical conversation about learning, asking for help and building credibility.',startsAt:'2026-11-07T11:00:00+01:00',dateLabel:'Sat 7 Nov · 11:00 AM',location:'Lagos City Club',mode:'In person',industry:'Technology',tone:'#2E5BC7'},
  {id:'marketing-circle-november',cliqueId:'girls-in-marketing',kind:'Sister Circle',title:'Build a Portfolio People Remember',topic:'Turn everyday work into proof of skill, judgment and creative direction.',startsAt:'2026-11-12T19:00:00+01:00',dateLabel:'Thu 12 Nov · 7:00 PM',location:'Live online',mode:'Online',industry:'Marketing',tone:'#8D3EBA'},
  {id:'corporate-circle-november',cliqueId:'corporate-girlies',kind:'Sister Circle',title:'Speak Up Without Second-Guessing',topic:'Presence, boundaries and confident communication at work.',startsAt:'2026-11-28T11:00:00+01:00',dateLabel:'Sat 28 Nov · 11:00 AM',location:'Abuja Sister Circle',mode:'In person',industry:'Professional Growth',tone:'#6D2B67'},
];
