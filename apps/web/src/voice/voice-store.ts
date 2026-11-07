import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ScreenQuality = '720p30' | '1080p30' | '1080p60';

export interface VoiceParticipant {
  identity: string;
  name: string;
  avatarUrl: string | null;
  accentColor: string | null;
  isBot: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  streaming: boolean;
  quality: string;
  volume: number;
  subscribed: boolean;
}

interface VoiceState {
  joined: string | null; // channelId
  connecting: boolean;
  connectionState: string;
  micMuted: boolean;
  deafened: boolean;
  preDeafenMute: boolean;
  cameraOn: boolean;
  sharing: boolean;
  watching: string[]; // identities being watched
  participants: VoiceParticipant[];
  activeSpeaker: string | null;
  // persisted prefs
  ptt: boolean;
  pttKey: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  screenQuality: ScreenQuality;
  screenAudio: boolean;
  selectedMic: string;
  selectedSpeaker: string;
  theater: boolean;
  // runtime
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];

  setJoined: (channelId: string | null) => void;
  setConnecting: (b: boolean) => void;
  setConnectionState: (s: string) => void;
  setMicMuted: (b: boolean) => void;
  setDeafened: (b: boolean) => void;
  setPreDeafenMute: (b: boolean) => void;
  setCameraOn: (b: boolean) => void;
  setSharing: (b: boolean) => void;
  setWatching: (identity: string, watch: boolean) => void;
  setParticipants: (list: VoiceParticipant[]) => void;
  setActiveSpeaker: (id: string | null) => void;
  setPtt: (b: boolean) => void;
  setPttKey: (k: string) => void;
  setToggles: (t: Partial<Pick<VoiceState, 'noiseSuppression' | 'echoCancellation' | 'autoGain'>>) => void;
  setScreenQuality: (q: ScreenQuality) => void;
  setScreenAudio: (b: boolean) => void;
  setSelectedMic: (id: string) => void;
  setSelectedSpeaker: (id: string) => void;
  setTheater: (b: boolean) => void;
  setDevices: (mics: MediaDeviceInfo[], speakers: MediaDeviceInfo[]) => void;
  reset: () => void;
}

export const useVoice = create<VoiceState>()(
  persist(
    (set) => ({
      joined: null,
      connecting: false,
      connectionState: 'idle',
      micMuted: false,
      deafened: false,
      preDeafenMute: false,
      cameraOn: false,
      sharing: false,
      watching: [],
      participants: [],
      activeSpeaker: null,
      ptt: false,
      pttKey: 'Space',
      noiseSuppression: true,
      echoCancellation: true,
      autoGain: true,
      screenQuality: '1080p30',
      screenAudio: true,
      selectedMic: '',
      selectedSpeaker: '',
      theater: false,
      mics: [],
      speakers: [],

      setJoined: (joined) => set({ joined, ...(joined ? {} : { participants: [], watching: [], cameraOn: false, sharing: false, activeSpeaker: null, connectionState: 'idle' }) }),
      setConnecting: (connecting) => set({ connecting }),
      setConnectionState: (connectionState) => set({ connectionState }),
      setMicMuted: (micMuted) => set({ micMuted }),
      setDeafened: (deafened) => set({ deafened }),
      setPreDeafenMute: (preDeafenMute) => set({ preDeafenMute }),
      setCameraOn: (cameraOn) => set({ cameraOn }),
      setSharing: (sharing) => set({ sharing }),
      setWatching: (identity, watch) =>
        set((s) => ({ watching: watch ? [...new Set([...s.watching, identity])] : s.watching.filter((x) => x !== identity) })),
      setParticipants: (participants) => set({ participants }),
      setActiveSpeaker: (activeSpeaker) => set({ activeSpeaker }),
      setPtt: (ptt) => set({ ptt }),
      setPttKey: (pttKey) => set({ pttKey }),
      setToggles: (t) => set(t),
      setScreenQuality: (screenQuality) => set({ screenQuality }),
      setScreenAudio: (screenAudio) => set({ screenAudio }),
      setSelectedMic: (selectedMic) => set({ selectedMic }),
      setSelectedSpeaker: (selectedSpeaker) => set({ selectedSpeaker }),
      setTheater: (theater) => set({ theater }),
      setDevices: (mics, speakers) => set({ mics, speakers }),
      reset: () =>
        set({
          joined: null,
          connecting: false,
          connectionState: 'idle',
          micMuted: false,
          deafened: false,
          cameraOn: false,
          sharing: false,
          watching: [],
          participants: [],
          activeSpeaker: null,
        }),
    }),
    {
      name: 'mg-voice',
      partialize: (s) => ({
        ptt: s.ptt,
        pttKey: s.pttKey,
        noiseSuppression: s.noiseSuppression,
        echoCancellation: s.echoCancellation,
        autoGain: s.autoGain,
        screenQuality: s.screenQuality,
        screenAudio: s.screenAudio,
        selectedMic: s.selectedMic,
        selectedSpeaker: s.selectedSpeaker,
      }),
    },
  ),
);
