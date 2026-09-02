<template>
  <div v-if="loading && phase" class="planning-loader" role="status" aria-live="polite">
    <div class="loader-kicker">智能规划进行中 · {{ phase }}</div>
    <div class="loader-steps">
      <div
        v-for="([label, note], index) in phases"
        :key="label"
        class="loader-step"
        :class="{
          active: index <= currentIndex,
          current: label === phase
        }"
      >
        <span>{{ index < currentIndex ? '✓' : index + 1 }}</span>
        <div>
          <strong>{{ label }}</strong>
          <small>{{ note }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  loading: boolean;
  phase: string;
}>();

const phases = [
  ['理解旅行条件', '整理时间、同行人、体力和偏好'],
  ['检索可信信息', '由服务端提供景点、路线与事实依据'],
  ['组合路线', '优化景点顺序与公共交通/步行衔接'],
  ['生成方案', '形成可解释、去重且可随时微调的行程']
] as const;

const currentIndex = computed(() => {
  const idx = phases.findIndex(([label]) => label === props.phase);
  return Math.max(0, idx);
});
</script>

<style scoped>
.planning-loader {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  margin: 16px 0;
  animation: fadeIn 0.2s ease-out;
}

.loader-kicker {
  font-size: 13px;
  font-weight: 700;
  color: var(--red-deep);
  margin-bottom: 12px;
}

.loader-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.loader-step {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.45;
  transition: opacity 0.3s ease;
}

.loader-step.active {
  opacity: 1;
}

.loader-step span {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--border);
  color: var(--ink-secondary);
  font-size: 11px;
  font-weight: 700;
  display: grid;
  place-items: center;
}

.loader-step.active span {
  background: var(--red);
  color: white;
}

.loader-step.current span {
  box-shadow: 0 0 0 3px var(--red-subtle);
  animation: pulse 1.5s infinite;
}

.loader-step strong {
  display: block;
  font-size: 13px;
  color: var(--ink);
}

.loader-step small {
  display: block;
  font-size: 11px;
  color: var(--muted);
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
</style>
