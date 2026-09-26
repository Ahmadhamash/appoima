import type { Status } from './scheduling-api';
export type AssistantAction='suggest_slots'|'summarize_appointment'|'draft_reply'|'explain_waiting';
export type HelpTopic='navigation'|'book'|'check_in'|'cancel'|'reschedule'|'waiting'|'consumption'|'own_work'|'setup'|'people'|'stock'|'owner';
export type Language='en'|'ar';
export type AssistantBootstrap={provider:{state:'disabled'|'not_configured'|'configured_not_verified';configured:boolean;provider:'disabled'|'openai'};actionsEnabled:boolean;actions:AssistantAction[];topics:{id:HelpTopic;title:string}[];readOnly:true};
export type AssistantHelp={source:'local';language:Language;topic:HelpTopic|null;title:string;steps:string[];link:{href:string;label:string}|null};
export type AssistantName={id:number;name:string;nameLang:Language};
export type AppointmentBrief={id:number;version:number;status:Status;startsAt:string;endsAt:string;timeZone:string;durationMinutes:number;customer:AssistantName;service:AssistantName;employee:AssistantName;branch:AssistantName};
export type AssistantRequest={action:'suggest_slots';language:Language;branchId:number;serviceId:number;employeeId:number;date:string}|{action:Exclude<AssistantAction,'suggest_slots'>;language:Language;appointmentId:number};
export type AssistantResult={action:AssistantAction;language:Language;source:'local';readOnly:true;asOf:string;text:string;link:{href:string;label:string};appointment?:AppointmentBrief;
  slots?:{startsAt:string;endsAt:string;roomId:number|null}[];timeZone?:string;date?:string;moreSlots?:boolean;waiting?:{offerId:number;entryId:number;status:'offered'|'booked';startsAt:string;endsAt:string;windowStart:string;windowEnd:string;hasEmployeePreference:boolean;recordedAt:string}|null;
  generation?:{provider:'openai';text:string;reviewRequired:true;usage:{inputTokens:number;outputTokens:number}|null}};
// Provider text can never become a route, HTML, or executable action.
export function safeAssistantHref(href:string):boolean {
  return /^\/(?:home|clinics|appointments(?:\/view|\/waiting-list|\/new|\/[1-9]\d*(?:\/reschedule)?)?|people(?:\/customers|\/employees)?|business(?:\/settings|\/services|\/rooms|\/inventory)?)$/.test(href);
}
