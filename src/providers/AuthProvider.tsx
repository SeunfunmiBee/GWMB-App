import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiFetch, type AppSession, type AppUser, authClient, signOut as authSignOut, toAppUser } from '@/lib/auth';
import { resetLive } from '@/lib/live';
import type { ChapterAccess } from '@/lib/chapter-admin';
import type { Membership, Profile } from '@/types/database';

type AuthContextValue = {
  session: AppSession | null;
  user: AppUser | null;
  profile: Profile | null;
  membership: Membership | null;
  isAdmin: boolean;
  isChapterAdmin: boolean;
  chapterAdminAccess: ChapterAccess[];
  loading: boolean;
  accountLoading: boolean;
  accountError: string | null;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
};

type Account = { profile: Profile | null; membership: Membership | null; isAdmin: boolean; chapterAdminAccess: ChapterAccess[] };
const EMPTY_ACCOUNT: Account = { profile: null, membership: null, isAdmin: false, chapterAdminAccess: [] };

const AuthContext = createContext<AuthContextValue | null>(null);

type LoadedAccount = { userId: string; account: Account; error: string | null };

async function requestAccount(userId: string): Promise<LoadedAccount> {
  try {
    const next = await apiFetch<Account>('/v1/me');
    return { userId, account: { ...next, chapterAdminAccess: next.chapterAdminAccess ?? [] }, error: null };
  } catch (error) {
    return { userId, account: EMPTY_ACCOUNT, error: error instanceof Error ? error.message : 'Your account could not be loaded.' };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { data: sessionData, isPending } = authClient.useSession();
  const sessionUser = sessionData?.user;
  const user = useMemo(() => (sessionUser ? toAppUser(sessionUser) : null), [sessionUser]);
  const userId = user?.id ?? null;

  // Account data is keyed by the user it was loaded for, so a stale response never shows for another user.
  const [loaded, setLoaded] = useState<LoadedAccount | null>(null);
  useEffect(() => {
    if (isPending || !userId) return;
    let active = true;
    void requestAccount(userId).then((next) => { if (active) setLoaded(next); });
    return () => { active = false; };
  }, [isPending, userId]);
  const current = userId && loaded?.userId === userId ? loaded : null;

  // Realtime subscriptions follow the signed-in identity (personal topics need a fresh ticket).
  useEffect(() => { if (!isPending) resetLive(); }, [isPending, userId]);

  // A session that disappears without an intentional sign-out is reported as expired.
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  if (!isPending && userId !== lastUserId) {
    setLastUserId(userId);
    if (userId) setSessionExpired(false);
    else if (lastUserId) { setSessionExpired(!signingOut); setSigningOut(false); }
  }

  const refreshAccount = useCallback(async () => { if (userId) setLoaded(await requestAccount(userId)); }, [userId]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    await apiFetch('/v1/me/push-devices/deactivate', { method: 'POST' }).catch(() => undefined);
    const { error } = await authSignOut();
    if (error) { setSigningOut(false); throw new Error(error); }
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const account = current?.account ?? EMPTY_ACCOUNT;
  const value = useMemo<AuthContextValue>(() => ({
    session: user ? { user } : null,
    user,
    profile: account.profile,
    membership: account.membership,
    isAdmin: account.isAdmin,
    isChapterAdmin: account.chapterAdminAccess.length > 0,
    chapterAdminAccess: account.chapterAdminAccess,
    loading: isPending,
    accountLoading: isPending || (Boolean(userId) && !current),
    accountError: current?.error ?? null,
    sessionExpired,
    clearSessionExpired,
    refreshAccount,
    signOut,
  }), [account, clearSessionExpired, current, isPending, refreshAccount, sessionExpired, signOut, user, userId]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
