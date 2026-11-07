import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useSettings, applySettingsDom } from '@/stores/settings';
import { useI18nStore } from '@/i18n';
import { startPetals } from '@/fx/petals';
import { bindWsHandlers } from '@/ws/handlers';
import { useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import { soundTestGesture } from '@/lib/gesture';

const LoginPage = lazy(() => import('@/pages/Login'));
const RegisterPage = lazy(() => import('@/pages/Register'));
const AppPage = lazy(() => import('@/pages/AppPage'));

export default function App(): JSX.Element {
  const boot = useAuth((s) => s.boot);
  const user = useAuth((s) => s.user);
  const booting = useAuth((s) => s.booting);
  const settings = useSettings();
  const locale = useI18nStore((s) => s.locale);
  const queryClient = useQueryClient();

  useEffect(() => {
    void boot();
    soundTestGesture();
  }, [boot]);

  useEffect(() => {
    applySettingsDom({ ...settings, locale });
  }, [settings, locale]);

  useEffect(() => {
    bindWsHandlers(queryClient);
  }, [queryClient]);

  // petals background (paused in performance mode / reduced motion)
  useEffect(() => {
    if (settings.performanceMode) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.appendChild(canvas);
    const stop = startPetals(canvas);
    return () => {
      stop();
      canvas.remove();
    };
  }, [settings.performanceMode]);

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="aurora" aria-hidden />
      <div className="aurora-grid" aria-hidden />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner size={32} />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
          <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
          <Route path="/app/*" element={user ? <AppPage /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={user ? '/app' : '/login'} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
