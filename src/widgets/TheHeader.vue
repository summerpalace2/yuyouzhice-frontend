<template>
  <header class="topbar shell">
    <div class="brand" @click="router.push('/')">
      <div class="brand-mark">渝</div>
      <div>
        <div class="brand-name">
          <span>渝游智策</span>
          <span v-if="authStore.user?.role === 'admin'" class="admin-role-badge">管理员</span>
        </div>
        <div class="brand-note">重庆立体山城 · 智能出行规划助手</div>
      </div>
    </div>
    <nav class="nav">
      <button
        v-for="[path, label] in navLinks"
        :key="path"
        class="nav-item"
        :class="{ active: route.path === path }"
        @click="router.push(path)"
      >
        {{ label }}
      </button>

      <button
        v-if="authStore.user?.role === 'admin' && route.path === '/admin'"
        class="perspective-btn"
        @click="router.push('/')"
      >
        切换视角
      </button>

      <button class="user-button" @click="handleUserAction">
        <span class="user-dot">{{ authStore.user ? (authStore.user.role === 'admin' ? '管' : '游') : '未' }}</span>
        <span>{{ authStore.user ? `退出 (${authStore.user.name || '用户'})` : '登录 / 注册' }}</span>
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const ui = useUiStore();

const navLinks = computed(() => {
  const links: Array<[string, string]> = [
    ['/', '首页'],
    ['/planning', '方案定制'],
    ['/explore', '探索地标'],
    ['/trips', '我的行程'],
    ['/history', '历史会话'],
    ['/profile', '旅行档案']
  ];
  if (authStore.user?.role === 'admin') {
    links.push(['/admin', '管理中心']);
  }
  return links;
});

async function handleUserAction() {
  if (authStore.user) {
    await authStore.logout();
    ui.showToast('已安全退出登录。');
  } else {
    authStore.openLogin('login');
  }
}
</script>

<style scoped>
.topbar {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: rgba(251, 249, 245, 0.88);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 40;
  transition: all 0.2s ease;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%);
  color: white;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 19px;
  box-shadow: 0 3px 10px rgba(194, 62, 50, 0.28);
  transition: transform 0.15s ease;
}
.brand:hover .brand-mark {
  transform: scale(1.04);
}

.brand-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-note {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

.admin-role-badge {
  background: #fef08a;
  color: #854d0e;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 700;
  border: 1px solid #fde047;
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-item {
  border: 0;
  background: transparent;
  color: var(--ink-secondary);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 13.5px;
  transition: all 0.15s ease;
}
.nav-item.active {
  background: rgba(194, 62, 50, 0.09);
  color: var(--red-deep);
  font-weight: 700;
}
.nav-item:hover:not(.active) {
  background: rgba(0, 0, 0, 0.04);
  color: var(--ink);
}

.perspective-btn {
  background: #fef3c7 !important;
  border: 1px solid #fde68a !important;
  color: #92400e !important;
  font-weight: 700;
  border-radius: var(--radius-sm);
  padding: 6px 12px !important;
  font-size: 12px !important;
}

.user-button {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border) !important;
  background: var(--surface) !important;
  color: var(--ink) !important;
  padding: 6px 12px !important;
  border-radius: var(--radius-sm) !important;
  font-size: 13px !important;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.user-dot {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--border);
  color: var(--ink-secondary);
  font-size: 11px;
  font-weight: 700;
}
</style>
