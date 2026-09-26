import type { AssistantProvider } from './types';
import { providerStatus, type AiConfig } from './config';
import { DisabledProvider } from './disabled';
import { OpenAIProvider } from './openai';
export function createAssistantProvider(config:AiConfig):AssistantProvider {
  const status=providerStatus(config);
  return status.configured?new OpenAIProvider(config):new DisabledProvider(status.state==='disabled'?'disabled':'not_configured');
}
