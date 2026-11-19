import '@/lib/polyfills';

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
import { NotificationBridge } from '@/components/NotificationBridge';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { OperationalErrorBridge } from '@/components/OperationalErrorBridge';
import { hasSeenWelcome } from '@/lib/first-launch';
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
    else if (!user && needsAccount(pathname)) router.replace('/sign-up');

    requestAnimationFrame(() => { void SplashScreen.hideAsync(); });
  }, [loading, pathname, user]);

  if (loading) return null;

  if (sessionExpired) return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind="session-expired" actionLabel="Sign in again" onAction={()=>{clearSessionExpired();router.replace('/sign-in');}} secondaryLabel="Return Home" onSecondary={()=>{clearSessionExpired();router.replace('/');}}/></Screen>;
  if (user && accountError && pathname !== '/support') return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind={offline?'offline':'error'} title={offline?'Reconnect to continue.':'We couldn’t load your account.'} copy={offline?'Your saved activity is safe. Connect to the internet and try again.':'Your account is safe. Check your connection and try again.'} actionLabel="Try again" onAction={()=>void refreshAccount()} secondaryLabel={offline?undefined:'Contact support'} onSecondary={offline?undefined:()=>router.push('/support')}/></Screen>;

  return <>
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
    </Stack>
  </>;
}

// Personal screens. Guests who open one (from a card, a link or a notification) are sent to create an account.
const ACCOUNT_ROUTES = [
  '/activity', '/application', '/application-profile', '/attendance', '/calendar', '/career-readiness/my', '/career-readiness/review',
  '/certificate', '/chapter-admin', '/community-location', '/cv/build', '/cv/import', '/cv/my', '/cv/preview', '/cv/review',
  '/edit-profile', '/goal', '/membership-application', '/mentorship-application', '/mentorship/my', '/mentorship-session', '/notifications',
  '/privacy-center', '/registration', '/settings', '/support', '/verify-membership',
];
function needsAccount(pathname: string) {
  return ACCOUNT_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <AppErrorBoundary><SafeAreaProvider><ConnectivityProvider><OperationalErrorBridge/>
      <AuthProvider><AppNavigator /></AuthProvider>
      <ConnectivityNotice />
    </ConnectivityProvider></SafeAreaProvider></AppErrorBoundary>
  );
}
