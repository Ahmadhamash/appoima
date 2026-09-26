import { z } from 'zod';
import { ASSISTANT_LIMITS } from './assistant-rules';
import { HELP_TOPIC_IDS } from './assistant-help';
import { validDate } from './scheduling-rules';
const id = z.number().int().positive();
const language = z.enum(['en','ar']);
export const assistantLanguageQuery = z.object({language}).strict();
export const assistantHelpSchema = z.object({language,question:z.string().trim().min(1).max(ASSISTANT_LIMITS.questionChars).optional(),topic:z.enum(HELP_TOPIC_IDS).optional()}).strict()
  .refine(v=>Boolean(v.question)!==Boolean(v.topic),'assistant_choose_question_or_topic');
// This is an explicit read-only allowlist. Extra fields (clinicId, SQL, confirmed, tools, etc.) are rejected.
export const assistantActionSchema = z.discriminatedUnion('action',[
  z.object({action:z.literal('suggest_slots'),language,branchId:id,serviceId:id,employeeId:id,date:z.string().refine(validDate,'invalid_date')}).strict(),
  z.object({action:z.literal('summarize_appointment'),language,appointmentId:id}).strict(),
  z.object({action:z.literal('draft_reply'),language,appointmentId:id}).strict(),
  z.object({action:z.literal('explain_waiting'),language,appointmentId:id}).strict(),
]);
export type AssistantActionInput = z.infer<typeof assistantActionSchema>;
export const assistantGenerateSchema = z.object({consent:z.literal(true),request:assistantActionSchema}).strict();
export const assistantAppointmentsQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),date:z.string().refine(validDate,'invalid_date').optional()}).strict();
