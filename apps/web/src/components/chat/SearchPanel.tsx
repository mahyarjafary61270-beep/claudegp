import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchQuery } from '@/api/queries';
import { useT } from '@/i18n';
import { X } from '@/components/ui/icons';
import { useView } from '@/stores/rooms';

export function SearchPanel({ serverId }: { serverId: string }): JSX.Element {
  const t = useT();
  const [q, setQ] = useState('');
  const setActive = useView((s) => s.setActive);
  const { data, isFetching } = useQuery(searchQuery(serverId, q));

  return (
    <aside className="glass float-in w-72 shrink-0 border-y-0 border-e p-3" aria-label={t('search')}>
      <div className="mb-2 flex items-center gap-2">
        <input className="input" placeholder={`${t('search')}...`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn-ghost !p-1.5" onClick={() => useChatClose()}>
          <X size={14} />
        </button>
      </div>
      <div className="scroll-thin max-h-[70vh] space-y-2 overflow-y-auto">
        {isFetching && q.length >= 2 && <div className="skeleton h-16" />}
        {q.length < 2 && <p className="text-xs text-subtle">۲ حرف بنویس...</p>}
        {(data?.items ?? []).map((r) => (
          <button
            key={r.id}
            className="w-full rounded-xl border border-line p-2.5 text-start text-xs transition-colors hover:bg-panel"
            onClick={() => setActive(serverId, r.channelId)}
          >
            <div className="mb-0.5 font-bold" style={{ color: 'var(--accent-2)' }}>
              {r.author?.displayName ?? '—'} · #{r.channelId.slice(-4)}
            </div>
            <div className="line-clamp-3 opacity-90" dir="auto">
              {r.content}
            </div>
          </button>
        ))}
        {q.length >= 2 && !isFetching && (data?.items ?? []).length === 0 && (
          <p className="text-xs text-subtle">—</p>
        )}
      </div>
      <span className="sr-only">{t('search')}</span>
    </aside>
  );
}

function useChatClose(): void {
  import('@/stores/chat').then((m) => m.useChat.getState().setSearchOpen(false));
}
