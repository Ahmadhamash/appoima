import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  jsonb,
  timestamp,
  boolean,
  unique,
  uniqueIndex,
  foreignKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { customersTable, servicesTable } from "./setup";
import { usersTable } from "./users";
import { appointmentsTable } from "./scheduling";

export type PackageItem = { serviceId: number; name: string; quantity: number };
export type PaymentPlan = {
  policy: "warning" | "minimum" | "full";
  initialPayment: string;
  installmentAmount: string;
  everySessions: number;
  minimumPerSession: string;
  allowManagerOverride: boolean;
};
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const packageTemplatesTable = pgTable(
  "package_templates",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinicsTable.id),
    name: text("name").notNull(),
    items: jsonb("items").$type<PackageItem[]>().notNull(),
    originalPrice: numeric("original_price", {
      precision: 12,
      scale: 3,
    }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    intervalDays: integer("interval_days").notNull().default(7),
    expiryDays: integer("expiry_days"),
    plan: jsonb("plan").$type<PaymentPlan>().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("package_templates_clinic_id_unique").on(t.clinicId, t.id),
    foreignKey({
      columns: [t.clinicId, t.createdBy],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
    check(
      "package_templates_price_check",
      sql`${t.originalPrice} >= 0 AND ${t.discount} BETWEEN 0 AND ${t.originalPrice} AND ${t.originalPrice} <> 'NaN'::numeric`,
    ),
  ],
);
export const billingInvoicesTable = pgTable(
  "billing_invoices",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id")
      .notNull()
      .references(() => clinicsTable.id),
    customerId: integer("customer_id").notNull(),
    appointmentId: integer("appointment_id"),
    name: text("name").notNull(),
    originalPrice: numeric("original_price", {
      precision: 12,
      scale: 3,
    }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    depositPolicy: text("deposit_policy")
      .$type<"refundable" | "non_refundable" | "wallet">()
      .notNull()
      .default("refundable"),
    createdBy: integer("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("billing_invoices_clinic_id_unique").on(t.clinicId, t.id),
    unique("billing_invoices_patient_context_unique").on(
      t.clinicId,
      t.customerId,
      t.id,
    ),
    uniqueIndex("billing_invoices_appointment_unique").on(
      t.clinicId,
      t.appointmentId,
    ),
    foreignKey({
      columns: [t.clinicId, t.customerId],
      foreignColumns: [customersTable.clinicId, customersTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointmentsTable.clinicId, appointmentsTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.createdBy],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
    check(
      "billing_invoices_price_check",
      sql`${t.originalPrice} >= 0 AND ${t.discount} BETWEEN 0 AND ${t.originalPrice} AND ${t.originalPrice} <> 'NaN'::numeric`,
    ),
    check(
      "billing_invoices_deposit_policy_check",
      sql`${t.depositPolicy} IN ('refundable','non_refundable','wallet')`,
    ),
  ],
);
export const patientPackagesTable = pgTable(
  "patient_packages",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    customerId: integer("customer_id").notNull(),
    templateId: integer("template_id"),
    invoiceId: integer("invoice_id").notNull(),
    name: text("name").notNull(),
    items: jsonb("items").$type<PackageItem[]>().notNull(),
    intervalDays: integer("interval_days").notNull().default(7),
    plan: jsonb("plan").$type<PaymentPlan>().notNull(),
    status: text("status")
      .$type<"active" | "completed" | "expired" | "frozen" | "cancelled">()
      .notNull()
      .default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: integer("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("patient_packages_clinic_id_unique").on(t.clinicId, t.id),
    unique("patient_packages_patient_context_unique").on(
      t.clinicId,
      t.customerId,
      t.id,
    ),
    unique("patient_packages_invoice_unique").on(t.clinicId, t.invoiceId),
    index("patient_packages_patient_idx").on(t.clinicId, t.customerId),
    foreignKey({
      columns: [t.clinicId, t.customerId, t.invoiceId],
      foreignColumns: [
        billingInvoicesTable.clinicId,
        billingInvoicesTable.customerId,
        billingInvoicesTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.templateId],
      foreignColumns: [
        packageTemplatesTable.clinicId,
        packageTemplatesTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.createdBy],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
    check(
      "patient_packages_status_check",
      sql`${t.status} IN ('active','completed','expired','frozen','cancelled')`,
    ),
  ],
);
export const paymentEntriesTable = pgTable(
  "payment_entries",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    customerId: integer("customer_id").notNull(),
    invoiceId: integer("invoice_id").notNull(),
    kind: text("kind")
      .$type<
        | "payment"
        | "deposit"
        | "refund"
        | "deposit_refund"
        | "deposit_wallet"
        | "wallet_payment"
      >()
      .notNull(),
    method: text("method")
      .$type<
        "cash" | "visa" | "cliq" | "bank" | "online" | "other" | "wallet"
      >()
      .notNull(),
    amount: numeric("amount", { precision: 12, scale: 3 }).notNull(),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    groupKey: text("group_key").notNull(),
    actorId: integer("actor_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_entries_invoice_idx").on(t.clinicId, t.invoiceId, t.id),
    foreignKey({
      columns: [t.clinicId, t.customerId, t.invoiceId],
      foreignColumns: [
        billingInvoicesTable.clinicId,
        billingInvoicesTable.customerId,
        billingInvoicesTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.actorId],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
    check(
      "payment_entries_amount_check",
      sql`${t.amount} > 0 AND ${t.amount} <> 'NaN'::numeric`,
    ),
    check(
      "payment_entries_kind_check",
      sql`${t.kind} IN ('payment','deposit','refund','deposit_refund','deposit_wallet','wallet_payment')`,
    ),
    check(
      "payment_entries_method_check",
      sql`${t.method} IN ('cash','visa','cliq','bank','online','other','wallet')`,
    ),
  ],
);
export const walletEntriesTable = pgTable(
  "patient_wallet_entries",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    customerId: integer("customer_id").notNull(),
    invoiceId: integer("invoice_id"),
    amount: numeric("amount", { precision: 12, scale: 3 }).notNull(),
    note: text("note").notNull(),
    actorId: integer("actor_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("wallet_entries_patient_idx").on(t.clinicId, t.customerId, t.id),
    foreignKey({
      columns: [t.clinicId, t.customerId],
      foreignColumns: [customersTable.clinicId, customersTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.customerId, t.invoiceId],
      foreignColumns: [
        billingInvoicesTable.clinicId,
        billingInvoicesTable.customerId,
        billingInvoicesTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.actorId],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
    check(
      "wallet_entries_amount_check",
      sql`${t.amount} <> 0 AND ${t.amount} <> 'NaN'::numeric`,
    ),
  ],
);
export const packageBookingsTable = pgTable(
  "package_bookings",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    customerId: integer("customer_id").notNull(),
    packageId: integer("package_id").notNull(),
    appointmentId: integer("appointment_id").notNull(),
    serviceId: integer("service_id").notNull(),
  },
  (t) => [
    unique("package_bookings_appointment_unique").on(
      t.clinicId,
      t.appointmentId,
    ),
    index("package_bookings_package_idx").on(
      t.clinicId,
      t.packageId,
      t.serviceId,
    ),
    foreignKey({
      columns: [t.clinicId, t.customerId, t.packageId],
      foreignColumns: [
        patientPackagesTable.clinicId,
        patientPackagesTable.customerId,
        patientPackagesTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointmentsTable.clinicId, appointmentsTable.id],
    }),
    foreignKey({
      name: "package_bookings_patient_service_fk",
      columns: [t.clinicId, t.customerId, t.serviceId, t.appointmentId],
      foreignColumns: [
        appointmentsTable.clinicId,
        appointmentsTable.customerId,
        appointmentsTable.serviceId,
        appointmentsTable.id,
      ],
    }),
    foreignKey({
      columns: [t.clinicId, t.serviceId],
      foreignColumns: [servicesTable.clinicId, servicesTable.id],
    }),
  ],
);
export const sessionEntriesTable = pgTable(
  "package_session_entries",
  {
    id: serial("id").primaryKey(),
    clinicId: integer("clinic_id").notNull(),
    packageId: integer("package_id").notNull(),
    serviceId: integer("service_id").notNull(),
    appointmentId: integer("appointment_id"),
    note: text("note").notNull().default(""),
    actorId: integer("actor_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("session_entries_appointment_unique").on(
      t.clinicId,
      t.appointmentId,
    ),
    index("session_entries_package_idx").on(
      t.clinicId,
      t.packageId,
      t.serviceId,
    ),
    foreignKey({
      columns: [t.clinicId, t.packageId],
      foreignColumns: [patientPackagesTable.clinicId, patientPackagesTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.serviceId],
      foreignColumns: [servicesTable.clinicId, servicesTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointmentsTable.clinicId, appointmentsTable.id],
    }),
    foreignKey({
      columns: [t.clinicId, t.actorId],
      foreignColumns: [usersTable.clinicId, usersTable.id],
    }),
  ],
);
