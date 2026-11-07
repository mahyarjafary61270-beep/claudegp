import { create } from 'zustand';
import type { MessageDTO, UnreadDTO } from '@mg/shared';

interface TypingEntry {
  userId: string;
  displayName: string;
  at: number;
}

interface ChatState {
  unread: Record<string, { count: number; mentionCount: number }>;
  typing: Record<string, TypingEntry[]>;
  searchOpen: boolean;
  pinnedOpen: boolean;
  markUnread: (channelId: string, count: number, mentionCount: number) => void;
  resetUnread: (channelId: string) => void;
  addUnread: (m: MessageDTO, selfId: string) => void;
  setTyping: (channelId: string, userId: string, displayName: string) => void;
  clearTyping: (channelId: string, userId: string) => void;
  pruneTyping: () => void;
  setSearchOpen: (b: boolean) => void;
  setPinnedOpen: (b: boolean) => void;
}

const TYPING_TTL = 6000;

export const useChat = create<ChatState>((set) => ({
  unread: {},
  typing: {},
  searchOpen: false,
  pinnedOpen: false,
  markUnread: (channelId, count, mentionCount) =>
    set((s) => ({ unread: { ...s.unread, [channelId]: { count, mentionCount } } })),
  resetUnread: (channelId) =>
    set((s) => ({ unread: { ...s.unread, [channelId]: { count: 0, mentionCount: 0 } } })),
  addUnread: (m, selfId) =>
    set((s) => {
      const cur = s.unread[m.channelId] ?? { count: 0, mentionCount: 0 };
      const mentioned = m.mentions.includes(selfId) || (m.replyTo?.author?.id === selfId && m.author?.id !== selfId);
      return {
        unread: {
          ...s.unread,
          [m.channelId]: { count: cur.count + 1, mentionCount: cur.mentionCount + (mentioned ? 1 : 0) },
        },
      };
    }),
  setTyping: (channelId, userId, displayName) =>
    set((s) => {
      const list = (s.typing[channelId] ?? []).filter((t) => t.userId !== userId);
      return { typing: { ...s.typing, [channelId]: [...list, { userId, displayName, at: Date.now() }] } };
    }),
  clearTyping: (channelId, userId) =>
    set((s) => ({ typing: { ...s.typing, [channelId]: (s.typing[channelId] ?? []).filter((t) => t.userId !== userId) } })),
  pruneTyping: () =>
    set((s) => {
      const next: Record<string, TypingEntry[]> = {};
      let changed = false;
      for (const [cid, list] of Object.entries(s.typing)) {
        const filtered = list.filter((t) => Date.now() - t.at < TYPING_TTL);
        if (filtered.length !== list.length) changed = true;
        next[cid] = filtered;
      }
      return changed ? { typing: next } : s;
    }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setPinnedOpen: (pinnedOpen) => set({ pinnedOpen }),
}));

// prune typing indicators periodically
setInterval(() => useChat.getState().pruneTyping(), 3000);

export function unreadFromDto(list: UnreadDTO[]): Record<string, { count: number; mentionCount: number }> {
  const out: Record<string, { count: number; mentionCount: number }> = {};
  for (const u of list) out[u.channelId] = { count: u.count, mentionCount: u.mentionCount };
  return out;
}
