import { useEffect } from 'react';
import { useVoice } from '@/voice/voice-store';
import { voiceEngine } from '@/voice/engine';
import { useT } from '@/i18n';
import { useUI } from '@/stores/ui';
import { Mic, MicOff, Headphones, HeadphonesOff, Video, VideoOff, Screen, PhoneOff, Signal, Settings } from '@/components/ui/icons';
import { Avatar } from '@/components/ui/Avatar';
import { VolumeSlider } from './VolumeSlider';

/** Persistent voice control bar shown above the user panel while in voice. */
export function VoiceBar(): JSX.Element {
  const t = useT();
  const joined = useVoice((s) => s.joined);
  const connecting = useVoice((s) => s.connecting);
  const micMuted = useVoice((s) => s.micMuted);
  const deafened = useVoice((s) => s.deafened);
  const cameraOn = useVoice((s) => s.cameraOn);
  const sharing = useVoice((s) => s.sharing);
  const connectionState = useVoice((s) => s.connectionState);
  const participants = useVoice((s) => s.participants);
  const watching = useVoice((s) => s.watching);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);

  useEffect(() => {
    if (joined) void voiceEngine.refreshDevices();
  }, [joined]);

  if (!joined) return <div className="hidden" />;

  const qualityColor =
    connectionState === 'connected' ? '#34d399' : connectionState === 'connecting' || connectionState === 'reconnecting' ? '#fbbf24' : '#ef4444';

  return (
    <div className="float-in border-t border-line p-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Signal size={14} style={{ color: qualityColor }} aria-label={t('connectionQuality')} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold" style={{ color: 'var(--accent-3)' }}>
            🔊 {connecting ? '...' : 'Voice connected'}
          </div>
          <div className="truncate text-[10px] text-subtle">
            {participants.length} 👥 {sharing ? `· ${t('screenShare')} ON` : ''}
          </div>
        </div>
        {sharing && (
          <button className="btn-danger !px-2 !py-1 text-[10px]" onClick={() => void voiceEngine.stopScreenShare()} title={t('stopShare')}>
            ⏹
          </button>
        )}
        <button className="btn-ghost !p-1" onClick={() => setSettingsOpen(true)} title={t('voiceSettings')}>
          <Settings size={14} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          className={`btn !p-2 ${micMuted ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => void voiceEngine.toggleMute()}
          title={micMuted ? t('unmute') : t('mute')}
          aria-pressed={micMuted}
        >
          {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          className={`btn !p-2 ${deafened ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => void voiceEngine.toggleDeafen()}
          title={deafened ? t('undeafen') : t('deafen')}
          aria-pressed={deafened}
        >
          {deafened ? <HeadphonesOff size={16} /> : <Headphones size={16} />}
        </button>
        <button
          className={`btn !p-2 ${cameraOn ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => void voiceEngine.toggleCamera()}
          title={t('camera')}
          aria-pressed={cameraOn}
        >
          {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
        </button>
        <button
          className={`btn !p-2 ${sharing ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => void voiceEngine.toggleScreenShare(useVoice.getState().screenQuality, useVoice.getState().screenAudio)}
          title={sharing ? t('stopShare') : t('screenShare')}
          aria-pressed={sharing}
        >
          <Screen size={16} />
        </button>
        <button className="btn !p-2 btn-danger" onClick={() => void voiceEngine.leave()} title={t('leaveVoice')}>
          <PhoneOff size={16} />
        </button>
      </div>
      <div className="mt-2 space-y-1 px-1">
        {participants.slice(0, 6).map((p) => (
          <div key={p.identity} className="flex items-center gap-2">
            <Avatar name={p.name} accent={p.accentColor} size={18} speaking={p.speaking} />
            <span className="min-w-0 flex-1 truncate text-[10px] text-subtle">
              {p.isBot && <span className="me-1 rounded px-1 text-[8px] font-bold text-white" style={{ background: 'var(--accent-3)' }}>BOT</span>}
              {p.name}
              {p.streaming && <span className="ms-1 font-bold" style={{ color: 'var(--accent-3)' }}>LIVE</span>}
            </span>
            {p.streaming && (
              <button
                className={`btn !px-1.5 !py-0.5 text-[9px] ${watching.includes(p.identity) ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => void voiceEngine.setWatch(p.identity, !watching.includes(p.identity))}
              >
                {watching.includes(p.identity) ? t('unwatch') : t('watch')}
              </button>
            )}
            <VolumeSlider identity={p.identity} mini />
          </div>
        ))}
      </div>
    </div>
  );
}
