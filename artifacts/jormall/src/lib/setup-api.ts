import type { ServiceDefinition } from '@workspace/service-definition';
import type { SessionUser, UserRole } from './api';
export type Resource = 'branches' | 'services' | 'rooms' | 'employees' | 'customers';
export const AREA: Record<Resource, string> = { branches: 'settings', services: 'services', rooms: 'rooms', employees: 'employees', customers: 'customers' };
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = typeof DAYS[number];
export type Range = { open: string; close: string };
export type Week = Record<Day, Range[]>;
export type TimeOff = { startsAt: string; endsAt: string; note: string };
export const emptyWeek = (): Week => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
export type StaffRole = Exclude<UserRole, 'platform_owner'>;
export const STAFF_ROLES: StaffRole[] = ['manager', 'secretary', 'doctor', 'service_provider', 'other_staff'];
export const CATEGORIES = ['Hair', 'Nails', 'Skin', 'Laser', 'Massage', 'Makeup', 'Other'] as const;
export const PERMISSION_AREAS = ['appointments', 'customers', 'employees', 'services', 'rooms', 'inventory', 'settings'];
export function can(user: SessionUser | null, permission: string): boolean {
  return Boolean(user && user.role !== 'platform_owner' && (user.permissions.includes(permission) || (permission.endsWith('.read') && user.permissions.includes(permission.replace(/\.read$/, '.manage')))));
}
export type Option = { id: number; name: string; nameLang: 'en' | 'ar'; branchId?: number | null; timeZone?: string; openingHours?: Week; isActive?: boolean; definition?: ServiceDefinition | null; requiredEquipment?: string[] };
export type Options = { branches: Option[]; services: Option[]; employees: Option[]; timeZones: string[]; currencies: string[]; grantablePermissions: string[]; rolePresets: Partial<Record<StaffRole, string[]>> };
export type RecordItem = Option & {
  address?: string | null; mapUrl?: string | null;
  definition?: ServiceDefinition | null;
  phone?: string | null; email?: string | null; notes?: string; sensitiveNotes?: string; historyAvailable?: boolean;
  role?: StaffRole; jobTitle?: string | null; permissions?: string[]; canEditAccess?: boolean;
  mustChangePassword?: boolean; workingHours?: Week; breaks?: Week; timeOff?: TimeOff[];
  timeZone?: string; openingHours?: Week; durationMinutes?: number; price?: string;
  currency?: string; category?: typeof CATEGORIES[number]; requiresRoom?: boolean;
  requiredEquipment?: string[]; extra?: {equipment?: string[]};
  followUpEnabled?: boolean;
  employeeIds?: number[]; serviceIds?: number[]; capacity?: number; status?: 'available' | 'maintenance';
};
export type ListResult = { items: RecordItem[]; total: number; page: number; pageSize: number; summary?: { total: number; active: number; doctors: number; roles: Record<string,number> } };
export const recordPath = (resource: Resource) => `/clinic/${resource}`;
export const sectionPath = (resource: Resource) => `${resource === 'employees' || resource === 'customers' ? '/people' : '/business'}/${resource === 'branches' ? 'settings' : resource}`;
