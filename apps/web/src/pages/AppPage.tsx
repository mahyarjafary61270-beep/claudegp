import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serverQueries } from '@/api/queries';
import { useView } from '@/stores/rooms';
import { useVoice } from '@/voice/voice-store';
import { voiceEngine } from '@/voice/engine';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { MemberList } from '@/components/layout/MemberList';
import { QuickSwitcher } from '@/components/chat/QuickSwitcher';
import { CommandPalette } from '@/components/chat/CommandPalette';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { useUI } from '@/stores/ui';

export default function AppPage(): JSX.Element {
  const { data: servers } = useQuery(serverQueries.list());
  const activeServer = useView((s) => s.activeServer);
  const setActive = useView((s) => s.setActive);

  // select the first server initially
  useEffect(() => {
    if (!activeServer && servers && servers.length > 0 && servers[0]) {
      setActive(servers[0].id, null);
    }
  }, [servers, activeServer, setActive]);

  // global shortcuts: Ctrl+K switcher, Ctrl+Shift+M mute, Ctrl+Shift+D deafen, PTT key
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUI.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setQuickSwitcher(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        if (voiceEngine.isJoined()) void voiceEngine.toggleMute();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (voiceEngine.isJoined()) void voiceEngine.toggleDeafen();
        return;
      }
      // push-to-talk
      const vs = useVoice.getState();
      if (vs.ptt && vs.joined && e.code === vs.pttKey && !e.repeat) {
        voiceEngine.setPttHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const vs = useVoice.getState();
      if (vs.ptt && e.code === vs.pttKey) {
        voiceEngine.setPttHeld(false);
      }
    };
    const onBlur = (): void => voiceEngine.setPttHeld(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const title = useMemo(() => document.title, []);
  void title;

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatArea />
      </main>
      <MemberList />
      <QuickSwitcher />
      <CommandPalette />
      <SettingsModal />
    </div>
  );
}
