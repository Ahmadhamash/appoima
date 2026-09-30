import type {Branch,InventoryExtra,Unit,Page} from './operations-api';
export type InventoryRoom={id:number;name:string;nameLang:'en'|'ar';branchId?:number;quantity:string};
export type BranchStock=Branch&{itemId:number;quantity:string;storeQuantity:string;rooms:InventoryRoom[]};
export type InventoryProduct={id:number;name:string;nameLang:'en'|'ar';unit:Unit;extra:InventoryExtra;availability:'all'|'selected';totalQuantity:string;branches:BranchStock[]};
export type InventoryOverview=Page<InventoryProduct>&{movementMode:'branch'|'room'};
export type InventoryCatalog={services?:{id:number;name:string;nameLang:'ar'|'en';branchId:number|null}[];branches:Branch[];rooms:InventoryRoom[];movementMode:'branch'|'room';canManage:boolean};
