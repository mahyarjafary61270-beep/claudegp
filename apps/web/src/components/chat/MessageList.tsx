import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageDTO } from '@mg/shared';
import { messageQueries, mutations } from '@/api/queries';
import { useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';
import { useChat } from '@/stores/chat';
import { useT } from '@/i18n';
import { formatDay, formatTime, formatFull, dayKey } from '@/lib/time';
import { Avatar } from '@/components/ui/Avatar';
import { MessageRow } from './MessageRow';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  channelId: string;
  scrollRef: React.RefObject<HTMLDivElement>;
}

export function MessageList({ channelId, scrollRef }: Props): JSX.Element {
  const t = useT();
  const me = useAuth((s) => s.user);
  const settings = useSettings();
  const markRead = useMutation(mutations.markRead(channelId));
  const queryClient = useQueryClient();

  const query = useInfiniteQuery(messageQueries.list(channelId));
  const messages = useMemo(() => {
    const items: MessageDTO[] = [];
    for (const page of query.data?.pages ?? []) items.push(...page.items);
    return items;
  }, [query.data]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const containerRef = scrollRef;
  const stickToBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastCount = useRef(0);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 52,
    overscan: 14,
  });

  const scrollToBottom = useCallback((smooth = false): void => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    virtualizer.measure();
  }, [containerRef, virtualizer]);

  // initial + channel switch
  useEffect(() => {
    if (query.isSuccess && messages.length > 0) {
      scrollToBottom();
      lastCount.current = messages.length;
      void markRead.mutateAsync(messages[messages.length - 1]?.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, query.isSuccess]);

  // keep pinned to bottom on new messages
  useEffect(() => {
    if (messages.length === lastCount.current) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (grew && stickToBottom.current) {
      scrollToBottom(true);
      void markRead.mutateAsync(messages[messages.length - 1]?.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const onScroll = (): void => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = atBottom;
    setIsAtBottom(atBottom);
    if (el.scrollTop < 120 && query.hasPreviousPage && !query.isFetchingPreviousPage) {
      void query.fetchPreviousPage();
    }
  };

  const rows: (MessageDTO | { dayDivider: string })[] = useMemo(() => {
    const out: (MessageDTO | { dayDivider: string })[] = [];
    let lastDay = '';
    for (const m of messages) {
      const k = dayKey(m.createdAt);
      if (k !== lastDay) {
        out.push({ dayDivider: formatDay(m.createdAt, settings.jalaliDates) });
        lastDay = k;
      }
      out.push(m);
    }
    return out;
  }, [messages, settings.jalaliDates]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={onScroll} className="scroll-thin absolute inset-0 overflow-y-auto px-2 py-3">
        {query.isFetching && messages.length === 0 && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="skeleton h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-28" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}
        {query.hasPreviousPage && (
          <div className="flex justify-center py-2">
            {query.isFetchingPreviousPage ? <Spinner size={18} /> : <span className="text-xs text-subtle">···</span>}
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            if ('dayDivider' in row) {
              return (
                <div
                  key={`d-${vi.key}`}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  className="absolute inset-x-0 px-3"
                  style={{ transform: `translateY(${vi.start}px)`, top: 0 }}
                >
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-line" />
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] font-bold text-subtle">{row.dayDivider}</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                </div>
              );
            }
            const m = row;
            const prev = rows[vi.index - 1];
            const grouped = !(prev && 'dayDivider' in prev) && prev && (prev as MessageDTO).author?.id === m.author?.id && new Date(m.createdAt).getTime() - new Date((prev as MessageDTO).createdAt).getTime() < 5 * 60_000;
            return (
              <div
                key={vi.key}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                className="absolute inset-x-0"
                style={{ transform: `translateY(${vi.start}px)`, top: 0 }}
              >
                <MessageRow
                  message={m}
                  grouped={!!grouped}
                  editing={editingId === m.id}
                  onStartEdit={() => setEditingId(m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onReply={() => setReplyTo(m)}
                  meId={me?.id ?? ''}
                  jalali={settings.jalaliDates}
                />
              </div>
            );
          })}
        </div>
        {messages.length === 0 && !query.isFetching && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <div className="text-3xl">🌸</div>
            <p className="text-sm text-subtle">{t('noMessages')}</p>
          </div>
        )}
      </div>

      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="glass float-in absolute bottom-3 start-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-glow"
          style={{ translate: 'none' }}
        >
          <ChevronDownMini /> {t('jumpToPresent')}
        </button>
      )}
    </div>
  );
}

function ChevronDownMini(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
