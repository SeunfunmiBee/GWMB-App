import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadUnreadNotificationCount } from '@/lib/notification-store';
import { supabase } from '@/lib/supabase';

export function useUnreadNotifications(userId?:string){
  const[count,setCount]=useState(0);
  useFocusEffect(useCallback(()=>{
    let active=true;
    if(!userId){setCount(0);return()=>{active=false}}
    const refresh=()=>{void loadUnreadNotificationCount(userId).then(result=>{if(active&&!result.error)setCount(result.count)})};
    refresh();
    const channel=supabase.channel(`notifications:${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'user_notifications',filter:`user_id=eq.${userId}`},refresh).subscribe();
    return()=>{active=false;void supabase.removeChannel(channel)};
  },[userId]));
  return count;
}
