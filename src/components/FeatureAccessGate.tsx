import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppStateView } from '@/components/states/AppStateView';

export function FeatureAccessGate({ reason }: { reason: 'disabled' | 'beta_only' }) {
  const beta = reason === 'beta_only';
  return <Screen scroll={false} contentContainerStyle={{justifyContent:'center'}}><AppStateView kind="permission-denied" eyebrow={beta?'CLOSED BETA':'TEMPORARILY UNAVAILABLE'} title={beta?'This experience is being tested.':'We’re making this experience better.'} copy={beta?'It is currently available to invited beta testers. You can still use the rest of GWMB.':'This feature has been paused by the GWMB team. Please check back soon.'} actionLabel="Return Home" onAction={()=>router.replace('/')}/></Screen>;
}
