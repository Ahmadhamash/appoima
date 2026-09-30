import {pgEnum} from 'drizzle-orm/pg-core';
export const inventoryUnitEnum=pgEnum('inventory_unit',['piece','pair','box','ml','l','g','kg']);
