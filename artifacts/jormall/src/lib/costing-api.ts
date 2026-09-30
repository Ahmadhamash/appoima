import type {Payment} from './patient-billing';
export type CostEquipment = {
  id: number; branchId: number; roomId: number | null; name: string; equipmentType:string; purchaseCost: string; residualValue: string;
  lifetimeUses: number; maintenancePerUse: string; operatingHourlyCost: string; isActive: boolean; employeeIds: number[];
};
export type CostProfile = { configured?: boolean; branchId: number; overhead: string; materials: { itemId: number; quantity: string }[]; equipment: { equipmentId: number; uses: number; minutes: number }[] };
export type CostCatalog = {
  branches: { id: number; name: string }[];
  services: { id: number; name: string; branchId: number | null; durationMinutes: number; price: string; currency: string; requiresRoom: boolean; isActive: boolean; requiredEquipment: string[] }[];
  employees: { id: number; name: string; branchId: number | null; isActive: boolean; hourlyCost: string | null }[];
  rooms: { id: number; name: string; branchId: number; status: string; extra: { equipment?: string[] }; hourlyCost: string | null }[];
  materials: { id: number; name: string; branchId: number; unit: string; unitCost: string | null; billingType?:string; sellingPrice?:string|null; isActive: boolean }[];
  equipment: CostEquipment[]; employeeLinks: { serviceId: number; employeeId: number }[]; roomLinks: { serviceId: number; roomId: number }[]; canManage: boolean;
};
export type CostBreakdown = {
  mode: string; currency: string; durationMinutes: number; price: string|null; priceCurrency: string; billing?:Payment|null; service: { id: number; name: string };
  complete: boolean; total: string | null; knownSubtotal: string; profit: string | null; warnings: string[];
  lines: { kind: string; name: string; amount: string | null; quantity?: string; unit?: string; unitCost?: string; hourlyCost?: string; minutes?: number; uses?: number }[];
  profile: CostProfile; eligibleEmployees: { id: number; name: string }[]; eligibleRooms: { id: number; name: string }[];
};
export type CostActualInput = { actualMinutes: number; equipment: CostProfile['equipment'] };
export type CostActual = { frozen: boolean; createdAt?: string; breakdown: CostBreakdown; actual?: CostActualInput };
export type CostAppointment = { id: number; serviceId: number; branchId: number; employeeId: number; roomId: number | null; startsAt: string; endsAt: string };
