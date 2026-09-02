<template>
  <BaseModal :model-value="authStore.loginOpen" @close="authStore.closeLogin()">
    <div class="auth-modal-content">
      <div class="auth-tabs">
        <button
          class="auth-tab"
          :class="{ active: authStore.authMode === 'login' }"
          @click="authStore.authMode = 'login'"
        >
          用户登录
        </button>
        <button
          class="auth-tab"
          :class="{ active: authStore.authMode === 'register' }"
          @click="authStore.authMode = 'register'"
        >
          新用户注册
        </button>
        <button
          class="auth-tab"
          :class="{ active: authStore.authMode === 'admin-login' }"
          @click="authStore.authMode = 'admin-login'"
        >
          管理员通道
        </button>
      </div>

      <h2>{{ title }}</h2>
      <p>{{ subtitle }}</p>

      <form @submit.prevent="handleSubmit">
        <div class="form-row">
          <label for="login-email">邮箱地址</label>
          <input id="login-email" v-model="form.email" type="email" placeholder="name@example.com" required />
        </div>

        <div v-if="authStore.authMode === 'register'" class="form-row">
          <label for="login-name">称呼 / 昵称</label>
          <input id="login-name" v-model="form.name" type="text" placeholder="如：重庆旅行者" />
        </div>

        <div class="form-row">
          <label for="login-password">密码</label>
          <input id="login-password" v-model="form.password" type="password" minlength="6" required />
        </div>

        <div v-if="authStore.loginError" class="notice notice-error">{{ authStore.loginError }}</div>

        <div class="modal-actions">
          <button type="button" class="secondary" @click="authStore.closeLogin()">取消</button>
          <button type="submit" class="primary" :disabled="loading">
            {{ loading ? '处理中…' : submitButtonText }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import BaseModal from '@/shared/ui/BaseModal.vue';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';

const authStore = useAuthStore();
const ui = useUiStore();
const loading = ref(false);

const form = reactive({
  email: '',
  password: '',
  name: ''
});

const title = computed(() => {
  if (authStore.authMode === 'admin-login') return '管理员专用通道';
  if (authStore.authMode === 'register') return '注册新账号';
  return '登录渝游智策';
});

const subtitle = computed(() => {
  if (authStore.authMode === 'admin-login') return '管理员登录后可实时监控多级缓存、知识库与系统图表。';
  if (authStore.authMode === 'register') return '注册后即可永久保存行程与偏好资产。';
  return '登录后可在多设备同步行程与偏好。';
});

const submitButtonText = computed(() => {
  if (authStore.authMode === 'admin-login') return '管理员登录';
  if (authStore.authMode === 'register') return '立即注册';
  return '登录';
});

async function handleSubmit() {
  loading.value = true;
  try {
    const res = await authStore.login(form);
    ui.showToast(res.message || '登录成功');
  } catch (err: any) {
    authStore.loginError = err.message || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  background: var(--surface-tint);
  padding: 4px;
  border-radius: var(--radius-sm);
}

.auth-tab {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-secondary);
  transition: all 0.15s ease;
}
.auth-tab.active {
  background: var(--surface);
  color: var(--red);
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

.auth-modal-content h2 {
  font-size: 20px;
  margin: 0 0 6px;
  font-weight: 800;
}
.auth-modal-content p {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 18px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.form-row label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}
.form-row input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  background: var(--surface);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
