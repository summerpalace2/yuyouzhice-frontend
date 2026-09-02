<template>
  <div v-if="ui.mapFullscreen && tripStore.trip" class="fullscreen-map-overlay">
    <div class="fullscreen-map-header">
      <div class="fullscreen-header-left">
        <span class="fullscreen-map-title">{{ tripStore.trip.title }} · 全屏路线导航</span>
        <span class="intel-badge">已定位 {{ poiCount }} 处机位</span>
      </div>
      <div class="map-day-tabs" style="margin:0;">
        <button
          class="map-tab"
          :class="{ active: tripStore.selectedMapDay === 0 }"
          @click="tripStore.selectedMapDay = 0"
        >
          全景路线
        </button>
        <button
          v-for="d in tripStore.trip.days"
          :key="d.day"
          class="map-tab"
          :class="{ active: tripStore.selectedMapDay === d.day }"
          @click="tripStore.selectedMapDay = d.day"
        >
          第{{ d.day }}天
        </button>
      </div>
      <button class="primary" @click="ui.mapFullscreen = false">退出全屏</button>
    </div>
    <div ref="fullContainerRef" class="fullscreen-map-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTripStore } from '@/app/stores/trip';
import { useUiStore } from '@/app/stores/ui';
import { useAmap } from '@/shared/lib/amap';

const tripStore = useTripStore();
const ui = useUiStore();

const fullContainerRef = ref<HTMLElement | null>(null);
const { renderMap } = useAmap(fullContainerRef);

const poiCount = computed(() => {
  return tripStore.trip?.days?.flatMap((d) => d.stops || []).length || 0;
});

watch(
  [() => ui.mapFullscreen, () => tripStore.selectedMapDay],
  ([isOpen]) => {
    if (isOpen) {
      setTimeout(() => {
        renderMap(tripStore.trip, tripStore.selectedMapDay, tripStore.userLocation);
      }, 50);
    }
  }
);
</script>

<style scoped>
.fullscreen-map-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 150;
  display: flex;
  flex-direction: column;
}

.fullscreen-map-header {
  height: 60px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fullscreen-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fullscreen-map-title {
  font-weight: 800;
  font-size: 16px;
}

.intel-badge {
  font-size: 12px;
  color: var(--green);
  font-weight: 700;
}

.map-day-tabs {
  display: flex;
  gap: 6px;
}
.map-tab {
  padding: 5px 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}
.map-tab.active {
  background: var(--red);
  color: white;
  border-color: var(--red);
}

.fullscreen-map-canvas {
  flex: 1;
  width: 100%;
}
</style>
