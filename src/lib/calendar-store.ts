import { supabase } from '@/lib/supabase';

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
  const{data,error}=await supabase.rpc('get_admin_calendar_feed',{p_from:from,p_to:to});
  return{items:((data??[]) as CalendarItem[]).sort(byStart),error};
}

export async function loadMyCalendar(){
  const{from,to}=range(1,6);
  const{data,error}=await supabase.rpc('get_my_calendar_feed',{p_from:from,p_to:to});
  return{items:((data??[]) as CalendarItem[]).sort(byStart),error};
}

export function subscribeToCalendarChanges(onChange:()=>void){
  const channel=supabase.channel(`calendar-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'content_items'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'mentorship_sessions'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'local_activities'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'event_registrations'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'mentorship_registrations'},onChange)
    .subscribe();
  return()=>{void supabase.removeChannel(channel)};
}

function byStart(a:CalendarItem,b:CalendarItem){return new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()}
