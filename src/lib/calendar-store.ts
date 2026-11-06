import { apiCall } from '@/lib/auth';
import { subscribeToRefresh } from '@/lib/live';

export type CalendarItem={
  source_type:'content_course'|'content_event'|'content_other'|'mentorship'|'local_event'|'local_project';
  source_id:string;
  title:string;
  starts_at:string;
  ends_at:string|null;
  status:string;
  category:string;
  access_level:string;
  location:string;
  route:string;
  relevance:'operations'|'saved'|'chapter'|'recommended';
  metadata:Record<string,unknown>;
};

const range=(monthsBack:number,monthsAhead:number)=>{
  const from=new Date();from.setMonth(from.getMonth()-monthsBack);from.setDate(1);from.setHours(0,0,0,0);
  const to=new Date();to.setMonth(to.getMonth()+monthsAhead+1);to.setDate(0);to.setHours(23,59,59,999);
  return{from:from.toISOString(),to:to.toISOString()};
};

export async function loadAdminCalendar(){
  const{from,to}=range(1,12);
  const{data,error}=await apiCall<CalendarItem[]>(`/v1/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return{items:((data??[]) as CalendarItem[]).sort(byStart),error};
}

export async function loadMyCalendar(){
  const{from,to}=range(1,6);
  const{data,error}=await apiCall<CalendarItem[]>(`/v1/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return{items:((data??[]) as CalendarItem[]).sort(byStart),error};
}

export function subscribeToCalendarChanges(onChange:()=>void){
  return subscribeToRefresh(onChange);
}

function byStart(a:CalendarItem,b:CalendarItem){return new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()}
