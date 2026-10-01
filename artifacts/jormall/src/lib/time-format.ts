/** Display helpers only. API payloads and schedule comparisons keep HH:mm / ISO values. */
export function formatClockTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return '—';
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function parseClockTime(value: string, period: string): string {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)$/.exec(value.trim());
  if (!match || !['AM', 'PM'].includes(period)) return '';
  return `${String(Number(match[1]) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${match[2]}`;
}

export function formatInstantTime(value: string | Date, zone: string | undefined, lang: string, full = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  // AM/PM and Latin clock digits remain explicit in both interface languages.
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hourCycle: 'h12' }).format(date);
  if (!full) return clock;
  const day = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-GB', { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  return `${day}, ${clock}`;
}
