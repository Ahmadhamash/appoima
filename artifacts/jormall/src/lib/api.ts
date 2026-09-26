export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public issues?: { path: string; code: string; message: string }[],
  ) {
    super(code);
  }
}

const API_BASE = '/api';

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; issues?: ApiError['issues'] };
    if (res.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      window.dispatchEvent(new Event('jormall:session-expired'));
    }
    throw new ApiError(res.status, body.error ?? 'internal', body.issues);
  }
  return data as T;
}

// ---- Shared API types (mirror the server's response shapes) ---------------

export type UserRole =
  | 'platform_owner'
  | 'manager'
  | 'secretary'
  | 'doctor'
  | 'service_provider'
  | 'other_staff';

export type HomeScreen = 'owner' | 'manager' | 'secretary' | 'doctor' | 'provider' | 'staff';
export type NavKey = 'home' | 'appointments' | 'people' | 'business';

export type SessionUser = {
  id: number;
  clinicId: number | null;
  branchId: number | null;
  email: string;
  name: string;
  nameLang: 'en' | 'ar';
  role: UserRole;
  permissions: string[];
  mustChangePassword: boolean;
  home: HomeScreen;
  nav: NavKey[];
};

export type ClinicProgress = {
  hasManager: boolean;
  hasBranch: boolean;
  staffCount: number;
  branchCount: number;
  hasBranchHours: boolean;
  hasCatalog: boolean;
  hasStaff: boolean;
  hasFirstAppointment: boolean;
};

export type ClinicOverview = {
  id: number;
  name: string;
  nameLang: 'en' | 'ar';
  status: 'active' | 'inactive';
  createdAt: string;
  manager: { id: number; name: string; email: string } | null;
  progress: ClinicProgress;
};

export type MyClinic = {
  id: number;
  name: string;
  nameLang: 'en' | 'ar';
  status: 'active' | 'inactive';
  progress?: ClinicProgress;
};
