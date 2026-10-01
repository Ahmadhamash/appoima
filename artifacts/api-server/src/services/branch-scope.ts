import { sql, type SQLWrapper } from 'drizzle-orm';
import { usersTable } from '@workspace/db';

/** Archives are retained under their original IDs and excluded from operational queries. */
export const activeBranch = (branchId: SQLWrapper) => sql`(${branchId} is null or exists (select 1 from branches live_branch where live_branch.id = ${branchId} and live_branch.archived_at is null))`;
export const activeEmployee = () => sql`(${usersTable.role} = 'manager' or (
 (jsonb_array_length(${usersTable.branchSchedules}) = 0 and ${activeBranch(usersTable.branchId)}) or
 exists (select 1 from jsonb_array_elements(${usersTable.branchSchedules}) assignment join branches live_branch on live_branch.id = (assignment->>'branchId')::int where live_branch.archived_at is null)
))`;

export const employeeAtBranch=(id:number)=>sql`(exists(select 1 from jsonb_array_elements(${usersTable.branchSchedules}) s where (s->>'branchId')::int=${id}) or (jsonb_array_length(${usersTable.branchSchedules})=0 and (${usersTable.branchId} is null or ${usersTable.branchId}=${id})))`;
