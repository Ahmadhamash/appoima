import {Link} from 'wouter';
import {ArrowUpRight,Check,ArrowLeft} from 'lucide-react';
import {useI18n} from '@/lib/i18n';
import {useAuth,homePath} from '@/lib/auth';
import './landing.css';

export default function LandingPage(){
  const {lang,setLang,dir}=useI18n(),{user}=useAuth(),L=(ar:string,en:string)=>lang==='ar'?ar:en;
  const target=user?homePath(user):'/login';
  const features=[
    ['schedule',L('مواعيد مرتبة، يوم أهدأ','A clearer schedule. A calmer day.')],
    ['rooms',L('كل خدمة في الغرفة المناسبة','The right room for each service')],
    ['team',L('فريقك على نفس الصفحة','Your team, connected')],
    ['supplies',L('مخزون مرتبط بعملك','Inventory connected to your work')],
  ] as const;
  return <main className="jm-landing" dir={dir} data-testid="landing-page"><nav className="jm-landing-nav"><Link href="/welcome" className="jm-landing-brand"><span className="jm-landing-mark">J</span>JorMall<span className="jm-landing-brand-note">{L('للعيادات','for clinics')}</span></Link><div className="jm-landing-nav-actions"><button type="button" onClick={()=>setLang(lang==='ar'?'en':'ar')} data-testid="landing-language">{lang==='ar'?'English':'العربية'}</button><Link href={target} className="jm-landing-login">{user?L('افتح مساحة العمل','Open workspace'):L('تسجيل الدخول','Sign in')}<ArrowUpRight size={16}/></Link></div></nav>
    <section className="jm-landing-hero"><div className="jm-landing-copy"><span className="jm-landing-eyebrow"><span/>{L('مساحة واحدة لكل تفاصيل عيادتك','ONE WORKSPACE FOR YOUR CLINIC')}</span><h1>{L('وقت أكثر لمرضاك.','More time for your patients.')}<br/><em>{L('كل التفاصيل مرتبة.','Every detail in place.')}</em></h1><p>{L('المواعيد، الفريق والخدمات في مكان واحد.','Appointments, people and services in one place.')}</p><div className="jm-landing-cta"><Link href={target} data-testid="landing-primary-action">{user?L('افتح عيادتك','Open your clinic'):L('ادخل إلى عيادتك','Access your clinic')}{lang==='ar'?<ArrowLeft size={18}/>:<ArrowUpRight size={18}/>}</Link></div><p className="jm-landing-small"><Check size={15}/>{L('بالعربي والإنجليزي · مصمم لعمل العيادات في الأردن','Arabic & English · Built for clinics in Jordan')}</p></div>
      <img className="jm-landing-hero-image" src={`${import.meta.env.BASE_URL}images/clinic.svg`} width="720" height="580" fetchPriority="high" alt={L('رسم لعيادة مضيئة مع غرفة علاج ومساحة استقبال','Illustration of a bright clinic with treatment and reception spaces')}/>
    </section><section className="jm-landing-features" id="features"><div className="jm-landing-section-heading"><span>{L('أقل تعقيدًا، أوضح للجميع','LESS FRICTION. MORE CLARITY.')}</span><h2>{L('من أول إعداد، لآخر موعد.','From the first setup to the last appointment.')}</h2></div><div className="jm-visual-grid">{features.map(([image,title])=><article key={title}><img src={`${import.meta.env.BASE_URL}images/${image}.svg`} width="480" height="320" loading="lazy" alt={title}/><h3>{title}</h3></article>)}</div></section><footer className="jm-landing-footer"><span>JorMall</span><p>{L('مساحة عمل العيادة، بكل تفاصيلها.','Your clinic workspace, with every detail connected.')}</p><Link href={target}>{L('تسجيل الدخول','Sign in')}</Link></footer>
  </main>;
}
