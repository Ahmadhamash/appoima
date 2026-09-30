import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUp, MessageCircle, Mic, Square, X } from 'lucide-react';
import { useI18n, useErrorMessage } from '@/lib/i18n';
import { api } from '@/lib/api';
import { safeAssistantHref } from '@/lib/assistant-api';
import { SonioxAssist } from '@/components/concierge/soniox-assist';

type BookingProposal={branchId:number;customerId:number;serviceId:number;employeeId:number;startsAt:string;customer:string;service:string;employee:string;branch:string;date:string;time:string};
type ChatMessage = { role: 'user' | 'assistant'; text: string; proposal?:BookingProposal; idempotencyKey?:string };

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const { lang, dir } = useI18n();
  const errorMessage = useErrorMessage();
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [bookingBusy,setBookingBusy]=useState(false);
  const [error, setError] = useState('');
  const [listening,setListening]=useState(false),[voiceBusy,setVoiceBusy]=useState(false);
  const voice=useRef<SonioxAssist|null>(null),voiceStream=useRef<MediaStream|null>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    input.current?.focus();
    return () => { voice.current?.stop();voiceStream.current?.getTracks().forEach(track=>track.stop());dialog.current?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, busy]);

  async function send(promptOverride?:string) {
    const question = (promptOverride??draft).trim();
    if (!question || busy) return;
    setDraft(''); setError(''); setBusy(true);
    setMessages(old => [...old, { role: 'user', text: question }]);
    try {
      const history = [...messages.slice(-7).map(({role,text})=>({role,text})), { role: 'user' as const, text: question }];
      const answer = await api<{reply:string;action:{href:string}|null;proposal:BookingProposal|null}>('/assistant/chat', { method: 'POST', body: { language: lang, messages: history } });
      setMessages(old => [...old, { role: 'assistant', text: answer.reply, proposal:answer.proposal??undefined,idempotencyKey:answer.proposal?crypto.randomUUID():undefined }]);
      if(answer.action && safeAssistantHref(answer.action.href))navigate(answer.action.href);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }
  async function confirmBooking(index:number){
    const selected=messages[index];if(!selected?.proposal||!selected.idempotencyKey||bookingBusy)return;
    setBookingBusy(true);setError('');
    try{
      const p=selected.proposal;
      const result=await api<{id:number}>('/assistant/book',{method:'POST',body:{branchId:p.branchId,customerId:p.customerId,serviceId:p.serviceId,employeeId:p.employeeId,startsAt:p.startsAt,idempotencyKey:selected.idempotencyKey}});
      setMessages(old=>[...old.map((item,i)=>i===index?{...item,proposal:undefined}:item),{role:'assistant',text:lang==='ar'?`تم تسجيل طلب الحجز لـ ${p.customer} بنجاح. فتحتلك تفاصيل الموعد.`:`The booking for ${p.customer} was saved. I opened its details.`}]);
      navigate('/appointments/'+result.id);
    }catch(cause){setError(errorMessage(cause));}
    finally{setBookingBusy(false);}
  }
  async function toggleVoice(){
    if(voiceBusy)return;
    if(listening){
      setVoiceBusy(true);
      const transcript=await voice.current?.refine('');
      voice.current?.stop();voice.current=null;
      voiceStream.current?.getTracks().forEach(track=>track.stop());voiceStream.current=null;
      setListening(false);setVoiceBusy(false);
      if(transcript)void send(transcript);else setError(lang==='ar'?'ما وصلني كلام واضح. جرّب مرة ثانية.':'I could not hear clearly. Please try again.');
      return;
    }
    setVoiceBusy(true);setError('');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});voiceStream.current=stream;
      const assist=new SonioxAssist();voice.current=assist;
      await assist.start(()=>api<{enabled:boolean;apiKey?:string}>('/assistant/stt-key',{method:'POST'}),stream,lang);
      if(!assist.isReady)throw new Error('soniox_unavailable');
      setListening(true);
    }catch{
      voice.current?.stop();voice.current=null;voiceStream.current?.getTracks().forEach(track=>track.stop());voiceStream.current=null;
      setError(lang==='ar'?'تعذّر تشغيل الميكروفون الآن. تقدر تكتب رسالتك.':'Microphone is unavailable. You can type your message.');
    }finally{setVoiceBusy(false);}
  }

  return <dialog ref={dialog} dir={dir} lang={lang} aria-label={lang === 'ar' ? 'محادثة مساعد العيادة' : 'Clinic assistant chat'}
    onCancel={event => { event.preventDefault(); onClose(); }} data-testid="assistant-dialog"
    className="fixed m-0 flex h-[min(600px,calc(100dvh-105px))] max-h-none w-[min(390px,calc(100vw-24px))] max-w-none flex-col overflow-hidden rounded-[24px] border border-[#e4e9ef] bg-white p-0 text-[#1b2d48] shadow-[0_24px_80px_#15233835] backdrop:bg-[#12223a]/20"
    style={{ insetBlockStart: 'auto', insetBlockEnd: 88, insetInlineStart: 'auto', insetInlineEnd: 16, width: 'min(370px, calc(100vw - 24px))', height: 'min(510px, calc(100dvh - 105px))', borderRadius: 22 }}>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#edf0f4] px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><MessageCircle className="size-4"/></span><div><h2 className="text-sm font-bold">{lang === 'ar' ? 'مساعد العيادة' : 'Clinic assistant'}</h2><p className="text-[11px] text-[#7c8999]">{lang === 'ar' ? 'كيف أقدر أساعدك؟' : 'How can I help?'}</p></div></div>
      <button type="button" onClick={onClose} data-testid="assistant-close" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'} className="grid size-8 shrink-0 place-items-center rounded-full text-[#68788d] hover:bg-[#f4f6f9]"><X className="size-4"/></button>
    </header>
    <div role="log" aria-live="polite" data-testid="assistant-conversation" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
      {!messages.length && <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#f7f0e3] text-primary"><MessageCircle className="size-6"/></span><div><p className="font-semibold">{lang === 'ar' ? 'أهلاً، كيف أساعدك اليوم؟' : 'Hi, how can I help today?'}</p><p className="mt-1 text-xs text-[#7b899c]">{lang === 'ar' ? 'اكتب سؤالك أو طلبك هنا' : 'Type your question or request'}</p></div></div>}
      {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ms-auto max-w-[86%] rounded-2xl rounded-es-sm bg-primary px-3.5 py-2.5 text-sm leading-6 text-white' : 'me-auto max-w-[92%] rounded-2xl rounded-ee-sm bg-[#f4f6f9] px-3.5 py-2.5 text-sm leading-6 text-[#24354f]'} dir="auto">
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        {message.proposal&&<button type="button" disabled={bookingBusy} onClick={()=>void confirmBooking(index)} className="mt-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="assistant-confirm-booking">{bookingBusy?(lang==='ar'?'جارٍ الحجز…':'Booking…'):(lang==='ar'?'تأكيد الحجز':'Confirm booking')}</button>}
      </div>)}
      {busy && <div className="me-auto w-fit rounded-2xl bg-[#f4f6f9] px-4 py-2 text-sm text-[#7b899c]" role="status">•••</div>}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div ref={end}/>
    </div>
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="shrink-0 border-t border-[#edf0f4] bg-white p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-[#e0e6ed] bg-[#fafbfc] p-1.5 focus-within:border-[#a88b50]">
        <textarea ref={input} data-testid="assistant-question" aria-label={lang === 'ar' ? 'اكتب رسالة' : 'Type a message'} rows={1} maxLength={600} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={listening?(lang==='ar'?'عم بسمعك...':'Listening...'):(lang === 'ar' ? 'اكتب رسالتك...' : 'Type your message...')} className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[#9aa6b5]"/>
        <button type="button" data-testid="assistant-microphone" onClick={()=>void toggleVoice()} disabled={voiceBusy||busy} aria-label={listening?(lang==='ar'?'إنهاء التسجيل':'Stop recording'):(lang==='ar'?'تحدث للمساعد':'Speak to assistant')} className={'grid size-9 shrink-0 place-items-center rounded-xl '+(listening?'bg-red-50 text-red-600':'text-primary hover:bg-[#f7f1e7]')} >{listening?<Square className="size-4"/>:<Mic className="size-4"/>}</button>
        <button type="submit" data-testid="assistant-ask" disabled={busy || !draft.trim()} aria-label={lang === 'ar' ? 'إرسال' : 'Send'} className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><ArrowUp className="size-4"/></button>
      </div>
    </form>
  </dialog>;
}
