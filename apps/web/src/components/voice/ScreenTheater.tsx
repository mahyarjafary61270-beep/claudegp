import { useEffect, useRef, useState } from 'react';
import type { RemoteVideoTrack } from 'livekit-client';
import { useVoice } from '@/voice/voice-store';
import { voiceEngine } from '@/voice/engine';
import { useT } from '@/i18n';
import { X, Maximize, Theater, Pip } from '@/components/ui/icons';

/**
 * Watch surface for screen shares. Attaches subscribed ScreenShare video
 * tracks; supports theater mode, fullscreen, PiP and viewer count.
 */
export function ScreenTheater(): JSX.Element {
  const t = useT();
  const joined = useVoice((s) => s.joined);
  const participants = useVoice((s) => s.participants);
  const watching = useVoice((s) => s.watching);
  const theater = useVoice((s) => s.theater);
  const setTheater = useVoice((s) => s.setTheater);
  const streaming = participants.filter((p) => p.streaming);
  const [attachedIdentity, setAttachedIdentity] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // find a subscribed screen share track among watched participants
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const lk = await import('livekit-client');
      const room = voiceEngine.getRoom();
      if (!room || cancelled) return;
      for (const identity of watching) {
        const p = room.remoteParticipants.get(identity);
        if (!p) continue;
        const pub = [...p.trackPublications.values()].find((x) => x.source === lk.Track.Source.ScreenShare && x.isSubscribed && x.videoTrack);
        if (pub?.videoTrack) {
          setAttachedIdentity(identity);
          const el = videoRef.current;
          if (el) {
            (pub.videoTrack as RemoteVideoTrack).attach(el);
          }
          return;
        }
      }
      setAttachedIdentity(null);
    };
    void tick();
    const iv = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [joined, watching]);

  if (!joined || streaming.length === 0 || !attachedIdentity) return <div className="hidden" />;

  const sharer = participants.find((p) => p.identity === attachedIdentity);
  const viewerCount = Math.max(1, watching.length);

  return (
    <div
      className={`float-in absolute inset-x-3 bottom-2 z-30 ${theater ? 'inset-0 bottom-0' : ''}`}
      style={{ maxHeight: theater ? '100%' : '40%' }}
    >
      <div className="neon-border relative h-full overflow-hidden rounded-2xl bg-black/80">
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-contain" />
        <div className="absolute start-3 top-2 flex items-center gap-2 text-xs font-bold text-white">
          <span className="rounded-md bg-red-600 px-1.5 py-0.5">● LIVE</span>
          <span>{sharer?.name}</span>
          <span className="text-white/70">👁 {viewerCount} {t('viewers')}</span>
        </div>
        <div className="absolute end-2 top-2 flex gap-1">
          <button className="glass rounded-lg p-1.5 text-white" onClick={() => setTheater(!theater)} title={t('theaterMode')}>
            <Theater size={15} />
          </button>
          <button
            className="glass rounded-lg p-1.5 text-white"
            onClick={() => {
              const el = videoRef.current?.parentElement;
              if (el) void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen());
            }}
            title={t('fullscreen')}
          >
            <Maximize size={15} />
          </button>
          <button
            className="glass rounded-lg p-1.5 text-white"
            onClick={() => {
              const el = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
              void el?.requestPictureInPicture?.().catch(() => undefined);
            }}
            title={t('pictureInPicture')}
          >
            <Pip size={15} />
          </button>
          {!theater && (
            <button className="glass rounded-lg p-1.5 text-white" onClick={() => setTheater(false)} title={t('unwatch')}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
