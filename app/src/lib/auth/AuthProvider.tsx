import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearDraft } from '@/features/onboarding/draft';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  // True until the stored session has been read
  initializing: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      signOut: async () => {
        const userId = session?.user.id;
        await supabase.auth.signOut();
        if (userId) clearDraft(userId);
        queryClient.clear();
      },
    }),
    [session, initializing, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// For screens rendered behind the auth guard
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId requires a session');
  return session.user.id;
}
