import {sql} from 'drizzle-orm';
import {pgTable,serial,integer,text,jsonb,unique,foreignKey,check} from 'drizzle-orm/pg-core';
import {clinicsTable,languageEnum} from './clinics';
import {usersTable} from './users';
import {inventoryUnitEnum} from './inventory-units';

export const inventoryProductsTable=pgTable('inventory_products',{
 id:serial('id').primaryKey(),clinicId:integer('clinic_id').notNull(),name:text('name').notNull(),nameLang:languageEnum('name_lang').notNull().default('en'),
 unit:inventoryUnitEnum('unit').notNull(),extra:jsonb('extra').$type<Record<string,unknown>>().notNull().default({}),
 availability:text('availability').notNull().default('selected'),createdBy:integer('created_by').notNull(),
},t=>[
 unique('inventory_products_clinic_id_unique').on(t.clinicId,t.id),
 unique('inventory_products_unit_unique').on(t.clinicId,t.id,t.unit),
 foreignKey({name:'inventory_products_clinic_fk',columns:[t.clinicId],foreignColumns:[clinicsTable.id]}),
 foreignKey({name:'inventory_products_creator_fk',columns:[t.clinicId,t.createdBy],foreignColumns:[usersTable.clinicId,usersTable.id]}),
 check('inventory_products_availability_check',sql`${t.availability} in ('all','selected')`),
]);
export const inventorySettingsTable=pgTable('inventory_settings',{
 clinicId:integer('clinic_id').primaryKey().references(()=>clinicsTable.id),movementMode:text('movement_mode').notNull().default('branch'),version:integer('version').notNull().default(1),
},t=>[check('inventory_settings_mode_check',sql`${t.movementMode} in ('branch','room')`),check('inventory_settings_version_check',sql`${t.version}>0`)]);
