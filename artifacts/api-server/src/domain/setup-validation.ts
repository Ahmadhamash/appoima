import { parseServiceDefinition, definitionIssues, type ServiceDefinition } from "@workspace/service-definition";
import { z } from "zod";
import { DAYS, validRanges, validBreaks, validTimeOff, isTimeZone, type Week } from "./setup-rules";
import { ALL_PERMISSIONS } from "./permissions";

const id = z.number().int().positive();
const nullableId = id.nullable();
const name = z.string().trim().min(1).max(120);
const lang = z.enum(["en", "ar"]);
const ids = z.array(id).max(1000).refine((v) => new Set(v).size === v.length, "duplicate_selection");
const range = z.object({ open: z.string(), close: z.string() }).strict();
const day = z.array(range).max(8).refine(validRanges, "invalid_hours");
export const weekSchema = z.object({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }).strict();
const defaultWeek = () => Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as Week;
const contactPhone = z.string().trim().max(50).nullable().optional().transform((v) => v || null);
const contactEmail = z.union([z.string().trim().email().max(200), z.literal(""), z.null()]).optional().transform((v) => v ? v.toLowerCase() : null);
export const branchSchema = z.object({ address: z.string().trim().max(400).nullable().optional(), mapUrl: z.string().max(500).url().refine(value => { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }).nullable().optional(), name, nameLang: lang, timeZone: z.string().refine(isTimeZone, "invalid_timezone"), openingHours: weekSchema }).strict();
export const serviceDefinitionSchema = z.unknown().transform((value, ctx): ServiceDefinition | null => {
  if (value === undefined || value === null) return null;
  try { return parseServiceDefinition(value); }
  catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'service_definition_invalid' }); return z.NEVER; }
});
export const serviceSchema = z.object({
  name, nameLang: lang, branchId: nullableId.default(null),
  definition: serviceDefinitionSchema.optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  price: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), "invalid_price"),
  currency: z.string().trim().toUpperCase().refine((v) => v === 'JOD', "invalid_currency"),
  category: z.enum(["Hair", "Nails", "Skin", "Laser", "Massage", "Makeup", "Other"]),
  isActive: z.boolean().default(true), requiresRoom: z.boolean().default(false), employeeIds: ids.default([]),
  followUpEnabled: z.boolean().default(false),
  requiredEquipment: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.isActive) for (const issue of definitionIssues(value.definition)) ctx.addIssue({code:z.ZodIssueCode.custom,path:issue.field.split('.'),message:issue.code});
});
export const serviceBatchSchema = z.object({ services: z.array(serviceSchema).min(1).max(20) }).strict().superRefine((value, ctx) => {
  const sections = new Set(value.services.map(service => service.definition?.section.trim()));
  if (sections.size !== 1 || sections.has(undefined)) ctx.addIssue({code:z.ZodIssueCode.custom,path:['services'],message:'services_must_share_section'});
  const names = value.services.map(service => service.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) ctx.addIssue({code:z.ZodIssueCode.custom,path:['services'],message:'duplicate_record'});
});
export const roomExtraSchema=z.object({
  roomType:z.enum(['laser','treatment','facial','injection','consultation','other']).optional(),description:z.string().trim().max(1500).optional(),
  equipment:z.array(z.string().trim().min(1).max(80)).max(40).optional(),features:z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  openingHours:weekSchema.nullable().optional(),breaks:weekSchema.nullable().optional(),
  color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),notes:z.string().trim().max(3000).optional(),
  imageDataUrl:z.string().regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/).max(2900000).nullable().optional(),employeeIds:z.array(id).max(100).refine(v=>new Set(v).size===v.length,'duplicate_selection').optional(),
}).strict();
export const roomSchema = z.object({ name, nameLang: lang, branchId: id, capacity: z.number().int().min(1).max(1000), status: z.enum(["available", "maintenance"]), serviceIds: ids.default([]),extra:roomExtraSchema.optional() }).strict();
export const customerSchema = z.object({ name, nameLang: lang, branchId: nullableId.default(null), phone: contactPhone, email: contactEmail, notes: z.string().max(5000).default(""), sensitiveNotes: z.string().max(10000).optional() }).strict().refine((v) => Boolean(v.phone || v.email), { path: ["phone"], message: "contact_required" });
const employeeFields = {
  name, nameLang: lang, email: z.string().trim().email().max(200).transform((v) => v.toLowerCase()),
  phone: contactPhone, jobTitle: z.string().trim().max(120).nullable().optional().transform((v) => v || null),
  branchId: nullableId.default(null), role: z.enum(["manager", "secretary", "doctor", "service_provider", "other_staff"]),
  permissions: z.array(z.string().refine((v) => ALL_PERMISSIONS.includes(v as typeof ALL_PERMISSIONS[number]), "invalid_permission")).max(14).refine((v) => new Set(v).size === v.length, "duplicate_selection"),
  isActive: z.boolean().default(true), serviceIds: ids.default([]),
  workingHours: weekSchema.default(defaultWeek), breaks: weekSchema.default(defaultWeek),
  timeOff: z.array(z.object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), note: z.string().max(500).default("") }).strict()).max(100).default([]).refine(validTimeOff, "invalid_time_off"),
};
const checkBreaks = (v: {workingHours: Week; breaks: Week}) => validBreaks(v.workingHours, v.breaks);
export const employeeSchema = z.object(employeeFields).strict().refine(checkBreaks, { path: ["breaks"], message: "break_outside_hours" });
// Omitted hours inherit the branch at creation; an explicit empty week stays closed.
export const newEmployeeSchema = z.object({ ...employeeFields, workingHours: weekSchema.optional(), initialPassword: z.string().min(10).max(200) }).strict().refine(v => v.workingHours === undefined || checkBreaks({...v,workingHours:v.workingHours}), { path: ["breaks"], message: "break_outside_hours" });
export const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), search: z.string().trim().max(120).default("") });
export const employeePageSchema = pageSchema.extend({ role: z.enum(["manager", "secretary", "doctor", "service_provider", "other_staff"]).optional(), branchId: z.coerce.number().int().positive().optional(), status: z.enum(["active", "inactive"]).optional() });
export type BranchInput = z.infer<typeof branchSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type ServiceBatchInput = z.infer<typeof serviceBatchSchema>;
export type RoomInput = z.infer<typeof roomSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type NewEmployeeInput = z.infer<typeof newEmployeeSchema>;
export type PageInput = z.infer<typeof pageSchema>;
export type EmployeePageInput = z.infer<typeof employeePageSchema>;
