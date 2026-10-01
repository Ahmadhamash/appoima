import type { StaffBranchSchedule } from '@workspace/db';
import { DAYS, normalizeWeek, validBreaks, validRanges } from './setup-rules';
import { wallConverter } from './scheduling-time';

export function staffWorksAt(employee: { branchId: number | null; branchSchedules?: StaffBranchSchedule[] }, branchId: number) {
 return employee.branchSchedules?.length ? employee.branchSchedules.some(schedule => schedule.branchId === branchId) : employee.branchId === null || employee.branchId === branchId;
}
export function staffScheduleAt(employee: { branchSchedules?: StaffBranchSchedule[]; workingHours: unknown; breaks: unknown }, branchId: number) {
 const schedule = employee.branchSchedules?.find(schedule => schedule.branchId === branchId);
 return schedule ?? (employee.branchSchedules?.length?{workingHours:normalizeWeek({}),breaks:normalizeWeek({})}:{ workingHours: employee.workingHours, breaks: employee.breaks });
}
/** Compare full work shifts, including breaks, in actual time across a year of DST changes. */
export function staffScheduleIssue(schedules: readonly StaffBranchSchedule[], branches: readonly { id: number; timeZone: string }[], now = Date.now()): string | null {
 if (new Set(schedules.map(s => s.branchId)).size !== schedules.length) return 'duplicate_branch_schedule';
 for (const schedule of schedules) {
  if (!branches.some(branch => branch.id === schedule.branchId)) return 'invalid_reference';
  const hours = normalizeWeek(schedule.workingHours);
  if (!DAYS.some(day => hours[day].length)) return 'staff_branch_hours_required';
  if (!DAYS.every(day => validRanges(hours[day])) || !validBreaks(hours, normalizeWeek(schedule.breaks))) return 'invalid_hours';
 }
 if (schedules.length < 2) return null;
 const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
 const base = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z') - 86400000;
 const intervals: { start: number; end: number; branchId: number }[] = [];
 const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
 for (let offset = 0; offset < 372; offset++) {
  const date = new Date(base + offset * 86400000), key = date.toISOString().slice(0, 10), day = dayNames[date.getUTCDay()]!;
  for (const schedule of schedules) {
   const ranges = normalizeWeek(schedule.workingHours)[day];
   if (!ranges.length) continue;
   const zone=branches.find(b => b.id === schedule.branchId)!.timeZone;
   const startAt=wallConverter(key,zone,'earliest'),endAt=wallConverter(key,zone,'latest');
   for (const range of ranges) {
    let first=minute(range.open),last=minute(range.close),start=startAt(first),end=endAt(last);
    // Cover both interpretations of repeated DST times. For a clock gap, retain the
    // real portion of the shift rather than dropping a whole otherwise bookable shift.
    while(start===null&&first<last)start=startAt(++first);
    while(end===null&&last>first)end=endAt(--last);
    if (start === null || end === null || start>=end) continue;
    intervals.push({ start, end, branchId: schedule.branchId });
   }
  }
 }
 intervals.sort((a, b) => a.start - b.start);
 for (let i = 0; i < intervals.length; i++) {
  const current = intervals[i]!;
  for (let j = i + 1; j < intervals.length && intervals[j]!.start < current.end; j++) {
   if (intervals[j]!.branchId !== current.branchId) return 'staff_branch_hours_overlap';
  }
 }
 return null;
}
