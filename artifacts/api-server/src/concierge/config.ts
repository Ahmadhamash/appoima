import { LIMITS } from '../domain/concierge-core';
import { UPLOAD_FORMATS } from './media';
const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export function conciergeConfig(env: Record<string, string | undefined> = process.env) {
  return {
    enabled: env.CONCIERGE_ENABLED !== 'false',
    sonioxKey: env.SONIOX_API_KEY?.trim() ?? '',
    elevenlabsKey: env.ELEVENLABS_API_KEY?.trim() ?? '',
    elevenlabsVoiceIdAr: env.ELEVENLABS_VOICE_ID_AR?.trim() ?? '',
    elevenlabsVoiceIdEn: env.ELEVENLABS_VOICE_ID_EN?.trim() ?? '',
    elevenlabsModel: env.ELEVENLABS_TTS_MODEL?.trim() || 'eleven_multilingual_v2',
    dailyLimitsEnabled: env.CONCIERGE_DAILY_LIMITS_ENABLED === 'true',
    openaiKey: env.JORMALL_OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '', model: env.CONCIERGE_LLM_MODEL?.trim() || 'gpt-6-luna',
    reasoningEffort: REASONING_EFFORTS.find(effort => effort === env.CONCIERGE_REASONING_EFFORT?.trim()) ?? 'xhigh',
    realtimeModel: env.CONCIERGE_REALTIME_MODEL?.trim() || 'gpt-realtime-2.1',
    realtimeVoice: env.CONCIERGE_REALTIME_VOICE?.trim() || 'marin',
    timeoutMs: 75000,
    fileTimeoutMs: 210000,
    fileTranscribeModel: env.CONCIERGE_FILE_TRANSCRIBE_MODEL?.trim() || 'whisper-1',
  };
}
export function publicCapabilities() {
  const c = conciergeConfig();
  const llm = !!c.openaiKey, tts = llm, stt = llm;
  return { publicLinks:true, localText:true, enabled: c.enabled, llm, tts, stt, voice: llm && tts && stt, configuredOnly: true,
    missing: [...(!llm ? ['OPENAI_API_KEY'] : [])],
    formats: [...UPLOAD_FORMATS], uploadMaxBytes: LIMITS.uploadBytes, voiceSeconds: LIMITS.voiceSeconds };
}
