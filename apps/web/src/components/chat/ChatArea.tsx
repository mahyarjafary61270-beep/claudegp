import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serverQueries, dmQueries } from '@/api/queries';
import { post } from '@/api/client';
import { useView, useVoiceRooms, useRadio } from '@/stores/rooms';
import { useChat } from '@/stores/chat';
import { useUI } from '@/stores/ui';
import { useT } from '@/i18n';
import { Hash, Search, Pin, Users } from '@/components/ui/icons';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { SearchPanel } from './SearchPanel';
import { PinPanel } from './PinPanel';
import { TypingIndicator } from './TypingIndicator';
import { ScreenTheater } from '@/components/voice/ScreenTheater';
import { voiceEngine } from '@/voice/engine';
import { useVoice } from '@/voice/voice-store';

export function ChatArea(): JSX.Element {
  const t = useT();
  const activeServer = useView((s) => s.activeServer);
  const activeChannel = useView((s) => s.activeChannel);
  const setActive = useView((s) => s.setActive);
  const voiceRooms = useVoiceRooms((s) => s.rooms);
  const radios = useRadio((s) => s.byChannel);
  const unread = useChat((s) => s.unread);
  const searchOpen = useChat((s) => s.searchOpen);
  const pinnedOpen = useChat((s) => s.pinnedOpen);
  const setSearchOpen = useChat((s) => s.setSearchOpen);
  const setPinnedOpen = useChat((s) => s.setPinnedOpen);
  const setMembersOpen = useUI((s) => s.setMembersOpen);
  const setMobileNavOpen = useUI((s) => s.setMobileNavOpen);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: serverData } = useQuery({ ...serverQueries.detail(activeServer ?? ''), enabled: !!activeServer });
  const { data: dms } = useQuery(dmQueries.list());

  // pick a default text channel when a server is selected
  useEffect(() => {
    if (activeServer && serverData) {
      const chs = serverData.channels.filter((c) => c.type === 'TEXT');
      if (chs.length > 0 && !activeChannel) setActive(activeServer, chs[0]!.id);
    }
  }, [activeServer, serverData, activeChannel, setActive]);

  const channel = [...(serverData?.channels ?? [])].find((c) => c.id === activeChannel);
  const dm = (dms ?? []).find((c) => c.id === activeChannel);
  const current = channel ?? dm;
  const isVoiceChannel = channel?.type === 'VOICE';

  // mark read when opening / while viewing
  useEffect(() => {
    if (!activeChannel || isVoiceChannel) return;
    void post(`/channels/${activeChannel}/read`, {}).catch(() => undefined);
    useChat.getState().resetUnread(activeChannel);
  }, [activeChannel, isVoiceChannel]);

  const title = dm ? (dm.peer?.displayName ?? 'DM') : (channel?.name ?? '');
  const voiceMembers = isVoiceChannel && activeChannel ? (voiceRooms[activeChannel] ?? []) : [];
  const radio = activeChannel ? (radios[activeChannel] ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="glass flex items-center gap-2 border-x-0 border-t-0 px-4 py-2.5">
        <button className="btn-ghost !p-1 md:hidden" onClick={() => setMobileNavOpen(true)} aria-label="menu">
          <Hash size={18} />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          {dm ? <span className="text-base">✉️</span> : <Hash size={17} className="shrink-0 opacity-70" />}
          <h1 className="min-w-0 truncate text-sm font-bold">{title}</h1>
          {isVoiceChannel && voiceMembers.length > 0 && (
            <span className="text-xs text-subtle">({voiceMembers.length})</span>
          )}
          {radio && (
            <span className="eq ms-1"><span className="eq-bar" /><span className="eq-bar" style={{ animationDelay: '150ms' }} /><span className="eq-bar" style={{ animationDelay: '300ms' }} /></span>
          )}
        </div>
        <div className="flex-1" />
        {activeChannel && (
          <>
            <button className="btn-ghost !p-1.5" title={t('pinned')} onClick={() => setPinnedOpen(!pinnedOpen)}>
              <Pin size={16} />
            </button>
            {current && current.type !== 'VOICE' && !dm && (
              <button className="btn-ghost !p-1.5" title={t('search')} onClick={() => setSearchOpen(!searchOpen)}>
                <Search size={16} />
              </button>
            )}
            <button className="btn-ghost !p-1.5 hidden lg:block" title={t('members')} onClick={() => setMembersOpen(true)}>
              <Users size={16} />
            </button>
          </>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {activeChannel ? (
            isVoiceChannel ? (
              <VoiceChannelInfo channelId={activeChannel} name={title} />
            ) : (
              <MessageList channelId={activeChannel} scrollRef={scrollRef} />
            )
          ) : (
            <EmptyState />
          )}
          {activeChannel && !isVoiceChannel && <Composer channelId={activeChannel} />}
          {!isVoiceChannel && <TypingIndicator channelId={activeChannel} />}
        </div>
        {searchOpen && activeServer && <SearchPanel serverId={activeServer} />}
        {pinnedOpen && activeChannel && <PinPanel channelId={activeChannel} />}
      </div>
      <ScreenTheater />
    </div>
  );
}

function VoiceChannelInfo({ channelId, name }: { channelId: string; name: string }): JSX.Element {
  const t = useT();
  const joined = useVoice((s) => s.joined);
  const join = async (): Promise<void> => {
    await voiceEngine.join(channelId);
  };
  const leave = async (): Promise<void> => {
    await voiceEngine.leave();
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="neon-text text-2xl font-black">🔊 {name}</div>
      {joined === channelId ? (
        <p className="text-sm text-subtle">{t('leaveVoice')} از نوار پایین یا دکمه زیر</p>
      ) : (
        <button className="btn-primary" onClick={() => void join()}>
          {t('joinVoice')}
        </button>
      )}
      {joined === channelId && (
        <button className="btn-danger" onClick={() => void leave()}>
          {t('leaveVoice')}
        </button>
      )}
      <p className="max-w-sm text-xs text-subtle">
        🎙️ {t('voiceSettings')} — میکروفون، بلندگو، PTT و اشتراک صفحه از تنظیمات
      </p>
    </div>
  );
}

function EmptyState(): JSX.Element {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="neon-text text-4xl font-black">{t('appName')}</div>
      <p className="text-sm text-subtle">Ctrl+K → {t('quickSwitcher')}</p>
    </div>
  );
}
