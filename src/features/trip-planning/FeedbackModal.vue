<template>
  <BaseModal :model-value="ui.feedbackOpen" @close="ui.feedbackOpen = false">
    <div class="feedback-modal-content">
      <h2>哪里需要改进？</h2>
      <p>选择一个最接近的改进原因，帮助系统在下一版更好地调整行程偏好。</p>
      <div class="reason-grid">
        <button
          v-for="r in reasons"
          :key="r"
          class="chip"
          @click="handleSendFeedback(r)"
        >
          {{ r }}
        </button>
      </div>
      <div class="modal-actions">
        <button class="secondary" @click="ui.feedbackOpen = false">暂不反馈</button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/shared/ui/BaseModal.vue';
import { useUiStore } from '@/app/stores/ui';
import { useTripStore } from '@/app/stores/trip';
import { request } from '@/shared/api/client';

const ui = useUiStore();
const tripStore = useTripStore();

const reasons = ['走路太多', '时间不合适', '想看更多夜景', '想吃地道火锅', '希望能多安排室内'] as const;

async function handleSendFeedback(reason: string) {
  ui.feedbackOpen = false;
  if (!tripStore.trip) return;
  try {
    await request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        value: 'needs-work',
        reason,
        tripId: tripStore.savedTripId || tripStore.trip.savedTripId || null,
        sessionId: tripStore.sessionId,
        version: tripStore.trip.version,
        prompt: tripStore.prompt
      })
    });
    ui.showToast('已记录你的反馈原因，后续将为您调整规划偏好。');
  } catch (err: any) {
    ui.showToast(err.message);
  }
}
</script>

<style scoped>
.feedback-modal-content h2 {
  font-size: 20px;
  margin: 0 0 8px;
  font-weight: 800;
}
.feedback-modal-content p {
  color: var(--ink-secondary);
  font-size: 14px;
  margin: 0 0 16px;
  line-height: 1.6;
}
.reason-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
