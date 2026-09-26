import { canAccessScheduling, canSchedule, isProvider, type ScheduleActor } from './scheduling-rules';
export type AssistantLanguage = 'en' | 'ar';
export const ASSISTANT_ACTIONS = ['suggest_slots', 'summarize_appointment', 'draft_reply', 'explain_waiting'] as const;
export type AssistantAction = typeof ASSISTANT_ACTIONS[number];
export const ASSISTANT_LIMITS = { questionChars: 600, historyMessages: 16, slots: 8, outputChars: 6000, contextChars: 12000 } as const;
export function canUseAssistantAction(actor: ScheduleActor, action: AssistantAction): boolean {
  if (!actor.clinicId || actor.role === 'platform_owner') return false;
  return action === 'summarize_appointment' ? canAccessScheduling(actor) : canSchedule(actor);
}
export function permittedAssistantActions(actor: ScheduleActor): AssistantAction[] {
  return ASSISTANT_ACTIONS.filter(action => canUseAssistantAction(actor, action));
}
export function isAssistantAction(value: unknown): value is AssistantAction {
  return typeof value === 'string' && (ASSISTANT_ACTIONS as readonly string[]).includes(value);
}
export function isSafeAssistantLink(href: string): boolean {
  return /^\/(?:home|clinics|appointments(?:\/view|\/waiting-list|\/new|\/[1-9]\d*(?:\/reschedule)?)?|people(?:\/customers|\/employees)?|business(?:\/settings|\/services|\/rooms|\/inventory)?)$/.test(href);
}
export function mayManageArea(actor: ScheduleActor, area: string): boolean {
  return actor.clinicId !== null && actor.role !== 'platform_owner' && actor.permissions.includes(`${area}.manage`);
}
export function mayReadArea(actor: ScheduleActor, area: string): boolean {
  return mayManageArea(actor, area) || (actor.clinicId !== null && actor.role !== 'platform_owner' && actor.permissions.includes(`${area}.read`));
}
export const canRecordMaterialsHelp = (actor: ScheduleActor) => mayManageArea(actor, 'inventory') && (canSchedule(actor) || isProvider(actor));
