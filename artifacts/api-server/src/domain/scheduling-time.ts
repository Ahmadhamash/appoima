import { normalizeWeek, type Day, type Leave } from './setup-rules';
import { overlaps, validDate } from './scheduling-rules';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(zone, f); }
  return f;
}
export function wallTime(instant: Date | number | string, zone: string): string {
  const p = formatter(zone).formatToParts(new Date(instant));
  const get = (type: string) => p.find((v) => v.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function branchDate(instant: Date | number | string, zone: string): string { return wallTime(instant, zone).slice(0, 10); }
/** Gaps and ambiguous wall times are omitted, not guessed. Same conservative policy as staff leave. */
export function wallConverter(date: string, zone: string, ambiguity?:'earliest'|'latest'): (minute: number) => number | null {
  const base = Date.parse(`${date}T00:00:00Z`), offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36, 48]) {
    const probe = base + hours * 3600000;
    offsets.add(Date.parse(`${wallTime(probe, zone)}:00Z`) - probe);
  }
  return (minute) => {
    const target = base + minute * 60000;
    const local = new Date(target).toISOString().slice(0, 16);
    const candidates = [...offsets].map((offset) => target - offset).filter((instant) => wallTime(instant, zone) === local);
    if(candidates.length>1&&ambiguity)return ambiguity==='earliest'?Math.min(...candidates):Math.max(...candidates);
    return candidates.length === 1 ? candidates[0]! : null;
  };
}
const weekdays: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export type BusyInterval = { startsAt: Date | string; endsAt: Date | string; employeeId: number; roomId: number | null };
export type Slot = { startsAt: string; endsAt: string; roomId: number | null };
export type SlotInput = {
  date: string; timeZone: string; branchHours: unknown; workingHours: unknown; breaks: unknown;
  timeOff: Leave[]; durationMinutes: number; employeeId: number; requiresRoom: boolean;
  roomIds: number[]; busy: BusyInterval[]; now: number;
  roomHours?: Record<number,unknown>; roomBreaks?: Record<number,unknown>;
};
export const SLOT_STEP_MINUTES = 15;
export function computeSlots(input: SlotInput): Slot[] {
  if (!validDate(input.date) || input.durationMinutes < 1 || input.durationMinutes > 1440) return [];
  const day = weekdays[new Date(`${input.date}T12:00:00Z`).getUTCDay()]!;
  const branch = normalizeWeek(input.branchHours)[day], work = normalizeWeek(input.workingHours)[day], breaks = normalizeWeek(input.breaks)[day];
  if (!branch.length || !work.length || (input.requiresRoom && !input.roomIds.length)) return [];
  const contains = (ranges: typeof branch, start: number, end: number) => ranges.some((r) => minutes(r.open) <= start && minutes(r.close) >= end);
  const toUtc = wallConverter(input.date, input.timeZone);
  const busy = input.busy.map((v) => ({ ...v, start: new Date(v.startsAt).getTime(), end: new Date(v.endsAt).getTime() }));
  const leave = input.timeOff.map((v) => ({ start: Date.parse(v.startsAt), end: Date.parse(v.endsAt) }));
  const slots: Slot[] = [];
  for (let minute = 0; minute < 1440; minute += SLOT_STEP_MINUTES) {
    const endMinute = minute + input.durationMinutes;
    if (endMinute >= 1440 || !contains(branch, minute, endMinute) || !contains(work, minute, endMinute)) continue;
    if (breaks.some((b) => overlaps(minute, endMinute, minutes(b.open), minutes(b.close)))) continue;
    const start = toUtc(minute), end = toUtc(endMinute);
    // Do not silently stretch/shorten a service across a daylight-saving transition.
    if (start === null || end === null || start <= input.now || end - start !== input.durationMinutes * 60000) continue;
    if (leave.some((l) => overlaps(start, end, l.start, l.end))) continue;
    if (busy.some((b) => b.employeeId === input.employeeId && overlaps(start, end, b.start, b.end))) continue;
    const room = input.requiresRoom ? [...input.roomIds].sort((a, b) => a - b).find((id) => {
      const hours=input.roomHours?.[id],roomBreaks=input.roomBreaks?.[id];
      return (!hours||contains(normalizeWeek(hours)[day],minute,endMinute))&&
        (!roomBreaks||!normalizeWeek(roomBreaks)[day].some((b)=>overlaps(minute,endMinute,minutes(b.open),minutes(b.close))))&&
        !busy.some((b) => b.roomId === id && overlaps(start, end, b.start, b.end));
    }) : null;
    if (input.requiresRoom && room === undefined) continue;
    slots.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), roomId: room ?? null });
  }
  return slots;
}
