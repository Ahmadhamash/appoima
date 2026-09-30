import {and,asc,eq,gt,inArray,lt,ne,sql} from 'drizzle-orm';
import {appointmentsTable,branchesTable,customersTable,roomsTable,roomBlocksTable,roomServicesTable,servicesTable,usersTable,type User} from '@workspace/db';
import {hasPermission} from '../domain/permissions';
import type {RoomBlockInput,RoomRange} from '../domain/room-workflow-validation';
import {conflict,forbidden,notFound} from '../lib/errors';
import {recordAudit} from './audit';
import {operatingClinic,operationsCommand,withOperations} from './operations-context';

const allowed=(actor:User,manage=false)=>{if(!hasPermission(actor,manage?'rooms.manage':'rooms.read'))throw forbidden();};

export async function roomOverview(actor:User){return withOperations(actor,false,async(tx,fresh)=>{
 allowed(fresh);const clinicId=operatingClinic(fresh),now=new Date();
 const rows=await tx.select({room:roomsTable,branch:{id:branchesTable.id,name:branchesTable.name,nameLang:branchesTable.nameLang,timeZone:branchesTable.timeZone}})
  .from(roomsTable).innerJoin(branchesTable,and(eq(branchesTable.clinicId,clinicId),eq(branchesTable.id,roomsTable.branchId)))
  .where(eq(roomsTable.clinicId,clinicId)).orderBy(asc(roomsTable.name)).limit(500);
 const ids=rows.map(row=>row.room.id);
 const links=ids.length?await tx.select({roomId:roomServicesTable.roomId,serviceId:roomServicesTable.serviceId}).from(roomServicesTable)
  .where(and(eq(roomServicesTable.clinicId,clinicId),inArray(roomServicesTable.roomId,ids))):[];
 const bookings=ids.length&&hasPermission(fresh,'appointments.read')?await tx.select({id:appointmentsTable.id,roomId:appointmentsTable.roomId,startsAt:appointmentsTable.startsAt,endsAt:appointmentsTable.endsAt,status:appointmentsTable.status})
  .from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinicId),inArray(appointmentsTable.roomId,ids),ne(appointmentsTable.status,'cancelled'),gt(appointmentsTable.endsAt,now),lt(appointmentsTable.startsAt,new Date(now.getTime()+31*86400000))))
  .orderBy(asc(appointmentsTable.startsAt)).limit(2000):[];
 return {rooms:rows.map(({room,branch})=>({...room,branch,serviceIds:links.filter(link=>link.roomId===room.id).map(link=>link.serviceId),
  inUse:bookings.some(booking=>booking.roomId===room.id&&booking.startsAt<=now&&booking.endsAt>now),nextBooking:bookings.find(booking=>booking.roomId===room.id&&booking.startsAt>now)?.startsAt??null})),
  canManage:hasPermission(fresh,'rooms.manage'),total:rows.length};
});}

