import {sql} from 'drizzle-orm';
import {pgTable,serial,integer,text,timestamp,numeric,index,unique,foreignKey,check} from 'drizzle-orm/pg-core';
import {branchesTable} from './clinics';
import {usersTable} from './users';
import {roomsTable} from './setup';
import {inventoryItemsTable} from './operations';

export const roomBlocksTable=pgTable('room_blocks',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),branchId:integer('branch_id').notNull(),roomId:integer('room_id').notNull(),
 startsAt:timestamp('starts_at',{withTimezone:true}).notNull(),endsAt:timestamp('ends_at',{withTimezone:true}).notNull(),
 kind:text('kind').notNull(),reason:text('reason').notNull(),notes:text('notes').notNull().default(''),createdBy:integer('created_by').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
 index('room_blocks_room_time_idx').on(t.clinicId,t.roomId,t.startsAt),
 foreignKey({name:'room_blocks_room_fk',columns:[t.clinicId,t.branchId,t.roomId],foreignColumns:[roomsTable.clinicId,roomsTable.branchId,roomsTable.id]}),
 foreignKey({name:'room_blocks_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
 check('room_blocks_time_check',sql`${t.endsAt}>${t.startsAt}`),
 check('room_blocks_kind_check',sql`${t.kind} in ('maintenance','block')`),
]);

export const inventoryPurchaseOrdersTable=pgTable('inventory_purchase_orders',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),branchId:integer('branch_id').notNull(),supplier:text('supplier').notNull(),
 status:text('status').notNull().default('pending'),notes:text('notes').notNull().default(''),createdBy:integer('created_by').notNull(),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),receivedAt:timestamp('received_at',{withTimezone:true}),
},t=>[
 unique('inventory_purchase_orders_clinic_id_unique').on(t.clinicId,t.id),
 unique('inventory_purchase_orders_branch_id_unique').on(t.clinicId,t.branchId,t.id),
 index('inventory_purchase_orders_branch_idx').on(t.clinicId,t.branchId,t.createdAt),
 foreignKey({name:'inventory_purchase_orders_branch_fk',columns:[t.clinicId,t.branchId],foreignColumns:[branchesTable.clinicId,branchesTable.id]}),
 foreignKey({name:'inventory_purchase_orders_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
 check('inventory_purchase_orders_status_check',sql`${t.status} in ('pending','partial','received','cancelled')`),
]);

export const inventoryPurchaseOrderLinesTable=pgTable('inventory_purchase_order_lines',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),branchId:integer('branch_id').notNull(),orderId:integer('order_id').notNull(),itemId:integer('item_id').notNull(),
 orderedQuantity:numeric('ordered_quantity',{precision:16,scale:3}).notNull(),receivedQuantity:numeric('received_quantity',{precision:16,scale:3}).notNull().default('0'),unitCost:numeric('unit_cost',{precision:16,scale:3}).notNull().default('0'),
},t=>[
 unique('inventory_purchase_order_lines_item_unique').on(t.orderId,t.itemId),
 index('inventory_purchase_order_lines_order_idx').on(t.clinicId,t.orderId),
 foreignKey({name:'inventory_purchase_order_lines_order_fk',columns:[t.clinicId,t.branchId,t.orderId],foreignColumns:[inventoryPurchaseOrdersTable.clinicId,inventoryPurchaseOrdersTable.branchId,inventoryPurchaseOrdersTable.id]}),
 foreignKey({name:'inventory_purchase_order_lines_item_fk',columns:[t.clinicId,t.branchId,t.itemId],foreignColumns:[inventoryItemsTable.clinicId,inventoryItemsTable.branchId,inventoryItemsTable.id]}),
 check('inventory_purchase_order_lines_quantity_check',sql`${t.orderedQuantity}>0 and ${t.receivedQuantity}>=0 and ${t.receivedQuantity}<=${t.orderedQuantity} and ${t.unitCost}>=0`),
]);

export const inventoryTransfersTable=pgTable('inventory_transfers',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),fromItemId:integer('from_item_id').notNull(),toItemId:integer('to_item_id').notNull(),
 fromRoomId:integer('from_room_id'),toRoomId:integer('to_room_id'),
 quantity:numeric('quantity',{precision:16,scale:3}).notNull(),notes:text('notes').notNull().default(''),createdBy:integer('created_by').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
 index('inventory_transfers_clinic_idx').on(t.clinicId,t.createdAt),
 foreignKey({name:'inventory_transfers_from_item_fk',columns:[t.clinicId,t.fromItemId],foreignColumns:[inventoryItemsTable.clinicId,inventoryItemsTable.id]}),
 foreignKey({name:'inventory_transfers_to_item_fk',columns:[t.clinicId,t.toItemId],foreignColumns:[inventoryItemsTable.clinicId,inventoryItemsTable.id]}),
 foreignKey({name:'inventory_transfers_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
 check('inventory_transfers_quantity_check',sql`${t.quantity}>0`),
 check('inventory_transfers_distinct_check',sql`${t.fromItemId}<>${t.toItemId} or ${t.fromRoomId} is distinct from ${t.toRoomId}`),
]);
