import { activeBranch, activeEmployee } from './branch-scope';
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  packageTemplatesTable,
  patientPackagesTable,
  billingInvoicesTable,
  paymentEntriesTable,
  walletEntriesTable,
  sessionEntriesTable,
  packageBookingsTable,
  customersTable,
  servicesTable,
  appointmentsTable,
  usersTable,
  type User,
  type Appointment,
} from "@workspace/db";
import {
  withOperations,
  operationsCommand,
  operatingClinic,
  type OperationsTx,
} from "./operations-context";
import { hasPermission } from "../domain/permissions";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { recordAudit } from "./audit";
import { milli, decimal } from "../domain/costing";
import {
  finance,
  paymentCheck,
  packageInputSchema,
  assignPackageSchema,
  paymentSchema,
  refundSchema,
  useSessionSchema,
  packageStatusSchema,
  walletSchema,
  appointmentInvoiceSchema,
} from "../domain/packages";
import { paymentSummary } from "../domain/patient-billing";
import { recordAppointmentHistory } from "./scheduling-history";
import { offerNextReplacement } from "./waiting-list";

type Tx = OperationsTx;
const permission = (
  actor: User,
  key:
    "services.read" | "services.manage" | "customers.read" | "customers.manage",
) => {
  if (!hasPermission(actor, key)) throw forbidden();
};
async function patient(tx: Tx, actor: User, id: number) {
  const [row] = await tx
    .select()
    .from(customersTable)
    .where(
      and(
        and(eq(customersTable.clinicId, operatingClinic(actor)), activeBranch(customersTable.branchId)),
        eq(customersTable.id, id),
      ),
    );
  if (!row) throw notFound("record_not_found");
  return row;
}
async function invoice(tx: Tx, actor: User, id: number) {
  const [row] = await tx
    .select()
    .from(billingInvoicesTable)
    .where(
      and(
        eq(billingInvoicesTable.clinicId, operatingClinic(actor)),
        eq(billingInvoicesTable.id, id),
      ),
    );
  if (!row) throw notFound("record_not_found");
  return row;
}
async function pkg(tx: Tx, actor: User, id: number) {
  const [row] = await tx
    .select()
    .from(patientPackagesTable)
    .where(
      and(
        eq(patientPackagesTable.clinicId, operatingClinic(actor)),
        eq(patientPackagesTable.id, id),
      ),
    );
  if (!row) throw notFound("record_not_found");
  return row;
}
async function items(
  tx: Tx,
  actor: User,
  input: { serviceId: number; quantity: number }[],
) {
  const rows = await tx
    .select()
    .from(servicesTable)
    .where(
      and(
        and(eq(servicesTable.clinicId, operatingClinic(actor)), activeBranch(servicesTable.branchId)),
        inArray(
          servicesTable.id,
          input.map((i) => i.serviceId),
        ),
      ),
    );
  if (
    rows.length !== input.length ||
    rows.some((s) => !s.isActive || s.currency !== "JOD")
  )
    throw badRequest("package_invalid_service");
  return input.map((i) => ({
    ...i,
    name: rows.find((s) => s.id === i.serviceId)!.name,
  }));
}
async function payments(tx: Tx, clinicId: number, invoiceId: number) {
  return tx
    .select()
    .from(paymentEntriesTable)
    .where(
      and(
        eq(paymentEntriesTable.clinicId, clinicId),
        eq(paymentEntriesTable.invoiceId, invoiceId),
      ),
    )
    .orderBy(asc(paymentEntriesTable.id));
}
async function walletBalance(tx: Tx, clinicId: number, customerId: number) {
  const rows = await tx
    .select({ amount: walletEntriesTable.amount })
    .from(walletEntriesTable)
    .where(
      and(
        eq(walletEntriesTable.clinicId, clinicId),
        eq(walletEntriesTable.customerId, customerId),
      ),
    );
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.amount.startsWith("-")
        ? -milli(row.amount.slice(1))
        : milli(row.amount)),
    0n,
  );
}
async function walletEntry(
  tx: Tx,
  actor: User,
  customerId: number,
  amount: bigint,
  note: string,
  invoiceId: number | null = null,
) {
  await tx
    .insert(walletEntriesTable)
    .values({
      clinicId: operatingClinic(actor),
      customerId,
      invoiceId,
      amount: decimal(amount),
      note,
      actorId: actor.id,
    });
}
async function audit(
  tx: Tx,
  actor: User,
  action: string,
  id: number,
  details: Record<string, unknown>,
) {
  await recordAudit(
    {
      clinicId: operatingClinic(actor),
      actorUserId: actor.id,
      action,
      entityType: "patient_package",
      entityId: id,
      details,
    },
    tx,
  );
}
export async function packageCatalog(actor: User) {
  return withOperations(actor, false, async (tx, fresh) => {
    permission(fresh, "services.read");
    return {
      items: await tx
        .select()
        .from(packageTemplatesTable)
        .where(eq(packageTemplatesTable.clinicId, operatingClinic(fresh)))
        .orderBy(asc(packageTemplatesTable.id)),
      services: await tx
        .select({
          id: servicesTable.id,
          name: servicesTable.name,
          price: servicesTable.price,
        })
        .from(servicesTable)
        .where(
          and(
            and(eq(servicesTable.clinicId, operatingClinic(fresh)), activeBranch(servicesTable.branchId)),
            eq(servicesTable.isActive, true),
          ),
        ),
      canManage: hasPermission(fresh, "services.manage"),
    };
  });
}
export async function savePackageTemplate(
  actor: User,
  input: z.infer<typeof packageInputSchema>,
) {
  return operationsCommand(
    actor,
    "package.template",
    input,
    async (_tx, fresh) => permission(fresh, "services.manage"),
    async (tx, fresh) => {
      const { idempotencyKey: _key, ...fields } = input;
      const [row] = await tx
        .insert(packageTemplatesTable)
        .values({
          ...fields,
          clinicId: operatingClinic(fresh),
          items: await items(tx, fresh, input.items),
          createdBy: fresh.id,
        })
        .returning();
      await audit(tx, fresh, "package.template_created", row!.id, {
        name: input.name,
      });
      return row!.id;
    },
  );
}
export async function assignPackage(
  actor: User,
  customerId: number,
  input: z.infer<typeof assignPackageSchema>,
) {
  return operationsCommand(
    actor,
    `package.assign:${customerId}`,
    input,
    async (tx, fresh) => {
      permission(fresh, "customers.manage");
      await patient(tx, fresh, customerId);
    },
    async (tx, fresh) => {
      const clinicId = operatingClinic(fresh),
        [template] = await tx
          .select()
          .from(packageTemplatesTable)
          .where(
            and(
              eq(packageTemplatesTable.clinicId, clinicId),
              eq(packageTemplatesTable.id, input.templateId),
              eq(packageTemplatesTable.isActive, true),
            ),
          );
      if (!template) throw notFound("record_not_found");
      const originalPrice = input.originalPrice ?? template.originalPrice,
        discount = input.discount ?? template.discount;
      if (milli(discount) > milli(originalPrice))
        throw badRequest("discount_exceeds_price");
      const packageItems = await items(
          tx,
          fresh,
          input.items ?? template.items,
        ),
        [inv] = await tx
          .insert(billingInvoicesTable)
          .values({
            clinicId,
            customerId,
            name: template.name,
            originalPrice,
            discount,
            depositPolicy: input.depositPolicy,
            createdBy: fresh.id,
          })
          .returning();
      const [row] = await tx
        .insert(patientPackagesTable)
        .values({
          clinicId,
          customerId,
          templateId: template.id,
          invoiceId: inv!.id,
          name: template.name,
          items: packageItems,
          intervalDays: input.intervalDays ?? template.intervalDays,
          plan: input.plan ?? template.plan,
          expiresAt: template.expiryDays
            ? new Date(Date.now() + template.expiryDays * 86400000)
            : null,
          createdBy: fresh.id,
        })
        .returning();
      await audit(tx, fresh, "package.created", row!.id, {
        invoiceId: inv!.id,
        originalPrice,
        discount,
        items: packageItems,
      });
      return row!.id;
    },
  );
}
export async function customerBilling(actor: User, customerId: number) {
  return withOperations(actor, false, async (tx, fresh) => {
    permission(fresh, "customers.read");
    await patient(tx, fresh, customerId);
    const clinicId = operatingClinic(fresh);
    const packages = await tx
      .select()
      .from(patientPackagesTable)
      .where(
        and(
          eq(patientPackagesTable.clinicId, clinicId),
          eq(patientPackagesTable.customerId, customerId),
        ),
      )
      .orderBy(asc(patientPackagesTable.id));
    const invoices = await tx
      .select()
      .from(billingInvoicesTable)
      .where(
        and(
          eq(billingInvoicesTable.clinicId, clinicId),
          eq(billingInvoicesTable.customerId, customerId),
        ),
      );
    const entries = await tx
      .select()
      .from(paymentEntriesTable)
      .where(
        and(
          eq(paymentEntriesTable.clinicId, clinicId),
          eq(paymentEntriesTable.customerId, customerId),
        ),
      );
    const sessions = await tx
      .select({ entry: sessionEntriesTable })
      .from(sessionEntriesTable)
      .innerJoin(
        patientPackagesTable,
        and(
          eq(patientPackagesTable.clinicId, sessionEntriesTable.clinicId),
          eq(patientPackagesTable.id, sessionEntriesTable.packageId),
        ),
      )
      .where(
        and(
          eq(patientPackagesTable.clinicId, clinicId),
          eq(patientPackagesTable.customerId, customerId),
        ),
      );
    const wallet = await tx
      .select()
      .from(walletEntriesTable)
      .where(
        and(
          eq(walletEntriesTable.clinicId, clinicId),
          eq(walletEntriesTable.customerId, customerId),
        ),
      );
    const staff = await tx
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.clinicId, clinicId), activeEmployee()));
    const invoicesWithBalance = invoices.map((inv) => ({
      ...inv,
      financial: finance(
        inv.originalPrice,
        inv.discount,
        entries.filter((e) => e.invoiceId === inv.id),
      ),
      payments: entries
        .filter((e) => e.invoiceId === inv.id)
        .map((e) => ({
          ...e,
          actor: staff.find((s) => s.id === e.actorId)?.name ?? "",
        })),
    }));
    return {
      packages: packages.map((p) => {
        const used = sessions
            .filter((s) => s.entry.packageId === p.id)
            .map((s) => s.entry),
          total = p.items.reduce((n, item) => n + item.quantity, 0);
        return {
          ...p,
          creator: staff.find((s) => s.id === p.createdBy)?.name ?? "",
          status:
            p.status === "active" &&
            p.expiresAt &&
            p.expiresAt.getTime() < Date.now()
              ? "expired"
              : p.status,
          used: used.length,
          remaining: total - used.length,
          totalSessions: total,
          items: p.items.map((item) => ({
            ...item,
            used: used.filter((s) => s.serviceId === item.serviceId).length,
          })),
          invoice: invoicesWithBalance.find((inv) => inv.id === p.invoiceId)!,
          sessions: used.map((e) => ({
            ...e,
            actor: staff.find((s) => s.id === e.actorId)?.name ?? "",
          })),
        };
      }),
      invoices: invoicesWithBalance,
      wallet: decimal(await walletBalance(tx, clinicId, customerId)),
      walletEntries: wallet.map((e) => ({
        ...e,
        actor: staff.find((s) => s.id === e.actorId)?.name ?? "",
      })),
      canManage: hasPermission(fresh, "customers.manage"),
      canOverride: fresh.role === "manager",
    };
  });
}
export async function recordPayment(
  actor: User,
  id: number,
  input: z.infer<typeof paymentSchema>,
) {
  return operationsCommand(
    actor,
    `billing.payment:${id}`,
    input,
    async (_tx, fresh) => permission(fresh, "customers.manage"),
    async (tx, fresh) => {
      const inv = await invoice(tx, fresh, id),
        current = finance(
          inv.originalPrice,
          inv.discount,
          await payments(tx, inv.clinicId, id),
        ),
        amount = input.lines.reduce((n, line) => n + milli(line.amount), 0n);
      if (amount > milli(current.balance))
        throw badRequest("payment_exceeds_balance");
      const walletUsed = input.lines
        .filter((line) => line.method === "wallet")
        .reduce((n, line) => n + milli(line.amount), 0n);
      if (walletUsed > (await walletBalance(tx, inv.clinicId, inv.customerId)))
        throw conflict("wallet_insufficient");
      if (walletUsed && input.kind === "deposit")
        throw badRequest("deposit_wallet_not_allowed");
      for (const line of input.lines)
        await tx
          .insert(paymentEntriesTable)
          .values({
            clinicId: inv.clinicId,
            customerId: inv.customerId,
            invoiceId: id,
            kind: line.method === "wallet" ? "wallet_payment" : input.kind,
            method: line.method,
            amount: line.amount,
            reference: line.reference,
            note: input.note,
            groupKey: input.idempotencyKey,
            actorId: fresh.id,
          });
      if (walletUsed)
        await walletEntry(
          tx,
          fresh,
          inv.customerId,
          -walletUsed,
          input.note || "Invoice payment",
          id,
        );
      await audit(tx, fresh, "billing.payment_recorded", id, {
        amount: decimal(amount),
        kind: input.kind,
        lines: input.lines,
      });
      return id;
    },
  );
}
export async function refundPayment(
  actor: User,
  id: number,
  input: z.infer<typeof refundSchema>,
) {
  return operationsCommand(
    actor,
    `billing.refund:${id}`,
    input,
    async (_tx, fresh) => {
      permission(fresh, "customers.manage");
      if (fresh.role !== "manager") throw forbidden();
    },
    async (tx, fresh) => {
      const inv = await invoice(tx, fresh, id),
        current = finance(
          inv.originalPrice,
          inv.discount,
          await payments(tx, inv.clinicId, id),
        ),
        available =
          input.source === "deposit"
            ? milli(current.deposit)
            : milli(current.paid) - milli(current.deposit);
      if (milli(input.amount) > available)
        throw badRequest("refund_exceeds_paid");
      if (input.source === "deposit" && inv.depositPolicy === "non_refundable")
        throw badRequest("deposit_non_refundable");
      if (
        input.source === "deposit" &&
        inv.depositPolicy === "wallet" &&
        input.destination !== "wallet"
      )
        throw badRequest("deposit_wallet_required");
      await tx
        .insert(paymentEntriesTable)
        .values({
          clinicId: inv.clinicId,
          customerId: inv.customerId,
          invoiceId: id,
          kind:
            input.source === "deposit"
              ? input.destination === "wallet"
                ? "deposit_wallet"
                : "deposit_refund"
              : "refund",
          method: input.destination,
          amount: input.amount,
          note: input.note,
          groupKey: input.idempotencyKey,
          actorId: fresh.id,
        });
      if (input.destination === "wallet")
        await walletEntry(
          tx,
          fresh,
          inv.customerId,
          milli(input.amount),
          input.note,
          id,
        );
      await audit(tx, fresh, "billing.refund_recorded", id, {
        ...input,
        idempotencyKey: undefined,
      });
      return id;
    },
  );
}
export async function creditWallet(
  actor: User,
  customerId: number,
  input: z.infer<typeof walletSchema>,
) {
  return operationsCommand(
    actor,
    `wallet.credit:${customerId}`,
    input,
    async (tx, fresh) => {
      permission(fresh, "customers.manage");
      await patient(tx, fresh, customerId);
    },
    async (tx, fresh) => {
      await walletEntry(tx, fresh, customerId, milli(input.amount), input.note);
      await audit(tx, fresh, "wallet.credited", customerId, {
        amount: input.amount,
        note: input.note,
      });
      return customerId;
    },
  );
}
async function activePackage(tx: Tx, actor: User, id: number) {
  const p = await pkg(tx, actor, id);
  if (
    p.status !== "active" ||
    (p.expiresAt && p.expiresAt.getTime() < Date.now())
  )
    throw conflict("package_not_active");
  return p;
}
export async function packagePaymentCheck(
  tx: Tx,
  actor: User,
  packageId: number,
  sessionNumber?: number,
) {
  const p = await pkg(tx, actor, packageId),
    inv = await invoice(tx, actor, p.invoiceId),
    entries = await payments(tx, p.clinicId, inv.id),
    used = await tx
      .select()
      .from(sessionEntriesTable)
      .where(
        and(
          eq(sessionEntriesTable.clinicId, p.clinicId),
          eq(sessionEntriesTable.packageId, p.id),
        ),
      ),
    f = finance(inv.originalPrice, inv.discount, entries);
  return paymentCheck(
    f.total,
    f.paid,
    p.plan,
    sessionNumber ?? used.length + 1,
  );
}
export async function enforcePackagePayment(
  tx: Tx,
  actor: User,
  packageId: number,
  overrideReason = "",
  sessionNumber?: number,
) {
  const p = await activePackage(tx, actor, packageId),
    check = await packagePaymentCheck(tx, actor, p.id, sessionNumber);
  if (check.blocking) {
    if (
      actor.role !== "manager" ||
      !p.plan.allowManagerOverride ||
      !overrideReason.trim()
    )
      throw conflict("package_payment_required");
    await audit(tx, actor, "package.payment_override", p.id, {
      reason: overrideReason,
      required: check.required,
      missing: check.missing,
      sessionNumber: check.sessionNumber,
    });
  }
  return check;
}
export async function ensurePackageReservation(
  tx: Tx,
  actor: User,
  packageId: number,
  customerId: number,
  serviceId: number,
  count = 1,
) {
  const p = await activePackage(tx, actor, packageId);
  if (p.customerId !== customerId) throw notFound("record_not_found");
  const item = p.items.find((i) => i.serviceId === serviceId);
  if (!item) throw badRequest("package_service_not_included");
  const used = await tx
    .select()
    .from(sessionEntriesTable)
    .where(
      and(
        eq(sessionEntriesTable.clinicId, p.clinicId),
        eq(sessionEntriesTable.packageId, p.id),
        eq(sessionEntriesTable.serviceId, serviceId),
      ),
    );
  const reserved = await tx
    .select({ id: packageBookingsTable.id })
    .from(packageBookingsTable)
    .innerJoin(
      appointmentsTable,
      and(
        and(eq(appointmentsTable.clinicId, packageBookingsTable.clinicId), activeBranch(appointmentsTable.branchId)),
        eq(appointmentsTable.id, packageBookingsTable.appointmentId),
      ),
    )
    .where(
      and(
        eq(packageBookingsTable.clinicId, p.clinicId),
        eq(packageBookingsTable.packageId, p.id),
        eq(packageBookingsTable.serviceId, serviceId),
        inArray(appointmentsTable.status, [
          "pending",
          "confirmed",
          "checked_in",
          "in_service",
        ]),
      ),
    );
  if (used.length + reserved.length + count > item.quantity)
    throw conflict("package_no_sessions");
  return p;
}
async function consume(
  tx: Tx,
  actor: User,
  packageId: number,
  serviceId: number,
  appointmentId: number | null,
  note: string,
  overrideReason = "",
) {
  const p = await activePackage(tx, actor, packageId),
    item = p.items.find((i) => i.serviceId === serviceId);
  if (!item) throw badRequest("package_service_not_included");
  const used = await tx
    .select()
    .from(sessionEntriesTable)
    .where(
      and(
        eq(sessionEntriesTable.clinicId, p.clinicId),
        eq(sessionEntriesTable.packageId, p.id),
      ),
    );
  if (used.filter((s) => s.serviceId === serviceId).length >= item.quantity)
    throw conflict("package_no_sessions");
  await enforcePackagePayment(tx, actor, p.id, overrideReason);
  await tx
    .insert(sessionEntriesTable)
    .values({
      clinicId: p.clinicId,
      packageId: p.id,
      serviceId,
      appointmentId,
      note,
      actorId: actor.id,
    });
  if (used.length + 1 === p.items.reduce((n, i) => n + i.quantity, 0))
    await tx
      .update(patientPackagesTable)
      .set({ status: "completed" })
      .where(
        and(
          eq(patientPackagesTable.clinicId, p.clinicId),
          eq(patientPackagesTable.id, p.id),
        ),
      );
  await audit(tx, actor, "package.session_used", p.id, {
    serviceId,
    appointmentId,
  });
}
export async function usePackageSession(
  actor: User,
  id: number,
  input: z.infer<typeof useSessionSchema>,
) {
  return operationsCommand(
    actor,
    `package.use:${id}`,
    input,
    async (_tx, fresh) => permission(fresh, "customers.manage"),
    async (tx, fresh) => {
      await ensurePackageReservation(
        tx,
        fresh,
        id,
        (await pkg(tx, fresh, id)).customerId,
        input.serviceId,
      );
      await consume(
        tx,
        fresh,
        id,
        input.serviceId,
        null,
        input.note,
        input.overrideReason,
      );
      return id;
    },
  );
}
export async function setPackageStatus(
  actor: User,
  id: number,
  input: z.infer<typeof packageStatusSchema>,
) {
  return operationsCommand(
    actor,
    `package.status:${id}`,
    input,
    async (_tx, fresh) => {
      permission(fresh, "customers.manage");
      if (fresh.role !== "manager") throw forbidden();
    },
    async (tx, fresh) => {
      const p = await pkg(tx, fresh, id);
      if (p.status === "completed" || p.status === "cancelled")
        throw conflict("package_status_locked");
      if (input.status === "cancelled") {
        const reserved = await tx
          .select({ appointment: appointmentsTable })
          .from(packageBookingsTable)
          .innerJoin(
            appointmentsTable,
            and(
              and(eq(appointmentsTable.clinicId, packageBookingsTable.clinicId), activeBranch(appointmentsTable.branchId)),
              eq(appointmentsTable.id, packageBookingsTable.appointmentId),
            ),
          )
          .where(
            and(
              eq(packageBookingsTable.clinicId, p.clinicId),
              eq(packageBookingsTable.packageId, p.id),
              inArray(appointmentsTable.status, [
                "pending",
                "confirmed",
                "checked_in",
                "in_service",
              ]),
            ),
          );
        if (reserved.some((r) => r.appointment.status === "in_service"))
          throw conflict("package_session_in_progress");
        for (const { appointment: a } of reserved) {
          const [after] = await tx
            .update(appointmentsTable)
            .set({
              status: "cancelled",
              version: a.version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                and(eq(appointmentsTable.clinicId, p.clinicId), activeBranch(appointmentsTable.branchId)),
                eq(appointmentsTable.id, a.id),
              ),
            )
            .returning();
          await recordAppointmentHistory(
            tx,
            fresh,
            "status_changed",
            a,
            after!,
            input.reason,
          );
          await cancelAppointmentDeposit(tx, fresh, after!);
          await offerNextReplacement(tx, fresh, after!);
        }
      }
      if (input.status === "cancelled")
        await transferCancellationDeposit(
          tx,
          fresh,
          await invoice(tx, fresh, p.invoiceId),
          `package-cancel:${id}`,
        );
      await tx
        .update(patientPackagesTable)
        .set({ status: input.status })
        .where(
          and(
            eq(patientPackagesTable.clinicId, p.clinicId),
            eq(patientPackagesTable.id, p.id),
          ),
        );
      await audit(tx, fresh, "package.status_changed", p.id, {
        before: p.status,
        after: input.status,
        reason: input.reason,
      });
      return id;
    },
  );
}
export async function appointmentPackage(tx: Tx, actor: User, id: number) {
  const [link] = await tx
    .select()
    .from(packageBookingsTable)
    .where(
      and(
        eq(packageBookingsTable.clinicId, operatingClinic(actor)),
        eq(packageBookingsTable.appointmentId, id),
      ),
    );
  return link;
}
export async function packageAppointmentTransition(
  tx: Tx,
  actor: User,
  a: Appointment,
  status: string,
  overrideReason = "",
) {
  const link = await appointmentPackage(tx, actor, a.id);
  if (!link) return;
  if (["confirmed", "in_service", "completed"].includes(status))
    await enforcePackagePayment(tx, actor, link.packageId, overrideReason);
  if (status === "completed")
    await consume(
      tx,
      actor,
      link.packageId,
      a.serviceId,
      a.id,
      "Appointment completed",
      overrideReason,
    );
}
async function transferCancellationDeposit(
  tx: Tx,
  actor: User,
  inv: typeof billingInvoicesTable.$inferSelect,
  groupKey: string,
) {
  if (inv.depositPolicy !== "wallet") return;
  const f = finance(
    inv.originalPrice,
    inv.discount,
    await payments(tx, inv.clinicId, inv.id),
  );
  if (milli(f.deposit) === 0n) return;
  await tx
    .insert(paymentEntriesTable)
    .values({
      clinicId: inv.clinicId,
      customerId: inv.customerId,
      invoiceId: inv.id,
      kind: "deposit_wallet",
      method: "wallet",
      amount: f.deposit,
      note: "Cancellation: deposit transferred to wallet",
      groupKey,
      actorId: actor.id,
    });
  await walletEntry(
    tx,
    actor,
    inv.customerId,
    milli(f.deposit),
    "Cancelled booking deposit",
    inv.id,
  );
}
export async function cancelAppointmentDeposit(
  tx: Tx,
  actor: User,
  a: Appointment,
) {
  const [inv] = await tx
    .select()
    .from(billingInvoicesTable)
    .where(
      and(
        eq(billingInvoicesTable.clinicId, a.clinicId),
        eq(billingInvoicesTable.appointmentId, a.id),
      ),
    );
  if (inv)
    await transferCancellationDeposit(
      tx,
      actor,
      inv,
      `cancel:${a.id}:${a.version}`,
    );
}
export async function syncAppointmentInvoice(
  tx: Tx,
  actor: User,
  a: Appointment,
) {
  const [inv] = await tx
    .select()
    .from(billingInvoicesTable)
    .where(
      and(
        eq(billingInvoicesTable.clinicId, a.clinicId),
        eq(billingInvoicesTable.appointmentId, a.id),
      ),
    );
  if (!inv) return;
  const total = paymentSummary(a.chargePrice, a.productCharges).total;
  if (total === null) throw badRequest("billing_selling_price_required");
  const paid = finance(
    inv.originalPrice,
    inv.discount,
    await payments(tx, a.clinicId, inv.id),
  );
  if (milli(total) < milli(paid.paid) + milli(inv.discount))
    throw conflict("invoice_adjustment_requires_refund");
  await tx
    .update(billingInvoicesTable)
    .set({ originalPrice: total })
    .where(
      and(
        eq(billingInvoicesTable.clinicId, a.clinicId),
        eq(billingInvoicesTable.id, inv.id),
      ),
    );
  await audit(tx, actor, "billing.invoice_updated", inv.id, {
    before: inv.originalPrice,
    after: total,
  });
}
export async function createAppointmentInvoice(
  actor: User,
  id: number,
  input: z.infer<typeof appointmentInvoiceSchema>,
) {
  return operationsCommand(
    actor,
    `billing.appointment:${id}`,
    input,
    async (_tx, fresh) => {
      permission(fresh, "customers.manage");
      if (!hasPermission(fresh, "appointments.read")) throw forbidden();
    },
    async (tx, fresh) => {
      const [a] = await tx
        .select()
        .from(appointmentsTable)
        .where(
          and(
            and(eq(appointmentsTable.clinicId, operatingClinic(fresh)), activeBranch(appointmentsTable.branchId)),
            eq(appointmentsTable.id, id),
          ),
        );
      if (!a) throw notFound("record_not_found");
      const [existing] = await tx
        .select()
        .from(billingInvoicesTable)
        .where(
          and(
            eq(billingInvoicesTable.clinicId, a.clinicId),
            eq(billingInvoicesTable.appointmentId, id),
          ),
        );
      if (existing) return existing.id;
      const [service] = await tx
        .select()
        .from(servicesTable)
        .where(
          and(
            and(eq(servicesTable.clinicId, a.clinicId), activeBranch(servicesTable.branchId)),
            eq(servicesTable.id, a.serviceId),
          ),
        );
      const total = paymentSummary(
        a.chargePrice ?? service!.price,
        a.productCharges,
      ).total;
      if (total === null) throw badRequest("billing_selling_price_required");
      const [inv] = await tx
        .insert(billingInvoicesTable)
        .values({
          clinicId: a.clinicId,
          customerId: a.customerId,
          appointmentId: id,
          name: service!.name,
          originalPrice: total,
          discount: "0",
          depositPolicy: input.depositPolicy,
          createdBy: fresh.id,
        })
        .returning();
      return inv!.id;
    },
  );
}
