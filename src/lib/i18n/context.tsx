'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { t as translate, DATE_LOCALES, type Locale } from './translations';

export type { Locale } from './translations';

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dateLocale: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'capbudget-locale';

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'fr';

  // Check localStorage for user preference
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'nl' || stored === 'en') return stored;
  } catch { /* SSR or blocked storage */ }

  // Auto-detect from browser language
  const lang = navigator.language || '';
  if (lang.startsWith('nl')) return 'nl';
  if (lang.startsWith('fr')) return 'fr';
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const dateLocale = DATE_LOCALES[locale];

  const value = useMemo(
    () => ({ locale, setLocale, t, dateLocale }),
    [locale, setLocale, t, dateLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
