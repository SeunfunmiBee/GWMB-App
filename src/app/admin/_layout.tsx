import { router, Stack } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';
import { ScreenSkeleton } from '@/components/states/Skeleton';
import { useAuth } from '@/providers/AuthProvider';

export default function AdminLayout() {
  const { user, isAdmin, loading, accountLoading } = useAuth();

  if (loading || accountLoading) {
    return <Screen><ScreenSkeleton rows={4}/></Screen>;
  }

  if (!user || !isAdmin) {
    return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind="permission-denied" eyebrow="ADMIN ACCESS REQUIRED" title="This workspace is restricted." copy="Sign in with an approved GWMB administrator account to manage the app." actionLabel={user?'Return to My GWMB':'Sign in'} onAction={()=>router.replace(user?'/profile':'/sign-in')}/></Screen>;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="builder" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
    <Stack.Screen name="content-editor" options={{presentation:'modal',animation:'slide_from_bottom'}}/>
  </Stack>;
}
