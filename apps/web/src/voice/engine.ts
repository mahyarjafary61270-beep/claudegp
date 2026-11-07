import type { ConnectionQuality, LocalAudioTrack, LocalTrack, RemoteParticipant, RemoteTrackPublication } from 'livekit-client';
import type { VoiceTokenDTO } from '@mg/shared';
import { post } from '@/api/client';
import { socket } from '@/ws/socket';
import { useVoice, type ScreenQuality } from './voice-store';
import { getEffectiveVolume, useVolumes } from '@/lib/volume';
import { useSettings } from '@/stores/settings';
import { sounds } from '@/lib/sound';

type LK = typeof import('livekit-client');

function isRemote(lk: LK, room: import('livekit-client').Room, p: { identity: string }): p is RemoteParticipant {
  return p.identity !== room.localParticipant.identity;
}

class VoiceEngine {
  private lk: LK | null = null;
  private room: import('livekit-client').Room | null = null;
  private channelId: string | null = null;
  private pttHeld = false;

  async loadLK(): Promise<LK> {
    if (!this.lk) {
      this.lk = await import('livekit-client');
    }
    return this.lk;
  }

  isJoined(): boolean {
    return this.channelId !== null;
  }

  currentChannel(): string | null {
    return this.channelId;
  }

  /** Escape hatch for UI that needs the raw Room (screen share attach). */
  getRoom(): import('livekit-client').Room | null {
    return this.room;
  }

  async join(channelId: string): Promise<void> {
    if (this.channelId === channelId) return;
    if (this.channelId) await this.leave(false);
    useVoice.getState().setConnecting(true);
    try {
      const lk = await this.loadLK();
      const token = await post<VoiceTokenDTO>('/voice/token', { channelId });

      const vs = useVoice.getState();
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        webAudioMix: true,
        audioCaptureDefaults: {
          autoGainControl: vs.autoGain,
          echoCancellation: vs.echoCancellation,
          noiseSuppression: vs.noiseSuppression,
          deviceId: vs.selectedMic || undefined,
        },
      });
      this.room = room;
      this.channelId = channelId;
      this.bindRoomEvents(lk, room, channelId);

      await room.connect(token.url, token.token);
      await room.startAudio().catch(() => undefined);

      await this.publishMic();