export async function roomSchedule(actor:User,input:RoomRange){return withOperations(actor,false,async(tx,fresh)=>{
 allowed(fresh);const clinicId=operatingClinic(fresh),from=new Date(input.from),to=new Date(input.to);
 if(input.roomId){const [room]=await tx.select({id:roomsTable.id}).from(roomsTable).where(and(eq(roomsTable.clinicId,clinicId),eq(roomsTable.id,input.roomId)));if(!room)throw notFound('record_not_found');}
 const roomFilter=input.roomId?eq(roomBlocksTable.roomId,input.roomId):undefined;
 const blocks=await tx.select().from(roomBlocksTable).where(and(eq(roomBlocksTable.clinicId,clinicId),roomFilter,lt(roomBlocksTable.startsAt,to),gt(roomBlocksTable.endsAt,from)))
  .orderBy(asc(roomBlocksTable.startsAt)).limit(2000);
 const bookings=hasPermission(fresh,'appointments.read')?await tx.select({id:appointmentsTable.id,roomId:appointmentsTable.roomId,startsAt:appointmentsTable.startsAt,endsAt:appointmentsTable.endsAt,status:appointmentsTable.status,
  customer:{id:customersTable.id,name:customersTable.name,nameLang:customersTable.nameLang},service:{id:servicesTable.id,name:servicesTable.name,nameLang:servicesTable.nameLang},staff:{id:usersTable.id,name:usersTable.name,nameLang:usersTable.nameLang}})
  .from(appointmentsTable).innerJoin(customersTable,and(eq(customersTable.clinicId,clinicId),eq(customersTable.id,appointmentsTable.customerId)))
  .innerJoin(servicesTable,and(eq(servicesTable.clinicId,clinicId),eq(servicesTable.id,appointmentsTable.serviceId)))
  .innerJoin(usersTable,and(eq(usersTable.clinicId,clinicId),eq(usersTable.id,appointmentsTable.employeeId)))
  .where(and(eq(appointmentsTable.clinicId,clinicId),input.roomId?eq(appointmentsTable.roomId,input.roomId):sql`${appointmentsTable.roomId} is not null`,ne(appointmentsTable.status,'cancelled'),lt(appointmentsTable.startsAt,to),gt(appointmentsTable.endsAt,from)))
  .orderBy(asc(appointmentsTable.startsAt)).limit(3000):[];
 return {blocks,bookings,canManage:hasPermission(fresh,'rooms.manage')};
});}

export async function createRoomBlock(actor:User,roomId:number,input:RoomBlockInput){return operationsCommand(actor,`room:block:${roomId}`,input,async(tx,fresh)=>{
 allowed(fresh,true);const [room]=await tx.select({id:roomsTable.id}).from(roomsTable).where(and(eq(roomsTable.clinicId,operatingClinic(fresh)),eq(roomsTable.id,roomId)));if(!room)throw notFound('record_not_found');
},async(tx,fresh)=>{
 const clinicId=operatingClinic(fresh),from=new Date(input.startsAt),to=new Date(input.endsAt);
 const [room]=await tx.select({branchId:roomsTable.branchId}).from(roomsTable).where(and(eq(roomsTable.clinicId,clinicId),eq(roomsTable.id,roomId)));
 const [booking]=await tx.select({id:appointmentsTable.id}).from(appointmentsTable).where(and(eq(appointmentsTable.clinicId,clinicId),eq(appointmentsTable.roomId,roomId),ne(appointmentsTable.status,'cancelled'),lt(appointmentsTable.startsAt,to),gt(appointmentsTable.endsAt,from))).limit(1);
 const [block]=await tx.select({id:roomBlocksTable.id}).from(roomBlocksTable).where(and(eq(roomBlocksTable.clinicId,clinicId),eq(roomBlocksTable.roomId,roomId),lt(roomBlocksTable.startsAt,to),gt(roomBlocksTable.endsAt,from))).limit(1);
 if(booking||block)throw conflict('slot_taken');
 const [created]=await tx.insert(roomBlocksTable).values({clinicId,branchId:room!.branchId,roomId,startsAt:from,endsAt:to,kind:input.kind,reason:input.reason,notes:input.notes,createdBy:fresh.id}).returning({id:roomBlocksTable.id});
 await recordAudit({clinicId,actorUserId:fresh.id,action:'room.block_created',entityType:'room_block',entityId:created!.id,details:{roomId,kind:input.kind}},tx);
 return created!.id;
});}

export async function removeRoomBlock(actor:User,id:number){return withOperations(actor,true,async(tx,fresh)=>{
 allowed(fresh,true);const clinicId=operatingClinic(fresh),[block]=await tx.select().from(roomBlocksTable).where(and(eq(roomBlocksTable.clinicId,clinicId),eq(roomBlocksTable.id,id)));
 if(!block)throw notFound('record_not_found');if(block.startsAt<=new Date())throw conflict('operation_changed');
 await tx.delete(roomBlocksTable).where(and(eq(roomBlocksTable.clinicId,clinicId),eq(roomBlocksTable.id,id)));
 await recordAudit({clinicId,actorUserId:fresh.id,action:'room.block_removed',entityType:'room_block',entityId:id},tx);
 return {id};
});}
