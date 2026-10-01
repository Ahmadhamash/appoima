import type { Week } from './setup-api';

const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function branchToday(zone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}

/** Dates are branch-local calendar days, independent of the browser timezone. */
export function bookingDateAllowed(value: string, openingHours: Week | undefined, zone: string, now = new Date()): boolean {
  if (!/^\d{4}-\d\d-\d\d$/.test(value) || value < branchToday(zone, now)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return (openingHours?.[days[date.getUTCDay()]!]?.length ?? 0) > 0;
}

export function nextBookingDate(openingHours: Week | undefined, zone: string, now = new Date()): string {
  const today = branchToday(zone, now), date = new Date(`${today}T12:00:00Z`);
  for (let offset = 0; offset < 7; offset++) {
    const value = date.toISOString().slice(0, 10);
    if (bookingDateAllowed(value, openingHours, zone, now)) return value;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return '';
}
