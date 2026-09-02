<template>
  <BaseModal :model-value="Boolean(ui.preferenceProposal)" @close="ui.preferenceProposal = null">
    <div v-if="ui.preferenceProposal" class="preference-modal-content">
      <h2>沿用已确认偏好吗？</h2>
      <p>{{ ui.preferenceProposal.copy }} 只有选择“沿用”，它才会进入这次规划；选择忽略不会修改长期偏好。</p>
      <div class="modal-actions">
        <button class="secondary" @click="handleDecision('ignore')">本次忽略</button>
        <button class="primary" @click="handleDecision('use')">沿用偏好</button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/shared/ui/BaseModal.vue';
import { useUiStore } from '@/app/stores/ui';
import { useTripStore } from '@/app/stores/trip';

const ui = useUiStore();
const tripStore = useTripStore();

async function handleDecision(decision: 'use' | 'ignore') {
  ui.preferenceProposal = null;
  await tripStore.planTrip({
    usePreferences: decision === 'use',
    preferenceDecision: decision
  });
}
</script>

<style scoped>
.preference-modal-content h2 {
  font-size: 20px;
  margin: 0 0 8px;
  font-weight: 800;
}
.preference-modal-content p {
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
