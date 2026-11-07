import type { UserDTO } from '@mg/shared';

let accessToken: string | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string };
        tokenStore.set(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 50);
      }
    })();
  }
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && typeof init.body === 'string') {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && !path.startsWith('/auth/') && init.retry !== false) {
    const fresh = await doRefresh();
    if (fresh) return api<T>(path, { ...init, retry: false });
  }

  if (!res.ok) {
    let code = 'ERROR';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
export const del = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });
export const upload = <T>(path: string, form: FormData) => api<T>(path, { method: 'POST', body: form });

export interface SessionResponse {
  user: UserDTO;
  accessToken: string;
}

export const authApi = {
  login: (username: string, password: string) => post<SessionResponse>('/auth/login', { username, password }),
  register: (username: string, password: string, displayName?: string, inviteCode?: string) =>
    post<SessionResponse>('/auth/register', { username, password, displayName, inviteCode }),
  logout: () => post('/auth/logout'),
  me: () => get<{ user: UserDTO }>('/users/me'),
};

export function fileUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url;
}
