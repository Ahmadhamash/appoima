import { activeBranch, activeEmployee } from './branch-scope';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, usersTable, clinicsTable, schedulingCommandsTable, type User } from '@workspace/db';
import { canonicalJson } from '../domain/scheduling-rules';
import { forbidden, conflict, badRequest } from '../lib/errors';
export type OperationsTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export function operatingClinic(actor:User):number {
  if(!actor.clinicId||actor.role==='platform_owner') throw forbidden();
  return actor.clinicId;
}
export async function refreshOperatingActor(tx:OperationsTx,actor:User):Promise<User> {
  const [r]=await tx.select({user:usersTable,status:clinicsTable.status}).from(usersTable).innerJoin(clinicsTable,eq(clinicsTable.id,usersTable.clinicId))
    .where(and(eq(usersTable.id,actor.id),and(eq(usersTable.clinicId,operatingClinic(actor)), activeEmployee())));
  if(!r||!r.user.isActive||r.user.mustChangePassword||r.status!=='active') throw forbidden();
  operatingClinic(r.user);return r.user;
}
export function mapOperationsError(error:unknown):never {
  const e=error as {code?:string;constraint?:string;cause?:{code?:string;constraint?:string}}, code=e.code??e.cause?.code, constraint=e.constraint??e.cause?.constraint;
  if(code==='23P01') throw conflict('slot_taken');
  if(code==='23503') throw badRequest('invalid_reference');
  if(code==='23514'&&constraint==='inventory_nonnegative_guard') throw conflict('insufficient_stock');
  if(code==='23514'&&constraint==='inventory_consumption_lines_guard') throw conflict('consumption_locked');
  if(code==='23505') throw conflict('operation_changed');
  if(code==='40001'||code==='40P01') throw conflict('scheduling_retry');
  throw error;
}
/** All setup, scheduling and stock writes share this lock order, including permission rechecks. */
export async function withOperations<T>(actor:User,write:boolean,work:(tx:OperationsTx,fresh:User)=>Promise<T>):Promise<T> {
  try{return await db.transaction(async tx=>{
    const clinicId=operatingClinic(actor);
    await tx.execute(write?sql`select pg_advisory_xact_lock(7140002,${clinicId})`:sql`select pg_advisory_xact_lock_shared(7140002,${clinicId})`);
    return work(tx,await refreshOperatingActor(tx,actor));
  });}catch(error){mapOperationsError(error);}
}
export function operationHash(operation:string,input:Record<string,unknown>) {
  const {idempotencyKey:_key,...payload}=input;
  return createHash('sha256').update(canonicalJson({operation,payload})).digest('hex');
}
export async function replayOperation(tx:OperationsTx,actor:User,operation:string,input:{idempotencyKey:string}&Record<string,unknown>) {
  const [old]=await tx.select().from(schedulingCommandsTable).where(and(eq(schedulingCommandsTable.clinicId,operatingClinic(actor)),eq(schedulingCommandsTable.actorId,actor.id),eq(schedulingCommandsTable.key,input.idempotencyKey)));
  if(old&&(old.operation!==operation||old.requestHash!==operationHash(operation,input)))throw conflict('idempotency_mismatch');
  return old?{id:old.resultId,replayed:true}:null;
}
export async function saveOperation(tx:OperationsTx,actor:User,operation:string,input:{idempotencyKey:string}&Record<string,unknown>,id:number) {
  await tx.insert(schedulingCommandsTable).values({clinicId:operatingClinic(actor),actorId:actor.id,key:input.idempotencyKey,operation,requestHash:operationHash(operation,input),resultId:id});
  return {id,replayed:false};
}
export async function operationsCommand<T extends {idempotencyKey:string}>(actor:User,operation:string,input:T,
  authorize:(tx:OperationsTx,fresh:User)=>Promise<void>,work:(tx:OperationsTx,fresh:User)=>Promise<number>) {
  return withOperations(actor,true,async(tx,fresh)=>{
    await authorize(tx,fresh);
    const replay=await replayOperation(tx,fresh,operation,input);if(replay)return replay;
    return saveOperation(tx,fresh,operation,input,await work(tx,fresh));
  });
}
