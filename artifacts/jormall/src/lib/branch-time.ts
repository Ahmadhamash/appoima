/** Local wall-clock editing for Phase 2 time off. Reject DST gaps/ambiguous instants. */
export function instantToLocal(value: string, timeZone: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function localToInstant(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const base = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(base)) return null;
  // Gather actual UTC offsets around the date; this handles fractional-hour zones and DST changes.
  const candidates = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const probe = base + delta * 3600000;
    const wall = Date.parse(`${instantToLocal(new Date(probe).toISOString(), timeZone)}:00Z`);
    const candidate = base - (wall - probe);
    if (instantToLocal(new Date(candidate).toISOString(), timeZone) === value) candidates.add(candidate);
  }
  return candidates.size === 1 ? new Date([...candidates][0]!).toISOString() : null;
}
