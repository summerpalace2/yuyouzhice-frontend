<template>
  <BaseModal :model-value="Boolean(targetStopId)" @close="emit('close')">
    <div class="replan-preview-modal">
      <h2>{{ isDining ? '🍽️ 餐饮换店与口味偏好调整' : '局部智能重规划' }}</h2>
      <p>
        当前{{ isDining ? '就餐' : '调整' }}站点：<strong>{{ targetStopName }}</strong>。
        {{ isDining ? '选择您的偏好口味后，悠悠将为您推荐同片区的地道餐厅：' : '选择调整理由后，由服务端重新计算替代站点：' }}
      </p>

      <div class="replan-reason-section">
        <label class="section-sub-label">{{ isDining ? '口味或餐厅类型：' : '调整理由：' }}</label>
        <div class="reason-grid">
          <button
            v-for="r in reasons"
            :key="r"
            class="chip"
            :class="{
              selected: selectedReason === r,
              'dining-chip': isDining
            }"
            @click="selectedReason = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <div class="notice">
        {{ isDining ? '推荐餐厅、招牌必吃菜品与就近距离将由服务端实时核验召回。' : '替代景点、路线与推荐依据将由服务端实时核验返回。' }}
      </div>

      <div class="modal-actions replan-modal-actions">
        <button class="secondary" @click="emit('close')">取消</button>
        <button :class="isDining ? 'primary dining-btn' : 'primary'" @click="emit('confirm', selectedReason)">
          {{ isDining ? '提交换店推荐' : '提交重规划' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import BaseModal from '@/shared/ui/BaseModal.vue';

const props = defineProps<{
  targetStopId: string | null;
  targetStopName?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', reason: string): void;
}>();

const isDining = computed(() => {
  const name = props.targetStopName || '';
  const id = props.targetStopId || '';
  return id.includes('dining')
    || name.includes('餐')
    || name.includes('火锅')
    || name.includes('鸡')
    || name.includes('鱼')
    || name.includes('菜');
});

const diningReasons = ['换地道老火锅', '换特色江湖菜', '换名小吃小面', '想吃清淡不辣', '高空江景餐厅', '换实惠平价餐'] as const;
const attractionReasons = ['少走路', '下雨了', '想换室内', '时间变少', '看夜景', '体验人文'] as const;

const reasons = computed(() => (isDining.value ? diningReasons : attractionReasons));
const selectedReason = ref<string>('换地道老火锅');

watch(
  () => isDining.value,
  (val) => {
    selectedReason.value = val ? '换地道老火锅' : '少走路';
  },
  { immediate: true }
);
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

.dining-chip.selected {
  background: #ea580c !important;
  color: #ffffff !important;
  border-color: #ea580c !important;
}

.dining-btn {
  background: #ea580c !important;
  border-color: #ea580c !important;
}
.dining-btn:hover {
  background: #c2410c !important;
  border-color: #c2410c !important;
}
</style>
