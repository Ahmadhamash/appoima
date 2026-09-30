import { z } from "zod";
import type { PaymentPlan } from "@workspace/db";
import { money, milli, decimal } from "./costing";
const id = z.number().int().positive(),
  key = z.string().uuid();
export const paymentPlanSchema = z
  .object({
    policy: z.enum(["warning", "minimum", "full"]).default("warning"),
    initialPayment: money.default("0"),
    installmentAmount: money.default("0"),
    everySessions: z.number().int().min(1).max(1000).default(2),
    minimumPerSession: money.default("0"),
    allowManagerOverride: z.boolean().default(false),
  })
  .strict();
const items = z
  .array(
    z
      .object({ serviceId: id, quantity: z.number().int().min(1).max(1000) })
      .strict(),
  )
  .min(1)
  .max(50)
  .refine(
    (v) => new Set(v.map((x) => x.serviceId)).size === v.length,
    "duplicate_service",
  );
export const packageInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    items,
    originalPrice: money,
    discount: money.default("0"),
    intervalDays: z.number().int().min(1).max(365).default(7),
    expiryDays: z.number().int().min(1).max(3650).nullable().default(null),
    plan: paymentPlanSchema.default({}),
    idempotencyKey: key,
  })
  .strict()
  .refine(
    (v) => milli(v.discount) <= milli(v.originalPrice),
    "discount_exceeds_price",
  );
export const assignPackageSchema = z
  .object({
    templateId: id,
    items: items.optional(),
    originalPrice: money.optional(),
    discount: money.optional(),
    intervalDays: z.number().int().min(1).max(365).optional(),
    plan: paymentPlanSchema.optional(),
    depositPolicy: z
      .enum(["refundable", "non_refundable", "wallet"])
      .default("refundable"),
    idempotencyKey: key,
  })
  .strict();
export const paymentSchema = z
  .object({
    kind: z.enum(["payment", "deposit"]).default("payment"),
    lines: z
      .array(
        z
          .object({
            method: z.enum([
              "cash",
              "visa",
              "cliq",
              "bank",
              "online",
              "other",
              "wallet",
            ]),
            amount: money.refine((v) => milli(v) > 0n),
            reference: z.string().trim().max(200).default(""),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    note: z.string().trim().max(1000).default(""),
    idempotencyKey: key,
  })
  .strict();
export const refundSchema = z
  .object({
    amount: money.refine((v) => milli(v) > 0n),
    source: z.enum(["payment", "deposit"]),
    destination: z.enum([
      "cash",
      "visa",
      "cliq",
      "bank",
      "online",
      "other",
      "wallet",
    ]),
    note: z.string().trim().min(1).max(1000),
    idempotencyKey: key,
  })
  .strict();
export const walletSchema = z
  .object({
    amount: money.refine((v) => milli(v) > 0n),
    note: z.string().trim().min(1).max(1000),
    idempotencyKey: key,
  })
  .strict();
export const useSessionSchema = z
  .object({
    serviceId: id,
    note: z.string().trim().max(1000).default(""),
    overrideReason: z.string().trim().max(1000).default(""),
    idempotencyKey: key,
  })
  .strict();
export const packageStatusSchema = z
  .object({
    status: z.enum(["active", "frozen", "cancelled"]),
    reason: z.string().trim().min(1).max(1000),
    idempotencyKey: key,
  })
  .strict();
export const appointmentInvoiceSchema = z
  .object({
    depositPolicy: z
      .enum(["refundable", "non_refundable", "wallet"])
      .default("refundable"),
    idempotencyKey: key,
  })
  .strict();
export type LedgerEntry = { kind: string; amount: string };
export function finance(
  originalPrice: string,
  discount: string,
  entries: LedgerEntry[],
) {
  const total = milli(originalPrice) - milli(discount);
  let received = 0n,
    refunded = 0n,
    deposits = 0n,
    depositReturns = 0n;
  for (const e of entries) {
    const amount = milli(e.amount);
    if (["refund", "deposit_refund", "deposit_wallet"].includes(e.kind)) {
      refunded += amount;
      if (e.kind !== "refund") depositReturns += amount;
    } else {
      received += amount;
      if (e.kind === "deposit") deposits += amount;
    }
  }
  const paid = received - refunded,
    balance = total - paid;
  const status =
    refunded > 0n
      ? paid === 0n
        ? "refunded"
        : "partially_refunded"
      : paid === 0n && total > 0n
        ? "unpaid"
        : balance <= 0n
          ? "paid"
          : "partially_paid";
  return {
    originalPrice: decimal(milli(originalPrice)),
    discount: decimal(milli(discount)),
    total: decimal(total),
    paid: decimal(paid),
    balance: decimal(balance),
    deposit: decimal(deposits - depositReturns),
    status,
    received: decimal(received),
    refunded: decimal(refunded),
  };
}
export function minimumRequired(
  total: string,
  plan: PaymentPlan,
  sessionNumber: number,
) {
  const cumulative =
    milli(plan.initialPayment) +
    milli(plan.installmentAmount) *
      BigInt(Math.floor((sessionNumber - 1) / plan.everySessions));
  const perSession = milli(plan.minimumPerSession) * BigInt(sessionNumber),
    required =
      plan.policy === "full"
        ? milli(total)
        : cumulative > perSession
          ? cumulative
          : perSession;
  return decimal(required > milli(total) ? milli(total) : required);
}
export function paymentCheck(
  total: string,
  paid: string,
  plan: PaymentPlan,
  sessionNumber: number,
) {
  const required = minimumRequired(total, plan, sessionNumber),
    missing =
      milli(required) > milli(paid) ? milli(required) - milli(paid) : 0n;
  return {
    required,
    missing: decimal(missing),
    warning: missing > 0n,
    blocking: missing > 0n && plan.policy !== "warning",
    sessionNumber,
  };
}
export function seriesDates(
  startsAt: string,
  count: number,
  intervalDays: number,
) {
  return Array.from({ length: count }, (_, index) =>
    new Date(
      Date.parse(startsAt) + index * intervalDays * 86400000,
    ).toISOString(),
  );
}
