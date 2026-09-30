import { button, el } from './dom';
import type { Language } from './contract';

const pageListeners = new WeakMap<HTMLElement, Map<string, EventListener>>();

/** Keep long setup lists in a single question-sized panel without rebuilding inputs. */
export function setupPager(root: HTMLElement, cards: HTMLElement[], language: Language, id: string, onPageChanged?: (page: number) => void): HTMLElement | null {
  const listeners = pageListeners.get(root) ?? new Map<string, EventListener>();
  const previousListener = listeners.get(id);
  if (previousListener) root.removeEventListener('jormall:setup-page', previousListener);
  listeners.delete(id); pageListeners.set(root, listeners);
  if (cards.length < 2) return null;
  const ar = language === 'ar';
  const nav = el('nav', 'jc-page-nav');
  nav.dataset.testid = id;
  nav.setAttribute('aria-label', ar ? 'تصفح بيانات الإعداد' : 'Browse setup details');
  const label = el('span');
  label.setAttribute('aria-live', 'polite');
  let page = 0;
  const update = (next: number) => {
    cards = cards.filter(card => root.contains(card));
    nav.hidden = cards.length < 2;
    page = Math.max(0, Math.min(cards.length - 1, next));
    root.dataset.setupPage = String(page);
    cards.forEach((card, index) => { card.hidden = index !== page; });
    label.textContent = ar ? `${page + 1} من ${cards.length}` : `${page + 1} of ${cards.length}`;
    previous.disabled = page === 0;
    following.disabled = page === cards.length - 1;
    onPageChanged?.(page);
  };
  const previous = button(ar ? 'السابق' : 'Previous', () => update(page - 1), 'jc-button', `${id}-previous`);
  const following = button(ar ? 'التالي' : 'Next', () => update(page + 1), 'jc-button', `${id}-next`);
  nav.append(previous, label, following);
  const listener: EventListener = event => { if(event.target===root)update(Number((event as CustomEvent<number>).detail) || 0); };
  root.addEventListener('jormall:setup-page', listener); listeners.set(id, listener);
  update(0);
  return nav;
}
