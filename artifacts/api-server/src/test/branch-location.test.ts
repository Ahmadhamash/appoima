import { describe, it, expect } from 'vitest';
import { parseDraft, emptyDraft } from '../domain/concierge-core';
import { branchSchema } from '../domain/setup-validation';
const hours = { mon: [{ open: '09:00', close: '17:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const branch = { key: 'branch_one', existingId: null, name: 'Amman', nameLang: 'en', timeZone: 'Asia/Amman', openingHours: hours };
describe('Branch location through setup', () => {
 it('upgrades legacy drafts and preserves structured location fields', () => {
  expect(parseDraft({ ...emptyDraft(), branches: [branch] }).branches[0]?.address).toBeNull();
  const location = { address: 'Amman, Test Street 5', mapUrl: 'https://maps.google.com/?q=Amman' };
  const parsed = parseDraft({ ...emptyDraft(), branches: [{ ...branch, ...location }] }).branches[0]!;
  expect(parsed).toMatchObject(location);
  const { key, existingId, ...fields } = parsed;
  expect(branchSchema.parse(fields)).toMatchObject(location);
 });
 it('rejects unsafe map schemes and oversized addresses', () => {
  for (const location of [{ mapUrl: 'javascript:alert(1)' }, { mapUrl: 'https://user:pass@example.com' }, { address: 'a'.repeat(401) }]) {
   expect(() => parseDraft({ ...emptyDraft(), branches: [{ ...branch, ...location }] })).toThrow();
  }
 });
});
