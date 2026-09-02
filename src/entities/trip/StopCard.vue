<template>
  <article
    class="stop"
    :class="{
      'selected-stop-card': isSelected,
      'pinned-stop-card': isPinned
    }"
    :data-stop-id="stop.id"
  >
    <div class="stop-icon" :class="`tone-${stop.tone || 'warm'}`">{{ stop.icon || '📍' }}</div>
    <div class="stop-body">
      <div class="stop-meta">
        <span class="stop-time-text">{{ stop.time || '上午' }} · {{ stop.district || '渝中区' }} · 建议游玩 {{ durationLabel }}</span>
        <span v-if="isSelected" class="chip chip-selected">✓ 待替换站点</span>
        <span v-if="isPinned" class="chip chip-pinned">📌 已固定</span>
      </div>
      <h3>{{ stop.name }}</h3>
      <p>{{ stop.summary }}</p>
      <div class="notice recommendation-reason">推荐依据：{{ stop.recommendationReason || '暂无推荐依据' }}</div>
      <div class="chip-row">
        <span class="chip chip-ticket">门票 {{ ticketLabel }}</span>
        <span class="chip chip-time">游玩 {{ durationLabel }}</span>
        <span class="chip chip-transit">{{ routeChip }}</span>
      </div>
    </div>
    <div class="stop-actions">
      <button
        class="secondary mini-btn"
        :class="{ 'active-btn': isSelected }"
        @click="emit('select-stop', stop.id, dayNumber)"
      >
        {{ isSelected ? '已选中' : '选中此站' }}
      </button>
      <button
        class="ghost mini-btn"
        :class="{ 'active-btn': isPinned }"
        @click="emit('toggle-pin', stop.id)"
      >
        {{ isPinned ? '取消固定' : '📌 固定' }}
      </button>
      <button class="ghost mini-btn" @click="emit('open-detail', stop.venueId || stop.id)">详情</button>
      <button class="ghost mini-btn" @click="emit('navigate', stop.name, stop.location || '')">到这去</button>
      <button class="secondary mini-btn" @click="emit('open-replan', stop.id)">替换</button>
      <button class="danger-mini" @click="emit('remove-stop', stop.id)">移除</button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Stop } from '@/shared/types/contracts';

const props = defineProps<{
  stop: Stop;
  dayNumber: number;
  isSelected?: boolean;
  isPinned?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-stop', id: string, day: number): void;
  (e: 'toggle-pin', id: string): void;
  (e: 'open-detail', venueId: string): void;
  (e: 'navigate', name: string, location: string): void;
  (e: 'open-replan', id: string): void;
  (e: 'remove-stop', id: string): void;
}>();

const durationLabel = computed(() => props.stop.duration || '约 90 分钟');
const ticketLabel = computed(() => (props.stop.ticket || '免费开放 · 无需预约').split('·')[0].trim());
const routeChip = computed(() => {
  const r = props.stop.routeFromPrevious;
  if (r?.selected?.summary) return `${r.selectedMode || '路线'} ${r.selected.summary}`;
  return props.stop.walk ? `路线 ${props.stop.walk}` : '路线待计算';
});
</script>

<style scoped>
.stop {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 12px;
  transition: all 0.2s ease;
  position: relative;
}

.stop:hover {
  border-color: var(--border-focus);
  box-shadow: var(--shadow);
}

.selected-stop-card {
  border-color: var(--red) !important;
  background: #fffafa !important;
  box-shadow: 0 0 0 2px var(--red-border);
}

.pinned-stop-card {
  border-left: 4px solid var(--gold) !important;
}

.stop-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--surface-tint);
  display: grid;
  place-items: center;
  font-size: 20px;
  flex-shrink: 0;
}

.stop-body {
  flex: 1;
  min-width: 0;
}

.stop-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.stop-body h3 {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--ink);
}

.stop-body p {
  font-size: 13.5px;
  color: var(--ink-secondary);
  line-height: 1.6;
  margin: 0 0 10px;
}

.recommendation-reason {
  margin-bottom: 10px;
  font-size: 12px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-selected {
  background: var(--red-subtle) !important;
  color: var(--red) !important;
  border-color: var(--red-border) !important;
}

.chip-pinned {
  background: var(--gold-subtle) !important;
  color: var(--gold) !important;
  border-color: #fde68a !important;
}

.stop-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  flex-shrink: 0;
}

.active-btn {
  background: var(--red) !important;
  color: white !important;
  border-color: var(--red) !important;
}

.danger-mini {
  border: 1px solid #fecaca;
  background: transparent;
  color: #dc2626;
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
}
.danger-mini:hover {
  background: #fef2f2;
}
</style>
