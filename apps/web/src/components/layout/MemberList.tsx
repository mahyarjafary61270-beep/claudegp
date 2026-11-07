import { useQuery } from '@tanstack/react-query';
import { serverQueries } from '@/api/queries';
import { useView } from '@/stores/rooms';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { usePresence } from '@/ws/handlers';
import { useT } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { Crown, Shield } from '@/components/ui/icons';
import type { Presence } from '@mg/shared';

export function MemberList(): JSX.Element {
  const t = useT();
  const me = useAuth((s) => s.user);
  const activeServer = useView((s) => s.activeServer);
  const membersOpen = useUI((s) => s.membersOpen);
  const presence = usePresence();
  const { data } = useQuery({ ...serverQueries.detail(activeServer ?? ''), enabled: !!activeServer });
  const setActive = useView((s) => s.setActive);
  const createDm = async (userId: string): Promise<void> => {
    const { mutations } = await import('@/api/queries');
    const { post } = await import('@/api/client');
    try {
      const res = await post<{ channel: { id: string } }>('/dms', { userId });
      setActive(null, res.channel.id);
      void mutations;
    } catch {
      /* ignore */
    }
  };

  if (!data || !membersOpen) return <div className="hidden" />;

  const groups: { key: string; label: string; members: typeof data.members }[] = [
    { key: 'online', label: t('online'), members: data.members.filter((m) => presence[m.userId] === 'online' || presence[m.userId] === 'idle') },
    { key: 'offline', label: t('offline'), members: data.members.filter((m) => !presence[m.userId] || presence[m.userId] === 'offline') },
  ];

  return (
    <aside className="glass hidden w-56 shrink-0 flex-col border-y-0 border-e-0 lg:flex" aria-label={t('members')}>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-subtle">
              {g.label} — {g.members.length}
            </div>
            {g.members.map((m) => (
              <button
                key={m.userId}
                onClick={() => m.userId !== me?.id && void createDm(m.userId)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm transition-colors hover:bg-panel"
                style={{ opacity: g.key === 'offline' ? 0.45 : 1 }}
              >
                <Avatar src={m.user.avatarUrl} name={m.user.displayName} accent={m.user.accentColor} size={30} userId={m.userId} showPresence />
                <span className="min-w-0 flex-1 truncate">{m.user.displayName}</span>
                {m.role === 'OWNER' && <Crown size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />}
                {m.role === 'ADMIN' && <Shield size={13} className="shrink-0" style={{ color: 'var(--accent-3)' }} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export type { Presence };
