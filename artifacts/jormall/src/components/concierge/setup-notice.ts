import { button, el } from './dom';
import type { Language } from './contract';

export function setupNotice(language: Language, title: string, message: string) {
  const popup = el('dialog', 'jc-setup-notice-popup');
  popup.dir = language === 'ar' ? 'rtl' : 'ltr';
  popup.dataset.testid = 'concierge-data-notice';
  const heading = el('h2', '', title);
  heading.id = 'jc-data-notice-title';
  popup.setAttribute('aria-labelledby', heading.id);
  popup.append(heading, el('p', '', message), button(language === 'ar' ? 'تمام، بكمّل البيانات' : 'Continue entering details', () => popup.close(), 'jc-button jc-primary', 'concierge-data-notice-close'));
  popup.addEventListener('close', () => popup.remove(), { once: true });
  document.body.append(popup);
  popup.showModal();
}
