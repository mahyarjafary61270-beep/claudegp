import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useSettings, ACCENT_LIST } from '@/components/modals/accent';
import { useVoice } from '@/voice/voice-store';
import { voiceEngine } from '@/voice/engine';
import { useI18nStore, useT } from '@/i18n';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { EMOJI_CATEGORIES } from '@/lib/emoji-data';

export function SettingsModal(): JSX.Element {
  const t = useT();
  const open = useUI((s) => s.settingsOpen);
  const setOpen = useUI((s) => s.setSettingsOpen);
  const me = useAuth((s) => s.user);
  const settings = useSettings();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const voice = useVoice();
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [statusText, setStatusText] = useState(me?.statusText ?? '');
  const [accent, setAccent] = useState(me?.accentColor ?? '');

  if (!me) return <div className="hidden" />;

  const saveProfile = async (): Promise<void> => {
    const { patch } = await import('@/api/client');
    try {
      const res = await patch<{ user: typeof me }>('/users/me', {
        displayName,
        statusText: statusText || null,
        accentColor: accent || null,
      });
      useAuth.getState().setUser(res.user);
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('settings')} width={560}>
      <div className="scroll-thin max-h-[70vh] space-y-6 overflow-y-auto pe-1">
        {/* Profile */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-subtle">{t('profile')}</h3>
          <div className="space-y-2">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('displayName')} maxLength={48} />
            <input className="input" value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder={t('statusText')} maxLength={120} />
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_LIST.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccent(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: accent === c ? '#fff' : 'transparent' }}
                  aria-label={c}
                />
              ))}
            </div>
            <button className="btn-primary" onClick={() => void saveProfile()}>
              ✓ {t('send')}
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-subtle">{t('appearance')}</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['sakura', t('themeSakura'), '🌸'],
                ['tokyo', t('themeTokyo'), '🌃'],
                ['aurora', t('themeAurora'), '🌌'],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => settings.setTheme(id)}
                className={`rounded-xl border p-3 text-center text-xs transition-all ${settings.theme === id ? 'neon-border font-bold' : 'border-line hover:bg-panel'}`}
              >
                <div className="text-xl">{icon}</div>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EMOJI_CATEGORIES[2]!.emojis.slice(0, 8).map((e, i) => (
              <button
                key={`${e}${i}`}
                className="h-7 w-7 rounded-full text-lg leading-none transition-transform hover:scale-125"
                onClick={() => settings.setAccent(ACCENT_LIST[i] ?? null)}
                title={t('accentColor')}
                aria-label={t('accentColor')}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Toggle label={t('performanceMode')} hint={t('performanceHint')} checked={settings.performanceMode} onChange={settings.setPerformanceMode} />
            <Toggle label={t('jalaliDates')} checked={settings.jalaliDates} onChange={settings.setJalaliDates} />
            <Toggle label={t('sounds')} checked={settings.soundEnabled} onChange={settings.setSoundEnabled} />
            <div className="flex items-center justify-between gap-3">
              <span>{t('masterVolume')}</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost !p-1" onClick={() => settings.setMasterMuted(!settings.masterMuted)}>
                  {settings.masterMuted ? '🔇' : '🔊'}
                </button>
                <input
                  type="range"
                  className="vol"
                  min={0}
                  max={2}
                  step={0.05}
                  value={settings.masterVolume}
                  style={{ ['--fill' as string]: `${(settings.masterVolume / 2) * 100}%`, width: 140 }}
                  onChange={(e) => settings.setMasterVolume(Number(e.target.value))}
                  aria-label={t('masterVolume')}
                />
                <span className="w-10 text-end text-xs text-subtle" dir="ltr">
                  {Math.round(settings.masterVolume * 100)}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Voice */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-subtle">{t('voiceSettings')}</h3>
          <div className="space-y-2 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-subtle">{t('inputDevice')}</span>
              <select className="input" value={voice.selectedMic} onChange={(e) => void voiceEngine.selectMic(e.target.value)}>
                <option value="">default</option>
                {voice.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId.slice(0, 12)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-subtle">{t('outputDevice')}</span>
              <select className="input" value={voice.selectedSpeaker} onChange={(e) => void voiceEngine.selectSpeaker(e.target.value)}>
                <option value="">default</option>
                {voice.speakers.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId.slice(0, 12)}
                  </option>
                ))}
              </select>
            </label>
            <Toggle label={t('noiseSuppression')} checked={voice.noiseSuppression} onChange={(v) => void voiceEngine.setProcessingToggles({ noiseSuppression: v })} />
            <Toggle label={t('echoCancellation')} checked={voice.echoCancellation} onChange={(v) => void voiceEngine.setProcessingToggles({ echoCancellation: v })} />
            <Toggle label={t('autoGain')} checked={voice.autoGain} onChange={(v) => void voiceEngine.setProcessingToggles({ autoGain: v })} />
            <Toggle label={t('pushToTalk')} checked={voice.ptt} onChange={(v) => void voiceEngine.setPttMode(v)} />
            {voice.ptt && (
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="text-subtle">key</span>
                <input
                  className="input w-32 text-center font-mono"
                  value={voice.pttKey}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    voice.setPttKey(e.code);
                  }}
                  readOnly
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-subtle">{t('screenShare')}</span>
              <div className="flex gap-1.5">
                {(['720p30', '1080p30', '1080p60'] as const).map((qk) => (
                  <button
                    key={qk}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${voice.screenQuality === qk ? 'neon-border font-bold' : 'border-line'}`}
                    onClick={() => voice.setScreenQuality(qk)}
                  >
                    {qk}
                  </button>
                ))}
              </div>
            </label>
            <Toggle label={`${t('screenShare')} 🔊 (system audio)`} checked={voice.screenAudio} onChange={voice.setScreenAudio} />
          </div>
        </section>

        {/* Language + notifications */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase text-subtle">{t('language')}</h3>
          <div className="flex gap-2">
            <button className={`btn flex-1 ${locale === 'fa' ? 'btn-primary' : 'btn-ghost border border-line'}`} onClick={() => setLocale('fa')}>
              🇮🇷 فارسی
            </button>
            <button className={`btn flex-1 ${locale === 'en' ? 'btn-primary' : 'btn-ghost border border-line'}`} onClick={() => setLocale('en')}>
              🇬🇧 English
            </button>
          </div>
          <button
            className="btn-ghost mt-3 w-full"
            onClick={() => {
              void Notification?.requestPermission?.();
            }}
          >
            🔔 {t('desktopNotifications')}
          </button>
        </section>
      </div>
    </Modal>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (b: boolean) => void }): JSX.Element {
  return (
    <button className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-start hover:bg-panel" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span>
        {label}
        {hint && <span className="block text-[10px] text-subtle">{hint}</span>}
      </span>
      <span
        className="relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--border-line)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{ insetInlineStart: checked ? '1.125rem' : '0.125rem' }}
        />
      </span>
    </button>
  );
}
