import { useQuery } from '@tanstack/react-query';
import { getStation } from '@mg/shared';
import { radioQueries } from '@/api/queries';
import { useRadio } from '@/stores/rooms';
import { useT } from '@/i18n';

/** Compact now-playing strip under a voice channel that has an active radio. */
export function RadioIndicator({ channelId }: { channelId: string }): JSX.Element {
  const t = useT();
  const radio = useRadio((s) => s.byChannel[channelId]);
  const { data } = useQuery({ ...radioQueries.status(channelId), refetchInterval: 30_000 });
  const np = data?.nowPlaying;
  const station = getStation(radio?.stationId ?? '');

  if (!radio || !station) return <div className="hidden" />;

  return (
    <div className="float-in mx-3 mb-1.5 rounded-xl border p-2 text-[10px]" style={{ borderColor: station.color, background: `color-mix(in srgb, ${station.color} 8%, transparent)` }}>
      <div className="flex items-center gap-1.5">
        <span className="eq"><span className="eq-bar" /><span className="eq-bar" style={{ animationDelay: '120ms' }} /><span className="eq-bar" style={{ animationDelay: '240ms' }} /></span>
        <span className="font-bold" style={{ color: station.color }}>
          {station.emoji} {station.name}
        </span>
        {np && (
          <span className="min-w-0 flex-1 truncate text-subtle" dir="auto" title={`${np.artist ?? ''} — ${np.title}`}>
            · {np.artist ? `${np.artist} — ` : ''}
            {np.title}
          </span>
        )}
        <span className="ms-auto shrink-0 text-subtle">{radio.listeners} 👥</span>
      </div>
      <div className="mt-0.5 text-[9px] text-subtle">{t('nowPlaying')} · mode: {radio.mode}</div>
    </div>
  );
}
