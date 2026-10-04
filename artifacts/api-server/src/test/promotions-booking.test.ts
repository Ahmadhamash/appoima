import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, usersTable, branchesTable, customersTable, servicesTable, serviceEmployeesTable, appointmentsTable, patientPackagesTable, promotionalOffersTable, billingInvoicesTable, paymentEntriesTable, type WeeklyHours } from '@workspace/db';
import { Fixture, agent, login } from './helpers';
import { ROLE_PRESETS } from '../domain/permissions';
import { purchaseDay } from '../domain/promotions';
const fx=new Fixture(),manager=agent(),secretary=agent(),foreign=agent(),viewer=agent(),provider=agent(),key=()=>randomUUID();
let clinicId:number,customerId:number,branchId:number,serviceId:number,otherServiceId:number,employeeId:number,templateId:number,offerId:number,patientPackageId:number;
const days=['mon','tue','wed','thu','fri','sat','sun'],week=Object.fromEntries(days.map(day=>[day,[{open:'00:00',close:'23:59'}]])) as WeeklyHours;
const date=(offset:number)=>{const day=new Date(purchaseDay()+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+offset);return day.toISOString().slice(0,10);};
const template=()=>({name:'Laser two sessions',description:'Two individual laser visits',usageRules:'Personal use only',items:[{serviceId,quantity:2}],originalPrice:'100',expiryDays:30});
const booking=(offset=1,extra:Record<string,unknown>={})=>({customerId,branchId,serviceId,employeeId,startsAt:date(offset)+'T10:00:00+03:00',idempotencyKey:key(),...extra});
const command=(path:string,body:Record<string,unknown>)=>manager.post('/api/clinic/billing/'+path).send({...body,idempotencyKey:key()});
async function state(id=patientPackageId){const r=await manager.get(`/api/clinic/billing/customers/${customerId}`);expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body.packages.find((p:{id:number})=>p.id===id);}
async function transition(id:number,status:string){const a=await manager.get('/api/clinic/appointments/'+id);const body={status,expectedVersion:a.body.version,reason:'Test cancellation',idempotencyKey:key()};const r=await manager.post(`/api/clinic/appointments/${id}/status`).send(body);expect(r.status,JSON.stringify(r.body)).toBe(200);return body;}
async function complete(id:number){for(const status of ['confirmed','checked_in','in_service','completed'])await transition(id,status);}
beforeAll(async()=>{
  if(process.env.TEST_DATABASE_DISPOSABLE!=='1')throw Error('Requires a disposable test database');
  clinicId=(await fx.createClinic()).id;
  for(const [client,role,permissions]of [[manager,'manager',ROLE_PRESETS.manager],[secretary,'secretary',ROLE_PRESETS.secretary],[viewer,'other_staff',['services.read']],[provider,'doctor',ROLE_PRESETS.doctor]] as const){const u=await fx.createUser({clinicId,role,permissions:[...permissions]});expect((await login(client,u.email,u.password)).status).toBe(200);if(role==='doctor'){employeeId=u.id;await db.update(usersTable).set({workingHours:week}).where(eq(usersTable.id,u.id));}}
  const outsider=await fx.createUser({clinicId:(await fx.createClinic()).id,role:'manager',permissions:ROLE_PRESETS.manager});await login(foreign,outsider.email,outsider.password);
  const [branch]=await db.insert(branchesTable).values({clinicId,name:'Amman',timeZone:'Asia/Amman',openingHours:week}).returning();branchId=branch!.id;
  const [patient]=await db.insert(customersTable).values({clinicId,name:'Package patient',email:'packages@example.test'}).returning();customerId=patient!.id;
  const rows=await db.insert(servicesTable).values(['Laser','Consultation'].map(name=>({clinicId,branchId,name,durationMinutes:30,price:'60',currency:'JOD',category:name,requiresRoom:false}))).returning();serviceId=rows[0]!.id;otherServiceId=rows[1]!.id;
  await db.insert(serviceEmployeesTable).values(rows.map(s=>({clinicId,serviceId:s.id,employeeId})));
});
afterAll(async()=>{if(fx.clinicIds.length)await db.update(usersTable).set({isActive:false}).where(inArray(usersTable.clinicId,fx.clinicIds));});
describe('Packages, offer purchase periods and individual session booking',()=>{
  it('manages catalog entries with clinic and permission isolation',async()=>{
    const r=await command('packages',template());expect(r.status,JSON.stringify(r.body)).toBe(201);templateId=r.body.id;
    expect((await viewer.post(`/api/clinic/billing/packages/${templateId}/edit`).send({...template(),idempotencyKey:key()})).status).toBe(403);
    expect((await foreign.post(`/api/clinic/billing/packages/${templateId}/active`).send({isActive:false,idempotencyKey:key()})).status).toBe(404);
    expect((await command(`packages/${templateId}/active`,{isActive:false})).status).toBe(200);
    expect((await manager.post('/api/clinic/billing/booking-options').send({customerId,serviceId})).body.packages).toEqual([]);
    await command(`packages/${templateId}/active`,{isActive:true});
    const offer={name:'Package launch',kind:'price',value:'80',packageIds:[templateId],startsOn:date(-1),endsOn:date(2),eligibility:{conditions:'Confirm personal use',maxPerPatient:1}};
    const o=await command('offers',offer);expect(o.status,JSON.stringify(o.body)).toBe(201);offerId=o.body.id;
    expect((await viewer.post(`/api/clinic/billing/offers/${offerId}/active`).send({isActive:false,idempotencyKey:key()})).status).toBe(403);
    const options=await secretary.post('/api/clinic/billing/booking-options').send({customerId,serviceId});expect(options.status).toBe(200);expect(options.body.packages[0]).toMatchObject({description:template().description,quote:{price:'80.000',totalSessions:2,promotion:{id:offerId}}});
    const plain=await manager.post('/api/clinic/billing/booking-options').send({customerId,serviceId:otherServiceId});expect(plain.body.packages).toEqual([]);
    expect((await foreign.post('/api/clinic/billing/booking-options').send({customerId,serviceId})).status).toBe(404);
  });
  it('validates discount periods, targets and eligibility and applies single-session offers without packages',async()=>{
    for(const body of [{name:'Bad',kind:'percent',value:'101',serviceIds:[otherServiceId],startsOn:date(0),endsOn:date(1)},{name:'Bad period',kind:'amount',value:'5',serviceIds:[otherServiceId],startsOn:date(1),endsOn:date(0)}])expect((await command('offers',body)).status).toBe(400);
    const r=await command('offers',{name:'Single visit',kind:'percent',value:'25',serviceIds:[otherServiceId],startsOn:date(-1),endsOn:date(1)});expect(r.status).toBe(201);
    const quote=await manager.post('/api/clinic/billing/booking-options').send({customerId,serviceId:otherServiceId});expect(quote.body).toMatchObject({packages:[],single:{price:'45.000',promotion:{id:r.body.id}}});
    const appointment=await manager.post('/api/clinic/appointments').send(booking(2,{serviceId:otherServiceId,offerId:r.body.id,expectedOfferPrice:'45.000'}));expect(appointment.status,JSON.stringify(appointment.body)).toBe(201);
    const detail=await manager.get('/api/clinic/appointments/'+appointment.body.id);expect(detail.body.chargePrice).toBe('45.000');
    const [invoice]=await db.select().from(billingInvoicesTable).where(eq(billingInvoicesTable.appointmentId,appointment.body.id));expect(invoice).toMatchObject({originalPrice:'60.000',discount:'15.000',promotion:{id:r.body.id}});
    expect((await manager.post(`/api/clinic/appointments/${appointment.body.id}/charge`).send({price:'60',expectedVersion:detail.body.version,idempotencyKey:key()})).body.error).toBe('offer_appointment_fee_locked');
    const inactive=await command(`offers/${r.body.id}/active`,{isActive:false});expect(inactive.status).toBe(200);
    expect((await manager.post('/api/clinic/billing/quote').send({customerId,serviceId:otherServiceId,offerId:r.body.id})).body.error).toBe('offer_unavailable');
  });
  it('rolls back purchase/payment on conflicts and rejects unaccepted terms or changed prices',async()=>{
    const purchase={templateId,offerId,expectedPrice:'80',rulesAccepted:true,eligibilityConfirmed:true,payment:{amount:'80',method:'cash'}};
    expect((await manager.post('/api/clinic/appointments').send(booking(3,{purchasePackage:{...purchase,rulesAccepted:false}}))).body.error).toBe('package_rules_confirmation_required');
    expect((await manager.post('/api/clinic/appointments').send(booking(3,{purchasePackage:{...purchase,eligibilityConfirmed:false}}))).body.error).toBe('offer_conditions_confirmation_required');
    expect((await manager.post('/api/clinic/appointments').send(booking(3,{purchasePackage:{...purchase,expectedPrice:'1'}}))).body.error).toBe('billing_price_changed');
    const taken=await manager.post('/api/clinic/appointments').send(booking(3));expect(taken.status).toBe(201);
    expect((await manager.post('/api/clinic/appointments').send(booking(3,{purchasePackage:purchase}))).status).toBe(409);
    expect(await db.select().from(patientPackagesTable).where(eq(patientPackagesTable.clinicId,clinicId))).toHaveLength(0);
    expect(await db.select().from(paymentEntriesTable).where(eq(paymentEntriesTable.clinicId,clinicId))).toHaveLength(0);
    await transition(taken.body.id,'cancelled');
  });
  it('purchases once, books only the first session and preserves purchased terms on edits',async()=>{
    const body=booking(4,{purchasePackage:{templateId,offerId,expectedPrice:'80',rulesAccepted:true,eligibilityConfirmed:true,payment:{amount:'80',method:'cash'}}});
    const r=await manager.post('/api/clinic/appointments').send(body);expect(r.status,JSON.stringify(r.body)).toBe(201);
    const replay=await manager.post('/api/clinic/appointments').send(body);expect(replay.body).toMatchObject({id:r.body.id,replayed:true});
    const [pkg]=await db.select().from(patientPackagesTable).where(eq(patientPackagesTable.clinicId,clinicId));patientPackageId=pkg!.id;
    expect(await state()).toMatchObject({description:'Two individual laser visits',used:0,reserved:1,available:1,totalSessions:2,invoice:{financial:{total:'80.000',paid:'80.000'},promotion:{id:offerId}}});
    expect((await manager.get('/api/clinic/appointments/'+r.body.id)).body.chargePrice).toBe('0.000');
    expect(await db.select().from(paymentEntriesTable).where(eq(paymentEntriesTable.clinicId,clinicId))).toHaveLength(1);
    expect((await command(`packages/${templateId}/edit`,{...template(),description:'New description',originalPrice:'150',usageRules:'Changed terms'})).status).toBe(200);
    expect(await state()).toMatchObject({description:'Two individual laser visits',usageRules:'Personal use only',invoice:{financial:{total:'80.000'}}});
    expect((await manager.post('/api/clinic/billing/quote').send({customerId,serviceId,templateId,offerId})).body.error).toBe('offer_purchase_limit');
    await transition(r.body.id,'cancelled');expect(await state()).toMatchObject({used:0,reserved:0,available:2});
  });
  it('uses balances after offer expiry and template deactivation, prevents overbooking and emits final-session notices once',async()=>{
    await command(`packages/${templateId}/active`,{isActive:false});
    await db.update(promotionalOffersTable).set({startsOn:date(-3),endsOn:date(-1)}).where(eq(promotionalOffersTable.id,offerId));
    expect((await manager.post('/api/clinic/billing/booking-options').send({customerId,serviceId})).body.packages).toEqual([]);
    const requests=await Promise.all([5,6,7].map(n=>manager.post('/api/clinic/appointments').send(booking(n,{packageId:patientPackageId,packageRulesAccepted:true}))));
    const booked=requests.filter(r=>r.status===201);expect(booked).toHaveLength(2);expect(requests.find(r=>r.status!==201)?.body.error).toBe('package_no_sessions');
    expect(await state()).toMatchObject({used:0,reserved:2,available:0});
    await complete(booked[0]!.body.id);expect(await state()).toMatchObject({used:1,reserved:1,available:0});
    const last=booked[1]!.body.id;await transition(last,'confirmed');await transition(last,'checked_in');
    const checked=await manager.get('/api/clinic/billing/notifications');expect(checked.body.items).toHaveLength(1);expect(checked.body.items[0]).toMatchObject({event:'final_check_in',appointmentId:last,packageId:patientPackageId,read:false});
    const ownNotice=await provider.get('/api/clinic/billing/notifications');expect(ownNotice.body.unread).toBe(1);
    await transition(last,'in_service');const body=await transition(last,'completed');expect((await manager.post(`/api/clinic/appointments/${last}/status`).send(body)).body.replayed).toBe(true);
    expect(await state()).toMatchObject({status:'completed',used:2,reserved:0,available:0,remaining:0});
    const notices=await manager.get('/api/clinic/billing/notifications');expect(notices.body.items).toHaveLength(2);expect(notices.body.items[0].event).toBe('final_completed');
    await command(`notifications/${notices.body.items[0].id}/read`,{});expect((await manager.get('/api/clinic/billing/notifications')).body.unread).toBe(1);expect((await secretary.get('/api/clinic/billing/notifications')).body.unread).toBe(2);
    expect((await foreign.post(`/api/clinic/billing/notifications/${notices.body.items[0].id}/read`).send({idempotencyKey:key()})).status).toBe(404);
    expect(await db.select().from(paymentEntriesTable).where(eq(paymentEntriesTable.clinicId,clinicId))).toHaveLength(1);
  });
  it('requires appointments to end inside package validity and rejects no-remaining/expired packages',async()=>{
    await command(`packages/${templateId}/active`,{isActive:true});
    const bought=await command(`customers/${customerId}/packages`,{templateId});expect(bought.status).toBe(201);
    const id=bought.body.id;
    await db.update(patientPackagesTable).set({expiresAt:new Date(date(8)+'T10:15:00+03:00')}).where(eq(patientPackagesTable.id,id));
    const future=await manager.post('/api/clinic/appointments').send(booking(8,{packageId:id,packageRulesAccepted:true}));expect(future.body.error).toBe('package_session_outside_validity');
    await db.update(patientPackagesTable).set({expiresAt:new Date(Date.now()-1000)}).where(eq(patientPackagesTable.id,id));
    expect((await manager.post('/api/clinic/appointments').send(booking(1,{packageId:id,packageRulesAccepted:true}))).body.error).toBe('package_not_active');
  });
});
