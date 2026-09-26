import type { UserRole } from "@workspace/db";

export const PERMISSION_AREAS = [
  "appointments",
  "customers",
  "employees",
  "services",
  "rooms",
  "inventory",
  "settings",
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type PermissionLevel = "read" | "manage";
export type Permission = `${PermissionArea}.${PermissionLevel}`;

export const ALL_PERMISSIONS: Permission[] = PERMISSION_AREAS.flatMap((a) => [
  `${a}.read` as Permission,
  `${a}.manage` as Permission,
]);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

/** Ready-made permission presets per role. Managers may adjust these per person. */
export const ROLE_PRESETS: Record<Exclude<UserRole, "platform_owner">, Permission[]> = {
  manager: [...ALL_PERMISSIONS],
  secretary: [
    "appointments.read",
    "appointments.manage",
    "customers.read",
    "customers.manage",
    "employees.read",
    "services.read",
    "rooms.read",
  ],
  // Providers have implicit assigned-appointment access. Explicit appointment permissions broaden it.
  // Existing saved permission arrays are intentionally not rewritten.
  doctor: ["customers.read", "inventory.read", "inventory.manage"],
  service_provider: ["customers.read", "inventory.read", "inventory.manage"],
  other_staff: ["appointments.read", "customers.read"],
};

/** Roles a clinic manager is allowed to create. Never platform_owner. */
export const CLINIC_STAFF_ROLES: UserRole[] = [
  "manager",
  "secretary",
  "doctor",
  "service_provider",
  "other_staff",
];

type UserLike = { role: UserRole; permissions: string[]; clinicId: number | null };

export function hasPermission(user: UserLike, permission: Permission): boolean {
  if (user.role === "platform_owner") return false; // owners do not operate inside clinics
  const [area] = permission.split(".") as [PermissionArea, PermissionLevel];
  if (user.permissions.includes(permission)) return true;
  // "manage" implies "read"
  return permission.endsWith(".read") && user.permissions.includes(`${area}.manage`);
}

export type HomeScreen = "owner" | "manager" | "secretary" | "doctor" | "provider" | "staff";

/** Which home screen a user lands on after sign-in. Single source of truth for routing. */
export function homeScreenFor(user: { role: UserRole }): HomeScreen {
  switch (user.role) {
    case "platform_owner":
      return "owner";
    case "manager":
      return "manager";
    case "secretary":
      return "secretary";
    case "doctor":
      return "doctor";
    case "service_provider":
      return "provider";
    default:
      return "staff";
  }
}

/** Navigation entries visible to a user. Sections are shown only when at least one area is permitted. */
export type NavKey = "home" | "appointments" | "people" | "business";

export function navFor(user: UserLike): NavKey[] {
  if (user.role === "platform_owner") return ["home"];
  const nav: NavKey[] = ["home"];
  if (hasPermission(user, "appointments.read") || user.role === "doctor" || user.role === "service_provider") nav.push("appointments");
  if (hasPermission(user, "customers.read") || hasPermission(user, "employees.read")) nav.push("people");
  if (
    hasPermission(user, "services.read") ||
    hasPermission(user, "rooms.read") ||
    hasPermission(user, "inventory.read") ||
    hasPermission(user, "settings.read")
  )
    nav.push("business");
  return nav;
}
