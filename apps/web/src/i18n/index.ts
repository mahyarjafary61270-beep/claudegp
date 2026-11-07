import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fa } from './fa';
import { en } from './en';

const dicts = { fa, en };
export type Dict = typeof fa;

export type I18nKey = keyof Dict;

interface I18nState {
  locale: 'fa' | 'en';
  setLocale: (l: 'fa' | 'en') => void;
}

export const useI18nStore = create<I18nState>()(persist((set) => ({ locale: 'fa', setLocale: (locale) => set({ locale }) }), { name: 'mg-locale' }));

export function t(key: I18nKey, locale?: 'fa' | 'en'): string {
  const loc = locale ?? useI18nStore.getState().locale;
  const dict = dicts[loc];
  return (dict[key] ?? dicts.fa[key] ?? key) as string;
}

/** React-friendly hook */
export function useT(): (key: I18nKey) => string {
  const locale = useI18nStore((s) => s.locale);
  return (key) => t(key, locale);
}
