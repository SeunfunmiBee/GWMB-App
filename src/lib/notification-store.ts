import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { GwmbEvent } from '@/data/events';
import type { CliqueSession } from '@/data/cliques';
import type { MentorshipSession } from '@/data/mentorship';
import type { ApplicationReminder } from '@/lib/application-profile-store';
import { apiCall } from '@/lib/auth';

export type UserNotification = { id:string; user_id:string; kind:string; title:string; body:string; route:string|null; read_at:string|null; created_at:string };
export type NotificationPreferences = {
  user_id:string;
  push_enabled:boolean;
  email_enabled:boolean;
  sms_enabled:boolean;
  whatsapp_enabled:boolean;
  events_enabled:boolean;
  opportunities_enabled:boolean;
  learning_enabled:boolean;
  community_enabled:boolean;
  newsletter_enabled:boolean;
  reminder_24h:boolean;
  reminder_1h:boolean;
  reminder_live:boolean;
  created_at?:string;
  updated_at?:string;
};

export const defaultNotificationPreferences = (userId:string):NotificationPreferences => ({
  user_id:userId,
  push_enabled:false,
  email_enabled:true,
  sms_enabled:false,
  whatsapp_enabled:false,
  events_enabled:true,
  opportunities_enabled:true,
  learning_enabled:true,
  community_enabled:true,
  newsletter_enabled:true,
  reminder_24h:true,
  reminder_1h:true,
  reminder_live:true,
});

export async function loadUserNotifications(_userId:string){const{data,error}=await apiCall<UserNotification[]>('/v1/notifications');return{notifications:data??[],error}}
export async function loadUnreadNotificationCount(_userId:string){const{data,error}=await apiCall<{count:number}>('/v1/notifications/unread-count');return{count:data?.count??0,error}}
export async function markNotificationRead(_userId:string,notificationId:string){return apiCall(`/v1/notifications/${notificationId}/read`,{method:'POST'})}
export async function markAllNotificationsRead(_userId:string){return apiCall('/v1/notifications/read-all',{method:'POST'})}

export async function loadNotificationPreferences(userId:string){
  const fallback=defaultNotificationPreferences(userId);
  // The API creates the defaults on first read.
  const{data,error}=await apiCall<NotificationPreferences>('/v1/notifications/preferences');
  return{preferences:data??fallback,error};
}

export async function updateNotificationPreferences(userId:string,patch:Partial<NotificationPreferences>){
  const{data,error}=await apiCall<NotificationPreferences>('/v1/notifications/preferences',{method:'PATCH',body:JSON.stringify(patch)});
  return{preferences:(data as NotificationPreferences|null)??{...defaultNotificationPreferences(userId),...patch},error};
}

export async function registerPushDevice(userId:string,requestPermission=true){
  if(Platform.OS==='web')return{enabled:false,reason:'Push notifications are available in the Android app.'};
  if(!Device.isDevice)return{enabled:false,reason:'Use a physical device to enable push notifications.'};
  const current=await Notifications.getPermissionsAsync();
  const permission=current.granted||!requestPermission?current:await Notifications.requestPermissionsAsync();
  if(!permission.granted)return{enabled:false,reason:'Notification permission was not granted.'};
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('gwmb-reminders',{name:'GWMB reminders',importance:Notifications.AndroidImportance.HIGH,vibrationPattern:[0,200,120,200],lightColor:'#E62B7F'});
  const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
  if(!projectId)return{enabled:false,reason:'The notification project ID is unavailable.'};
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  const{error}=await apiCall('/v1/notifications/push-devices',{method:'POST',body:JSON.stringify({token,device_name:Device.deviceName??Device.modelName??'Android device',platform:Platform.OS})});
  if(error)return{enabled:false,reason:error.message};
  await updateNotificationPreferences(userId,{push_enabled:true});
  return{enabled:true,token};
}

export async function disablePushForUser(userId:string){await Promise.all([apiCall('/v1/me/push-devices/deactivate',{method:'POST'}),updateNotificationPreferences(userId,{push_enabled:false})])}

export async function scheduleLocalEventReminders(event:GwmbEvent,preferences:NotificationPreferences){
  if(Platform.OS==='web'||!event.startsAt)return[];
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)return[];
  const start=new Date(event.startsAt).getTime();
  if(!Number.isFinite(start)||start<=Date.now())return[];
  const reminders=[
    {enabled:preferences.reminder_24h,suffix:'24h',at:start-24*60*60*1000,title:'Your GWMB event is tomorrow',body:`${event.title} starts tomorrow.`},
    {enabled:preferences.reminder_1h,suffix:'1h',at:start-60*60*1000,title:'Your GWMB event starts in one hour',body:`${event.title} starts in one hour. Get ready to join.`},
    {enabled:preferences.reminder_live,suffix:'live',at:start,title:'We are live now',body:`${event.title} is starting now. Open GWMB to join.`},
  ].filter(item=>item.enabled&&item.at>Date.now());
  const identifiers:string[]=[];
  for(const reminder of reminders){
    const identifier=await Notifications.scheduleNotificationAsync({content:{title:reminder.title,body:reminder.body,data:{route:`/event/${event.id}`,eventId:event.id},sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(reminder.at),channelId:Platform.OS==='android'?'gwmb-reminders':undefined},identifier:`gwmb-event-${event.id}-${reminder.suffix}`});
    identifiers.push(identifier);
  }
  return identifiers;
}

