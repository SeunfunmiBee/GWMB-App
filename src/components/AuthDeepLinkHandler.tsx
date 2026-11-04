import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { completeWelcome } from '@/lib/first-launch';

async function handleAuthUrl(url: string) {
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.split('?')[1] : '';
  const params = new URLSearchParams([query, hash].filter(Boolean).join('&'));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const authorizationCode = params.get('code');
  const type = params.get('type');

  const result = accessToken && refreshToken
    ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    : authorizationCode
      ? await supabase.auth.exchangeCodeForSession(authorizationCode)
      : null;

  if (!result) return;
  const { error } = result;
  if (error) return;
  completeWelcome();
  const recovery = type === 'recovery' || url.includes('reset-password');
  router.replace(recovery ? '/reset-password' : '/');
}

export function AuthDeepLinkHandler() {
  useEffect(() => {
    void Linking.getInitialURL().then(url => { if (url) void handleAuthUrl(url); });
    const listener = Linking.addEventListener('url', ({ url }) => { void handleAuthUrl(url); });
    return () => listener.remove();
  }, []);
  return null;
}
