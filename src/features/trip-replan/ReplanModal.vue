<template>
  <BaseModal :model-value="Boolean(targetStopId)" @close="emit('close')">
    <div class="replan-preview-modal">
      <h2>局部智能重规划</h2>
      <p>
        当前调整站点：<strong>{{ targetStopName }}</strong>。选择调整理由后，由服务端重新计算替代站点。
      </p>

      <div class="replan-reason-section">
        <label class="section-sub-label">调整理由：</label>
        <div class="reason-grid">
          <button
            v-for="r in reasons"
            :key="r"
            class="chip"
            :class="{ selected: selectedReason === r }"
            @click="selectedReason = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <div class="notice">替代景点、路线与推荐依据将由 Java/BFF 返回；浏览器不在本地选择或排序候选。</div>

      <div class="modal-actions replan-modal-actions">
        <button class="secondary" @click="emit('close')">取消</button>
        <button class="primary" @click="emit('confirm', selectedReason)">提交重规划</button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import BaseModal from '@/shared/ui/BaseModal.vue';

defineProps<{
  targetStopId: string | null;
  targetStopName?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', reason: string): void;
}>();

const reasons = ['少走路', '下雨了', '想换室内', '时间变少', '看夜景', '体验美食'] as const;
const selectedReason = ref('少走路');
</script>

<style scoped>
.replan-preview-modal h2 {
  font-size: 20px;
  margin: 0 0 8px;
  font-weight: 800;
}
.replan-preview-modal p {
  color: var(--ink-secondary);
  font-size: 14px;
  margin: 0 0 16px;
  line-height: 1.6;
}

.section-sub-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink);
  display: block;
  margin-bottom: 8px;
}

.reason-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
