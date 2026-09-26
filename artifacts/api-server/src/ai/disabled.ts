import type { AssistantProvider, ProviderResult } from './types';
export class DisabledProvider implements AssistantProvider {
  constructor(private readonly reason:'disabled'|'not_configured'='disabled') {}
  async generate():Promise<ProviderResult> {return {available:false,reason:this.reason};}
}
