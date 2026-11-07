import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RADIO_STATIONS, type RadioStateDTO } from '@mg/shared';
import { mutations, radioQueries, qk } from '@/api/queries';
import { useVoiceRooms } from '@/stores/rooms';
import { useVoice } from '@/voice/voice-store';
import { useT } from '@/i18n';
import { X } from '@/components/ui/icons';

/**
 * The glowing /mp station-picker card, reused in list mode for /radios.
 */
export function StationCard({ channelId, listMode = false, onClose }: { channelId: string; listMode?: boolean; onClose: () => void }): JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const start = useMutation(mutations.startRadio(channelId));
  const { data: status } = useQuery({ ...radioQueries.status(channelId), refetchInterval: false });
  const voiceRooms = useVoiceRooms((s) => s.rooms);
  const joined = useVoice((s) => s.joined);
  const inVoice = (voiceRooms[channelId]?.length ?? 0) > 0 || joined === channelId;

  const active: RadioStateDTO | null = status?.radio ?? null;

  const pick = async (stationId: string): Promise<void> => {
    try {
      await start.mutateAsync(stationId);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="neon-border float-in mb-2 rounded-2xl p-4" role="dialog" aria-label={t('radioStations')}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="eq"><span className="eq-bar" /><span className="eq-bar" style={{ animationDelay: '150ms' }} /><span className="eq-bar" style={{ animationDelay: '300ms' }} /></span>
          <h3 className="neon-text text-sm font-black">{listMode ? t('radioStations') : t('playRadio')}</h3>
        </div>
        <button className="btn-ghost !p-1" onClick={onClose} aria-label="close">
          <X size={14} />
        </button>
      </div>
      {!listMode && !inVoice && (
        <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">🎙️ {t('notInVoice')}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {RADIO_STATIONS.map((s) => {
          const isActiveHere = active?.stationId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => void pick(s.id)}
              disabled={start.isPending}
              className="group relative overflow-hidden rounded-xl border p-3 text-start transition-all duration-200 hover:scale-[1.02]"
              style={{
                borderColor: isActiveHere ? s.color : 'var(--border-line)',
                background: `linear-gradient(135deg, color-mix(in srgb, ${s.color} 16%, transparent), transparent)`,
                boxShadow: isActiveHere ? `0 0 18px -6px ${s.color}` : undefined,
              }}
            >
              <div className="text-xl">{s.emoji}</div>
              <div className="mt-1 text-sm font-bold" style={{ color: s.color }}>
                {s.name}
              </div>
              {isActiveHere && <div className="mt-0.5 text-[10px] font-bold text-white">▶ ON AIR</div>}
              {active && !isActiveHere && active.stationId === s.id && <div className="mt-0.5 text-[10px] text-subtle">{active.listeners} 👥</div>}
            </button>
          );
        })}
      </div>
      {active && !listMode && (
        <button className="btn-danger mt-3 w-full" onClick={() => void stopRadio(channelId, queryClient, onClose)}>
          ⏹ {t('stopRadio')}
        </button>
      )}
    </div>
  );
}

async function stopRadio(channelId: string, queryClient: ReturnType<typeof useQueryClient>, onClose: () => void): Promise<void> {
  const { del } = await import('@/api/client');
  await del(`/channels/${channelId}/radio`).catch(() => undefined);
  void queryClient.invalidateQueries({ queryKey: qk.radio(channelId) });
  onClose();
}
