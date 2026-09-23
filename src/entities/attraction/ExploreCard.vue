<template>
  <article class="panel explore-card">
    <div class="explore-card-thumb" :style="thumbStyle">
      <span class="explore-cat-badge">{{ item.category }}</span>
      <span v-if="hasRealPhoto" class="explore-real-photo-badge">📷 高德实景</span>
    </div>
    <div class="explore-card-body">
      <div class="eyebrow">{{ item.district }} · {{ ticketBrief }}</div>
      <h3>{{ item.name }}</h3>
      <p>{{ item.summary }}</p>
      <div class="chip-row">
        <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <div class="notice explore-fit">{{ item.fit }}</div>
      <div class="modal-actions explore-actions">
        <button class="ghost" @click="emit('open-detail', item.id)">查看详情</button>
        <div v-if="hasTrip" class="explore-add-wrap">
          <select v-model="selectedDay" class="explore-day-select">
            <option v-for="d in totalDays" :key="d" :value="d">第{{ d }}天</option>
          </select>
          <button
            class="primary"
            :class="{ 'button-secondary': alreadyInTrip }"
            @click="emit('add-attraction', item.id, selectedDay)"
          >
            {{ alreadyInTrip ? '继续加入' : '加入行程' }}
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ExploreItem } from '@/shared/types/contracts';

const props = defineProps<{
  item: ExploreItem;
  hasTrip?: boolean;
  alreadyInTrip?: boolean;
  totalDays?: number;
}>();

const emit = defineEmits<{
  (e: 'open-detail', id: string): void;
  (e: 'add-attraction', id: string, day: number): void;
}>();

const selectedDay = ref(1);
const ticketBrief = computed(() => (props.item.ticket || '免费').split('·')[0].trim());

const hasRealPhoto = computed(() => Boolean(props.item.image || props.item.photoUrl));
const thumbStyle = computed(() => {
  const photo = props.item.image || props.item.photoUrl;
  if (photo) {
    return {
      backgroundImage: `url("${photo}")`
    };
  }
  return {
    backgroundImage: `url("/images/attractions/${props.item.id}.svg")`
  };
});
</script>

<style scoped>
.explore-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.2s ease;
}
.explore-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.explore-card-thumb {
  height: 180px;
  background-size: cover;
  background-position: center;
  position: relative;
  background-color: var(--surface-tint);
}

.explore-cat-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(28, 25, 23, 0.75);
  color: white;
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  backdrop-filter: blur(4px);
}

.explore-real-photo-badge {
  position: absolute;
  bottom: 10px;
  right: 12px;
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.explore-card-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.explore-card-body h3 {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 6px;
}

.explore-card-body p {
  font-size: 13px;
  color: var(--ink-secondary);
  line-height: 1.6;
  margin: 0 0 10px;
  flex: 1;
}

.explore-fit {
  margin: 10px 0;
  font-size: 12px;
}

.explore-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.explore-add-wrap {
  display: flex;
  gap: 6px;
}

.explore-day-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--surface);
}
</style>
