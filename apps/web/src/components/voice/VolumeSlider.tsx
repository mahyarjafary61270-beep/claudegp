import { useVolumes, getEffectiveVolume } from '@/lib/volume';
import { useSettings } from '@/stores/settings';

/**
 * Discord-style per-participant volume: 0–200 %.
 * Applied via participant.setVolume (LiveKit Web Audio gain, supports >1).
 */
export function VolumeSlider({ identity, mini = false }: { identity: string; mini?: boolean }): JSX.Element {
  const per = useVolumes((s) => s.participant[identity] ?? 1);
  const setVolume = useVolumes((s) => s.setParticipantVolume);
  const master = useSettings((s) => s.masterVolume);
  const masterMuted = useSettings((s) => s.masterMuted);
  const effective = getEffectiveVolume(identity, masterMuted ? 0 : master, masterMuted);

  return (
    <div className="flex items-center gap-1.5" title={`${Math.round(per * 100)}%`}>
      <input
        type="range"
        className="vol"
        min={0}
        max={2}
        step={0.05}
        value={per}
        style={{ ['--fill' as string]: `${(per / 2) * 100}%`, width: mini ? 72 : 120 }}
        onChange={(e) => setVolume(identity, Number(e.target.value))}
        aria-label={`volume ${identity}`}
      />
      <span className="w-8 text-end text-[9px] text-subtle" dir="ltr">
        {Math.round(effective * 100)}%
      </span>
    </div>
  );
}
