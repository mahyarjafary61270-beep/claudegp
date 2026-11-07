import { create } from 'zustand';
import type { UserDTO } from '@mg/shared';
import { authApi, tokenStore } from '@/api/client';
import { socket } from '@/ws/socket';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  booting: boolean;
  setUser: (u: UserDTO) => void;
  setSession: (u: UserDTO, token: string) => void;
  boot: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  booting: true,

  setUser: (user) => set({ user }),

  setSession: (user, token) => {
    tokenStore.set(token);
    set({ user, accessToken: token });
    socket.start();
  },

  boot: async () => {
    try {
      // cookie refresh token → new session (silent, single attempt)
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { user: UserDTO; accessToken: string };
        get().setSession(data.user, data.accessToken);
        return;
      }
    } catch {
      /* offline */
    }
    set({ booting: false });
  },

  login: async (username, password) => {
    const data = await authApi.login(username, password);
    get().setSession(data.user, data.accessToken);
  },

  register: async (username, password, displayName, inviteCode) => {
    const data = await authApi.register(username, password, displayName, inviteCode);
    get().setSession(data.user, data.accessToken);
  },

  logout: async () => {
    await authApi.logout().catch(() => undefined);
    socket.stop();
    tokenStore.set(null);
    set({ user: null, accessToken: null });
  },
}));
