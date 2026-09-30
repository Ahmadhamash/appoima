import { appointmentsTable } from "@workspace/db";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, clinicsTable, branchesTable, usersTable, servicesTable, roomsTable, roomServicesTable, type Clinic } from "@workspace/db";
import { hasOpenHours } from "../domain/setup-rules";
import { roomHasEquipment } from "../domain/equipment";
import { notFound } from "../lib/errors";
import { recordAudit } from "./audit";
import { createStaffAccount } from "./auth";

export type ClinicSetupProgress = {
  hasManager: boolean;
  hasBranch: boolean;
  staffCount: number;
  branchCount: number;
  hasBranchHours: boolean;
  hasCatalog: boolean;
  hasStaff: boolean;
  hasFirstAppointment: boolean;
};

export type ClinicOverview = Clinic & {
  manager: { id: number; name: string; email: string } | null;
  progress: ClinicSetupProgress;
};

async function buildOverview(clinic: Clinic): Promise<ClinicOverview> {
  const [manager] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinic.id), eq(usersTable.role, "manager"), eq(usersTable.isActive, true)))
    .orderBy(usersTable.id)
    .limit(1);
  const [staff] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.clinicId, clinic.id));
  const [branches] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(branchesTable)
    .where(eq(branchesTable.clinicId, clinic.id));
  const branchRows = await db.select({ openingHours: branchesTable.openingHours }).from(branchesTable).where(eq(branchesTable.clinicId, clinic.id));
  const services = await db.select({ id: servicesTable.id, requiresRoom: servicesTable.requiresRoom, requiredEquipment: servicesTable.requiredEquipment }).from(servicesTable).where(and(eq(servicesTable.clinicId, clinic.id), eq(servicesTable.isActive, true)));
  const compatible = await db.select({ serviceId: roomServicesTable.serviceId, equipment: roomsTable.extra }).from(roomServicesTable).innerJoin(roomsTable, and(eq(roomsTable.id, roomServicesTable.roomId), eq(roomsTable.clinicId, clinic.id))).where(and(eq(roomServicesTable.clinicId, clinic.id), eq(roomsTable.status, "available")));
  const [activeStaff] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(and(eq(usersTable.clinicId, clinic.id), eq(usersTable.isActive, true), sql`${usersTable.role} <> 'manager'`));
  const branchCount = branches?.count ?? 0;
  return {
    ...clinic,
    manager: manager ?? null,
    progress: {
      hasManager: Boolean(manager),
      hasBranch: branchCount > 0,
      staffCount: staff?.count ?? 0,
      branchCount,
      hasBranchHours: branchRows.length > 0 && branchRows.every((b) => hasOpenHours(b.openingHours)),
      hasCatalog: services.length > 0 && services.every((s) => !(s.requiresRoom || s.requiredEquipment.length) || compatible.some((r) => r.serviceId === s.id && roomHasEquipment(s.requiredEquipment, r.equipment['equipment']))),
      hasStaff: (activeStaff?.count ?? 0) > 0,
      // Booking progress reflects committed appointment records.
      hasFirstAppointment: (await db.select({id: appointmentsTable.id}).from(appointmentsTable).where(eq(appointmentsTable.clinicId, clinic.id)).limit(1)).length > 0,
    },
  };
}

export async function listClinics(search?: string): Promise<ClinicOverview[]> {
  const rows = await db
    .select()
    .from(clinicsTable)
    .where(search ? ilike(clinicsTable.name, `%${search}%`) : undefined)
    .orderBy(desc(clinicsTable.createdAt))
    .limit(200);
  return Promise.all(rows.map(buildOverview));
}

export async function getClinic(id: number): Promise<ClinicOverview> {
  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, id)).limit(1);
  if (!clinic) throw notFound("clinic_not_found");
  return buildOverview(clinic);
}

/** Creates a clinic and, optionally, its first manager in one transaction: no orphan clinics. */
export async function createClinic(input: {
  name: string;
  nameLang: "en" | "ar";
  actorUserId: number;
  manager?: { name: string; email: string; initialPassword: string };
}) {
  return db.transaction(async (tx) => {
    const [clinic] = await tx
      .insert(clinicsTable)
      .values({ name: input.name, nameLang: input.nameLang })
      .returning();
    await recordAudit(
      { clinicId: clinic!.id, actorUserId: input.actorUserId, action: "clinic.created", entityType: "clinic", entityId: clinic!.id },
      tx,
    );
    if (input.manager) {
      await createStaffAccount(
        { clinicId: clinic!.id, ...input.manager, role: "manager", actorUserId: input.actorUserId },
        tx,
      );
    }
    return clinic!;
  });
}

export async function setClinicStatus(id: number, status: "active" | "inactive", actorUserId: number) {
  const [clinic] = await db.update(clinicsTable).set({ status }).where(eq(clinicsTable.id, id)).returning();
  if (!clinic) throw notFound("clinic_not_found");
  await recordAudit({ clinicId: id, actorUserId, action: "clinic.status_changed", entityType: "clinic", entityId: id, details: { status } });
  return clinic;
}
