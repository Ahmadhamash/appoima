import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { promotionalOffersTable, packageTemplatesTable, billingInvoicesTable, customersTable, servicesTable, appointmentsTable, patientPackagesTable, packageNotificationsTable, packageNotificationReadsTable, type User, type PromotionSnapshot } from '@workspace/db';
import { offerInputSchema, catalogStatusSchema, quoteSchema, promotionalPrice, purchaseDay } from '../domain/promotions';
import { milli, decimal } from '../domain/costing';
import { hasPermission, type Permission } from '../domain/permissions';
import { canAccessScheduling, canReadAll } from '../domain/scheduling-rules';
import { operationsCommand, withOperations, operatingClinic, type OperationsTx } from './operations-context';
import { activeBranch } from './branch-scope';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordAudit } from './audit';

const requirePermission = (actor: User, permission: Permission) => { if (!hasPermission(actor, permission)) throw forbidden(); };
async function validateTargets(tx: OperationsTx, actor: User, input: z.infer<typeof offerInputSchema>) {
  const clinicId = operatingClinic(actor);
  const services = input.serviceIds.length ? await tx.select({ id: servicesTable.id }).from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), inArray(servicesTable.id, input.serviceIds), eq(servicesTable.isActive, true), isNull(servicesTable.deletedAt), activeBranch(servicesTable.branchId))) : [];
  const packages = input.packageIds.length ? await tx.select({ id: packageTemplatesTable.id }).from(packageTemplatesTable).where(and(eq(packageTemplatesTable.clinicId, clinicId), inArray(packageTemplatesTable.id, input.packageIds), eq(packageTemplatesTable.isActive, true))) : [];
  if (services.length !== input.serviceIds.length || packages.length !== input.packageIds.length) throw badRequest('offer_invalid_target');
}
export function offerCatalog(actor: User) {
  return withOperations(actor, false, async (tx, fresh) => {
    requirePermission(fresh, 'services.read');
    return { items: await tx.select().from(promotionalOffersTable).where(eq(promotionalOffersTable.clinicId, operatingClinic(fresh))).orderBy(asc(promotionalOffersTable.id)), canManage: hasPermission(fresh, 'services.manage') };
  });
}
export function saveOffer(actor: User, input: z.infer<typeof offerInputSchema>, id?: number) {
  return operationsCommand(actor, `offer.save:${id ?? 'new'}`, input, async (_tx, fresh) => requirePermission(fresh, 'services.manage'), async (tx, fresh) => {
    const clinicId = operatingClinic(fresh), { idempotencyKey: _key, ...fields } = input;
    await validateTargets(tx, fresh, input);
    const [row] = id ? await tx.update(promotionalOffersTable).set(fields).where(and(eq(promotionalOffersTable.clinicId, clinicId), eq(promotionalOffersTable.id, id))).returning() : await tx.insert(promotionalOffersTable).values({ ...fields, clinicId, createdBy: fresh.id }).returning();
    if (!row) throw notFound('record_not_found');
    await recordAudit({ clinicId, actorUserId: fresh.id, action: id ? 'offer.updated' : 'offer.created', entityType: 'promotional_offer', entityId: row.id, details: { name: row.name } }, tx);
    return row.id;
  });
}
export function setOfferActive(actor: User, id: number, input: z.infer<typeof catalogStatusSchema>) {
  return operationsCommand(actor, `offer.active:${id}`, input, async (_tx, fresh) => requirePermission(fresh, 'services.manage'), async (tx, fresh) => {
    const [row] = await tx.update(promotionalOffersTable).set({ isActive: input.isActive }).where(and(eq(promotionalOffersTable.clinicId, operatingClinic(fresh)), eq(promotionalOffersTable.id, id))).returning();
    if (!row) throw notFound('record_not_found');
    await recordAudit({ clinicId: row.clinicId, actorUserId: fresh.id, action: 'offer.status_changed', entityType: 'promotional_offer', entityId: id, details: { isActive: input.isActive } }, tx);
    return id;
  });
}

