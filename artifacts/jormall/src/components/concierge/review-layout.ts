import type { WorkspaceProfile } from '@workspace/service-definition';
import type { Kind, Language } from './contract';
import { button, el } from './dom';
import { safeLogo } from './branding';

const paths = {
 clinic: 'M4 21V5h12v16M2 21h20M16 11h4v10M7 8h1M11 8h1M7 12h1M11 12h1M7 16h1M11 16h1M9 21v-3',
 globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
 document: 'M7 3h7l4 4v14H7ZM14 3v5h4M10 12h5M10 16h5',
 phone: 'M6 3h4l1 5-3 2a15 15 0 0 0 6 6l2-3 5 1v4c0 2-2 3-4 2A24 24 0 0 1 4 7c-1-2 0-4 2-4Z',
 mail: 'M3 5h18v14H3ZM3 5l9 7 9-7',
 map: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 link: 'm9 15 6-6M8 12l-3 3a4 4 0 0 0 6 6l3-3M10 6l3-3a4 4 0 0 1 6 6l-3 3',
 palette: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-4-4-6-9-6ZM7 9h.01M11 6h.01M16 7h.01M6 14h.01',
 image: 'M3 3h18v18H3ZM3 16l6-6 4 4 3-3 5 5M16 7h.01',
 layers: 'm12 3 10 6-10 6L2 9Zm-10 12 10 6 10-6M2 12l10 6 10-6',
 services: 'M6 3v7a5 5 0 0 0 10 0V3M4 3h4M14 3h4M11 15v2a4 4 0 0 0 8 0v-3M21 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
 rooms: 'M3 3h14v18H3ZM7 3l7 3v18l-7-3ZM18 6h3v15h-3M11 13h.01',
 staff: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM16 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4',
 check: 'm6 12 4 4 8-8',
 shield: 'm12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Zm-5 10 3 3 7-7',
 arrow: 'M4 12h16m-6-6 6 6-6 6',
 chevron: 'm9 5 7 7-7 7',
} as const;
export function reviewIcon(name: keyof typeof paths) {
 const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
 for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
 const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
}

export function reviewHeading(title: string, subtitle: string, icon: keyof typeof paths) {
 const heading = el('div', 'jc-overview-heading'), mark = el('span', 'jc-overview-mark'), copy = el('div', 'jc-overview-heading-copy');
 mark.append(reviewIcon(icon)); copy.append(el('h2', '', title), el('p', '', subtitle)); heading.append(mark, copy); return heading;
}

export function buildIdentityCard(profile: WorkspaceProfile, language: Language) {
 const ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
 const card = el('section', 'jc-overview-card jc-overview-identity'); card.dataset.testid = 'review-clinic-identity';
 const header = reviewHeading(w('هوية العيادة', 'Clinic identity'), w('راجع المعلومات الأساسية لعيادتك', 'Review your clinic’s basic information'), 'clinic');
 if (profile.nameAr?.trim() || profile.nameEn?.trim()) { const badge = el('span', 'jc-overview-badge'); badge.append(reviewIcon('check'), el('span', '', w('المعلومات جاهزة', 'Looks good!'))); header.append(badge); }
 const grid = el('div', 'jc-overview-identity-grid'), left = el('dl'), right = el('dl');
 const field = (host: HTMLElement, key: keyof WorkspaceProfile, label: string, icon: keyof typeof paths, kind: 'text' | 'color' | 'logo' | 'link' = 'text') => {
  const row = el('div', 'jc-overview-fact'), title = el('dt', '', label), value = el('dd', 'jc-overview-value'); row.dataset.testid = `review-identity-${key}`;
  const content = profile[key]; value.append(reviewIcon(icon));
  if (kind === 'logo' && safeLogo(content)) { const image = el('img', 'jc-overview-logo'); image.src = content; image.alt = w('شعار العيادة', 'Clinic logo'); value.append(image); }
  else {
   if (kind === 'color' && typeof content === 'string' && /^#[a-f0-9]{6}$/i.test(content)) { const swatch = el('span', 'jc-overview-swatch'); swatch.style.backgroundColor = content; swatch.setAttribute('aria-hidden', 'true'); value.append(swatch); }
   let linked = false;
   if (kind === 'link' && typeof content === 'string') { try { const url = new URL(content); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) { const anchor = el('a', '', content); anchor.href = url.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; value.append(anchor); linked = true; } } catch {} }
   if (!linked) { const text = el('bdi', '', kind !== 'logo' && typeof content === 'string' && content.trim() ? content : '—'); if (['phone', 'email', 'primaryColor', 'accentColor'].includes(key)) text.dir = 'ltr'; value.append(text); }
  }
  row.append(title, value); host.append(row);
 };
 field(left, 'nameAr', w('الاسم بالعربية', 'Arabic name'), 'globe'); field(right, 'nameEn', w('الاسم بالإنجليزية', 'English name'), 'globe');
 field(left, 'subtitleAr', w('الوصف بالعربية', 'Arabic subtitle'), 'document'); field(right, 'subtitleEn', w('الوصف بالإنجليزية', 'English subtitle'), 'document');
 field(left, 'phone', w('الهاتف (اختياري)', 'Phone (optional)'), 'phone'); field(right, 'email', w('البريد الإلكتروني', 'Email'), 'mail');
 field(left, 'address', w('العنوان', 'Address'), 'map'); field(right, 'website', w('الموقع الإلكتروني', 'Website'), 'link', 'link');
 field(left, 'primaryColor', w('اللون الرئيسي', 'Primary color'), 'palette', 'color'); field(right, 'accentColor', w('اللون الإضافي', 'Accent color'), 'palette', 'color');
 field(left, 'logoDataUrl', w('الشعار', 'Logo'), 'image', 'logo'); grid.append(left, right); card.append(header, grid); return card;
}

