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
  reserved?: number;
  available?: number;
};
export type PackageTemplate = {
  description: string;
  usageRules: string;
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
  promotion?: PromotionSnapshot | null;
  id: number;
  appointmentId: number | null;
  name: string;
  depositPolicy: string;
  createdAt: string;
  financial: Financial;
  payments: PaymentEntry[];
};
export type PatientPackage = {
  description: string;
  usageRules: string;
  reserved?: number;
  available?: number;
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
export function useCustomerBilling(customerId: number, enabled = true) {
  return useQuery({
    queryKey: ["billing", "customer", customerId],
    queryFn: () => api<Billing>(`/clinic/billing/customers/${customerId}`),
    enabled: enabled && customerId > 0,
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

export type OfferEligibility = { customerType: 'all' | 'new' | 'existing'; minimumSpend: string; maxPerPatient: number | null; conditions: string };
export type PromotionSnapshot = { id: number; name: string; kind: 'percent' | 'amount' | 'price'; value: string; originalPrice: string; price: string; startsOn: string; endsOn: string; eligibility: OfferEligibility };
export type PromotionalOffer = Omit<PromotionSnapshot, 'originalPrice' | 'price'> & { serviceIds: number[]; packageIds: number[]; isActive: boolean };
export type BookingQuote = { originalPrice: string; price: string; promotion: PromotionSnapshot | null; usageRules: string; expiryDays: number | null; totalSessions: number; offers: (PromotionalOffer & { price: string; eligible: boolean; reason: string | null })[] };
export type PackageNotice = { id: number; event: 'final_check_in' | 'final_completed'; appointmentId: number; packageId: number; customerId: number; customer: string; package: string; createdAt: string; read: boolean };
export function useOfferCatalog(enabled = true) {
  return useQuery({ queryKey: ['billing', 'offers'], queryFn: () => api<{ items: PromotionalOffer[]; canManage: boolean }>('/clinic/billing/offers'), enabled });
}
export function useBookingQuote(input: { customerId?: number; serviceId?: number; templateId?: number; offerId?: number }, enabled: boolean) {
  return useQuery({ queryKey: ['billing', 'quote', input], queryFn: () => api<BookingQuote>('/clinic/billing/quote', { method: 'POST', body: input }), enabled: enabled && !!input.customerId && !!input.serviceId, staleTime: 0 });
}
export function usePackageNotifications(enabled: boolean) {
  return useQuery({ queryKey: ['billing', 'notifications'], queryFn: () => api<{ unread: number; items: PackageNotice[] }>('/clinic/billing/notifications'), enabled, refetchInterval: 15000, refetchOnWindowFocus: true });
}
export type BookingPackageOptions={single:BookingQuote;packages:(PackageTemplate&{quote:BookingQuote})[];canPurchase:boolean};
export function useBookingPackages(customerId:number|undefined,serviceId:number|undefined,enabled=true){
  return useQuery({queryKey:['billing','booking-options',customerId,serviceId],queryFn:()=>api<BookingPackageOptions>('/clinic/billing/booking-options',{method:'POST',body:{customerId,serviceId}}),enabled:enabled&&!!customerId&&!!serviceId,staleTime:0,refetchOnWindowFocus:true});
}
