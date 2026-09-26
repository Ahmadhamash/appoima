import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Dictionary } from './en';
import { ar } from './ar';

export type Lang = 'en' | 'ar';
const STORAGE_KEY = 'jormall.lang';
const dictionaries: Record<Lang, Dictionary> = { en, ar };

type Ctx = {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dict: Dictionary;
};

const I18nContext = createContext<Ctx | null>(null);

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ar' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'ar';
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = dictionaries[lang];
    const t: Ctx['t'] = (key, vars) => {
      let s = lookup(dict, key) ?? lookup(en, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      }
      return s;
    };
    return { lang, dir, setLang, t, dict };
  }, [lang, dir, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Translate a server error code to a plain-language message. */
export function useErrorMessage() {
  const { t, dict } = useI18n();
  return (err: unknown): string => {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String((err as { code: string }).code);
      if (code === 'validation' && 'issues' in err && Array.isArray(err.issues)) {
        const issue = err.issues.find((item: unknown) => item && typeof item === 'object' && 'message' in item && typeof item.message === 'string' && item.message in dict.errors);
        if (issue) return t(`errors.${issue.message}`);
      }
      if (code in dict.errors) return t(`errors.${code}`);
      return t('errors.internal');
    }
    if (err instanceof TypeError) return t('errors.network');
    return t('common.somethingWrong');
  };
}

/** Format a date in the active language. Time zone comes from the branch in later phases. */
export function useDateFormat() {
  const { lang } = useI18n();
  const locale = lang === 'ar' ? 'ar-JO' : 'en-GB';
  return {
    long: (d: Date) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d),
    short: (d: Date) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d),
  };
}