      useVoice.getState().setJoined(channelId);
      sounds.join();
      socket.send({ t: 'sync' });
    } catch (err) {
      this.channelId = null;
      this.room = null;
      useVoice.getState().setJoined(null);
      throw err;
    } finally {
      useVoice.getState().setConnecting(false);
    }
  }

  async leave(playSound = true): Promise<void> {
    if (this.room) {
      await this.room.disconnect().catch(() => undefined);
    }
    this.room = null;
    const wasChannel = this.channelId;
    this.channelId = null;
    useVoice.getState().reset();
    if (wasChannel && playSound) sounds.leave();
  }

  private async publishMic(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const vs = useVoice.getState();
    const enabled = vs.ptt ? false : !vs.micMuted;
    await room.localParticipant.setMicrophoneEnabled(enabled, {
      autoGainControl: vs.autoGain,
      echoCancellation: vs.echoCancellation,
      noiseSuppression: vs.noiseSuppression,
      deviceId: vs.selectedMic || undefined,
    }).catch(() => undefined);
    this.announceFlags();
  }

  private announceFlags(): void {
    const s = useVoice.getState();
    this.room?.localParticipant.setMetadata(JSON.stringify({ muted: s.micMuted, deafened: s.deafened }));
    // our own WS is the reliable flag channel (LiveKit webhooks don't carry metadata updates)
    socket.send({ t: 'voice_flags', muted: s.micMuted, deafened: s.deafened });
  }

  // ---- controls ----

  async setMicMuted(muted: boolean): Promise<void> {
    useVoice.getState().setMicMuted(muted);
    if (!useVoice.getState().ptt) {
      await this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => undefined);
    }
    this.announceFlags();
  }

  async toggleMute(): Promise<void> {
    const s = useVoice.getState();
    await this.setMicMuted(!s.micMuted);
  }

  async setDeafened(deafened: boolean): Promise<void> {
    const prev = useVoice.getState();
    useVoice.getState().setDeafened(deafened);
    useVoice.getState().setPreDeafenMute(prev.micMuted);
    if (deafened && !prev.micMuted) await this.setMicMuted(true);
    if (!deafened && prev.micMuted && !prev.preDeafenMute) await this.setMicMuted(false);
    this.applyVolumes();
    this.announceFlags();
  }

  async toggleDeafen(): Promise<void> {
    await this.setDeafened(!useVoice.getState().deafened);
  }

  async setCamera(on: boolean): Promise<void> {
    await this.room?.localParticipant.setCameraEnabled(on).catch(() => undefined);
    useVoice.getState().setCameraOn(on);
    this.announceFlags();
  }

  async toggleCamera(): Promise<void> {
    await this.setCamera(!useVoice.getState().cameraOn);
  }

  async startScreenShare(quality: ScreenQuality, withAudio: boolean): Promise<void> {
    const lk = await this.loadLK();
    const presets: Record<ScreenQuality, { width: number; height: number; frameRate: number; maxBitrate: number }> = {
      '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 2_500_000 },
      '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 5_000_000 },
      '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 8_000_000 },
    };
    const preset = presets[quality];
    try {
      const stream = await lk.createLocalScreenTracks({
        audio: withAudio,
        resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
      });
      for (const track of stream) {
        if (track.kind === 'video') {
          await this.room?.localParticipant.publishTrack(track, {
            source: lk.Track.Source.ScreenShare,
            videoEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
            simulcast: true,
          });
        } else {
          await this.room?.localParticipant.publishTrack(track, {
            source: lk.Track.Source.ScreenShareAudio,
          });
        }
      }
      useVoice.getState().setSharing(true);
      this.announceFlags();
    } catch (err) {
      useVoice.getState().setSharing(false);
      throw err;
    }
  }

  async stopScreenShare(): Promise<void> {
    const lk = await this.loadLK();
    const room = this.room;
    if (!room) return;
    const pubs = [...room.localParticipant.trackPublications.values()].filter(
      (p) => p.source === lk.Track.Source.ScreenShare || p.source === lk.Track.Source.ScreenShareAudio,
    );
    for (const p of pubs) {
      await room.localParticipant.unpublishTrack(p.track as LocalTrack, true).catch(() => undefined);
    }
    useVoice.getState().setSharing(false);
    this.announceFlags();
  }

  async toggleScreenShare(quality: ScreenQuality, withAudio: boolean): Promise<void> {
    if (useVoice.getState().sharing) await this.stopScreenShare();
    else await this.startScreenShare(quality, withAudio);
  }

  // ---- PTT ----

  setPttHeld(held: boolean): void {
    if (!useVoice.getState().ptt) return;
    if (this.pttHeld === held) return;
    this.pttHeld = held;
    void this.room?.localParticipant.setMicrophoneEnabled(held).catch(() => undefined);
  }

  async setPttMode(on: boolean): Promise<void> {
    useVoice.getState().setPtt(on);
    if (on) {
      await this.room?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    } else {
      await this.room?.localParticipant.setMicrophoneEnabled(!useVoice.getState().micMuted).catch(() => undefined);
    }
  }

  // ---- devices & audio processing ----

  async refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      useVoice.getState().setDevices(
        devices.filter((d) => d.kind === 'audioinput'),
        devices.filter((d) => d.kind === 'audiooutput'),
      );
    } catch {
      /* permissions missing */
    }
  }

  async selectMic(deviceId: string): Promise<void> {
    useVoice.getState().setSelectedMic(deviceId);
    const vs = useVoice.getState();
    await this.room?.localParticipant.setMicrophoneEnabled(!vs.micMuted && !vs.ptt, {
      deviceId: deviceId || undefined,
      autoGainControl: vs.autoGain,
      echoCancellation: vs.echoCancellation,
      noiseSuppression: vs.noiseSuppression,
    }).catch(() => undefined);
  }

  async selectSpeaker(deviceId: string): Promise<void> {
    useVoice.getState().setSelectedSpeaker(deviceId);
    const room = this.room;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const t = pub.track as unknown as { setSinkId?: (id: string) => Promise<void> } | undefined;
        if (t && typeof t.setSinkId === 'function') {
          await t.setSinkId(deviceId).catch(() => undefined);
        }
      }
    }
  }

  async setProcessingToggles(t: Partial<{ noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean }>): Promise<void> {
    useVoice.getState().setToggles(t);
    const vs = useVoice.getState();
    await this.room?.localParticipant.setMicrophoneEnabled(!vs.micMuted && !vs.ptt, {
      autoGainControl: vs.autoGain,
      echoCancellation: vs.echoCancellation,
      noiseSuppression: vs.noiseSuppression,
      deviceId: vs.selectedMic || undefined,
    }).catch(() => undefined);
  }

  // ---- volume ----

  applyVolumes(): void {
    const room = this.room;
    const lk = this.lk;
    if (!room || !lk) return;
    const s = useSettings.getState();
    for (const p of room.remoteParticipants.values()) {
      try {
        p.setVolume(getEffectiveVolume(p.identity, s.masterMuted ? 0 : s.masterVolume, s.masterMuted));
      } catch {
        /* not subscribed to audio yet */
      }
    }
  }

  async setWatch(identity: string, watch: boolean): Promise<void> {
    const lk = await this.loadLK();
    const room = this.room;
    if (!room) return;
    const p = room.remoteParticipants.get(identity);
    if (!p) return;
    for (const pub of p.trackPublications.values()) {
      if (pub.source === lk.Track.Source.ScreenShare || pub.source === lk.Track.Source.ScreenShareAudio) {
        await Promise.resolve((pub as RemoteTrackPublication).setSubscribed(watch)).catch(() => undefined);
      }
    }
    useVoice.getState().setWatching(identity, watch);
  }

  // ---- events ----

  private bindRoomEvents(lk: LK, room: import('livekit-client').Room, channelId: string): void {
    const store = useVoice.getState;

    const upsertParticipant = (p: RemoteParticipant): void => {
      const meta = (() => {
        try {
          return JSON.parse(p.metadata ?? '{}') as { muted?: boolean; deafened?: boolean };
        } catch {
          return {};
        }
      })();
      const list = store().participants.filter((x) => x.identity !== p.identity);
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: null,
        accentColor: null,
        isBot: p.identity.startsWith('radio:'),
        muted: meta.muted ?? !p.isMicrophoneEnabled,
        deafened: meta.deafened ?? false,
        speaking: p.isSpeaking,
        streaming: [...p.trackPublications.values()].some((t) => t.source === lk.Track.Source.ScreenShare),
        quality: p.connectionQuality as ConnectionQuality,
        volume: useVolumes.getState().participant[p.identity] ?? 1,
        subscribed: [...p.trackPublications.values()].some(
          (t) => t.isSubscribed && (t.source === lk.Track.Source.ScreenShare || t.source === lk.Track.Source.ScreenShareAudio),
        ),
      });
      store().setParticipants(list);
    };

    room.on(lk.RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      upsertParticipant(p);
      sounds.join();
    });

    room.on(lk.RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      const list = store().participants.filter((x) => x.identity !== p.identity);
      store().setParticipants(list);
      store().setWatching(p.identity, false);
      sounds.leave();
    });

    room.on(lk.RoomEvent.TrackMuted, (pub: import('livekit-client').TrackPublication, p: import('livekit-client').Participant) => {
      if (pub.source === lk.Track.Source.Microphone && isRemote(lk, room, p)) upsertParticipant(p);
    });
    room.on(lk.RoomEvent.TrackUnmuted, (pub: import('livekit-client').TrackPublication, p: import('livekit-client').Participant) => {
      if (pub.source === lk.Track.Source.Microphone && isRemote(lk, room, p)) upsertParticipant(p);
    });

    room.on(lk.RoomEvent.TrackPublished, (pub: import('livekit-client').RemoteTrackPublication, p: RemoteParticipant) => {
      upsertParticipant(p);
      // auto-subscribe to mic/cam; screen share only on explicit "Watch"
      if (pub.source === lk.Track.Source.Microphone || pub.source === lk.Track.Source.Camera) {
        void Promise.resolve(pub.setSubscribed(true)).catch(() => undefined);
      }
      if (pub.source === lk.Track.Source.ScreenShare && store().watching.includes(p.identity)) {
        void Promise.resolve(pub.setSubscribed(true)).catch(() => undefined);
      }
    });

    room.on(lk.RoomEvent.TrackUnpublished, (_pub: import('livekit-client').RemoteTrackPublication, p: RemoteParticipant) => upsertParticipant(p));

    room.on(lk.RoomEvent.TrackSubscribed, (track: import('livekit-client').RemoteTrack, pub: import('livekit-client').RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.source === lk.Track.Source.Microphone) {
        const s = useSettings.getState();
        try {
          p.setVolume(getEffectiveVolume(p.identity, s.masterMuted ? 0 : s.masterVolume, s.masterMuted));
          const sink = useVoice.getState().selectedSpeaker;
          const t = track as unknown as { setSinkId?: (id: string) => Promise<void> };
          if (sink && typeof t.setSinkId === 'function') void t.setSinkId(sink).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    });

    room.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers: { identity: string }[]) => {
      const active = speakers.map((s) => s.identity);
      const list = store().participants.map((x) => ({ ...x, speaking: active.includes(x.identity) }));
      store().setParticipants(list);
      store().setActiveSpeaker(active[0] ?? null);
    });

    room.on(lk.RoomEvent.ParticipantMetadataChanged, (_m: string | undefined, p: import('livekit-client').Participant) => {
      if (isRemote(lk, room, p)) upsertParticipant(p);
    });

    room.on(lk.RoomEvent.ConnectionStateChanged, (state: import('livekit-client').ConnectionState) => {
      store().setConnectionState(state);
    });

    room.on(lk.RoomEvent.Reconnecting, () => {
      store().setConnectionState('reconnecting');
    });
    room.on(lk.RoomEvent.Reconnected, () => {
      store().setConnectionState('connected');
      socket.send({ t: 'sync' });
    });

    room.on(lk.RoomEvent.Disconnected, () => {
      if (this.channelId === channelId) {
        this.channelId = null;
        this.room = null;
        useVoice.getState().reset();
      }
    });
  }
}

export const voiceEngine = new VoiceEngine();

// re-apply volumes whenever settings change
useSettings.subscribe((s, prev) => {
  if (s.masterVolume !== prev.masterVolume || s.masterMuted !== prev.masterMuted) {
    voiceEngine.applyVolumes();
  }
});
useVolumes.subscribe(() => {
  voiceEngine.applyVolumes();
});

// keep LocalAudioTrack type referenced for the unpublish cast
export type { LocalAudioTrack };
