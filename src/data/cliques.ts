import type { ImageSourcePropType } from 'react-native';

export type CliqueCategory = 'tech' | 'digital' | 'creative' | 'business' | 'professional';

export type Clique = {
  id: string;
  title: string;
  category: CliqueCategory;
  copy: string;
  image: ImageSourcePropType;
  tone: string;
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
  { id:'girls-in-tech', title:'Tech Sistas', category:'tech', copy:'Join ladies like you in your chapter who are building careers in tech.', image:require('../../assets/media/community/member-06.png'), tone:'#1456C7' },
  { id:'girls-in-marketing', title:'Girls in Marketing', category:'digital', copy:'For women growing in marketing, content, social media and digital strategy.', image:require('../../assets/media/community/member-01.png'), tone:'#7A35D1' },
  { id:'girls-in-fashion', title:'Girls in Fashion', category:'creative', copy:'A community for women exploring fashion, styling, production and fashion business.', image:require('../../assets/media/community/member-07.png'), tone:'#C32762' },
  { id:'girls-in-photography', title:'Girls in Photography', category:'creative', copy:'Create stronger work, share honest feedback and grow your photography practice.', image:require('../../assets/media/community/member-10.png'), tone:'#222026' },
  { id:'girls-in-design', title:'Girls in Design', category:'creative', copy:'For emerging designers building skills, portfolios and visible creative careers.', image:require('../../assets/media/community/member-08.png'), tone:'#1B65A7' },
  { id:'smart-money-girls', title:'Smart Money Girls', category:'business', copy:'Talk honestly about earning, saving, business and building financial confidence.', image:require('../../assets/media/community/member-05.png'), tone:'#9A6100' },
  { id:'corporate-girlies', title:'Corporate Girlies', category:'professional', copy:'Navigate work, confidence and career growth with women who understand the journey.', image:require('../../assets/media/community/member-04.png'), tone:'#A81455' },
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
