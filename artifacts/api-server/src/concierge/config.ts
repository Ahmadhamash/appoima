import { LIMITS } from '../domain/concierge-core';
export function conciergeConfig(env: Record<string, string | undefined> = process.env) {
  return {
    enabled: env.CONCIERGE_ENABLED !== 'false',
    sonioxKey: env.SONIOX_API_KEY?.trim() ?? '',
    dailyLimitsEnabled: env.CONCIERGE_DAILY_LIMITS_ENABLED === 'true',
    openaiKey: env.JORMALL_OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '', model: env.CONCIERGE_LLM_MODEL?.trim() || 'gpt-6-sol',
    realtimeModel: env.CONCIERGE_REALTIME_MODEL?.trim() || 'gpt-realtime-2.1',
    realtimeVoice: env.CONCIERGE_REALTIME_VOICE?.trim() || 'marin',
    timeoutMs: 75000,
  };
}
export function publicCapabilities() {
  const c = conciergeConfig();
  const llm = !!c.openaiKey, tts = llm, stt = llm;
  return { publicLinks:true, localText:true, enabled: c.enabled, llm, tts, stt, voice: llm && tts && stt, configuredOnly: true,
    missing: [...(!llm ? ['OPENAI_API_KEY'] : [])],
    formats: ['pdf','txt','csv','json'], uploadMaxBytes: LIMITS.uploadBytes, voiceSeconds: LIMITS.voiceSeconds };
}
