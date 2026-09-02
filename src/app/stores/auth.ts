import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from '@/shared/types/contracts';
import { request, setCsrfToken } from '@/shared/api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loginOpen = ref(false);
  const authMode = ref<'login' | 'register' | 'admin-login'>('login');
  const loginError = ref('');
  const pendingAction = ref<string | null>(null);

  async function restoreSession() {
    try {
      const data = await request<{ authenticated: boolean; user: User; csrfToken?: string }>('/api/auth/session');
      if (data.authenticated && data.user) {
        user.value = data.user;
        setCsrfToken(data.csrfToken || null);
      } else {
        user.value = null;
        setCsrfToken(null);
      }
    } catch {
      user.value = null;
      setCsrfToken(null);
    }
  }

  async function login(credentials: { email: string; password: string; name?: string }) {
    loginError.value = '';
    const registering = authMode.value === 'register';
    const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
    const data = await request<{ ok: boolean; user: User; csrfToken?: string; message?: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    user.value = data.user;
    setCsrfToken(data.csrfToken || null);
    loginOpen.value = false;
    return data;
  }

  async function logout() {
    if (user.value) {
      try {
        await request('/api/auth/logout', { method: 'POST' });
      } catch {}
    }
    user.value = null;
    setCsrfToken(null);
  }

  function openLogin(mode: 'login' | 'register' | 'admin-login' = 'login', afterAction?: string) {
    authMode.value = mode;
    loginError.value = '';
    loginOpen.value = true;
    if (afterAction) pendingAction.value = afterAction;
  }

  function closeLogin() {
    loginOpen.value = false;
    loginError.value = '';
    pendingAction.value = null;
  }

  return {
    user,
    loginOpen,
    authMode,
    loginError,
    pendingAction,
    restoreSession,
    login,
    logout,
    openLogin,
    closeLogin
  };
});
