import { and, eq, inArray } from 'drizzle-orm';
import { branchesTable, type StaffBranchSchedule } from '@workspace/db';
import type { OperationsTx } from './operations-context';
import { staffScheduleIssue } from '../domain/staff-branches';
import { badRequest,notFound } from '../lib/errors';

export async function validateStaffSchedules(tx: OperationsTx, clinicId: number, schedules: StaffBranchSchedule[]) {
 const ids=schedules.map(s=>s.branchId);
 const branches=ids.length?await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinicId),inArray(branchesTable.id,ids))):[];
 if(branches.length!==ids.length||branches.some(branch=>branch.archivedAt))throw notFound('record_not_found');
 const issue=staffScheduleIssue(schedules,branches);
 if(issue)throw badRequest(issue);
}
