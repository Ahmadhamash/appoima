import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, clinicsTable, auditEventsTable, branchesTable, servicesTable, roomsTable, customersTable, appointmentsTable, schedulingCommandsTable } from "@workspace/db";
import app from "../app";
import { hashPassword } from "../services/auth";

export const agent = () => request.agent(app);

const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function uniqueEmail(prefix: string) {
  return `${prefix}-${tag()}@test.jormall.local`;
}

export class Fixture {
  userIds: number[] = [];
  clinicIds: number[] = [];

  async createClinic(name = `Test clinic ${tag()}`) {
    const [clinic] = await db.insert(clinicsTable).values({ name, nameLang: "en" }).returning();
    this.clinicIds.push(clinic!.id);
    return clinic!;
  }

  async createUser(input: {
    clinicId: number | null;
    role: "platform_owner" | "manager" | "secretary" | "doctor" | "service_provider" | "other_staff";
    permissions?: string[];
    password?: string;
    mustChangePassword?: boolean;
  }) {
    const password = input.password ?? "initial-pass-123";
    const email = uniqueEmail(input.role);
    const [user] = await db
      .insert(usersTable)
      .values({
        clinicId: input.clinicId,
        email,
        name: `Test ${input.role}`,
        passwordHash: await hashPassword(password),
        role: input.role,
        permissions: input.permissions ?? [],
        mustChangePassword: input.mustChangePassword ?? false,
      })
      .returning();
    this.userIds.push(user!.id);
    return { ...user!, password };
  }

  async cleanup() {
    // Scheduling references staff/customer records; remove fixture appointments before those records.
    if (this.clinicIds.length) {
      await db.delete(appointmentsTable).where(inArray(appointmentsTable.clinicId, this.clinicIds));
      await db.delete(schedulingCommandsTable).where(inArray(schedulingCommandsTable.clinicId, this.clinicIds));
    }
    if (this.userIds.length) {
      await db.delete(auditEventsTable).where(inArray(auditEventsTable.actorUserId, this.userIds));
      await db.delete(usersTable).where(inArray(usersTable.id, this.userIds));
    }
    if (this.clinicIds.length) {
      await db.delete(auditEventsTable).where(inArray(auditEventsTable.clinicId, this.clinicIds));
      await db.delete(usersTable).where(inArray(usersTable.clinicId, this.clinicIds));
      await db.delete(roomsTable).where(inArray(roomsTable.clinicId, this.clinicIds));
      await db.delete(servicesTable).where(inArray(servicesTable.clinicId, this.clinicIds));
      await db.delete(customersTable).where(inArray(customersTable.clinicId, this.clinicIds));
      await db.delete(branchesTable).where(inArray(branchesTable.clinicId, this.clinicIds));
      await db.delete(clinicsTable).where(inArray(clinicsTable.id, this.clinicIds));
    }
  }

  /** Track a user created through the API so cleanup removes it. */
  async trackUserByEmail(email: string) {
    const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
    if (u) this.userIds.push(u.id);
  }
}

export async function login(a: ReturnType<typeof agent>, email: string, password: string) {
  return a.post("/api/auth/login").send({ email, password });
}
