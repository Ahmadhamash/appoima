/** Equipment names are shared by the service editor and room editor. Match without case or spacing differences. */
export function roomHasEquipment(required: string[], roomEquipment: unknown): boolean {
  if (!required.length) return true;
  if (!Array.isArray(roomEquipment)) return false;
  const names = new Set(roomEquipment.filter((item): item is string => typeof item === 'string').map(item => item.trim().toLocaleLowerCase()));
  return required.every(item => names.has(item.trim().toLocaleLowerCase()));
}
