import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
export type Plan = {
  policy: "warning" | "minimum" | "full";
  initialPayment: string;
  installmentAmount: string;
  everySessions: number;
  minimumPerSession: string;
  allowManagerOverride: boolean;
};
export const emptyPlan: Plan = {
  policy: "warning",
  initialPayment: "0",
  installmentAmount: "0",
  everySessions: 2,
  minimumPerSession: "0",
  allowManagerOverride: false,
};
export type PackageItem = {
  serviceId: number;
  name: string;
  quantity: number;
  used?: number;
};
export type PackageTemplate = {
  id: number;
  name: string;
  items: PackageItem[];
  originalPrice: string;
  discount: string;
  intervalDays: number;
  expiryDays: number | null;
  plan: Plan;
  isActive: boolean;
};
export type Financial = {
  originalPrice: string;
  discount: string;
  total: string;
  paid: string;
  balance: string;
  deposit: string;
  status: string;
  received: string;
  refunded: string;
};
export type PaymentEntry = {
  id: number;
  kind: string;
  method: string;
  amount: string;
  reference: string;
  note: string;
  createdAt: string;
  actor: string;
};
export type Invoice = {
  id: number;
  appointmentId: number | null;
  name: string;
  depositPolicy: string;
  createdAt: string;
  financial: Financial;
  payments: PaymentEntry[];
};
export type PatientPackage = {
  id: number;
  customerId: number;
  creator: string;
  name: string;
  items: PackageItem[];
  intervalDays: number;
  plan: Plan;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  invoice: Invoice;
  used: number;
  remaining: number;
  totalSessions: number;
  sessions: {
    id: number;
    serviceId: number;
    appointmentId: number | null;
    createdAt: string;
    actor: string;
    note: string;
  }[];
};
export type Billing = {
  packages: PatientPackage[];
  invoices: Invoice[];
  wallet: string;
  walletEntries: {
    id: number;
    amount: string;
    note: string;
    createdAt: string;
    actor: string;
  }[];
  canManage: boolean;
  canOverride: boolean;
};
export function usePackageCatalog(enabled = true) {
  return useQuery({
    queryKey: ["billing", "catalog"],
    queryFn: () =>
      api<{
        items: PackageTemplate[];
        services: { id: number; name: string; price: string }[];
        canManage: boolean;
      }>("/clinic/billing/packages"),
    enabled,
  });
}
export function useCustomerBilling(customerId: number) {
  return useQuery({
    queryKey: ["billing", "customer", customerId],
    queryFn: () => api<Billing>(`/clinic/billing/customers/${customerId}`),
    enabled: customerId > 0,
  });
}
export function useBillingCommand(onSaved?: (id: number) => void) {
  const client = useQueryClient(),
    attempt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: ({
      path,
      body,
    }: {
      path: string;
      body: Record<string, unknown>;
    }) => {
      const signature = JSON.stringify({ path, body });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      return api<{ id: number }>(path, {
        method: "POST",
        body: { ...body, idempotencyKey: attempt.current.key },
      });
    },
    onSuccess: async (result) => {
      attempt.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["billing"] }),
        client.invalidateQueries({ queryKey: ["scheduling"] }),
      ]);
      onSaved?.(result.id);
    },
  });
}
export const paymentMethods = [
  "cash",
  "visa",
  "cliq",
  "bank",
  "online",
  "other",
  "wallet",
] as const;
export const methodNames: Record<string, [string, string]> = {
  cash: ["نقدي", "Cash"],
  visa: ["فيزا", "Visa"],
  cliq: ["CliQ", "CliQ"],
  bank: ["تحويل بنكي", "Bank transfer"],
  online: ["دفع إلكتروني", "Online payment"],
  other: ["أخرى", "Other"],
  wallet: ["المحفظة", "Wallet"],
};
export const statusNames: Record<string, [string, string]> = {
  active: ["نشطة", "Active"],
  completed: ["مكتملة", "Completed"],
  expired: ["منتهية", "Expired"],
  frozen: ["مجمّدة", "Frozen"],
  cancelled: ["ملغاة", "Cancelled"],
  unpaid: ["غير مدفوعة", "Unpaid"],
  partially_paid: ["مدفوعة جزئيًا", "Partially paid"],
  paid: ["مدفوعة", "Paid"],
  refunded: ["مستردة", "Refunded"],
  partially_refunded: ["مستردة جزئيًا", "Partially refunded"],
};
