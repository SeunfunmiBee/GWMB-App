import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { loadNotificationPreferences, registerPushDevice } from '@/lib/notification-store';
import { logAppError } from '@/lib/launch-operations';
import { useAuth } from '@/providers/AuthProvider';

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:true})});

export function NotificationBridge(){
  const{user}=useAuth();
  useEffect(()=>{if(!user)return;loadNotificationPreferences(user.id).then(({preferences})=>{if(preferences.push_enabled)void registerPushDevice(user.id,false)})},[user]);
  useEffect(()=>{
    let active=true;
    const openResponse=async(response:Notifications.NotificationResponse|null)=>{
      if(!response||response.actionIdentifier!==Notifications.DEFAULT_ACTION_IDENTIFIER)return;
      const route=response.notification.request.content.data?.route;
      if(typeof route==='string'&&route.startsWith('/')&&!route.startsWith('//')){
        router.push(route as never);
        await Notifications.clearLastNotificationResponseAsync();
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(response=>active?openResponse(response):undefined).catch(error=>logAppError('notification-cold-start',error));
    const subscription=Notifications.addNotificationResponseReceivedListener(response=>{void openResponse(response).catch(error=>logAppError('notification-open',error))});
    return()=>{active=false;subscription.remove()};
  },[]);
  return null;
}
