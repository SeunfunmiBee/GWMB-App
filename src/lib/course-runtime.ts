import { useMemo } from 'react';

import { type AdvancedProgram, type Course, type Lesson } from '@/data/courses';
import type { ContentItem } from '@/lib/admin-content';
import { usePublishedContentState } from '@/lib/content-runtime';

const stringValue=(value:unknown,fallback='')=>typeof value==='string'?value:fallback;
const stringList=(value:unknown,fallback:string[]=[])=>Array.isArray(value)?value.filter(item=>typeof item==='string') as string[]:fallback;
const validCategory=(value:unknown):Course['category']=>{
  const normalized=stringValue(value,'professional').toLowerCase().replaceAll(' ','-');
  if(normalized.includes('tech'))return 'tech';
  if(normalized.includes('digital'))return 'digital';
  if(normalized.includes('creative'))return 'creative';
  if(normalized.includes('business'))return 'business';
  if(normalized.includes('personal'))return 'personal-growth';
  if(normalized.includes('money'))return 'smart-money';
  if(normalized.includes('leader'))return 'leadership';
  return 'professional';
};

function courseLesson(value:unknown,index:number):Lesson{
  const lesson=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
  const title=stringValue(lesson.title,`Lesson ${index+1}`);
  const objectives=stringList(lesson.objectives,['Understand the key ideas in this lesson','Apply the lesson to your own development']);
  const rawSections=Array.isArray(lesson.sections)?lesson.sections:[];
  const sections=rawSections.flatMap(section=>{
    if(!section||typeof section!=='object')return [];
    const record=section as Record<string,unknown>;
    const heading=stringValue(record.heading);
    const body=stringValue(record.body);
    return heading||body?[{heading:heading||'Lesson notes',body}]:[];
  });
  return {
    id:stringValue(lesson.id,`lesson-${index+1}`),title,
    duration:stringValue(lesson.duration,'8 min'),summary:stringValue(lesson.summary,'A focused, practical lesson.'),objectives,
    sections:sections.length?sections:[{heading:'Lesson guide',body:stringValue(lesson.summary,'Open the learning media, then use the reflection to apply what you learned.')}],
    reflection:stringValue(lesson.reflection,'What is one useful action you will take from this lesson?'),
    mediaType:(['youtube','upload','external','none'].includes(stringValue(lesson.media_type))?stringValue(lesson.media_type):'none') as Lesson['mediaType'],
    mediaUrl:stringValue(lesson.media_url),preview:lesson.preview===true,
  };
}

function parseResources(value:unknown){
  const titles:string[]=[];const links:Record<string,string>={};
  const items=Array.isArray(value)?value:[];
  items.forEach((item,index)=>{
    if(typeof item==='string'){
      const [rawTitle,...urlParts]=item.split('|');const title=rawTitle.trim()||`Resource ${index+1}`;const url=urlParts.join('|').trim();
      titles.push(title);if(url)links[title]=url;
    }else if(item&&typeof item==='object'){
      const record=item as Record<string,unknown>;const title=stringValue(record.title,`Resource ${index+1}`);titles.push(title);const url=stringValue(record.url);if(url)links[title]=url;
    }
  });
  return {titles,links};
}

export function courseFromContent(item:ContentItem):Course{
  const metadata=item.metadata??{};
  const lessons=Array.isArray(metadata.lessons)?metadata.lessons.map(courseLesson):[];
  const certificate=metadata.certificate===true;
  const level=stringValue(metadata.level,'Beginner');
  const resources=parseResources(metadata.resources);
  const instructor=(metadata.instructor&&typeof metadata.instructor==='object'?metadata.instructor:{}) as Record<string,unknown>;
  const provider=stringValue(metadata.provider,'GWMB');
  const advanced=(metadata.advanced_program&&typeof metadata.advanced_program==='object'?metadata.advanced_program:{}) as Record<string,unknown>;
  const advancedStatus=(['open','closing-soon','closed','coming-soon'].includes(stringValue(advanced.status))?stringValue(advanced.status):'coming-soon') as AdvancedProgram['status'];
  const offerType=(['none','discount','partial-scholarship','full-scholarship','fee-waiver'].includes(stringValue(advanced.offer_type))?stringValue(advanced.offer_type):'none') as AdvancedProgram['offerType'];
  const advancedProgram=advanced.enabled===true?{enabled:true,title:stringValue(advanced.title,`Go further with ${item.title}`),partner:stringValue(advanced.partner,'Tech School Africa'),summary:stringValue(advanced.summary,'Continue into a professional programme delivered by our learning partner.'),duration:stringValue(advanced.duration)||undefined,format:stringValue(advanced.format)||undefined,certificate:stringValue(advanced.certificate)||undefined,programmeUrl:stringValue(advanced.programme_url),applicationUrl:stringValue(advanced.application_url),deadline:stringValue(advanced.deadline)||undefined,intake:stringValue(advanced.intake)||undefined,standardPrice:stringValue(advanced.standard_price)||undefined,status:advancedStatus,offerType,offerLabel:stringValue(advanced.offer_label)||undefined,membersOnlyOffer:advanced.members_only_offer!==false,completionRequired:advanced.completion_required===true} satisfies AdvancedProgram:undefined;
  return {
    id:item.slug,eyebrow:item.eyebrow||'GWMB LEARNING',title:item.title,
    promise:item.summary||'Build a practical skill for your next move.',duration:stringValue(metadata.duration,'Self-paced'),
    rating:stringValue(metadata.rating,'New'),tone:stringValue(metadata.color,'#6B3AA5'),
    access:item.access_level==='members'?'MEMBERS ONLY':'OPEN ACCESS',overview:item.body||item.summary||'',
    resources:resources.titles,lessons,category:validCategory(metadata.category),subcategory:stringValue(metadata.subcategory,'Professional Learning'),
    source:(['GWMB','Tech School Africa','Learning Partner'].includes(provider)?provider:'Learning Partner') as Course['source'],
    benefits:Array.from(new Set([level,certificate?'Certificate':'',item.access_level==='members'?'Members Only':'Free'].filter(Boolean))),
    certificate,instructor:stringValue(instructor.name)?{name:stringValue(instructor.name),role:stringValue(instructor.role),bio:stringValue(instructor.bio),imageUrl:stringValue(instructor.image_url)}:undefined,
    imageUrl:item.image_url||undefined,resourceLinks:resources.links,advancedProgram,
  };
}

export function buildCourseCatalog(items:ContentItem[]){
  const catalog:Record<string,Course>={};
  items.forEach(item=>{catalog[item.slug]=courseFromContent(item);});
  return catalog;
}

export function useCourseCatalog(){
  const {items}=usePublishedContentState('courses');
  return useMemo(()=>buildCourseCatalog(items),[items]);
}

export function useCourseCatalogState(){
  const state=usePublishedContentState('courses');
  const catalog=useMemo(()=>buildCourseCatalog(state.items),[state.items]);
  return {...state,catalog};
}
