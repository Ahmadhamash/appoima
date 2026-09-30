import AppointmentsView from './appointments-view';
import { Link } from 'wouter';
import { CalendarPlus, CalendarDays, Users, UserCog, Scissors, DoorOpen, Boxes, Settings, Info, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type Choice = { icon: LucideIcon; title: string; hint: string; permission?: string; testId: string; href?: string };

function can(permissions: string[], p?: string) {
  if (!p) return true;
  if (permissions.includes(p)) return true;
  const [area, level] = p.split('.');
  return level === 'read' && permissions.includes(`${area}.manage`);
}

function ChoiceGrid({ choices }: { choices: Choice[] }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const visible = choices.filter((c) => can(user?.permissions ?? [], c.permission));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((c) => {
          const content = <>
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><c.icon className="size-5" aria-hidden /></div>
            <div className="min-w-0"><h2 className="font-semibold">{c.title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{c.hint}</p>{!c.href && <Badge variant="secondary" className="mt-2">{t('home.comingSoon')}</Badge>}</div>
          </>;
          return c.href ? <Link key={c.testId} href={c.href} className="focus-ring flex items-start gap-4 rounded-xl border bg-card p-5 hover:border-primary/50" data-testid={c.testId}>{content}</Link>
            : <div key={c.testId} className="flex items-start gap-4 rounded-xl border bg-card p-5" data-testid={c.testId} aria-disabled="true">{content}</div>;
        })}
      </div>
      {visible.some((c) => !c.href) && <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('sections.phaseNote')}
      </p>}
    </>
  );
}

export function AppointmentsPage() { return <AppointmentsView/>; }

export function PeoplePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('sections.people.title')} />
      <ChoiceGrid
        choices={[
          { icon: Users, title: t('sections.people.customers'), hint: t('sections.people.customersHint'), permission: 'customers.read', testId: 'choice-customers', href: '/people/customers' },
          { icon: UserCog, title: t('sections.people.employees'), hint: t('sections.people.employeesHint'), permission: 'employees.read', testId: 'choice-employees', href: '/people/employees' },
        ]}
      />
    </>
  );
}

export function BusinessPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={t('sections.business.title')} />
      <ChoiceGrid
        choices={[
          ...(user?.role==='manager'&&['inventory','services','employees','rooms','settings'].every(area=>can(user.permissions,`${area}.read`))?[{icon:Boxes,title:lang==='ar'?'المعدات والماتيريال':'Equipment & Materials',hint:lang==='ar'?'ربط الموارد بالخدمات وحساب تكلفة الجلسة':'Connect resources to services and calculate session cost',testId:'choice-equipment-materials',href:'/business/equipment-materials'}]:[]),
          { icon: Scissors, title: t('sections.business.services'), hint: t('sections.business.servicesHint'), permission: 'services.read', testId: 'choice-services', href: '/business/services' },
          { icon: DoorOpen, title: t('sections.business.rooms'), hint: t('sections.business.roomsHint'), permission: 'rooms.read', testId: 'choice-rooms', href: '/business/rooms' },
          { icon: Boxes, title: t('sections.business.inventory'), hint: t('sections.business.inventoryHint'), permission: 'inventory.read', testId: 'choice-inventory', href: '/business/inventory' },
          { icon: Settings, title: t('sections.business.settings'), hint: t('sections.business.settingsHint'), permission: 'settings.read', testId: 'choice-settings', href: '/business/settings' },
        ]}
      />
    </>
  );
}