export async function cancelLocalEventReminders(eventId:string){await Promise.all(['24h','1h','live'].map(suffix=>Notifications.cancelScheduledNotificationAsync(`gwmb-event-${eventId}-${suffix}`)))}

export async function scheduleLocalMentorshipReminders(session:MentorshipSession,preferences:NotificationPreferences){
  if(Platform.OS==='web'||!preferences.push_enabled)return[];
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)return[];
  const start=new Date(session.starts_at).getTime();
  if(!Number.isFinite(start)||start<=Date.now())return[];
  const reminders=[
    {enabled:preferences.reminder_24h,suffix:'24h',at:start-24*60*60*1000,title:'Your mentorship is tomorrow',body:`${session.title} starts tomorrow.`},
    {enabled:preferences.reminder_1h,suffix:'1h',at:start-60*60*1000,title:'Your mentorship starts in one hour',body:`${session.title} starts in one hour. Get ready to join.`},
    {enabled:preferences.reminder_live,suffix:'live',at:start,title:'Your mentorship is live now',body:`${session.title} is starting now. Tap to join.`},
  ].filter(item=>item.enabled&&item.at>Date.now());
  const identifiers:string[]=[];
  for(const reminder of reminders){
    identifiers.push(await Notifications.scheduleNotificationAsync({content:{title:reminder.title,body:reminder.body,data:{route:`/mentorship-session/${session.id}`,sessionId:session.id},sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(reminder.at),channelId:Platform.OS==='android'?'gwmb-reminders':undefined},identifier:`gwmb-mentorship-${session.id}-${reminder.suffix}`}));
  }
  return identifiers;
}

export async function cancelLocalMentorshipReminders(sessionId:string){await Promise.all(['24h','1h','live'].map(suffix=>Notifications.cancelScheduledNotificationAsync(`gwmb-mentorship-${sessionId}-${suffix}`)))}

export async function scheduleLocalApplicationReminders(opportunityId:string,reminders:ApplicationReminder[]){
  if(Platform.OS==='web')return[];
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)return[];
  const identifiers:string[]=[];
  for(const reminder of reminders.filter(item=>item.enabled&&new Date(item.scheduled_for).getTime()>Date.now())){
    identifiers.push(await Notifications.scheduleNotificationAsync({content:{title:reminder.label,body:'Review your application progress and choose your next useful step.',data:{route:'/opportunities?tab=applications',opportunityId},sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(reminder.scheduled_for),channelId:Platform.OS==='android'?'gwmb-reminders':undefined},identifier:`gwmb-application-${opportunityId}-${reminder.days_after_submission}`}));
  }
  return identifiers;
}

export async function scheduleLocalCliqueReminders(session:CliqueSession,preferences:NotificationPreferences){
  if(Platform.OS==='web'||!preferences.push_enabled||!preferences.community_enabled)return[];
  const permission=await Notifications.getPermissionsAsync();
  if(!permission.granted)return[];
  const start=new Date(session.startsAt).getTime();
  if(!Number.isFinite(start)||start<=Date.now())return[];
  const reminders=[
    {enabled:preferences.reminder_24h,suffix:'24h',at:start-24*60*60*1000,title:'Your Clique session is tomorrow',body:`${session.title} starts tomorrow.`},
    {enabled:preferences.reminder_1h,suffix:'1h',at:start-60*60*1000,title:'Your Clique session starts in one hour',body:`${session.title} starts in one hour. Your circle is getting ready.`},
    {enabled:preferences.reminder_live,suffix:'live',at:start,title:'Your Clique is gathering now',body:`${session.title} is starting now. Open GWMB to join.`},
  ].filter(item=>item.enabled&&item.at>Date.now());
  const identifiers:string[]=[];
  for(const reminder of reminders){
    identifiers.push(await Notifications.scheduleNotificationAsync({content:{title:reminder.title,body:reminder.body,data:{route:'/cliques',cliqueSessionId:session.id},sound:'default'},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(reminder.at),channelId:Platform.OS==='android'?'gwmb-reminders':undefined},identifier:`gwmb-clique-${session.id}-${reminder.suffix}`}));
  }
  return identifiers;
}
