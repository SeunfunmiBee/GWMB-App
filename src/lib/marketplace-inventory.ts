import { supabase } from '@/lib/supabase';

export type MarketplaceContentType = 'course' | 'event' | 'mentorship' | 'opportunity' | 'resource' | 'career_tool' | 'pathway';
export type MarketplaceAvailability = 'draft' | 'scheduled' | 'available' | 'full' | 'closed' | 'archived';

export type MarketplaceInventoryItem = {
  id: string;
  source_id: string;
  content_type: MarketplaceContentType;
  title: string;
  summary: string;
  route: string;
  career_areas: string[];
  skills: string[];
  journey_stages: string[];
  readiness_gaps: string[];
  career_stages: string[];
  access_level: 'Open Access' | 'Members Only';
  location: string | null;
  starts_at: string | null;
  deadline_at: string | null;
  availability: MarketplaceAvailability;
  prerequisites: string[];
  action_label: string;
  tone: string;
  priority: number;
  metadata: Record<string, unknown>;
  published: boolean;
  image_url?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  fresh_until?: string | null;
};

const inventoryKey = 'gwmb-marketplace-inventory:v1';

function readLocal() {
  try {
    const value = globalThis.localStorage?.getItem(inventoryKey);
    return value ? JSON.parse(value) as MarketplaceInventoryItem[] : [];
  } catch { return []; }
}

function writeLocal(items: MarketplaceInventoryItem[]) {
  try { globalThis.localStorage?.setItem(inventoryKey, JSON.stringify(items)); }
  catch { /* Supabase remains the source of truth on native. */ }
}

export function isInventoryItemAvailable(item: MarketplaceInventoryItem, now = new Date()) {
  if (!item.published || !['available', 'scheduled'].includes(item.availability)) return false;
  return !item.deadline_at || new Date(item.deadline_at) >= now;
}

export async function loadMarketplaceInventory() {
  const local = readLocal();
  const [inventoryResult,contentResult,sessionResult,mentorResult]=await Promise.all([
    supabase.from('marketplace_inventory').select('*').eq('published',true).in('availability',['available','scheduled']).order('priority',{ascending:false}),
    supabase.from('content_items').select('*').eq('status','published').eq('visible',true).in('area',['courses','resources','opportunities','events','grow-learning']),
    supabase.from('mentorship_sessions').select('id,title,mentorship_type,industry,subfield,description,starts_at,registration_deadline,capacity,access_level,replay_url,resources,eligibility,status,timezone,recording_allowed,published_at,completed_at,cancelled_at,audience_type,audience_fields,audience_subfields,selected_user_ids,notification_channels,distribution_surfaces,feature_level,mentor_confirmed_at,attendance_recorded_at,replay_expected,created_at,updated_at').in('status',['published','upcoming','live']),
    supabase.from('mentors').select('*').eq('active',true).eq('publish_public_profile',true),
  ]);
  const cloudItems=(inventoryResult.data??[]) as MarketplaceInventoryItem[];
  const dynamicItems=[
    ...(contentResult.data??[]).map(contentItemToInventory),
    ...(sessionResult.data??[]).filter(session=>!Array.isArray(session.distribution_surfaces)||session.distribution_surfaces.includes('home')).map(mentorshipSessionToInventory),
    ...(mentorResult.data??[]).map(mentorToInventory),
  ];
  const successfulCloudItems=inventoryResult.error?[]:cloudItems;
  const successfulDynamicItems=[
    ...(contentResult.error?[]:dynamicItems.filter(item=>item.metadata.area)),
    ...(sessionResult.error?[]:dynamicItems.filter(item=>item.metadata.source==='mentorship')),
    ...(mentorResult.error?[]:dynamicItems.filter(item=>item.metadata.source==='mentor')),
  ];
  const merged=new Map<string,MarketplaceInventoryItem>();
  [...successfulCloudItems,...successfulDynamicItems].forEach(item=>merged.set(`${item.content_type}:${item.source_id}`,item));
  const items=[...merged.values()].filter(item=>isInventoryItemAvailable(item)).sort((a,b)=>b.priority-a.priority);
  const cloud=!inventoryResult.error&&!contentResult.error&&!sessionResult.error&&!mentorResult.error;
  if(cloud)writeLocal(items);
  return { items:cloud?items:(items.length?items:local), cloud };
}

