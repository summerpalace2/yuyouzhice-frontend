<template>
  <div class="prompt-box">
    <textarea
      v-model="tripStore.prompt"
      aria-label="旅行需求"
      placeholder="输入你想游玩的时间、同行人、体力偏好，或点击下方标签快捷辅助填写..."
    />
    <div class="prompt-footer">
      <span class="hint">智能去重 · 多天规划 · 高德多轨迹精准核验</span>
      <button class="primary" :disabled="tripStore.loading" @click="emit('submit')">
        {{ tripStore.loading ? '正在智能规划中…' : '开始 AI 智能规划' }}
      </button>
    </div>
  </div>

  <!-- 懂你的 AI 智能画像快捷模版 -->
  <div class="smart-presets-wrap">
    <span class="presets-label">懂你的智能模版：</span>
    <div class="presets-row">
      <button class="preset-badge" @click="tripStore.applyPreset('elderly')">
        长辈省心游（少爬坡·直达电梯·文博夜景）
      </button>
      <button class="preset-badge" @click="tripStore.applyPreset('magic8d')">
        8D魔幻打卡（穿楼单轨·天桥·老火锅）
      </button>
      <button class="preset-badge" @click="tripStore.applyPreset('couple')">
        情侣浪漫江夜（江岸夜景·老街·清幽）
      </button>
      <button class="preset-badge" @click="tripStore.applyPreset('family')">
        亲子研学（三峡博物馆·自然峡谷）
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTripStore } from '@/app/stores/trip';

const tripStore = useTripStore();

const emit = defineEmits<{
  (e: 'submit'): void;
}>();
</script>

<style scoped>
.prompt-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.prompt-box:focus-within {
  border-color: var(--red);
  box-shadow: 0 8px 24px rgba(194, 62, 50, 0.12);
}

.prompt-box textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 0;
  background: transparent;
  outline: 0;
  line-height: 1.65;
  color: var(--ink);
  font-size: 14.5px;
}

.prompt-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
  margin-top: 8px;
}

.hint {
  color: var(--muted);
  font-size: 12px;
}

.smart-presets-wrap {
  margin-top: 18px;
  padding: 12px 14px;
  background: var(--surface-tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.presets-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--red-deep);
}

.presets-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-badge {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  padding: 5px 11px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.18s ease;
}

.preset-badge:hover {
  border-color: var(--red);
  color: var(--red);
  background: var(--red-subtle);
  transform: translateY(-1px);
}
</style>
