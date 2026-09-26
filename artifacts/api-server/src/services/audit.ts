import { db, auditEventsTable } from "@workspace/db";

/** Either the shared db or a transaction handle; both expose the same query builder. */
export type DbExecutor = Pick<typeof db, "insert" | "select" | "update">;

export async function recordAudit(
  input: {
    clinicId?: number | null;
    actorUserId?: number | null;
    action: string;
    entityType?: string;
    entityId?: number;
    details?: Record<string, unknown>;
  },
  executor: DbExecutor = db,
) {
  await executor.insert(auditEventsTable).values({
    clinicId: input.clinicId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    details: input.details,
  });
}