/** Prices and eligibility are resolved again inside the booking transaction. Never trust client discounts. */
export async function bookingQuoteInTx(tx: OperationsTx, actor: User, input: z.infer<typeof quoteSchema>) {
  const clinicId = operatingClinic(actor);
  const [customer] = await tx.select({ id: customersTable.id }).from(customersTable).where(and(eq(customersTable.clinicId, clinicId), eq(customersTable.id, input.customerId), activeBranch(customersTable.branchId)));
  const [service] = await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.id, input.serviceId), activeBranch(servicesTable.branchId), eq(servicesTable.isActive, true), isNull(servicesTable.deletedAt)));
  if (!customer || !service) throw notFound('record_not_found');
  const [template] = input.templateId ? await tx.select().from(packageTemplatesTable).where(and(eq(packageTemplatesTable.clinicId, clinicId), eq(packageTemplatesTable.id, input.templateId), eq(packageTemplatesTable.isActive, true))) : [];
  if (input.templateId && (!template || !template.items.some(i => i.serviceId === service.id))) throw badRequest('package_service_not_included');
  const originalPrice = template ? decimal(milli(template.originalPrice) - milli(template.discount)) : service.price;
  const [visits] = await tx.select({ count: sql<number>`count(*)::int` }).from(appointmentsTable).where(and(eq(appointmentsTable.clinicId, clinicId), eq(appointmentsTable.customerId, customer.id), eq(appointmentsTable.status, 'completed')));
  const purchases = await tx.select({ promotion: billingInvoicesTable.promotion }).from(billingInvoicesTable).where(and(eq(billingInvoicesTable.clinicId, clinicId), eq(billingInvoicesTable.customerId, customer.id)));
  const offers = await tx.select().from(promotionalOffersTable).where(and(eq(promotionalOffersTable.clinicId, clinicId), eq(promotionalOffersTable.isActive, true))).orderBy(asc(promotionalOffersTable.id));
  const today = purchaseDay(), applicable = [];
  for (const offer of offers) {
    if (!(template ? offer.packageIds.includes(template.id) : offer.serviceIds.includes(service.id))) continue;
    let reason: string | null = offer.startsOn > today ? 'offer_not_started' : offer.endsOn < today ? 'offer_ended' : null;
    if (!reason && (offer.eligibility.customerType === 'new' && (visits?.count ?? 0) > 0 || offer.eligibility.customerType === 'existing' && !visits?.count)) reason = 'offer_patient_ineligible';
    if (!reason && milli(originalPrice) < milli(offer.eligibility.minimumSpend)) reason = 'offer_minimum_spend';
    if (!reason && offer.eligibility.maxPerPatient !== null && purchases.filter(p => p.promotion?.id === offer.id).length >= offer.eligibility.maxPerPatient) reason = 'offer_purchase_limit';
    let price = originalPrice;
    try { price = promotionalPrice(originalPrice, offer.kind, offer.value); } catch { reason ??= 'offer_price_invalid'; }
    applicable.push({ ...offer, price, eligible: !reason, reason });
  }
  const selected = input.offerId ? applicable.find(o => o.id === input.offerId) : applicable.filter(o=>o.eligible).sort((a,b)=>milli(a.price)<milli(b.price)?-1:milli(a.price)>milli(b.price)?1:a.id-b.id)[0];
  if (input.offerId && (!selected || !selected.eligible)) throw conflict(selected?.reason ?? 'offer_unavailable');
  const promotion: PromotionSnapshot | null = selected ? { id: selected.id, name: selected.name, kind: selected.kind, value: selected.value, originalPrice, price: selected.price, startsOn: selected.startsOn, endsOn: selected.endsOn, eligibility: selected.eligibility } : null;
  return { originalPrice, price: selected?.price ?? originalPrice, promotion, offers: applicable, usageRules: template?.usageRules ?? '', expiryDays: template?.expiryDays ?? null, totalSessions: template?.items.reduce((n, i) => n + i.quantity, 0) ?? 1 };
}
export function bookingQuote(actor: User, input: z.infer<typeof quoteSchema>) {
  return withOperations(actor, false, async (tx, fresh) => { requirePermission(fresh, 'customers.read'); return bookingQuoteInTx(tx, fresh, input); });
}
export function bookingPackageOptions(actor: User, input: {customerId:number;serviceId:number}) {
  return withOperations(actor,false,async(tx,fresh)=>{
    requirePermission(fresh,'appointments.manage');requirePermission(fresh,'customers.read');
    const single=await bookingQuoteInTx(tx,fresh,input);
    const templates=await tx.select().from(packageTemplatesTable).where(and(eq(packageTemplatesTable.clinicId,operatingClinic(fresh)),eq(packageTemplatesTable.isActive,true))).orderBy(asc(packageTemplatesTable.id));
    const packages=[];
    for(const template of templates.filter(p=>p.items.some(i=>i.serviceId===input.serviceId)))packages.push({...template,quote:await bookingQuoteInTx(tx,fresh,{...input,templateId:template.id})});
    return {single,packages,canPurchase:hasPermission(fresh,'customers.manage')};
  });
}
export function confirmQuoteTerms(quote: Awaited<ReturnType<typeof bookingQuoteInTx>>, expectedPrice: string | undefined, eligibilityConfirmed: boolean, rulesAccepted = true) {
  if (expectedPrice !== undefined && milli(expectedPrice) !== milli(quote.price)) throw conflict('billing_price_changed');
  if (quote.promotion?.eligibility.conditions && !eligibilityConfirmed) throw badRequest('offer_conditions_confirmation_required');
  if (quote.usageRules && !rulesAccepted) throw badRequest('package_rules_confirmation_required');
}

