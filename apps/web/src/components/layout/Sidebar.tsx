import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChannelDTO } from '@mg/shared';
import { serverQueries, dmQueries, mutations, qk } from '@/api/queries';
import { useView, useRadio, useVoiceRooms } from '@/stores/rooms';
import { useChat } from '@/stores/chat';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/i18n';
import { Hash, Plus } from '@/components/ui/icons';
import { UserPanel } from './UserPanel';
import { VoiceBar } from '@/components/voice/VoiceBar';
import { RadioIndicator } from '@/components/voice/RadioIndicator';

export function Sidebar(): JSX.Element {
  const t = useT();
  const me = useAuth((s) => s.user);
  const activeServer = useView((s) => s.activeServer);
  const activeChannel = useView((s) => s.activeChannel);
  const setActive = useView((s) => s.setActive);
  const unread = useChat((s) => s.unread);
  const radios = useRadio((s) => s.byChannel);
  const voiceRooms = useVoiceRooms((s) => s.rooms);
  const mobileNavOpen = useUI((s) => s.mobileNavOpen);
  const queryClient = useQueryClient();
  const [dmMode, setDmMode] = useState(false);

  const { data: servers } = useQuery(serverQueries.list());
  const { data: serverData } = useQuery({ ...serverQueries.detail(activeServer ?? ''), enabled: !!activeServer });
  const { data: dms } = useQuery(dmQueries.list());

  const createDm = useMutation({
    ...mutations.createDm,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.dms });
      setActive(null, data.channel.id);
      setDmMode(true);
    },
  });

  const channels = serverData?.channels ?? [];
  const textChannels = channels.filter((c) => c.type === 'TEXT');
  const voiceChannels = channels.filter((c) => c.type === 'VOICE');
  const canManage = serverData ? serverData.server.ownerId === me?.id || serverData.members.find((m) => m.userId === me?.id)?.role === 'ADMIN' : false;

  const openChannel = (c: ChannelDTO): void => {
    setActive(c.serverId, c.id);
    if (window.innerWidth < 768) useUI.getState().setMobileNavOpen(false);
  };

  const badge = (cid: string): number => unread[cid]?.count ?? 0;
  const mention = (cid: string): number => unread[cid]?.mentionCount ?? 0;

  return (
    <>
      {/* server rail */}
      <nav aria-label="servers" className="glass hidden w-[68px] shrink-0 flex-col items-center gap-2 border-y-0 border-s-0 py-3 md:flex">
        <button
          onClick={() => setDmMode(true)}
          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl transition-all duration-200 ${dmMode ? 'neon-border' : 'glass hover:scale-105'}`}
          title={t('directMessages')}
        >
          💬
        </button>
        <div className="h-px w-8 bg-line" />
        {(servers ?? []).map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setDmMode(false);
              setActive(s.id, null);
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white transition-all duration-200 hover:scale-105 ${!dmMode && activeServer === s.id ? 'neon-border ring-2' : ''}`}
            style={{
              background: `linear-gradient(135deg, ${s.iconColor}, color-mix(in srgb, ${s.iconColor} 50%, #000))`,
              boxShadow: !dmMode && activeServer === s.id ? '0 0 16px -4px var(--accent-glow)' : undefined,
            }}
            title={s.name}
          >
            {s.name.slice(0, 2)}
          </button>
        ))}
      </nav>

      {/* channel list */}
      <aside
        className={`glass absolute inset-y-0 z-40 w-64 shrink-0 flex-col border-y-0 border-e md:static md:z-auto md:flex ${mobileNavOpen ? 'flex' : 'hidden'}`}
        aria-label={t('channels')}
      >
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="truncate text-sm font-bold">
              {dmMode ? t('directMessages') : (serverData?.server.name ?? t('appName'))}
            </h1>
            {!dmMode && canManage && (
              <button className="btn-ghost !p-1" title={t('createChannel')} onClick={() => useUI.getState().setSettingsOpen(true)}>
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          {dmMode ? (
            <div className="space-y-0.5">
              {(dms ?? []).map((dm) => {
                const n = badge(dm.id);
                return (
                  <button
                    key={dm.id}
                    onClick={() => openChannel(dm)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-sm transition-colors hover:bg-panel ${activeChannel === dm.id ? 'bg-panel' : ''}`}
                  >
                    <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full" style={{ background: 'linear-gradient(135deg, var(--accent-2), var(--accent))' }}>
                      {dm.peer?.avatarUrl ? <img src={dm.peer.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-bold text-white">{(dm.peer?.displayName ?? '?').slice(0, 1)}</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{dm.peer?.displayName ?? 'DM'}</span>
                    {n > 0 && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                        {n > 99 ? '99+' : n}
                      </span>
                    )}
                  </button>
                );
              })}
              {dmMode && (
                <StartDm
                  onStart={(userId) => createDm.mutate(userId)}
                  memberIds={(serverData?.members ?? []).filter((m) => m.userId !== me?.id).map((m) => ({ id: m.user.id, name: m.user.displayName }))}
                />
              )}
            </div>
          ) : (
            <>
              <SectionLabel>{t('textChannels')}</SectionLabel>
              {textChannels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openChannel(c)}
                  className={`group flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors hover:bg-panel ${activeChannel === c.id ? 'bg-panel font-semibold' : 'text-subtle'}`}
                >
                  <Hash size={15} className="shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate text-start">{c.name}</span>
                  {mention(c.id) > 0 && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                      @ {mention(c.id)}
                    </span>
                  )}
                  {badge(c.id) > 0 && mention(c.id) === 0 && (
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                  )}
                </button>
              ))}
              <SectionLabel>{t('voiceChannels')}</SectionLabel>
              {voiceChannels.map((c) => {
                const members = voiceRooms[c.id] ?? [];
                const radio = radios[c.id] ?? null;
                return (
                  <div key={c.id}>
                    <button
                      onClick={() => openChannel(c)}
                      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors hover:bg-panel ${activeChannel === c.id ? 'bg-panel font-semibold' : 'text-subtle'}`}
                    >
                      <VolumeGlyph />
                      <span className="min-w-0 flex-1 truncate text-start">{c.name}</span>
                      {members.length > 0 && <span className="text-xs opacity-70">{members.length}</span>}
                      {radio && <span className="eq" title={t('radio')}><span className="eq-bar" style={{ animationDelay: '0ms' }} /><span className="eq-bar" style={{ animationDelay: '150ms' }} /><span className="eq-bar" style={{ animationDelay: '300ms' }} /></span>}
                    </button>
                    <div className="ms-6 space-y-0.5">
                      {members.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-subtle">
                          <span className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full" style={{ background: m.accentColor ? m.accentColor : 'var(--accent-2)' }}>
                            {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] font-bold text-white">{m.displayName.slice(0, 1)}</span>}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {m.isBot && <span className="me-1 rounded px-1 text-[9px] font-bold text-white" style={{ background: 'var(--accent-3)' }}>BOT</span>}
                            {m.displayName}
                          </span>
                          {m.streaming && <span className="text-[9px] font-bold" style={{ color: 'var(--accent-3)' }}>LIVE</span>}
                          {m.deafened && <span className="opacity-60">🔇</span>}
                          {m.muted && !m.deafened && <span className="opacity-60">🎙️✕</span>}
                        </div>
                      ))}
                    </div>
                    {radio && <RadioIndicator channelId={c.id} />}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <VoiceBar />
        <UserPanel />
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-subtle">{children}</div>;
}

function VolumeGlyph(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-70" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

function StartDm({ onStart, memberIds }: { onStart: (userId: string) => void; memberIds: { id: string; name: string }[] }): JSX.Element {
  const [q, setQ] = useState('');
  const filtered = memberIds.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  return (
    <div className="mt-3 rounded-xl border border-line p-2">
      <input className="input !py-1.5 text-xs" placeholder="start DM..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-1 space-y-0.5">
        {filtered.map((m) => (
          <button key={m.id} onClick={() => onStart(m.id)} className="w-full rounded-lg px-2 py-1 text-start text-xs hover:bg-panel">
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
