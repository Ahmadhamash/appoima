import { DAYS, type Week } from './concierge/contract';

export type WeeklySchedule = { workingHours: Week; breaks: Week };
export const emptyScheduleWeek = (): Week => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
type Range = Week[typeof DAYS[number]][number];

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const sorted = (ranges: Range[]) => [...ranges].sort((a, b) => a.open.localeCompare(b.open));
const validRanges = (ranges: Range[]) => ranges.length <= 8 && sorted(ranges).every((range, index, all) =>
  validTime(range.open) && validTime(range.close) && range.open < range.close && (!index || all[index - 1]!.close <= range.open));

export function scheduleDayValid(hours: Range[], breaks: Range[]) {
  return validRanges(hours) && validRanges(breaks) && breaks.every(pause =>
    hours.some(range => range.open <= pause.open && pause.close <= range.close));
}

/** Closed gaps in a branch's existing opening hours are displayed as breaks. */
export function scheduleFromBranchHours(openingHours: Week): WeeklySchedule {
  const workingHours = emptyScheduleWeek(), breaks = emptyScheduleWeek();
  for (const day of DAYS) {
    const ranges = sorted(openingHours[day]);
    if (!ranges.length) continue;
    if (!validRanges(ranges)) { workingHours[day] = structuredClone(ranges); continue; }
    workingHours[day] = [{ open: ranges[0]!.open, close: ranges.at(-1)!.close }];
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i - 1]!.close < ranges[i]!.open) breaks[day].push({ open: ranges[i - 1]!.close, close: ranges[i]!.open });
    }
  }
  return { workingHours, breaks };
}

/** Split branch opening intervals around breaks so every booking path excludes them. */
export function branchHoursFromSchedule(schedule: WeeklySchedule): Week {
  const week = emptyScheduleWeek();
  for (const day of DAYS) {
    const hours = sorted(schedule.workingHours[day]), pauses = sorted(schedule.breaks[day]);
    if (!scheduleDayValid(hours, pauses)) { week[day] = [{ open: '', close: '' }]; continue; }
    for (const range of hours) {
      let start = range.open;
      for (const pause of pauses.filter(p => range.open <= p.open && p.close <= range.close)) {
        if (start < pause.open) week[day].push({ open: start, close: pause.open });
        start = pause.close;
      }
      if (start < range.close) week[day].push({ open: start, close: range.close });
    }
    if (week[day].length > 8 || hours.length && !week[day].length) week[day] = [{ open: '', close: '' }];
  }
  return week;
}
