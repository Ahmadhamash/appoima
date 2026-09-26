import type { AssistantAction, AssistantLanguage } from '../domain/assistant-rules';
/** Only a server-created, field-allowlisted operational packet crosses the provider boundary. */
export type ProviderPacket = {action:AssistantAction;language:AssistantLanguage;approvedText:string;facts:Record<string,unknown>};
export type ProviderFailure = 'disabled'|'not_configured'|'timeout'|'rate_limited'|'authentication'|'network'|'invalid_response'|'refused'|'provider_error';
export type ProviderResult =
  | {available:true;provider:'openai';text:string;usage:{inputTokens:number;outputTokens:number}|null}
  | {available:false;reason:ProviderFailure};
export interface AssistantProvider { generate(packet:ProviderPacket):Promise<ProviderResult> }
export type ProviderStatus = {state:'disabled'|'not_configured'|'configured_not_verified';configured:boolean;provider:'disabled'|'openai'};
