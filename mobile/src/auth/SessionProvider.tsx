import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { configureApiAuth } from '@/api/client';
import { authApi } from '@/api/endpoints';
import type { User } from '@/api/types';
import { loadApiBaseUrlOverride } from '@/config';
import { tokenStorage, type StoredSession } from './tokenStorage';

interface SessionContextValue {
  status: 'restoring' | 'signedOut' | 'signedIn';
  user: User | null;
  /** Demo sign-in. Production uses OIDC Authorization Code + PKCE against the corporate IdP. */
  signInAsPersona: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    setSession(null);
    await tokenStorage.clear();
    // Cached prices belong to the previous user's scope - never show them to the next one.
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    configureApiAuth({ getToken: () => tokenRef.current, onUnauthorized: () => void signOut() });
  }, [signOut]);

  useEffect(() => {
    loadApiBaseUrlOverride()
      .catch(() => {})
      .then(() => tokenStorage.load())
      .then((stored) => {
        if (stored) {
          tokenRef.current = stored.accessToken;
          setSession(stored);
        } else {
          queryClient.clear(); // expired session: drop any offline cache from it
        }
      })
      .finally(() => setRestoring(false));
  }, [queryClient]);

  const signInAsPersona = useCallback(async (userId: string) => {
    const { accessToken, user } = await authApi.devLogin(userId);
    const next = { accessToken, user };
    tokenRef.current = accessToken;
    await tokenStorage.save(next);
    setSession(next);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: restoring ? 'restoring' : session ? 'signedIn' : 'signedOut',
      user: session?.user ?? null,
      signInAsPersona,
      signOut,
    }),
    [restoring, session, signInAsPersona, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The signed-in user; only call from screens behind the auth guard. */
export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('No signed-in user');
  return user;
}
