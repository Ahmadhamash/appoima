"""Synthetic fixtures serving the REAL browser component. NOT the application API.
No PostgreSQL, authentication or live providers are exercised. Localhost only.
"""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from http.cookies import SimpleCookie
import json, uuid, time, copy
ROOT=Path(__file__).resolve().parents[2]
BUILD=ROOT/'verification/concierge/browser-build'
CASES={}
WEEK={d:[{'open':'09:00','close':'17:00'}] for d in ['mon','tue','wed','thu','fri','sat','sun']}
EMPTY_WEEK={d:[] for d in WEEK}
EMPTY={'branches':[],'services':[],'rooms':[],'staff':[]}
BRANCH={'key':'branch_new','existingId':None,'name':'فرع عمّان','nameLang':'ar','timeZone':'Asia/Amman','openingHours':WEEK}
STAFF={'key':'staff_new','name':'سارة','nameLang':'ar','email':'sara@example.test','phone':None,'jobTitle':None,'branchKey':'branch_new','role':'secretary','serviceKeys':[],'workingHours':WEEK,'breaks':EMPTY_WEEK}
SPEECH={'ar':{'name':'أهلين! كيف حالك؟ أول إشي، خبرني باسمك.','choice':'أنا مساعدتك من جورمول. بنرتّب الفروع والموظفين والخدمات والمواعيد بمكان واحد. بتحب تعبّي البيانات بنفسك، ولا نحكي شوي وأنا أجهّزها معك؟','conversation':'خلّينا نبلّش بالفروع. شو أسماء فروعك، ووين موجودة؟','complete':'تم حفظ البيانات بالنظام.','manual':'بتقدر تكمل الإعداد من صفحات البرنامج.'},'en':{'name':'Hi! How are you? First, what should I call you?','choice':'I am your JorMall assistant. Would you like to enter the details or talk me through them?','conversation':'Let us start with your branches.','complete':'Your setup has been saved.','manual':'Continue in the setup pages.'}}
HTML='''<!doctype html><html lang="ar" dir="rtl"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/concierge.css"><title>SYNTHETIC concierge UI test</title><style>body{margin:0;background:#e8eef7;color:#213850;font-family:system-ui}main{padding:50px}nav{display:flex;gap:20px}section.bg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;margin-top:50px}.tile{background:white;height:130px;padding:20px;border-radius:16px}button{padding:10px}</style><body><main><nav>JorMall · SYNTHETIC TEST WORKSPACE <button id="background-action">Background action</button></nav><h1>تجهيز المركز</h1><section class="bg"><div class="tile">الفروع</div><div class="tile">الموظفون</div><div class="tile">الخدمات</div></section></main><script type="module">import {ConciergeView} from '/build/view.js';window.testNav=[];window.testApplied=0;window.backgroundClicks=0;document.getElementById('background-action').onclick=()=>window.backgroundClicks++;window.view=new ConciergeView({onNavigate:p=>window.testNav.push(p),onApplied:()=>window.testApplied++,onStaffHelp:()=>window.testNav.push('STAFF_HELP')});</script></body></html>'''
def session():return {'revision':0,'stage':'name','preferredName':None,'language':'ar','consented':False,'draft':copy.deepcopy(EMPTY),'uploads':[],'ui':'none','navigation':None,'message':{'id':'stage:name','role':'assistant','text':SPEECH['ar']['name']},'busy':False,'applied':None}
def message(s):s['message']={'id':'stage:'+s['stage'],'role':'assistant','text':SPEECH[s['language']][s['stage']]}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def reply(self,data,status=200,mime='application/json',cookie=None):
  body=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
  if cookie:self.send_header('Set-Cookie','testcase='+cookie+'; SameSite=Lax; Path=/')
  self.end_headers()
  try:self.wfile.write(body)
  except (BrokenPipeError,ConnectionResetError):pass
 def state(self):
  c=SimpleCookie(self.headers.get('Cookie',''));key=c.get('testcase');return CASES[key.value] if key and key.value in CASES else None
 def caps(self,c):
  ai=c['mode']!='unconfigured';v=c['mode']=='voice';return {'enabled':True,'llm':ai,'tts':v,'stt':v,'voice':v,'configuredOnly':True,'missing':[] if v else ['SONIOX_API_KEY'],'formats':['pdf','txt','csv','json'],'uploadMaxBytes':8388608,'voiceSeconds':900}
 def do_GET(self):
  parsed=urlparse(self.path);path=parsed.path
  if path=='/':
   key=str(uuid.uuid4());CASES[key]={'session':session(),'mode':parse_qs(parsed.query).get('mode',['text'])[0],'calls':[],'turns':0};return self.reply(HTML.encode(),mime='text/html; charset=utf-8',cookie=key)
  if path=='/concierge.css':return self.reply((ROOT/'artifacts/jormall/src/components/concierge/concierge.css').read_bytes(),mime='text/css')
  if path.startswith('/build/'):
   name=Path(path).name;f=BUILD/(name if name.endswith('.js') else name+'.js')
   if f.is_file():return self.reply(f.read_bytes(),mime='text/javascript')
  c=self.state()
  if path=='/__test/state':return self.reply(c)
  if not c:return self.reply({'error':'unauthorized'},401)
  s=c['session']
  if path=='/api/concierge/bootstrap':return self.reply({'session':s,'capabilities':self.caps(c),'consentVersion':'synthetic'})
  if path=='/api/concierge/review':return self.reply({'revision':s['revision'],'draft':s['draft'],'issues':[],'staffAccess':[{'key':p['key'],'permissions':['appointments.read','customers.read']} for p in s['draft']['staff']], 'grantablePermissions':['appointments.read','appointments.manage','customers.read'],'options':{'branches':[],'services':[]}})
  return self.reply({'error':'not_found'},404)
 def do_PUT(self):self.do_POST()
 def do_POST(self):
  c=self.state()
  if not c:return self.reply({'error':'unauthorized'},401)
  path=urlparse(self.path).path;raw=self.rfile.read(int(self.headers.get('Content-Length','0')))
  if self.headers.get('X-JorMall-Intent')!='concierge':return self.reply({'error':'concierge_origin'},403)
  body={} if path.endswith('/upload') else json.loads(raw or '{}');c['calls'].append({'path':path,'body':body,'intent':self.headers.get('X-JorMall-Intent')});s=c['session']
  if path.endswith('/start'):
   s['language']=body['language'];s['revision']+=1
   if body.get('reopen') and s['stage'] in ['complete','manual']:s['stage']='choice'
   message(s);return self.reply({'session':s,'capabilities':self.caps(c),'consentVersion':'synthetic'})
  if path.endswith('/name'):s['preferredName']=body['name'];s['stage']='choice';s['language']=body['language'];message(s)
  elif path.endswith('/mode'):s['stage']='manual' if body['mode']=='manual' else 'conversation';s['consented']=body['consent'];message(s)
  elif path.endswith('/turn'):
   c['turns']+=1
   if body['text']=='FAIL':return self.reply({'error':'concierge_provider_limit'},503)
   s['draft']['branches']=[copy.deepcopy(BRANCH)];s['draft']['staff']=[copy.deepcopy(STAFF)] if c['mode']=='staff' else [];s['ui']='upload' if 'pdf' in body['text'].lower() else 'review';s['message']={'id':'msg-'+str(c['turns']),'role':'assistant','text':'تمام، ضفت المعلومات للمسودة. عندك ملف؟ ابعته هون وبراجعه معك.' if s['language']=='ar' else 'Added to your draft. Upload your document or review the details.'}
  elif path.endswith('/upload'):
   time.sleep(1.3)
   if b'FAIL' in raw:return self.reply({'error':'concierge_provider_limit'},503)
   s['ui']='none';s['uploads'].append({'id':str(uuid.uuid4()),'name':unquote(self.headers['X-File-Name']),'size':len(raw),'status':'read','summary':'Synthetic parser fixture. Not a live file model.'});s['message']={'id':'upload-msg','role':'assistant','text':'قرأت الملف، وبياناته بالمسودة للمراجعة.'}
  elif path.endswith('/draft'):s['draft']=body['draft']
  elif path.endswith('/apply'):
   if body.get('confirmed') is not True:return self.reply({'error':'confirmation_required'},400)
   s['applied']={k:list(range(1,len(v)+1)) for k,v in s['draft'].items()};s['stage']='complete';s['draft']=copy.deepcopy(EMPTY);s['uploads']=[];message(s)
  elif path.endswith('/voice-token'):return self.reply({'apiKey':'SYNTHETIC_SINGLE_USE_KEY','expiresAt':'2099-01-01T00:00:00Z','url':'wss://stt-rt.soniox.com/transcribe-websocket','model':'stt-rt-v5','maxSeconds':900})
  elif path.endswith('/speech'):
   tone=ROOT/'verification/concierge/test-tone.mp3'
   if not tone.is_file():return self.reply({'error':'synthetic_audio_missing'},503)
   return self.reply(tone.read_bytes(),mime='audio/mpeg')
  else:return self.reply({'error':'not_found'},404)
  s['revision']+=1;return self.reply(s)
if __name__=='__main__':
 print('SYNTHETIC UI HARNESS ONLY — http://127.0.0.1:18763',flush=True);ThreadingHTTPServer(('127.0.0.1',18763),Handler).serve_forever()
