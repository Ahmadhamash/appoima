/** Pure Phase 2 rules; kept independent of the database and HTTP for direct tests. */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export type Range = { open: string; close: string };
export type Week = Record<Day, Range[]>;
export type Leave = { startsAt: string; endsAt: string; note: string };

export function normalizeWeek(value: unknown): Week {
  const input = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(DAYS.map((day) => {
    const v = input[day];
    return [day, Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []];
  })) as Week;
}
export function validTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function validRanges(ranges: Range[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.open.localeCompare(b.open));
  return sorted.every((r, i) => validTime(r.open) && validTime(r.close) && r.open < r.close && (!i || sorted[i - 1]!.close <= r.open));
}
export function validBreaks(hours: Week, breaks: Week): boolean {
  return DAYS.every((d) => validRanges(breaks[d]) && breaks[d].every((b) => hours[d].some((h) => h.open <= b.open && h.close >= b.close)));
}
export function validTimeOff(entries: Leave[]): boolean {
  const sorted = [...entries].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return sorted.every((e, i) => Number.isFinite(Date.parse(e.startsAt)) && Number.isFinite(Date.parse(e.endsAt)) && Date.parse(e.startsAt) < Date.parse(e.endsAt) && (!i || Date.parse(sorted[i - 1]!.endsAt) <= Date.parse(e.startsAt)));
}
export function isTimeZone(value: string): boolean {
  if (!value.includes("/") && value !== "UTC") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function hasOpenHours(value: unknown): boolean { return DAYS.some((d) => normalizeWeek(value)[d].length > 0); }
/** Apply branch filters before pagination; cards retain clinic-wide counts. */
export function branchListPage<T extends {name:string;timeZone:string;openingHours:unknown}>(rows:T[], p:{page:number;pageSize:number;search:string;openingHours?:'configured';timeZone?:string}) {
  const timeZones = [...new Set(rows.map(row=>row.timeZone))].sort().map(timeZone=>({timeZone,count:rows.filter(row=>row.timeZone===timeZone).length}));
  const filtered=rows.filter(row=>(!p.search||row.name.toLocaleLowerCase().includes(p.search.toLocaleLowerCase()))&&(!p.openingHours||hasOpenHours(row.openingHours))&&(!p.timeZone||row.timeZone===p.timeZone));
  return {items:filtered.slice((p.page-1)*p.pageSize,p.page*p.pageSize),total:filtered.length,page:p.page,pageSize:p.pageSize,branchSummary:{total:rows.length,withOpeningHours:rows.filter(row=>hasOpenHours(row.openingHours)).length,timeZones}};
}
export function effectivePermissions(permissions: readonly string[]): Set<string> {
  const result = new Set(permissions);
  for (const p of permissions) if (p.endsWith(".manage")) result.add(p.replace(/\.manage$/, ".read"));
  return result;
}
/** Used for both creating access and editing/resetting a more privileged account. */
export function withinGrantCeiling(actor: readonly string[], requested: readonly string[]): boolean {
  const allowed = effectivePermissions(actor);
  return [...effectivePermissions(requested)].every((p) => allowed.has(p));
}
export function compatibleBranch(serviceBranch: number | null, employeeOrRoomBranch: number | null): boolean {
  return serviceBranch === null || employeeOrRoomBranch === null || serviceBranch === employeeOrRoomBranch;
}
