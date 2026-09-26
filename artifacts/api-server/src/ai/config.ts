import type { ProviderStatus } from './types';
export type AiConfig = {enabled:boolean;actionsEnabled:boolean;provider:'disabled'|'openai';apiKey:string;model:string;timeoutMs:number;maxOutputTokens:number};
const bounded=(value:string|undefined,fallback:number,min:number,max:number)=>{
  const n=Number(value);return value?.trim()&&Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;
};
export function readAiConfig(env:Record<string,string|undefined>):AiConfig {
  // Invalid flags fail closed, not truthy (the string "false" must never enable external requests).
  return {enabled:env.AI_ASSISTANT_ENABLED==='true',actionsEnabled:env.AI_ASSISTANT_ACTIONS_ENABLED===undefined||env.AI_ASSISTANT_ACTIONS_ENABLED==='true',
    provider:env.AI_ASSISTANT_PROVIDER==='openai'?'openai':'disabled',apiKey:env.OPENAI_API_KEY?.trim()??'',model:env.AI_ASSISTANT_MODEL?.trim()??'',
    timeoutMs:bounded(env.AI_ASSISTANT_TIMEOUT_MS,12000,1000,30000),maxOutputTokens:bounded(env.AI_ASSISTANT_MAX_OUTPUT_TOKENS,600,128,1200)};
}
export function providerStatus(config:AiConfig):ProviderStatus {
  if(!config.enabled) return {state:'disabled',configured:false,provider:'disabled'};
  if(config.provider!=='openai'||!config.apiKey||!config.model) return {state:'not_configured',configured:false,provider:config.provider};
  return {state:'configured_not_verified',configured:true,provider:'openai'};
}
