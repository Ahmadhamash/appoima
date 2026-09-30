import { z } from 'zod';

const index = z.number().int().min(0).max(49);
const named = { index, name: z.string().trim().min(1).max(120), detail: z.string().trim().max(1500) };
export const importApprovalEditsSchema = z.object({
  facts: z.array(z.object({ id: z.string().min(1).max(40), value: z.string().max(125000) }).strict()).max(20).refine(v => new Set(v.map(x => x.id)).size === v.length),
  services: z.array(z.object({ ...named, followUpEnabled: z.boolean() }).strict()).max(50).refine(v => new Set(v.map(x => x.index)).size === v.length),
  branches: z.array(z.object(named).strict()).max(50).refine(v => new Set(v.map(x => x.index)).size === v.length),
}).strict();
export type ImportApprovalEdits = z.infer<typeof importApprovalEditsSchema>;
