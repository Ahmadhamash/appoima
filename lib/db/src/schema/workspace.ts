import {pgTable,integer,jsonb,timestamp,check} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {clinicsTable} from './clinics';
import type {WorkspaceProfile,WorkspaceSources} from '@workspace/service-definition';
/** One internal identity per tenant; onboarding drafts remain in manager_onboarding. */
export const clinicWorkspacesTable=pgTable('clinic_workspaces',{
 clinicId:integer('clinic_id').primaryKey().references(()=>clinicsTable.id),
 revision:integer('revision').notNull().default(1),
 profile:jsonb('profile').$type<WorkspaceProfile>().notNull(),
 sources:jsonb('sources').$type<WorkspaceSources>().notNull().default({}),
 updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('clinic_workspace_revision_positive',sql`${t.revision}>0`)]);
