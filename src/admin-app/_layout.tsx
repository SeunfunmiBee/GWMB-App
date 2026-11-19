// Root of the web-only admin build (appadmin.girlswhomeanbusiness.org). The mobile app never bundles this folder:
// app.config.js points Expo Router here only when APP_TARGET=admin.
import '@/lib/polyfills';
import '@/lib/web-alert';

import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AdminShell } from '@/components/admin/AdminShell';
import { AdminSignIn } from '@/components/admin/AdminSignIn';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import { ScreenSkeleton } from '@/components/states/Skeleton';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

function AdminGate() {
  const { user, isAdmin, loading, accountLoading, signOut } = useAuth();
  if (loading || accountLoading) return <Screen><ScreenSkeleton rows={4}/></Screen>;
  if (!user) return <AdminSignIn/>;
  if (!isAdmin) return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind="permission-denied" eyebrow="ADMIN ACCESS REQUIRED" title="This workspace is restricted." copy="This account is not a GWMB administrator. Sign in with an approved administrator account." actionLabel="Sign out" onAction={()=>void signOut()}/></Screen>;
  return <AdminShell><Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.canvas } }}/></AdminShell>;
}

export default function AdminRoot() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;
  return <AppErrorBoundary><SafeAreaProvider><AuthProvider><AdminGate/></AuthProvider></SafeAreaProvider></AppErrorBoundary>;
}
