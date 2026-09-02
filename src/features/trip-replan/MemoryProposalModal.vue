<template>
  <BaseModal :model-value="Boolean(ui.memoryProposal)" @close="ui.memoryProposal = null">
    <div v-if="ui.memoryProposal" class="memory-modal-content">
      <h2>记住这个偏好吗？</h2>
      <p>{{ ui.memoryProposal.copy }} 记住后，之后的规划会优先参考；仅本次则不会写入偏好。</p>
      <div class="modal-actions">
        <button class="secondary" @click="handleDecision(false)">仅本次有效</button>
        <button class="primary" @click="handleDecision(true)">记住偏好</button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/shared/ui/BaseModal.vue';
import { useUiStore } from '@/app/stores/ui';
import { useAuthStore } from '@/app/stores/auth';
import { request } from '@/shared/api/client';

const ui = useUiStore();
const authStore = useAuthStore();

async function handleDecision(save: boolean) {
  const proposal = ui.memoryProposal;
  ui.memoryProposal = null;
  if (!save) {
    ui.showToast('仅本次调整有效，不写入长期偏好。');
    return;
  }
  if (!authStore.user) {
    authStore.openLogin('login', 'memory');
    return;
  }
  try {
    await request('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ value: ui.replanReason || '少走路' })
    });
    ui.showToast(`已记住“${ui.replanReason || '少走路'}”偏好。`);
  } catch (err: any) {
    ui.showToast(err.message);
  }
}
</script>

<style scoped>
.memory-modal-content h2 {
  font-size: 20px;
  margin: 0 0 8px;
  font-weight: 800;
}
.memory-modal-content p {
  color: var(--ink-secondary);
  font-size: 14px;
  margin: 0 0 20px;
  line-height: 1.6;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