const strings=(value:unknown)=>Array.isArray(value)?value.filter(item=>typeof item==='string') as string[]:[];
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value:fallback;
const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const datePlus=(value:string|null|undefined,milliseconds:number)=>{if(!value)return null;const time=new Date(value).getTime();return Number.isFinite(time)?new Date(time+milliseconds).toISOString():null};

function contentItemToInventory(item:Record<string,unknown>):MarketplaceInventoryItem{
  const metadata=record(item.metadata);
  const area=text(item.area);
  const contentType:MarketplaceContentType=area==='courses'?'course':area==='resources'?'resource':area==='opportunities'?'opportunity':'event';
  const sourceId=text(item.slug,text(item.id));
  const startsAt=text(item.starts_at)||null;
  const deadlineAt=text(metadata.deadline,text(metadata.deadlineAt))||null;
  const route=text(item.route,contentType==='course'?`/course/${sourceId}`:contentType==='resource'?`/resource/${sourceId}`:contentType==='opportunity'?`/opportunity/${sourceId}`:`/event/${sourceId}`);
  const publishedAt=text(item.publish_at,text(item.created_at))||null;
  const freshDays=typeof metadata.freshDays==='number'?metadata.freshDays:14;
  return{id:`content-${text(item.id,sourceId)}`,source_id:sourceId,content_type:contentType,title:text(item.title,'New from GWMB'),summary:text(item.summary),route,career_areas:strings(metadata.careerAreas).length?strings(metadata.careerAreas):strings(metadata.fields),skills:strings(metadata.skills),journey_stages:strings(metadata.journeyStages),readiness_gaps:strings(metadata.readinessGaps),career_stages:strings(metadata.careerStages),access_level:item.access_level==='members'?'Members Only':'Open Access',location:text(metadata.location)||null,starts_at:startsAt,deadline_at:deadlineAt,availability:contentType==='event'?'scheduled':'available',prerequisites:strings(metadata.prerequisites),action_label:text(metadata.actionLabel,contentType==='course'?'Start learning':contentType==='opportunity'?'View opportunity':contentType==='resource'?'Open resource':'View session'),tone:text(metadata.color,'#A81455'),priority:(item.featured===true?95:70)+(typeof item.sort_order==='number'?Math.max(0,10-item.sort_order):0),metadata:{...metadata,area},published:true,image_url:text(item.image_url)||null,published_at:publishedAt,updated_at:text(item.updated_at)||publishedAt,fresh_until:text(metadata.freshUntil)||datePlus(publishedAt,freshDays*24*60*60*1000)};
}

function mentorshipSessionToInventory(session:Record<string,unknown>):MarketplaceInventoryItem{
  const sourceId=text(session.id);
  const startsAt=text(session.starts_at)||null;
  const publishedAt=text(session.published_at,text(session.created_at))||null;
  const feature=text(session.feature_level,'normal');
  return{id:`mentorship-session-${sourceId}`,source_id:sourceId,content_type:'event',title:text(session.title,'New mentorship session'),summary:text(session.description),route:`/mentorship-session/${sourceId}`,career_areas:[text(session.industry),text(session.subfield)].filter(Boolean),skills:[],journey_stages:['explore','prepare'],readiness_gaps:['career_clarity','industry_understanding','guidance'],career_stages:[],access_level:session.access_level==='members'?'Members Only':'Open Access',location:'Online',starts_at:startsAt,deadline_at:text(session.registration_deadline)||null,availability:'scheduled',prerequisites:[],action_label:'View mentorship session',tone:text(record(session.metadata).color,feature==='priority'?'#3150E8':'#7A35D1'),priority:feature==='priority'?110:feature==='featured'?100:82,metadata:{mentorship_type:session.mentorship_type,subfield:session.subfield,source:'mentorship'},published:true,published_at:publishedAt,updated_at:text(session.updated_at)||publishedAt,fresh_until:datePlus(startsAt,2*60*60*1000)};
}

