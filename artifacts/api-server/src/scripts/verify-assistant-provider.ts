/** Explicit, optionally paid LIVE smoke test. Never imported by application startup or API tests.
 * Sends only a fixed synthetic operational packet. No database import or personal data.
 * A pass verifies one configured provider request, not application/clinic acceptance.
 */
import {createAssistantProvider} from '../ai';
import {readAiConfig,providerStatus} from '../ai/config';
import type {ProviderPacket} from '../ai/types';
async function main() {
  if(process.env.AI_PROVIDER_SMOKE_ALLOW!=='1')throw new Error('Set AI_PROVIDER_SMOKE_ALLOW=1 to explicitly authorize one potentially paid request using synthetic data.');
  const config=readAiConfig(process.env);
  if(!providerStatus(config).configured)throw new Error('Set the enabled flag, OpenAI provider, server-side secret and a model available to your account.');
  const packet:ProviderPacket={action:'summarize_appointment',language:'en',approvedText:'Synthetic test: an appointment is pending confirmation. No action has been taken.',facts:{status:'pending',statusLabel:'Pending',durationMinutes:45,synthetic:true}};
  const result=await createAssistantProvider(config).generate(packet);
  if(!result.available){console.error(JSON.stringify({result:'failed',provider:'openai',reason:result.reason,syntheticDataOnly:true}));process.exitCode=1;return;}
  // Never print the key, raw packet, raw output or vendor debug response.
  console.log(JSON.stringify({result:'passed',checkedAt:new Date().toISOString(),provider:'openai',syntheticDataOnly:true,usage:result.usage,outputCharacters:result.text.length,limitation:'One live HTTP request only. Not a content-quality, clinical, database/API, or browser acceptance test.'},null,2));
}
main().catch(()=>{console.error('Provider smoke test could not run. Check opt-in and server-side configuration. No secret or provider body is logged.');process.exitCode=1;});
