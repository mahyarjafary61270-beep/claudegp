import { useUI } from '@/stores/ui';
import { useView } from '@/stores/rooms';
import { useVoice } from '@/voice/voice-store';
import { voiceEngine } from '@/voice/engine';
import { useT } from '@/i18n';
import { RADIO_STATIONS } from '@mg/shared';
import { StationCard } from './StationCard';

/** Discord-style slash command palette: /mp /stop /np /radios */
export function CommandPalette(): JSX.Element {
  const t = useT();
  const activeChannel = useView((s) => s.activeChannel);
  const palette = useUI((s) => s.commandPalette);
  const setCommandPalette = useUI((s) => s.setCommandPalette);

  if (!palette.open || !activeChannel) return <div className="hidden" />;

  if (palette.command === 'mp') return <StationCard channelId={activeChannel} onClose={() => setCommandPalette(false)} />;
  if (palette.command === 'radios') return <StationCard channelId={activeChannel} listMode onClose={() => setCommandPalette(false)} />;

  if (palette.command === 'stop') {
    void (async () => {
      const { del } = await import('@/api/client');
      await del(`/channels/${activeChannel}/radio`).catch((err: Error) => alert(err.message));
      setCommandPalette(false);
    })();
    return <div className="hidden" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]" role="dialog">
      <div className="absolute inset-0 bg-black/60" onClick={() => setCommandPalette(false)} />
      <div className="glass float-in relative w-full max-w-sm rounded-2xl p-4">
        <div className="mb-2 text-[10px] font-bold uppercase text-subtle">{t('radio')} · /</div>
        <div className="space-y-1">
          {[
            { cmd: '/mp', desc: t('commandHintMp') },
            { cmd: '/stop', desc: t('commandHintStop') },
            { cmd: '/np', desc: t('commandHintNp') },
            { cmd: '/radios', desc: t('commandHintRadios') },
          ].map((c) => (
            <button
              key={c.cmd}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-panel"
              onClick={() => setCommandPalette(true, c.cmd.slice(1) as 'mp' | 'stop' | 'np' | 'radios')}
            >
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono" style={{ color: 'var(--accent-3)' }}>
                {c.cmd}
              </code>
              <span className="text-subtle">{c.desc}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-subtle">
          {RADIO_STATIONS.map((s) => `${s.emoji} ${s.name}`).join(' · ')}
        </div>
        <div className="mt-1 text-[10px] text-subtle">
          {useVoice.getState().joined ? '🎙️ in voice' : `🎙️ ${t('notInVoice')}`}
          {useVoice.getState().joined && voiceEngine.isJoined() ? '' : ''}
        </div>
      </div>
    </div>
  );
}
