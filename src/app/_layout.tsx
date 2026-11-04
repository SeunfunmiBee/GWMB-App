import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useEffect } from 'react';

import { colors } from '@/theme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { AuthDeepLinkHandler } from '@/components/AuthDeepLinkHandler';
import { NotificationBridge } from '@/components/NotificationBridge';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { OperationalErrorBridge } from '@/components/OperationalErrorBridge';
import { FeatureAccessGate } from '@/components/FeatureAccessGate';
import { hasSeenWelcome } from '@/lib/first-launch';
import { FeatureFlagProvider, type LaunchFeatureKey, useFeatureFlags } from '@/providers/FeatureFlagProvider';
import { AppStateView } from '@/components/states/AppStateView';
import { Screen } from '@/components/Screen';
import { ConnectivityNotice, ConnectivityProvider, useConnectivity } from '@/providers/ConnectivityProvider';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 450, fade: true });

function AppNavigator() {
  const { loading, user, accountError, refreshAccount, sessionExpired, clearSessionExpired } = useAuth();
  const { offline } = useConnectivity();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const shouldShowWelcome = !user && !hasSeenWelcome() && pathname === '/';
    if (shouldShowWelcome) router.replace('/welcome');

    requestAnimationFrame(() => { void SplashScreen.hideAsync(); });
  }, [loading, pathname, user]);

  if (loading) return null;

  if (sessionExpired) return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind="session-expired" actionLabel="Sign in again" onAction={()=>{clearSessionExpired();router.replace('/sign-in');}} secondaryLabel="Return Home" onSecondary={()=>{clearSessionExpired();router.replace('/');}}/></Screen>;
  if (user && accountError && pathname !== '/support') return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind={offline?'offline':'error'} title={offline?'Reconnect to continue.':'We couldn’t load your account.'} copy={offline?'Your saved activity is safe. Connect to the internet and try again.':'Your account is safe. Check your connection and try again.'} actionLabel="Try again" onAction={()=>void refreshAccount()} secondaryLabel={offline?undefined:'Contact support'} onSecondary={offline?undefined:()=>router.push('/support')}/></Screen>;

  return <>
    <AuthDeepLinkHandler />
    <NotificationBridge />
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="membership" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="marketplace-journey" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="cliques" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="course/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="events" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="registration/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="reset-password" options={{ animation: 'slide_from_right' }} />
    </Stack>
  </>;
}

const protectedFeatures: { prefix: string; key: LaunchFeatureKey }[] = [
  { prefix: '/attendance', key: 'attendance_participation' },
  { prefix: '/application-profile', key: 'application_assistant' },
  { prefix: '/cliques', key: 'clique_sessions' },
  { prefix: '/mentorship-application', key: 'one_to_one_mentorship' },
];

function FeatureControlledNavigator() {
  const pathname = usePathname();
  const { loading, access } = useFeatureFlags();
  const feature = protectedFeatures.find(item => pathname.startsWith(item.prefix));
  const state = feature ? access(feature.key) : 'allowed';
  if (!loading && state !== 'allowed') return <FeatureAccessGate reason={state} />;
  return <AppNavigator />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <AppErrorBoundary><SafeAreaProvider><ConnectivityProvider><OperationalErrorBridge/>
      <AuthProvider><FeatureFlagProvider><FeatureControlledNavigator /></FeatureFlagProvider></AuthProvider>
      <ConnectivityNotice />
    </ConnectivityProvider></SafeAreaProvider></AppErrorBoundary>
  );
}
