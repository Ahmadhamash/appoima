import { describe, expect, it } from 'vitest';
import { milli, decimal, materialCost, timeCost, equipmentCost, equipmentSchema, actualSchema } from '../domain/costing';

describe('exact session costing arithmetic', () => {
  it('multiplies fractional stock units without binary floating point', () => {
    expect(decimal(materialCost('0.100', '12.345'))).toBe('1.235');
    expect(decimal(materialCost('999999999.999', '999999999.999'))).toBe('999999999998000000.000');
    expect(milli('0.001')).toBe(1n);
  });
  it('prorates hourly rates and rounds a half-fils upward', () => {
    expect(decimal(timeCost('10.000', 20))).toBe('3.333');
    expect(decimal(timeCost('0.003', 10))).toBe('0.001');
    expect(decimal(timeCost('0', 45))).toBe('0.000');
  });
  it('combines depreciation, maintenance and operation before rounding', () => {
    expect(decimal(equipmentCost({ purchaseCost: '1000', residualValue: '100', lifetimeUses: 1000, maintenancePerUse: '0.200', operatingHourlyCost: '3' }, 2, 30))).toBe('3.700');
    expect(decimal(equipmentCost({ purchaseCost: '1', residualValue: '0', lifetimeUses: 3, maintenancePerUse: '0', operatingHourlyCost: '0.001' }, 1, 30))).toBe('0.334');
    expect(decimal(-1234n)).toBe('-1.234');
  });
  it('rejects impossible residuals and duplicate actual assets', () => {
    expect(equipmentSchema.safeParse({ name: 'Laser', branchId: 1, roomId: null, purchaseCost: '10', residualValue: '11', lifetimeUses: 1, maintenancePerUse: '0', operatingHourlyCost: '0', isActive: true, employeeIds: [2] }).success).toBe(false);
    expect(actualSchema.safeParse({ actualMinutes: 30, equipment: [{ equipmentId: 1, uses: 1, minutes: 30 }, { equipmentId: 1, uses: 1, minutes: 30 }] }).success).toBe(false);
  });
});