function notificationScope(actor: User) {
  if (!canAccessScheduling(actor) || !hasPermission(actor, 'customers.read')) throw forbidden();
  return and(eq(packageNotificationsTable.clinicId, operatingClinic(actor)), activeBranch(appointmentsTable.branchId), canReadAll(actor) ? undefined : eq(appointmentsTable.employeeId, actor.id));
}
function notices(tx: OperationsTx, actor: User) {
  return tx.select({ id: packageNotificationsTable.id, event: packageNotificationsTable.event, appointmentId: packageNotificationsTable.appointmentId, packageId: packageNotificationsTable.packageId, customerId: packageNotificationsTable.customerId, createdAt: packageNotificationsTable.createdAt, customer: customersTable.name, package: patientPackagesTable.name, readId: packageNotificationReadsTable.id })
    .from(packageNotificationsTable)
    .innerJoin(appointmentsTable, and(eq(appointmentsTable.clinicId, packageNotificationsTable.clinicId), eq(appointmentsTable.id, packageNotificationsTable.appointmentId)))
    .innerJoin(customersTable, and(eq(customersTable.clinicId, packageNotificationsTable.clinicId), eq(customersTable.id, packageNotificationsTable.customerId)))
    .innerJoin(patientPackagesTable, and(eq(patientPackagesTable.clinicId, packageNotificationsTable.clinicId), eq(patientPackagesTable.id, packageNotificationsTable.packageId)))
    .leftJoin(packageNotificationReadsTable, and(eq(packageNotificationReadsTable.clinicId, packageNotificationsTable.clinicId), eq(packageNotificationReadsTable.notificationId, packageNotificationsTable.id), eq(packageNotificationReadsTable.userId, actor.id)));
}
export function packageNotifications(actor: User) {
  return withOperations(actor, false, async (tx, fresh) => {
    const scope = notificationScope(fresh), allUnread = await notices(tx, fresh).where(and(scope, isNull(packageNotificationReadsTable.id)));
    return { unread: allUnread.length, items: (await notices(tx, fresh).where(scope).orderBy(desc(packageNotificationsTable.id)).limit(50)).map(({ readId, ...item }) => ({ ...item, read: !!readId })) };
  });
}
export function readPackageNotification(actor: User, id: number, input: { idempotencyKey: string }) {
  return operationsCommand(actor, `package.notification.read:${id}`, input, async (_tx, fresh) => { notificationScope(fresh); }, async (tx, fresh) => {
    const [notice] = await notices(tx, fresh).where(and(notificationScope(fresh), eq(packageNotificationsTable.id, id)));
    if (!notice) throw notFound('record_not_found');
    await tx.insert(packageNotificationReadsTable).values({ clinicId: operatingClinic(fresh), notificationId: id, userId: fresh.id }).onConflictDoNothing();
    return id;
  });
}