export function createReviewSections(language: Language, counts: Record<Kind, number>) {
 const ar = language === 'ar', w = (a: string, e: string) => ar ? a : e;
 const titles = { branches: w('الفروع', 'Branches'), services: w('الخدمات', 'Services'), rooms: w('الغرف', 'Rooms'), staff: w('الموظفين', 'Staff') };
 const icons = { branches: 'clinic', services: 'services', rooms: 'rooms', staff: 'staff' } as const;
 const card = el('section', 'jc-overview-card jc-overview-sections'), header = reviewHeading(w('باقي تفاصيل الإعداد', 'Other setup details'), w('راجع بقية معلومات إعداد عيادتك', 'Review the rest of your setup information'), 'layers'), status = el('span', 'jc-overview-status'); status.setAttribute('role', 'status'); header.append(status);
 const links = el('div', 'jc-overview-section-links'), panels = el('div', 'jc-overview-detail-panels');
 const controls = new Map<Kind, HTMLButtonElement>(), sections = new Map<Kind, HTMLElement>();
 const reveal = (kind: Kind, open = true, focus = false) => { const panel = sections.get(kind)!, control = controls.get(kind)!; panel.hidden = !open; control.setAttribute('aria-expanded', String(open)); if (open && focus) { panel.scrollIntoView({ block: 'nearest' }); panel.focus({ preventScroll: true }); } };
 for (const kind of ['branches', 'services', 'rooms', 'staff'] as const) {
  const panel = el('section', 'jc-overview-detail-panel'); panel.hidden = true; panel.id = `review-section-${kind}`; panel.tabIndex = -1; panel.dataset.testid = `review-section-${kind}`; panel.append(el('h3', '', titles[kind])); sections.set(kind, panel);
  const control = button('', () => reveal(kind, panel.hidden, true), 'jc-overview-section-link', `review-card-${kind}`), mark = el('span', 'jc-overview-section-icon'), copy = el('span', 'jc-overview-section-copy');
  mark.append(reviewIcon(icons[kind])); const count = counts[kind], unit = ar ? `${count} ${{branches:'فروع',services:'خدمات',rooms:'غرف',staff:'موظفين'}[kind]}` : `${count} ${kind === 'staff' ? count === 1 ? 'staff member' : 'staff members' : count === 1 ? kind === 'branches' ? 'branch' : kind.slice(0, -1) : kind}`;
  copy.append(el('strong', '', titles[kind]), el('span', '', unit)); control.append(mark, copy, reviewIcon('chevron')); control.setAttribute('aria-expanded', 'false'); control.setAttribute('aria-controls', panel.id); controls.set(kind, control); links.append(control); panels.append(panel);
 }
 card.append(header, links); return { card, panels, sections, controls, status, reveal, titles };
}
