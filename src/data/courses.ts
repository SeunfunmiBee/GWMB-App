export type Lesson = {
  id: string;
  title: string;
  duration: string;
  summary: string;
  objectives: string[];
  sections: { heading:string; body:string }[];
  reflection: string;
  mediaType?: 'youtube' | 'upload' | 'external' | 'none';
  mediaUrl?: string;
  preview?: boolean;
};

export type CourseInstructor = { name:string; role:string; bio:string; imageUrl?:string };
export type AdvancedProgram = {
  enabled:boolean;
  title:string;
  partner:string;
  summary:string;
  duration?:string;
  format?:string;
  certificate?:string;
  programmeUrl:string;
  applicationUrl:string;
  deadline?:string;
  intake?:string;
  standardPrice?:string;
  status:'open'|'closing-soon'|'closed'|'coming-soon';
  offerType:'none'|'discount'|'partial-scholarship'|'full-scholarship'|'fee-waiver';
  offerLabel?:string;
  membersOnlyOffer:boolean;
  completionRequired:boolean;
};

export type Course = {
  id: string;
  eyebrow: string;
  title: string;
  promise: string;
  duration: string;
  rating: string;
  tone: string;
  access: 'OPEN ACCESS' | 'MEMBERS ONLY';
  overview: string;
  resources: string[];
  lessons: Lesson[];
  category: 'tech' | 'digital' | 'creative' | 'business' | 'professional' | 'personal-growth' | 'smart-money' | 'leadership';
  subcategory: string;
  source: 'GWMB' | 'Tech School Africa' | 'Learning Partner';
  benefits: string[];
  certificate?: boolean;
  instructor?: CourseInstructor;
  imageUrl?: string;
  resourceLinks?: Record<string,string>;
  advancedProgram?: AdvancedProgram;
};

const cvLessons:Lesson[]=[
  {id:'recruiter-scan',title:'What recruiters notice first',duration:'6 min',summary:'Understand the first review and what earns attention.',objectives:['Recognise the first things recruiters scan','Create a clear visual hierarchy','Remove details that distract from your value'],sections:[{heading:'The first scan is fast',body:'Recruiters often begin with a quick relevance check. Your name, professional direction, recent experience and strongest evidence should be easy to locate without effort.'},{heading:'Make relevance obvious',body:'Use a focused profile, familiar headings and concise evidence. The goal is not to include everything. It is to make the right information easy to understand.'}],reflection:'What is the first useful thing someone notices on your current CV?'},
  {id:'strong-profile',title:'Writing a powerful profile',duration:'8 min',summary:'Turn your opening paragraph into a focused professional story.',objectives:['Write a concise professional direction','Connect strengths to the role','Avoid vague claims and clichés'],sections:[{heading:'Lead with direction',body:'A strong profile names the work you are moving toward and the value you can already offer. Keep it specific enough to feel credible.'},{heading:'Evidence beats adjectives',body:'Replace phrases like “hard-working team player” with a skill, context or result that helps the reader understand what you have done.'}],reflection:'Write one sentence that connects your strongest skill to the opportunity you want.'},
  {id:'evidence',title:'Showing evidence of your skills',duration:'10 min',summary:'Use outcomes and action language, even without formal roles.',objectives:['Turn responsibilities into evidence','Use strong action language','Find experience beyond paid jobs'],sections:[{heading:'Experience is broader than employment',body:'Projects, volunteering, student leadership, freelance work and community responsibilities can all demonstrate useful skills when described clearly.'},{heading:'Show action and result',body:'Begin with what you did, add the context, then show the outcome or learning. Numbers help when they are honest and meaningful.'}],reflection:'Which project best proves one of the skills your target role requires?'},
  {id:'structure',title:'Structuring your experience',duration:'7 min',summary:'Organise education, skills and experience around relevance.',objectives:['Choose useful section headings','Prioritise recent relevant evidence','Keep formatting consistent'],sections:[{heading:'Structure guides attention',body:'Place the sections most relevant to your target opportunity earlier. A student CV may lead with education and projects; another may lead with experience.'},{heading:'Consistency builds trust',body:'Use the same date style, heading hierarchy, spacing and bullet structure throughout the document.'}],reflection:'Which section should move higher on your CV for the role you want?'},
  {id:'final-checklist',title:'The final CV checklist',duration:'6 min',summary:'Polish every detail before sending your application.',objectives:['Check clarity and accuracy','Remove avoidable errors','Tailor the CV to the opportunity'],sections:[{heading:'Review in layers',body:'First check relevance, then evidence, then structure, and finally spelling and formatting. Trying to fix everything at once makes errors easier to miss.'},{heading:'Tailor before sending',body:'Use the opportunity description to confirm that your strongest matching skills and experience are visible.'}],reflection:'What is the one improvement your CV needs before your next application?'},
  {id:'next-application',title:'Your next application',duration:'5 min',summary:'Turn your learning into a practical application plan.',objectives:['Choose a suitable opportunity','Create a tailoring checklist','Plan your next action'],sections:[{heading:'Use the course immediately',body:'Choose one real opportunity and apply what you have learned while the ideas are fresh. Save a master CV, then tailor a copy for each application.'},{heading:'Your simple workflow',body:'Read the description, highlight required evidence, tailor your profile and strongest bullets, complete the final checklist, then submit confidently.'}],reflection:'Which opportunity will you use to put this course into practice?'},
];

