import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { subscribeLive } from '@/lib/live';
import { loadUnreadNotificationCount } from '@/lib/notification-store';

/** Unread badge count: refreshed on focus and whenever the server reports a notification change. */
export function useUnreadNotifications(userId?:string){
  const[count,setCount]=useState(0);
  useFocusEffect(useCallback(()=>{
    let active=true;
    if(!userId){setCount(0);return()=>{active=false}}
    const refresh=()=>{void loadUnreadNotificationCount(userId).then(result=>{if(active&&!result.error)setCount(result.count)})};
    refresh();
    const stop=subscribeLive('notifications',refresh);
    return()=>{active=false;stop()};
  },[userId]));
  return count;
}
