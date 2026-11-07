import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useT } from '@/i18n';
import { Spinner } from '@/components/ui/Spinner';

export default function LoginPage(): JSX.Element {
  const t = useT();
  const login = useAuth((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate('/app');
    } catch (err) {
      setError(err instanceof Error && err.message.includes('Wrong') ? t('loginFailed') : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="neon-border float-in w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 text-center">
          <div className="neon-text text-3xl font-black">{t('appName')}</div>
          <p className="mt-2 text-sm text-subtle">{t('tagline')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('username')}
            </label>
            <input id="username" dir="ltr" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-subtle">
              {t('password')}
            </label>
            <input id="password" type="password" dir="ltr" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner size={16} /> : t('login')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-subtle">
          {t('noAccount')}{' '}
          <Link to="/register" className="font-semibold" style={{ color: 'var(--accent)' }}>
            {t('register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
