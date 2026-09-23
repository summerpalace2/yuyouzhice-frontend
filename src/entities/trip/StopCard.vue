<template>
  <article
    class="stop"
    :class="{
      'selected-stop-card': isSelected,
      'pinned-stop-card': isPinned,
      'stop-card-dining': isDining,
      'stop-card-attraction': !isDining
    }"
    :data-stop-id="stop.id"
  >
    <div class="stop-icon" :class="isDining ? 'dining-icon' : `tone-${stop.tone || 'warm'}`">
      {{ stop.icon || (isDining ? '🍜' : '📍') }}
    </div>
    <div class="stop-body">
      <div class="stop-meta">
        <span class="stop-time-text">
          <template v-if="isDining">
            <span class="dining-tag-pill">美食推荐</span>
            {{ stop.time || '就餐时段' }} · {{ stop.district || '周边特色' }} · 人均约 {{ costLabel }}
          </template>
          <template v-else>
            {{ stop.time || '上午' }} · {{ stop.district || '渝中区' }} · 建议游玩 {{ durationLabel }}
          </template>
        </span>
        <span v-if="isSelected" class="chip chip-selected">✓ {{ isDining ? '待调整餐饮' : '待替换站点' }}</span>
        <span v-if="isPinned" class="chip chip-pinned">📌 已固定</span>
      </div>
      <h3>{{ stop.name }}</h3>

      <!-- 美食专属招牌必吃菜品框 -->
      <div v-if="isDining && stop.specialtyDish" class="specialty-dish-box">
        <span class="specialty-badge">🥘 招牌必吃</span>
        <span class="specialty-text">{{ stop.specialtyDish }}</span>
      </div>

      <p>{{ stop.summary }}</p>
      <div class="notice recommendation-reason">
        推荐依据：{{ stop.recommendationReason || (isDining ? '临近景区，精选同片区高口碑地道巴渝餐饮' : '暂无推荐依据') }}
      </div>

      <div class="chip-row">
        <template v-if="isDining">
          <span class="chip chip-cost">💰 人均 {{ costLabel }}</span>
          <span class="chip chip-time">⏱️ 用餐 {{ durationLabel }}</span>
          <span v-if="stop.distanceFromAttraction" class="chip chip-distance">🚶 {{ stop.distanceFromAttraction }}</span>
          <span class="chip chip-transit">{{ routeChip }}</span>
        </template>
        <template v-else>
          <span class="chip chip-ticket">门票 {{ ticketLabel }}</span>
          <span class="chip chip-time">游玩 {{ durationLabel }}</span>
          <span class="chip chip-transit">{{ routeChip }}</span>
        </template>
      </div>
    </div>
    <div class="stop-actions">
      <button
        class="secondary mini-btn"
        :class="{ 'active-btn': isSelected }"
        @click="emit('select-stop', stop.id, dayNumber)"
      >
        {{ isSelected ? '取消选中' : (isDining ? '选中改餐' : '选中此站') }}
      </button>
      <button
        class="ghost mini-btn"
        :class="{ 'active-btn': isPinned }"
        @click="emit('toggle-pin', stop.id)"
      >
        {{ isPinned ? '取消固定' : '📌 固定' }}
      </button>
      <button class="ghost mini-btn" @click="emit('open-detail', stop.venueId || stop.id, stop)">
        {{ isDining ? '美食详情' : '景点详情' }}
      </button>
      <button class="ghost mini-btn" @click="emit('navigate', stop.name, stop.location || '')">
        {{ isDining ? '到店导航' : '到这去' }}
      </button>
      <button
        v-if="!isDining"
        class="secondary mini-btn"
        @click="emit('open-replan', stop.id)"
      >
        替换
      </button>
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
  (e: 'open-detail', venueId: string, stop?: Stop): void;
  (e: 'navigate', name: string, location: string): void;
  (e: 'open-replan', id: string): void;
  (e: 'remove-stop', id: string): void;
}>();

const isDining = computed(() => {
  const s = props.stop;
  if (!s) return false;
  return s.type === 'DINING'
    || s.isDining === true
    || s.icon === '餐'
    || Boolean(s.specialtyDish)
    || Boolean(s.id && s.id.includes('dining'))
    || Boolean(s.name && (s.name.includes('餐推荐') || s.name.includes('【午餐】') || s.name.includes('【晚餐】')));
});

const durationLabel = computed(() => props.stop.duration || (isDining.value ? '约 60 分钟' : '约 90 分钟'));
const costLabel = computed(() => props.stop.averageCost || props.stop.costSummary || '45-65 元');
const ticketLabel = computed(() => (props.stop.ticket || '免费开放 · 无需预约').split('·')[0].trim());
const routeChip = computed(() => {
  const r = props.stop.routeFromPrevious;
  if (r?.selected?.summary) return `${r.selectedMode || '路线'} ${r.selected.summary}`;
  return props.stop.walk ? `路线 ${props.stop.walk}` : (isDining.value ? '就近步行可达' : '路线待计算');
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

/* 双色卡片视觉区别 */
.stop-card-attraction {
  border-left: 4.5px solid #2563eb;
}

.stop-card-dining {
  border-left: 4.5px solid #ea580c;
  background: linear-gradient(135deg, #fffdfa 0%, #fff7ed 100%);
  border-color: #fed7aa;
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
  border-left: 4.5px solid var(--gold) !important;
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

.dining-icon {
  background: #ffedd5;
  color: #c2410c;
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

.dining-tag-pill {
  display: inline-block;
  background: #ea580c;
  color: #ffffff;
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
  letter-spacing: 0.02em;
}

.stop-body h3 {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--ink);
}

/* 招牌必吃推荐高亮框 */
.specialty-dish-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff7ed;
  border: 1px dashed #fdba74;
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
}

.specialty-badge {
  font-size: 11.5px;
  font-weight: 700;
  color: #c2410c;
  background: #ffedd5;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.specialty-text {
  font-size: 12.5px;
  font-weight: 600;
  color: #9a3412;
  line-height: 1.4;
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

.chip-cost {
  background: #ffedd5 !important;
  color: #9a3412 !important;
  border-color: #fed7aa !important;
  font-weight: 600;
}

.chip-distance {
  background: #f1f5f9 !important;
  color: #475569 !important;
  border-color: #cbd5e1 !important;
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

.dining-replan-btn {
  background: #ea580c !important;
  color: white !important;
  border-color: #ea580c !important;
  font-weight: 600;
}

.dining-replan-btn:hover {
  background: #c2410c !important;
  border-color: #c2410c !important;
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
