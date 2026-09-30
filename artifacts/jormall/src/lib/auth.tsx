import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type SessionUser } from './api';

type AuthCtx = {
  user: SessionUser | null;
  isLoading: boolean;
  needsSetup: boolean;
  setUser: (user: SessionUser | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export const ME_KEY = ['auth', 'me'] as const;
export const SETUP_KEY = ['setup', 'status'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    const expire = () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' && q.queryKey[0] !== 'setup' });
    };
    window.addEventListener('jormall:session-expired', expire);
    return () => window.removeEventListener('jormall:session-expired', expire);
  }, [qc]);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        const res = await api<{ user: SessionUser }>('/auth/me');
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const setup = useQuery({
    queryKey: SETUP_KEY,
    queryFn: () => api<{ needsSetup: boolean }>('/setup/status'),
    enabled: me.data === null,
    staleTime: 60_000,
  });

  const logout = useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: async () => {
      await qc.cancelQueries();
      qc.setQueryData(ME_KEY, null);
      // Drop the previous user's cached data once the private screens have unmounted.
      setTimeout(() => qc.removeQueries({ predicate: (q) => !(q.queryKey[0] === 'auth' && q.queryKey[1] === 'me') && !(q.queryKey[0] === 'setup' && q.queryKey[1] === 'status') }), 0);
    },
  });

  const value: AuthCtx = {
    user: me.data ?? null,
    isLoading: me.isPending || (me.data === null && setup.isPending),
    needsSetup: setup.data?.needsSetup ?? false,
    setUser: (user) => {
      const previous = qc.getQueryData<SessionUser | null>(ME_KEY);
      if (previous?.id !== user?.id) qc.removeQueries({predicate:(q)=>!(q.queryKey[0] === 'auth' && q.queryKey[1] === 'me') && !(q.queryKey[0] === 'setup' && q.queryKey[1] === 'status')});
      qc.setQueryData(ME_KEY, user);
      if (user) { localStorage.removeItem(`jormall:concierge-later:${user.id}`); window.dispatchEvent(new Event('jormall:setup-pause-changed')); qc.setQueryData(SETUP_KEY, { needsSetup: false }); }
    },
    signOut: () => logout.mutateAsync(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function homePath(user: SessionUser): string {
  return user.role === 'platform_owner' ? '/clinics' : '/home';
}
