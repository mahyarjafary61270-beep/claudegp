import { create } from 'zustand';
import type { MessageDTO, Presence, UnreadDTO, VoiceMemberDTO } from '@mg/shared';
import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/api/queries';
import { get } from '@/api/client';
import { useChat, unreadFromDto } from '@/stores/chat';
import { useSettings } from '@/stores/settings';
import { useAuth } from '@/stores/auth';
import { useVoiceRooms, useRadio } from '@/stores/rooms';
import { sounds } from '@/lib/sound';
import { socket } from './socket';

interface PresenceStore {
  presence: Record<string, Presence>;
  setPresence: (userId: string, p: Presence) => void;
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  presence: {},
  setPresence: (userId, p) => set((s) => ({ presence: { ...s.presence, [userId]: p } })),
}));

export function usePresence(): Record<string, Presence> {
  return usePresenceStore((s) => s.presence);
}

function soundsEnabled(): boolean {
  return useSettings.getState().soundEnabled;
}

async function notify(title: string, body: string): Promise<void> {
  if (!document.hidden || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, silent: true });
  } catch {
    /* ignore */
  }
}

export function bindWsHandlers(queryClient: QueryClient): void {
  // reconnect resync: invalidate caches + ask the server for live snapshots
  socket.onOpen(() => {
    void queryClient.invalidateQueries({ queryKey: ['messages'] });
    void queryClient.invalidateQueries({ queryKey: qk.unread });
    void queryClient.invalidateQueries({ queryKey: qk.dms });
    void queryClient.invalidateQueries({ queryKey: qk.servers });
    socket.requestSync();
  });

  socket.onEvent((ev) => {
    switch (ev.t) {
      case 'ready': {
        useAuth.getState().setUser(ev.user);
        break;
      }
      case 'force_logout': {
        void useAuth.getState().logout();
        break;
      }
      case 'presence': {
        usePresenceStore.getState().setPresence(ev.userId, ev.presence);
        break;
      }
      case 'message_new': {
        const m = ev.message;
        const selfId = useAuth.getState().user?.id;
        const existing = queryClient.getQueryData<Pages>(qk.messages(m.channelId));
        if (existing) {
          const pages = existing.pages.map((p, i) =>
            i === existing.pages.length - 1 ? { ...p, items: [...p.items.filter((x) => x.id !== m.id), m] } : p,
          );
          queryClient.setQueryData(qk.messages(m.channelId), { ...existing, pages });
        }
        if (m.author?.id !== selfId) {
          useChat.getState().addUnread(m, selfId ?? '');
          const mentioned = m.mentions.includes(selfId ?? '') || m.replyTo?.author?.id === selfId;
          if (document.hidden && soundsEnabled()) {
            if (mentioned) sounds.mention();
            else sounds.message();
          }
          void notify(m.author?.displayName ?? 'پیام جدید', m.content.slice(0, 80));
        }
        void queryClient.invalidateQueries({ queryKey: qk.dms });
        break;
      }
      case 'message_edit': {
        const m = ev.message;
        patchMessage(queryClient, m.channelId, (x) => (x.id === m.id ? m : x));
        break;
      }
      case 'message_delete': {
        patchMessage(queryClient, ev.channelId, (x) => (x.id === ev.messageId ? null : x));
        break;
      }
      case 'reaction': {
        const selfId = useAuth.getState().user?.id;
        patchMessage(queryClient, ev.channelId, (x) => {
          if (x.id !== ev.messageId) return x;
          let reactions = [...x.reactions];
          const g = reactions.find((r) => r.emoji === ev.emoji);
          if (ev.added) {
            if (g) {
              g.count += 1;
              if (ev.userId === selfId) g.me = true;
            } else {
              reactions.push({ emoji: ev.emoji, count: 1, me: ev.userId === selfId });
            }
          } else if (g) {
            g.count -= 1;
            if (ev.userId === selfId) g.me = false;
            if (g.count <= 0) reactions = reactions.filter((r) => r.emoji !== ev.emoji);
          }
          return { ...x, reactions };
        });
        break;
      }
      case 'pin': {
        patchMessage(queryClient, ev.channelId, (x) => (x.id === ev.messageId ? { ...x, pinned: ev.pinned } : x));
        void queryClient.invalidateQueries({ queryKey: qk.pins(ev.channelId) });
        break;
      }
      case 'typing': {
        if (ev.userId !== useAuth.getState().user?.id) {
          useChat.getState().setTyping(ev.channelId, ev.userId, ev.displayName);
        }
        break;
      }
      case 'channel_new':
      case 'channel_update': {
        if (ev.channel.serverId) void queryClient.invalidateQueries({ queryKey: qk.server(ev.channel.serverId) });
        break;
      }
      case 'channel_delete': {
        if (ev.serverId) void queryClient.invalidateQueries({ queryKey: qk.server(ev.serverId) });
        break;
      }
      case 'server_update': {
        void queryClient.invalidateQueries({ queryKey: qk.servers });
        void queryClient.invalidateQueries({ queryKey: qk.server(ev.serverId) });
        break;
      }
      case 'member_joined':
      case 'member_left':
      case 'member_update': {
        void queryClient.invalidateQueries({ queryKey: qk.server(ev.serverId) });
        break;
      }
      case 'dm_new': {
        void queryClient.invalidateQueries({ queryKey: qk.dms });
        break;
      }
      case 'voice_room': {
        const map: Record<string, VoiceMemberDTO[]> = { [ev.channelId]: ev.members };
        useVoiceRooms.getState().merge(map);
        break;
      }
      case 'radio_state': {
        useRadio.getState().set(ev.channelId, ev.radio);
        if (ev.radio && soundsEnabled()) sounds.radioStart();
        break;
      }
      case 'now_playing': {
        useRadio.getState().setNowPlaying(ev.channelId, ev.nowPlaying);
        break;
      }
      case 'unread_reset': {
        useChat.getState().resetUnread(ev.channelId);
        break;
      }
      default:
        break;
    }
  });

  // initial unread snapshot via REST
  void get<{ items: UnreadDTO[] }>('/unread')
    .then((data) => useChat.setState({ unread: unreadFromDto(data.items) }))
    .catch(() => undefined);
}

type Pages = { pages: { items: MessageDTO[] }[]; pageParams: unknown[] };

function patchMessage(queryClient: QueryClient, channelId: string, fn: (m: MessageDTO) => MessageDTO | null): void {
  const key = qk.messages(channelId);
  const existing = queryClient.getQueryData<Pages>(key);
  if (!existing) return;
  const pages = existing.pages.map((p) => ({ ...p, items: p.items.map(fn).filter((x): x is MessageDTO => x !== null) }));
  queryClient.setQueryData(key, { ...existing, pages });
}
