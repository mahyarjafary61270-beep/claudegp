import { useRef, useState } from 'react';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/i18n';
import { Avatar } from '@/components/ui/Avatar';
import { Settings, LogOut } from '@/components/ui/icons';
import { get, upload } from '@/api/client';
import type { UserDTO } from '@mg/shared';

export function UserPanel(): JSX.Element {
  const t = useT();
  const me = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <div className="p-3" />;

  const onAvatar = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', f);
      await upload<{ user: UserDTO }>('/users/me/avatar', form);
      const data = await get<{ user: UserDTO }>('/users/me');
      useAuth.getState().setUser(data.user);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 border-t border-line p-2.5">
      <button onClick={() => setSettingsOpen(true)} className="relative" title={t('settings')}>
        <Avatar src={me.avatarUrl} name={me.displayName} accent={me.accentColor} size={36} userId={me.id} showPresence />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold">{me.displayName}</div>
        <div className="truncate text-[10px] text-subtle">@{me.username}</div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onAvatar(e.target.files?.[0])}
      />
      <button className="btn-ghost !p-1.5" title={t('changeAvatar')} onClick={() => fileRef.current?.click()} disabled={busy}>
        <Settings size={15} />
      </button>
      <button className="btn-ghost !p-1.5" title={t('logout')} onClick={() => void logout()}>
        <LogOut size={15} />
      </button>
    </div>
  );
}
