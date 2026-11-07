import { create } from 'zustand';
import type { RadioStateDTO, NowPlayingDTO, VoiceMemberDTO } from '@mg/shared';

/** Voice room rosters pushed by the server (source: LiveKit webhooks + sweep). */
interface VoiceRoomsState {
  rooms: Record<string, VoiceMemberDTO[]>;
  merge: (map: Record<string, VoiceMemberDTO[]>) => void;
  drop: (channelId: string) => void;
}

export const useVoiceRooms = create<VoiceRoomsState>((set) => ({
  rooms: {},
  merge: (map) => set((s) => ({ rooms: { ...s.rooms, ...map } })),
  drop: (channelId) =>
    set((s) => {
      const next = { ...s.rooms };
      delete next[channelId];
      return { rooms: next };
    }),
}));

/** Active radios + cached now-playing per channel. */
interface RadioState {
  byChannel: Record<string, RadioStateDTO | null>;
  nowPlaying: Record<string, NowPlayingDTO | null>;
  set: (channelId: string, radio: RadioStateDTO | null) => void;
  setNowPlaying: (channelId: string, np: NowPlayingDTO | null) => void;
}

export const useRadio = create<RadioState>((set) => ({
  byChannel: {},
  nowPlaying: {},
  set: (channelId, radio) => set((s) => ({ byChannel: { ...s.byChannel, [channelId]: radio } })),
  setNowPlaying: (channelId, np) => set((s) => ({ nowPlaying: { ...s.nowPlaying, [channelId]: np } })),
}));

/** Which channel the user is currently viewing (chat). */
interface ViewState {
  activeChannel: string | null; // text channel or DM id
  activeServer: string | null;
  setActive: (serverId: string | null, channelId: string | null) => void;
}

export const useView = create<ViewState>((set) => ({
  activeChannel: null,
  activeServer: null,
  setActive: (activeServer, activeChannel) => set({ activeServer, activeChannel }),
}));