function mentorToInventory(mentor:Record<string,unknown>):MarketplaceInventoryItem{
  const sourceId=text(mentor.id);
  const publishedAt=text(mentor.created_at)||null;
  return{id:`mentor-${sourceId}`,source_id:sourceId,content_type:'mentorship',title:`Meet ${text(mentor.full_name,'a GWMB mentor')}`,summary:[text(mentor.job_title),text(mentor.organisation)].filter(Boolean).join(' · '),route:`/mentor/${sourceId}`,career_areas:[text(mentor.industry),...strings(mentor.subfields)].filter(Boolean),skills:strings(mentor.expertise),journey_stages:['explore','prepare'],readiness_gaps:['career_clarity','industry_understanding','guidance'],career_stages:[],access_level:'Open Access',location:'GWMB Mentor Network',starts_at:null,deadline_at:null,availability:'available',prerequisites:[],action_label:'Meet this mentor',tone:'#C55B4B',priority:68,metadata:{source:'mentor',mentorship_types:strings(mentor.mentorship_types)},published:true,image_url:text(mentor.photo_url)||null,published_at:publishedAt,updated_at:text(mentor.updated_at)||publishedAt,fresh_until:datePlus(publishedAt,21*24*60*60*1000)};
}

export function subscribeToMarketplaceChanges(onChange:()=>void){
  const channel=supabase.channel(`marketplace-home-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'content_items'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'marketplace_inventory'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'mentorship_sessions'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'mentors'},onChange)
    .subscribe();
  return()=>{void supabase.removeChannel(channel)};
}

export function freshMarketplaceItems(items:MarketplaceInventoryItem[],input:{interests:string[];isMember:boolean;excludeRoutes?:string[];now?:Date}){
  const now=input.now??new Date();const interestSet=new Set(input.interests.map(value=>value.toLowerCase()));const excluded=new Set(input.excludeRoutes??[]);
  return items.filter(item=>{const freshUntil=item.fresh_until?new Date(item.fresh_until).getTime():0;return isInventoryItemAvailable(item,now)&&freshUntil>now.getTime()&&!excluded.has(item.route)&&(input.isMember||item.access_level!=='Members Only')}).map(item=>{const matches=item.career_areas.filter(area=>interestSet.has(area.toLowerCase())).length;return{item,score:matches*40+item.priority+(item.starts_at?12:0)}}).sort((a,b)=>b.score-a.score).map(value=>value.item).slice(0,5);
}

export function findInventoryItem(items: MarketplaceInventoryItem[], contentType: MarketplaceContentType, sourceId: string, now = new Date()) {
  return items.find((item) => item.content_type === contentType && item.source_id === sourceId && isInventoryItemAvailable(item, now)) ?? null;
}

export function findBestOpportunity(items: MarketplaceInventoryItem[], input: { interests: string[]; careerStage: string; isMember: boolean; now?: Date }) {
  const now = input.now ?? new Date();
  const interests = new Set(input.interests.map((item) => item.toLowerCase()));
  return items
    .filter((item) => item.content_type === 'opportunity' && isInventoryItemAvailable(item, now))
    .map((item) => {
      const interestMatches = item.career_areas.filter((area) => interests.has(area.toLowerCase())).length;
      const stageMatch = !item.career_stages.length || item.career_stages.includes(input.careerStage);
      const accessible = input.isMember || item.access_level === 'Open Access';
      return { item, score: item.priority + interestMatches * 30 + (stageMatch ? 20 : -40) + (accessible ? 20 : -20) };
    })
    .sort((a, b) => b.score - a.score)[0]?.item ?? null;
}
