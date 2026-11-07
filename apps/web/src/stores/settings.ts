import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectLowEndDevice } from '@/lib/device';

export type ThemeName = 'sakura' | 'tokyo' | 'aurora';
export type Locale = 'fa' | 'en';

interface SettingsState {
  theme: ThemeName;
  accent: string | null;
  locale: Locale;
  performanceMode: boolean;
  jalaliDates: boolean;
  soundEnabled: boolean;
  masterVolume: number; // 0..2
  masterMuted: boolean;
  setTheme: (t: ThemeName) => void;
  setAccent: (c: string | null) => void;
  setLocale: (l: Locale) => void;
  setPerformanceMode: (p: boolean) => void;
  setJalaliDates: (b: boolean) => void;
  setSoundEnabled: (b: boolean) => void;
  setMasterVolume: (v: number) => void;
  setMasterMuted: (b: boolean) => void;
}

const lowEnd = detectLowEndDevice();

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'sakura',
      accent: null,
      locale: 'fa',
      performanceMode: lowEnd, // auto-enable on low-end devices
      jalaliDates: true,
      soundEnabled: true,
      masterVolume: 1,
      masterMuted: false,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setLocale: (locale) => set({ locale }),
      setPerformanceMode: (performanceMode) => set({ performanceMode }),
      setJalaliDates: (jalaliDates) => set({ jalaliDates }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setMasterVolume: (masterVolume) => set({ masterVolume }),
      setMasterMuted: (masterMuted) => set({ masterMuted }),
    }),
    { name: 'mg-settings' },
  ),
);

export function applySettingsDom(s: SettingsState): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.lang = s.locale;
  root.dir = s.locale === 'fa' ? 'rtl' : 'ltr';
  if (s.accent) {
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accent-glow', `color-mix(in srgb, ${s.accent} 55%, transparent)`);
  } else {
    root.style.removeProperty('--accent');
  }
  document.body.classList.toggle('perf-off', s.performanceMode);
}
