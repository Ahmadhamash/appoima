import {sql} from 'drizzle-orm';
import {pgTable,serial,integer,date,timestamp,numeric,unique,foreignKey,index,check} from 'drizzle-orm/pg-core';
import {clinicsTable} from './clinics';
import {inventoryItemsTable,inventoryMovementsTable} from './operations';
import {roomsTable} from './setup';
export const inventoryBatchesTable=pgTable('inventory_batches',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull().references(()=>clinicsTable.id),expiryDate:date('expiry_date'),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[unique('inventory_batches_context_unique').on(t.clinicId,t.id)]);
export const inventoryBatchAllocationsTable=pgTable('inventory_batch_allocations',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),branchId:integer('branch_id').notNull(),itemId:integer('item_id').notNull(),roomId:integer('room_id'),batchId:integer('batch_id').notNull(),movementId:integer('movement_id').references(()=>inventoryMovementsTable.id),quantity:numeric('quantity',{precision:16,scale:3}).notNull(),
},t=>[
 foreignKey({columns:[t.clinicId,t.batchId],foreignColumns:[inventoryBatchesTable.clinicId,inventoryBatchesTable.id]}),
 foreignKey({columns:[t.clinicId,t.branchId,t.itemId],foreignColumns:[inventoryItemsTable.clinicId,inventoryItemsTable.branchId,inventoryItemsTable.id]}),
 foreignKey({columns:[t.clinicId,t.branchId,t.roomId],foreignColumns:[roomsTable.clinicId,roomsTable.branchId,roomsTable.id]}),
 index('inventory_batch_allocations_location_idx').on(t.clinicId,t.itemId,t.roomId,t.batchId),index('inventory_batch_allocations_movement_idx').on(t.movementId),
 check('inventory_batch_allocations_quantity_check',sql`${t.quantity}<>0 and ${t.quantity}<>'NaN'::numeric`),
]);
