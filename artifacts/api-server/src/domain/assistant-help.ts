import { canAccessScheduling, canSchedule, isProvider, type ScheduleActor } from './scheduling-rules';
import { canRecordMaterialsHelp, mayManageArea, mayReadArea, type AssistantLanguage } from './assistant-rules';
export const HELP_TOPIC_IDS = ['navigation','book','check_in','cancel','reschedule','waiting','consumption','own_work','setup','people','stock','owner'] as const;
export type HelpTopicId = typeof HELP_TOPIC_IDS[number];
type Copy = {title:string; steps:string[]; linkLabel:string};
type Topic = {id:HelpTopicId; href:string; allowed:(actor:ScheduleActor)=>boolean; keywords:string[]; en:Copy; ar:Copy};
const everyone = () => true;
const topics: Topic[] = [
  {id:'navigation',href:'/home',allowed:everyone,keywords:['help','navigation','where','menu','مساعدة','مساعده','وين','القائمة'],
    en:{title:'Find your way around',steps:['Home shows the work and navigation allowed for your role.','Appointments contains schedules and booking. Customers & Employees contains people records. Business contains the sections you may access.','Missing an action? Ask your clinic manager to review your access. This panel cannot grant permissions.'],linkLabel:'Open home'},
    ar:{title:'التنقل داخل التطبيق',steps:['تعرض الصفحة الرئيسية العمل والقوائم المسموحة لدورك.','قسم المواعيد للجدول والحجز، وقسم العملاء والموظفين للسجلات، وقسم الأعمال للأقسام المتاحة لك.','إذا كان إجراء غير ظاهر، اطلب من مدير المركز مراجعة صلاحياتك. لا تمنح هذه اللوحة صلاحيات.'],linkLabel:'فتح الرئيسية'}},
  {id:'book',href:'/appointments/new',allowed:canSchedule,keywords:['book','booking','create appointment','حجز','احجز','موعد جديد'],
    en:{title:'Book an appointment',steps:['Open the booking wizard and find the customer or add them once.','Choose the branch, service, employee and an available date and time. Times use the branch time zone.','Review the details and explicitly press Book. A suggested time is not reserved; the server rechecks it when you book.'],linkLabel:'Open booking wizard'},
    ar:{title:'حجز موعد',steps:['افتح خطوات الحجز وابحث عن العميل أو أضفه مرة واحدة.','اختر الفرع والخدمة والموظف والتاريخ والوقت المتاح. الأوقات حسب المنطقة الزمنية للفرع.','راجع التفاصيل واضغط حجز بنفسك. الوقت المقترح ليس محجوزاً؛ يعيد الخادم التحقق عند الحجز.'],linkLabel:'فتح خطوات الحجز'}},
  {id:'check_in',href:'/appointments/view',allowed:canSchedule,keywords:['check in','check-in','arrival','arrived','حضور','وصل','تسجيل الوصول'],
    en:{title:'Check in a customer',steps:['Open the appointment from the daily schedule.','For a pending booking, confirm it first. A confirmed booking can be checked in.','Review the customer and time, then choose Check in. Only valid next actions are shown.'],linkLabel:'Open appointments'},
    ar:{title:'تسجيل حضور عميل',steps:['افتح الموعد من الجدول اليومي.','أكد الحجز المعلق أولاً. يمكن تسجيل حضور الحجز المؤكد.','راجع العميل والوقت ثم اختر تسجيل الحضور. تظهر الإجراءات التالية المسموحة فقط.'],linkLabel:'فتح المواعيد'}},
  {id:'cancel',href:'/appointments/view',allowed:canSchedule,keywords:['cancel','cancellation','إلغاء','الغاء','الغي'],
    en:{title:'Cancel an appointment',steps:['Open the appointment and choose Cancel when it is an allowed next action.','Enter the reason, review the appointment and confirm in that screen. Nothing is cancelled from this help panel.','Review any waiting-list suggestion. It needs a separate Confirm replacement action and never books automatically.'],linkLabel:'Open appointments'},
    ar:{title:'إلغاء موعد',steps:['افتح الموعد واختر إلغاء عندما يكون إجراءً مسموحاً.','أدخل السبب وراجع الموعد ثم أكد من شاشته. لا تلغي لوحة المساعدة أي موعد.','راجع اقتراح قائمة الانتظار إن وجد. يحتاج إلى تأكيد بديل مستقل ولا يحجز تلقائياً.'],linkLabel:'فتح المواعيد'}},
  {id:'reschedule',href:'/appointments/view',allowed:canSchedule,keywords:['reschedule','change time','move appointment','تغيير الموعد','تعديل الموعد','نقل الموعد','إعادة الجدولة'],
    en:{title:'Reschedule a booking',steps:['Open a pending or confirmed appointment and choose Reschedule.','Choose a valid employee and time, enter the reason and review the change.','Confirm the change in the appointment screen. The original history is kept and availability is checked again.'],linkLabel:'Open appointments'},
    ar:{title:'إعادة جدولة حجز',steps:['افتح موعداً معلقاً أو مؤكداً واختر إعادة الجدولة.','اختر الموظف والوقت المتاح وأدخل السبب ثم راجع التغيير.','أكد التغيير من شاشة الموعد. يبقى السجل الأصلي وتُفحص الإتاحة مجدداً.'],linkLabel:'فتح المواعيد'}},
  {id:'waiting',href:'/appointments/waiting-list',allowed:canSchedule,keywords:['waiting','replacement','queue','انتظار','بديل','استبدال'],
    en:{title:'Work with the waiting list',steps:['Inside Appointments, open Waiting list and add the requested service, branch, employee preference and date or time window.','A cancellation can suggest the earliest compatible request. A suggestion is neither a reservation nor a notification.','Review the offer and use Confirm replacement yourself. Declining checks the next eligible request; availability is rechecked on confirmation.'],linkLabel:'Open waiting list'},
    ar:{title:'العمل على قائمة الانتظار',steps:['من قسم المواعيد افتح قائمة الانتظار وأضف الخدمة والفرع وتفضيل الموظف والتاريخ أو الفترة المطلوبة.','قد يقترح الإلغاء أقدم طلب متوافق. الاقتراح ليس حجزاً ولا إشعاراً.','راجع العرض واضغط تأكيد البديل بنفسك. عند الرفض يُفحص الطلب التالي، وتُراجع الإتاحة عند التأكيد.'],linkLabel:'فتح قائمة الانتظار'}},
  {id:'consumption',href:'/appointments/view',allowed:canRecordMaterialsHelp,keywords:['consumption','materials','used','استهلاك','مواد','استخدمت','المستهلكة'],
    en:{title:'Record actual materials used',steps:['Open the assigned or permitted appointment. Finish the service and enter the actual quantity used for each inventory item.','Choose the explicit no-materials option only when nothing was used. Missing reporting is not zero usage.','Review and save once. Insufficient stock blocks the complete submission. Recorded consumption is locked; stock corrections are new authorized adjustments.'],linkLabel:'Open appointments'},
    ar:{title:'تسجيل المواد المستخدمة فعلياً',steps:['افتح الموعد المسند إليك أو المسموح لك. أنهِ الخدمة وأدخل الكمية الفعلية المستخدمة من كل مادة.','اختر لم تُستخدم مواد فقط عندما لم تُستخدم أي مادة فعلاً. عدم التسجيل لا يعني استهلاكاً صفرياً.','راجع واحفظ مرة واحدة. يمنع نقص المخزون حفظ العملية كاملة. يُقفل الاستهلاك المسجل، وتصحح الأرصدة بحركات تسوية جديدة ومصرح بها.'],linkLabel:'فتح المواعيد'}},
  {id:'own_work',href:'/appointments/view',allowed:a=>isProvider(a)&&canAccessScheduling(a),keywords:['my schedule','start service','finish service','جدولي','مواعيدي','بدء الخدمة','إنهاء الخدمة'],
    en:{title:'Your service workflow',steps:['Your home shows your own appointments and next customer.','Open an assigned appointment, read only the details your access allows, then start and finish the service using its valid actions.','Use appointment notes for service notes, not this help chat. Other employees’ appointments need explicit broader access.'],linkLabel:'Open your appointments'},
    ar:{title:'خطوات تقديم الخدمة',steps:['تعرض الرئيسية مواعيدك والعميل التالي.','افتح موعداً مسنداً إليك واقرأ التفاصيل المسموحة ثم ابدأ الخدمة وأنهِها بالإجراءات المتاحة.','استخدم ملاحظات الموعد لتوثيق الخدمة، لا محادثة المساعدة. تتطلب مواعيد الموظفين الآخرين صلاحية أوسع وصريحة.'],linkLabel:'فتح مواعيدك'}},
  {id:'setup',href:'/business/settings',allowed:a=>mayManageArea(a,'settings'),keywords:['setup','branch','hours','time zone','إعداد','ساعات','فرع'],
    en:{title:'Set branch hours',steps:['Open Business → Settings, select the branch and its time zone.','Enter weekly opening ranges and closed days, then save.','Set services, compatible rooms and staff working hours in their permitted sections. These rules determine bookable times.'],linkLabel:'Open settings'},
    ar:{title:'إعداد ساعات الفرع',steps:['افتح الأعمال ثم الإعدادات وحدد الفرع ومنطقته الزمنية.','أدخل فترات العمل الأسبوعية والأيام المغلقة ثم احفظ.','أكمل الخدمات والغرف المتوافقة وساعات الموظفين في الأقسام المسموحة لك. تحدد هذه القواعد أوقات الحجز.'],linkLabel:'فتح الإعدادات'}},
  {id:'people',href:'/people/customers',allowed:a=>mayReadArea(a,'customers'),keywords:['customer','patient','customers','عميل','عملاء','مريض'],
    en:{title:'Find a customer',steps:['Open Customers & Employees → Customers and search by name, phone or email.','Customer changes and sensitive notes need the appropriate access.','Use the appointment history to review permitted bookings. Never paste customer contact details, allergies or private notes into help questions.'],linkLabel:'Open customers'},
    ar:{title:'البحث عن عميل',steps:['افتح العملاء والموظفين ثم العملاء وابحث بالاسم أو الهاتف أو البريد الإلكتروني.','تتطلب تعديلات العملاء والملاحظات الحساسة الصلاحية المناسبة.','راجع الحجوزات المسموحة من سجل المواعيد. لا تلصق بيانات التواصل أو الحساسية أو الملاحظات الخاصة في أسئلة المساعدة.'],linkLabel:'فتح العملاء'}},
  {id:'stock',href:'/business/inventory',allowed:a=>mayReadArea(a,'inventory'),keywords:['inventory','stock','receipt','balance','مخزون','رصيد','استلام'],
    en:{title:'Understand inventory',steps:['Open Business → Inventory to see items, units and movement-derived balances.','Only staff with inventory management access can receive stock or record signed adjustments with a reason.','Balances and previous movements are not directly editable. Units are never silently converted.'],linkLabel:'Open inventory'},
    ar:{title:'فهم المخزون',steps:['افتح الأعمال ثم المخزون للاطلاع على المواد ووحداتها والأرصدة المحسوبة من الحركات.','يسمح باستلام المخزون أو تسجيل التسويات المسببة فقط لمن لديه صلاحية إدارة المخزون.','لا تعدل الأرصدة والحركات السابقة مباشرة، ولا تُحوّل الوحدات تلقائياً.'],linkLabel:'فتح المخزون'}},
  {id:'owner',href:'/clinics',allowed:a=>a.role==='platform_owner',keywords:['clinic','manager','owner','center','عيادة','مركز','مالك','مدير'],
    en:{title:'Manage clinic setup',steps:['Open Clinics to add a clinic and its manager login or review setup progress.','New staff must replace their initial password on first sign-in.','Platform-owner access does not grant access to clinic appointments or private customer data through this assistant.'],linkLabel:'Open clinics'},
    ar:{title:'إدارة إعداد المراكز',steps:['افتح المراكز لإضافة مركز وحساب مديره أو مراجعة تقدم الإعداد.','يجب على الموظف تغيير كلمة المرور الأولية عند الدخول الأول.','لا تمنح صلاحية مالك المنصة وصولاً لمواعيد المركز أو بيانات العملاء الخاصة عبر هذا المساعد.'],linkLabel:'فتح المراكز'}},
];
export function normalizeHelpText(value:string):string {
  return value.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
export function helpTopics(actor:ScheduleActor, language:AssistantLanguage) {
  return topics.filter(topic=>topic.allowed(actor)).map(topic=>({id:topic.id,title:topic[language].title}));
}
export function helpAnswer(actor:ScheduleActor, language:AssistantLanguage, request:{question?:string;topic?:HelpTopicId}) {
  const permitted=topics.filter(topic=>topic.allowed(actor));
  let selected = request.topic ? permitted.find(t=>t.id===request.topic) : undefined;
  if(!request.topic && request.question) {
    const text=` ${normalizeHelpText(request.question)} `;
    let score=0;
    for(const topic of permitted) for(const keyword of topic.keywords) {
      const normalized=normalizeHelpText(keyword);
      if(text.includes(` ${normalized} `) && normalized.length>score) {selected=topic;score=normalized.length;}
    }
  }
  if(!selected) return {source:'local' as const,language,topic:null,title:language==='ar'?'المساعدة المدمجة':'Built-in help',
    steps:[language==='ar'?'اختر أحد المواضيع المتاحة لدورك. هذه إرشادات محلية وليست ذكاءً اصطناعياً توليدياً، ولا تنفذ أي تغييرات.':'Choose a topic available to your role. These are local guided answers, not generative AI; they do not make changes.'],link:null};
  const copy=selected[language];
  const ownerNavigation = selected.id==='navigation' && actor.role==='platform_owner';
  return {source:'local' as const,language,topic:selected.id,title:copy.title,
    steps:ownerNavigation ? topics.find(t=>t.id==='owner')![language].steps : copy.steps,
    link:{href:ownerNavigation?'/clinics':selected.href,label:ownerNavigation?(language==='ar'?'فتح المراكز':'Open clinics'):copy.linkLabel}};
}
