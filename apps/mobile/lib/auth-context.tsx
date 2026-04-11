import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getUserContext } from '@omnilease/supabase';
import type { UserContext } from '@omnilease/shared';
import { supabase } from './supabase';

type AuthState =
  | { status: 'loading'; session: null; userContext: null }
  | { status: 'signed-out'; session: null; userContext: null }
  // Authenticated to Supabase but no row in public.users yet (needs onboarding).
  | { status: 'no-org'; session: Session; userContext: null }
  | { status: 'ready'; session: Session; userContext: UserContext };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    userContext: null,
  });

  // Resolve { session, userContext } from a fresh Supabase session. Pulled out
  // so it can be reused by both the bootstrap and the onAuthStateChange listener.
  async function hydrate(session: Session | null) {
    if (!session) {
      setState({ status: 'signed-out', session: null, userContext: null });
      return;
    }
    try {
      const userContext = await getUserContext(supabase);
      if (!userContext) {
        setState({ status: 'no-org', session, userContext: null });
        return;
      }
      setState({ status: 'ready', session, userContext });
    } catch (err) {
      // Fail loud in dev so we notice broken RLS / view drift.
      console.error('[auth] failed to load user_context', err);
      setState({ status: 'no-org', session, userContext: null });
    }
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void hydrate(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      void hydrate(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // hydrate() will fire via onAuthStateChange.
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
