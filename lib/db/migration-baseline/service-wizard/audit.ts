import { pgTable, serial, text, timestamp, integer, jsonb, index, json } from "drizzle-orm/pg-core";

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id"),
    actorUserId: integer("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_clinic_idx").on(t.clinicId)],
);

// Session store table used by connect-pg-simple.
export const sessionTable = pgTable(
  "session",
  {
    sid: text("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);
