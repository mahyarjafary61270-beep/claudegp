import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useT } from '@/i18n';
import { Spinner } from '@/components/ui/Spinner';

export default function RegisterPage(): JSX.Element {
  const t = useT();
  const register = useAuth((s) => s.register);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(username, password, displayName || undefined, inviteCode || undefined);
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="neon-border float-in w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 text-center">
          <div className="neon-text text-3xl font-black">{t('appName')}</div>
          <p className="mt-2 text-sm text-subtle">{t('inviteRequired')} ✨</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="invite" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('inviteCode')}
            </label>
            <input id="invite" dir="ltr" className="input font-mono" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('username')}
            </label>
            <input id="username" dir="ltr" className="input" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={24} required />
          </div>
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('displayName')}
            </label>
            <input id="displayName" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('password')}
            </label>
            <input id="password" type="password" dir="ltr" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner size={16} /> : t('createAccount')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-subtle">
          {t('haveAccount')}{' '}
          <Link to="/login" className="font-semibold" style={{ color: 'var(--accent)' }}>
            {t('login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
