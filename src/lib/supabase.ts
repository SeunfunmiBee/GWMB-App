import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const backendNetworkSetting=process.env.EXPO_PUBLIC_BACKEND_NETWORK_ENABLED;
export const backendNetworkEnabled=backendNetworkSetting?backendNetworkSetting==='true':!__DEV__;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase configuration is missing. Check .env.local.');
}

const networkFailurePattern=/failed to fetch|network request failed|networkerror|load failed|internet connection appears to be offline/i;
function unavailableResponse(){return new Response(JSON.stringify({message:'The GWMB service is temporarily unreachable.',code:'NETWORK_UNAVAILABLE'}),{status:503,headers:{'Content-Type':'application/json'}})}
const supabaseFetch:typeof fetch=async(input,init)=>{
  if(!backendNetworkEnabled)return unavailableResponse();
  try{
    return await fetch(input,init);
  }catch(error){
    const message=error instanceof Error?`${error.name}: ${error.message}`:String(error);
    if(!networkFailurePattern.test(message))throw error;
    // Supabase normally converts HTTP failures into typed result errors. Browsers,
    // however, reject outright for DNS/offline failures; converting only that case
    // to a 503 keeps the app in its normal error-state path instead of Expo's redbox.
    return unavailableResponse();
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global:{fetch:supabaseFetch},
  auth: {
    storage: localStorage,
    autoRefreshToken: backendNetworkEnabled,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
