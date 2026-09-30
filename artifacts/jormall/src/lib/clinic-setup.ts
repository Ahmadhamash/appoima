import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type MyClinic } from './api';
import { useAuth } from './auth';
import { useManagerBranch } from './manager-branch';
import type { Bootstrap } from '@/components/concierge/contract';

export const clinicSetupKey = (userId?: number) => ['clinic-setup', userId] as const;
export const setupPauseKey = (userId: number) => `jormall:concierge-later:${userId}`;
export const SETUP_PATH = '/clinic-setup';
export const isClinicSetupPath = (path: string) => path === SETUP_PATH;

function hasPendingSetup(userId?: number) {
  if (!userId) return false;
  try {
    const saved = localStorage.getItem(`jormall:concierge-checkpoint:${userId}`);
    if (!saved) return false;
    const checkpoint = JSON.parse(saved) as { serviceWizard?: boolean; stage?: string };
    return checkpoint.stage !== 'complete';
  } catch { return false; }
}

export function useClinicSetup() {
  const { user } = useAuth();
  const branch = useManagerBranch();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const sync = () => setPaused(!!user && !!localStorage.getItem(setupPauseKey(user.id)));
    sync();
    window.addEventListener('jormall:setup-pause-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jormall:setup-pause-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [user?.id]);
  const enabled = user?.role === 'manager' && !user.mustChangePassword && user.permissions.includes('settings.manage');
  const query = useQuery({
    queryKey: clinicSetupKey(user?.id),
    enabled,
    queryFn: () => api<Bootstrap>('/concierge/bootstrap'),
    staleTime: 30_000,
    retry: false,
    retryOnMount: false,
  });
  const session = query.data?.session;
  const clinic = useQuery({
    queryKey: ['clinic-setup-progress', user?.id], enabled,
    queryFn: () => api<{ clinic: MyClinic }>('/me/clinic'),
    staleTime: 30_000, retry: false, retryOnMount: false,
  });
  const progress = clinic.data?.clinic?.progress;
  const configured = !!progress?.hasBranchHours && !!progress.hasCatalog;
  const required = !!enabled && (query.isError || clinic.isError || (session ? session.stage !== 'complete' || !configured : !configured || branch.branches.length === 0 || hasPendingSetup(user?.id)));
  return { ...query, enabled, required, paused, loading: !!enabled && (query.isPending || clinic.isPending || branch.loading) };
}
