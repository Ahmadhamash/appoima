import { activeBranch, activeEmployee } from './branch-scope';
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db, usersTable, clinicsTable, type User, type UserRole } from "@workspace/db";
import { homeScreenFor, navFor, ROLE_PRESETS, isPermission } from "../domain/permissions";
import { conflict, unauthorized, badRequest } from "../lib/errors";
import { recordAudit, type DbExecutor } from "./audit";

const BCRYPT_ROUNDS = 12;
/** Arbitrary constant key for the platform-setup advisory lock. */
const SETUP_LOCK_KEY = 7_140_001;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Public shape of a signed-in user. Never includes the password hash. */
export function toSessionUser(user: User) {
  return {
    id: user.id,
    clinicId: user.clinicId,
    branchId: user.branchId,
    email: user.email,
    name: user.name,
    nameLang: user.nameLang,
    role: user.role,
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
    home: homeScreenFor(user),
    nav: navFor(user),
  };
}
export type SessionUser = ReturnType<typeof toSessionUser>;

export async function platformOwnerExists() {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "platform_owner"))
    .limit(1);
  return Boolean(row);
}

/** First-run setup: creates the single JorMall platform owner. Refuses if one already exists. */
export async function createPlatformOwner(input: { name: string; email: string; password: string }) {
  return db.transaction(async (tx) => {
    // Serialise concurrent first-run setup requests so only one can become the owner.
    await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);
    const [existing] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "platform_owner"))
      .limit(1);
    if (existing) throw conflict("setup_already_done");
    try {
      const [user] = await tx
        .insert(usersTable)
        .values({
          clinicId: null,
          email: input.email.toLowerCase(),
          name: input.name,
          passwordHash: await hashPassword(input.password),
          role: "platform_owner",
          permissions: [],
          mustChangePassword: false,
        })
        .returning();
      return user!;
    } catch (err) {
      if (isUniqueViolation(err, "users_email_unique")) throw conflict("email_taken");
      throw err;
    }
  });
}

function isUniqueViolation(err: unknown, constraint: string) {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  const name = e?.constraint ?? e?.cause?.constraint;
  return code === "23505" && name === constraint;
}

/** A user may sign in only if their own account and (for clinic staff) their clinic are active. */
export async function isUserUsable(user: User) {
  if (!user.isActive) return false;
  if (user.clinicId === null) return true;
  const [clinic] = await db
    .select({ status: clinicsTable.status })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, user.clinicId))
    .limit(1);
  return clinic?.status === "active";
}

export async function authenticate(email: string, password: string): Promise<User> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);
  // Constant-ish time: still run compare against a dummy hash when no user.
  const ok = user ? await verifyPassword(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !ok || !(await isUserUsable(user))) throw unauthorized("invalid_credentials");
  return user;
}
// Real hash of a throwaway value so failed lookups cost the same as failed passwords.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user ?? null;
}

export async function changeOwnPassword(user: User, currentPassword: string, newPassword: string) {
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw badRequest("current_password_wrong");
  if (currentPassword === newPassword) throw badRequest("password_unchanged");
  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(usersTable.id, user.id));
  await recordAudit({ clinicId: user.clinicId, actorUserId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id });
}

/**
 * Create a staff account inside a clinic with an initial password. The plain password is hashed
 * immediately and never stored or returned. Used by the owner (managers) and by managers (staff).
 */
export async function createStaffAccount(input: {
  clinicId: number;
  name: string;
  email: string;
  initialPassword: string;
  nameLang?: "en" | "ar";
  role: Exclude<UserRole, "platform_owner">;
  permissions?: string[];
  phone?: string | null;
  jobTitle?: string | null;
  branchId?: number | null;
  actorUserId: number;
}, executor: DbExecutor = db) {
  const permissions = (input.permissions ?? ROLE_PRESETS[input.role]).filter(isPermission);
  const [existing] = await executor
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, input.email.toLowerCase()))
    .limit(1);
  if (existing) throw conflict("email_taken");
  const [user] = await executor
    .insert(usersTable)
    .values({
      clinicId: input.clinicId,
      branchId: input.branchId ?? null,
      email: input.email.toLowerCase(),
      name: input.name,
      nameLang: input.nameLang ?? "en",
      phone: input.phone ?? null,
      jobTitle: input.jobTitle ?? null,
      passwordHash: await hashPassword(input.initialPassword),
      role: input.role,
      permissions,
      mustChangePassword: true,
    })
    .returning();
  await recordAudit({
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: "user.created",
    entityType: "user",
    entityId: user!.id,
    details: { role: input.role },
  }, executor);
  return user!;
}

export async function findClinicManagers(clinicId: number) {
  return db
    .select()
    .from(usersTable)
    .where(and(and(eq(usersTable.clinicId, clinicId), activeEmployee()), eq(usersTable.role, "manager")));
}
