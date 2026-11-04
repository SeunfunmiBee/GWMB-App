import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export type LaunchFeatureKey = 'attendance_participation' | 'application_assistant' | 'clique_sessions' | 'one_to_one_mentorship';

type RuntimeFlag = { key: LaunchFeatureKey; enabled: boolean; beta_only: boolean };
type FeatureFlagContextValue = {
  loading: boolean;
  isBetaTester: boolean;
  access: (key: LaunchFeatureKey) => 'allowed' | 'disabled' | 'beta_only';
};

const defaults: Record<LaunchFeatureKey, RuntimeFlag> = {
  attendance_participation: { key: 'attendance_participation', enabled: false, beta_only: true },
  application_assistant: { key: 'application_assistant', enabled: false, beta_only: true },
  clique_sessions: { key: 'clique_sessions', enabled: false, beta_only: true },
  one_to_one_mentorship: { key: 'one_to_one_mentorship', enabled: false, beta_only: true },
};

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function FeatureFlagProvider({ children }: PropsWithChildren) {
  const { user, isAdmin } = useAuth();
  const [flags, setFlags] = useState<Record<LaunchFeatureKey, RuntimeFlag>>(defaults);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFlags(defaults);
      setIsBetaTester(false);
      const [flagResult, betaResult] = await Promise.all([
        supabase.from('feature_flags').select('key,enabled,beta_only'),
        user ? supabase.from('beta_testers').select('active').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;
      if (!flagResult.error) {
        const next = { ...defaults };
        for (const flag of flagResult.data ?? []) {
          if (flag.key in next) next[flag.key as LaunchFeatureKey] = flag as RuntimeFlag;
        }
        setFlags(next);
      }
      setIsBetaTester(betaResult.data?.active === true);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [user]);

  const value = useMemo<FeatureFlagContextValue>(() => ({
    loading,
    isBetaTester,
    access: (key) => {
      const flag = flags[key];
      if (!flag.enabled) return 'disabled';
      if (flag.beta_only && !isAdmin && !isBetaTester) return 'beta_only';
      return 'allowed';
    },
  }), [flags, isAdmin, isBetaTester, loading]);

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (!context) throw new Error('useFeatureFlags must be used inside FeatureFlagProvider.');
  return context;
}