function previewLesson(id:string,title:string):Lesson{return{id,title,duration:'8 min',summary:'A focused lesson with practical guidance.',objectives:['Understand the core idea','Apply it to your own development'],sections:[{heading:'Lesson preview',body:'This course will use the same guided lesson experience as Build a CV That Gets Noticed. Full learning content will be added in the content phase.'}],reflection:'What is one action you can take after this lesson?'};}

export const courses:Record<string,Course>={
  'workplace-foundations':{id:'workplace-foundations',eyebrow:'CAREER ESSENTIALS · GWMB',title:'Build a CV that gets noticed',promise:'Turn your experience into a clear, confident CV that opens doors.',duration:'42 min',rating:'4.9',tone:'#A81455',access:'OPEN ACCESS',overview:'A practical, example-led course designed to help you explain your value clearly and apply with confidence. When you are ready to build, review or save your actual CV, open CV Builder from Opportunities.',resources:['CV checklist','Action-word bank','CV Builder in Opportunities'],lessons:cvLessons,category:'professional',subcategory:'Career Readiness',source:'GWMB',benefits:['Beginner','Certificate','Free']},
  'public-speaking':{id:'public-speaking',eyebrow:'COMMUNICATION SKILLS',title:'Confident Public Speaking',promise:'Structure your message and speak with greater clarity and calm.',duration:'58 min',rating:'4.8',tone:'#3E45E8',access:'MEMBERS ONLY',overview:'Short lessons and guided practice for presentations and interviews.',resources:['Presentation planner','Practice scorecard'],lessons:['Know your audience','Build a memorable message','Use your voice well','Confident body language','Handling nerves','Presenting online','Your practice presentation'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'professional',subcategory:'Communication',source:'GWMB',benefits:['Beginner','Certificate','Members Only']},
  budgeting:{id:'budgeting',eyebrow:'SMART MONEY GIRL',title:'Budgeting Without the Stress',promise:'Build a realistic budget that fits your actual life.',duration:'36 min',rating:'4.9',tone:'#D99A20',access:'OPEN ACCESS',overview:'A shame-free introduction to intentional money decisions.',resources:['Monthly budget sheet','Expense tracker'],lessons:['Where your money goes','Needs, wants and priorities','Build your first budget','Create a weekly money rhythm'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'smart-money',subcategory:'Budgeting',source:'GWMB',benefits:['Beginner','Free']},
  'self-leadership':{id:'self-leadership',eyebrow:'LEADERSHIP DEVELOPMENT',title:'Leading Yourself First',promise:'Build ownership, self-awareness and dependable habits.',duration:'48 min',rating:'4.8',tone:'#111111',access:'OPEN ACCESS',overview:'Build the habits and confidence to lead from where you are.',resources:['Values exercise','Habit builder'],lessons:['What self-leadership means','Know your values','Own your choices','Build dependable habits','Your leadership plan'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'leadership',subcategory:'Self Leadership',source:'GWMB',benefits:['Beginner','Certificate','Free']},
  'tech-foundations':{id:'tech-foundations',eyebrow:'TECH FOUNDATIONS · TECH SCHOOL AFRICA',title:'How Technology Careers Work',promise:'Understand the major paths in technology and where your strengths may fit.',duration:'45 min',rating:'4.8',tone:'#1266D6',access:'OPEN ACCESS',overview:'A beginner-friendly map of technology careers, skills and practical entry points.',resources:['Tech career map','Skills reflection'],lessons:['The technology landscape','Software and engineering','Data and AI','Product and design','Choose an entry point'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'tech',subcategory:'Career Discovery',source:'Tech School Africa',benefits:['Beginner','Certificate','Free']},
  'digital-marketing':{id:'digital-marketing',eyebrow:'DIGITAL SKILLS · TECH SCHOOL AFRICA',title:'Digital Marketing Fundamentals',promise:'Learn how brands find, engage and convert audiences online.',duration:'1 hr 12 min',rating:'4.9',tone:'#7347D8',access:'OPEN ACCESS',overview:'A practical introduction to channels, content, audiences and campaign thinking.',resources:['Channel planner','Campaign brief'],lessons:['Digital marketing today','Know your audience','Content and channels','Campaign planning','Measure what matters','Build a sample campaign'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'digital',subcategory:'Marketing',source:'Tech School Africa',benefits:['Beginner','Certificate','Free']},
  'creative-thinking':{id:'creative-thinking',eyebrow:'CREATIVE PRACTICE · LEARNING PARTNER',title:'Creative Thinking for Real Projects',promise:'Turn ideas into clearer concepts, useful work and stronger portfolios.',duration:'52 min',rating:'4.7',tone:'#E25B79',access:'MEMBERS ONLY',overview:'Use simple creative methods to generate, shape and present ideas.',resources:['Idea workbook','Project prompt cards'],lessons:['Start with a useful problem','Generate stronger ideas','Choose what to develop','Make and test quickly','Present the work'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'creative',subcategory:'Creative Practice',source:'Learning Partner',benefits:['Beginner','Certificate','Members Only']},
  'business-basics':{id:'business-basics',eyebrow:'BUSINESS ESSENTIALS',title:'Business Basics for Young Professionals',promise:'Understand how organisations create value, operate and make decisions.',duration:'55 min',rating:'4.8',tone:'#168A72',access:'OPEN ACCESS',overview:'A clear foundation in customers, operations, money and business decision-making.',resources:['Business model canvas','Decision checklist'],lessons:['How a business creates value','Customers and markets','Operations and delivery','Revenue and costs','Make better business decisions'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'business',subcategory:'Business Foundations',source:'GWMB',benefits:['Beginner','Certificate','Free']},
  'confidence-in-action':{id:'confidence-in-action',eyebrow:'PERSONAL GROWTH',title:'Confidence You Can Practise',promise:'Build confidence through small, repeatable actions instead of waiting to feel ready.',duration:'40 min',rating:'4.9',tone:'#D43B88',access:'OPEN ACCESS',overview:'A grounded course for recognising your strengths, acting through doubt and growing with intention.',resources:['Confidence tracker','Small wins journal'],lessons:['What confidence really is','Notice your evidence','Act before you feel ready','Recover from setbacks','Build your confidence practice'].map((title,index)=>previewLesson(`lesson-${index+1}`,title)),category:'personal-growth',subcategory:'Confidence',source:'GWMB',benefits:['Beginner','Free']},
};
