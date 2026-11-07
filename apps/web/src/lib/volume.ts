import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Discord-style volume model (all local, persisted):
 *  - per-participant: 0..200 % (identity key = LiveKit identity, humans = userId, radio = radio:<channelId>)
 *  - master output: 0..200 % (in settings store)
 *  - effective = clamp(master * perUser, 0..2) — applied with RemoteParticipant.setVolume,
 *    which routes through LiveKit's Web Audio gain node (supports >1.0).
 */

export interface VolumeState {
  participant: Record<string, number>;
  setParticipantVolume: (identity: string, v: number) => void;
}

export const useVolumes = create<VolumeState>()(
  persist(
    (set) => ({
      participant: {},
      setParticipantVolume: (identity, v) =>
        set((s) => ({ participant: { ...s.participant, [identity]: Math.max(0, Math.min(2, v)) } })),
    }),
    { name: 'mg-volumes' },
  ),
);

export function getEffectiveVolume(identity: string, master: number, masterMuted: boolean): number {
  if (masterMuted) return 0;
  const per = useVolumes.getState().participant[identity] ?? 1;
  return Math.max(0, Math.min(2, master * per));
}
