import type { Session, User } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { backendNetworkEnabled, supabase } from '@/lib/supabase';
import type { ChapterAccess } from '@/lib/chapter-admin';
import type { Membership, Profile } from '@/types/database';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chapterAdminAccess, setChapterAdminAccess] = useState<ChapterAccess[]>([]);
  const [loading, setLoading] = useState(backendNetworkEnabled);
  const [accountLoading, setAccountLoading] = useState(backendNetworkEnabled);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const accountRequest = useRef(0);
  const hadSession = useRef(false);
  const intentionalSignOut = useRef(false);

  const loadAccount = useCallback(async (userId?: string) => {
    const request = ++accountRequest.current;
    setAccountLoading(true);
    if (!userId) {
      setProfile(null);
      setMembership(null);
      setIsAdmin(false);
      setChapterAdminAccess([]);
      setAccountError(null);
      setAccountLoading(false);
      return;
    }
    try {
      const [profileResult, membershipResult, adminResult,chapterResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('memberships').select('*').eq('user_id', userId).maybeSingle(),
        supabase.rpc('is_app_admin'),
        supabase.rpc('get_my_chapter_admin_access'),
      ]);
      if (request !== accountRequest.current) return;
      const error = profileResult.error ?? membershipResult.error ?? adminResult.error ?? chapterResult.error;
      if (error) throw error;
      setProfile(profileResult.data as Profile | null);
      setMembership(membershipResult.data as Membership | null);
      setIsAdmin(adminResult.data === true);
      setChapterAdminAccess((chapterResult.data??[]) as ChapterAccess[]);
      setAccountError(null);
    } catch (error) {
      if (request !== accountRequest.current) return;
      setProfile(null);
      setMembership(null);
      setIsAdmin(false);
      setChapterAdminAccess([]);
      setAccountError(error instanceof Error?error.message:'Your account could not be loaded.');
    } finally {
      if (request === accountRequest.current) setAccountLoading(false);
    }
  }, []);

  const refreshAccount = useCallback(async () => loadAccount(session?.user.id), [loadAccount, session?.user.id]);

  useEffect(() => {
    let mounted = true;
    if(!backendNetworkEnabled){
      return()=>{mounted=false;};
    }
    void (async()=>{
      try{
        const{data,error}=await supabase.auth.getSession();
        if(error)throw error;
        if(!mounted)return;
        hadSession.current=Boolean(data.session);
        setSession(data.session);
        await loadAccount(data.session?.user.id);
      }catch{
        // Public routes, including Welcome, must remain usable during an outage.
        if(mounted){setSession(null);setAccountLoading(false);}
      }finally{
        if(mounted)setLoading(false);
      }
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT' && hadSession.current && !intentionalSignOut.current) setSessionExpired(true);
      if (nextSession) { hadSession.current = true; setSessionExpired(false); }
      if (event === 'SIGNED_OUT') hadSession.current = false;
      intentionalSignOut.current = false;
      setSession(nextSession);
      void loadAccount(nextSession?.user.id);
      setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadAccount]);

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true;
    await supabase.rpc('deactivate_my_push_devices');
    const { error } = await supabase.auth.signOut();
    if (error) { intentionalSignOut.current = false; throw error; }
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo<AuthContextValue>(() => ({ session, user: session?.user ?? null, profile, membership, isAdmin, isChapterAdmin:chapterAdminAccess.length>0,chapterAdminAccess,loading, accountLoading, accountError, sessionExpired, clearSessionExpired, refreshAccount, signOut }), [accountError, accountLoading, chapterAdminAccess,clearSessionExpired,isAdmin, loading, membership, profile, refreshAccount, session, sessionExpired, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
