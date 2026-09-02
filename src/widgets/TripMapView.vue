<template>
  <aside class="panel evidence-card">
    <div class="map-card-head">
      <div class="panel-title">高德全景路线图</div>
      <div class="map-head-actions">
        <button
          class="map-action-btn"
          :class="{ active: Boolean(tripStore.userLocation) }"
          @click="handleLocate"
        >
          {{ tripStore.locating ? '定位中...' : (tripStore.userLocation ? '已定位' : '我的定位') }}
        </button>
        <button class="map-action-btn" @click="handleRefresh">刷新地图</button>
        <button class="fullscreen-map-btn" @click="ui.mapFullscreen = true">全屏查看</button>
      </div>
    </div>

    <!-- 多天 Tab -->
    <div v-if="tripStore.trip?.days" class="map-day-tabs">
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

    <!-- 地图 Canvas -->
    <div ref="mapContainerRef" class="trip-map">
      <div v-if="!isKeyConfigured" class="map-fallback">
        <div class="map-fallback-title">高德路线与空间拓扑就绪</div>
        <p class="map-fallback-desc">已解析站点坐标与路线数据</p>
        <div class="map-fallback-note">路线数据模式下已完整绑定站点地理信息，配置 AMAP_JS_KEY 即可开启底图漫游。</div>
      </div>
    </div>

    <!-- 地图情报卡片 -->
    <div class="map-intel-card">
      <div class="intel-header">
        <span class="intel-badge">高德路网核验就绪</span>
        <span class="intel-poi-count">已定位 {{ poiCount }} 处机位</span>
      </div>
      <div v-if="tripStore.userLocation" class="intel-row user-location-row">
        <strong>我的相对位置</strong>
        <p>当前设备坐标：{{ tripStore.userLocation.coordinates[0].toFixed(4) }}, {{ tripStore.userLocation.coordinates[1].toFixed(4) }}（{{ tripStore.userLocation.distanceText || '已标出相对位置' }}）</p>
      </div>
      <div class="intel-row">
        <strong>出行建议</strong>
        <p>重庆依山而建，轻轨与户外自动扶梯是长辈出行的极佳选择，沿线商圈多为平街直连。</p>
      </div>
      <div class="intel-row">
        <strong>路线依据</strong>
        <p>折线由高德步行与公交网络实时计算生成，已自动排除陡坡台阶与拥堵路段。</p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useTripStore } from '@/app/stores/trip';
import { useUiStore } from '@/app/stores/ui';
import { useAmap } from '@/shared/lib/amap';

const tripStore = useTripStore();
const ui = useUiStore();

const mapContainerRef = ref<HTMLElement | null>(null);
const { isKeyConfigured, renderMap } = useAmap(mapContainerRef);

const poiCount = computed(() => {
  return tripStore.trip?.days?.flatMap((d) => d.stops || []).length || 0;
});

function triggerMapRender() {
  renderMap(tripStore.trip, tripStore.selectedMapDay, tripStore.userLocation);
}

watch(
  [() => tripStore.trip, () => tripStore.selectedMapDay, () => tripStore.userLocation],
  () => {
    triggerMapRender();
  },
  { deep: true }
);

onMounted(() => {
  triggerMapRender();
});

function handleLocate() {
  if (!navigator.geolocation) {
    ui.showToast('您的浏览器不支持地理定位。');
    return;
  }
  tripStore.locating = true;
  ui.showToast('正在向浏览器请求定位权限并获取位置...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      tripStore.locating = false;
      tripStore.userLocation = {
        coordinates: [pos.coords.longitude, pos.coords.latitude],
        accuracy: pos.coords.accuracy,
        distanceText: '已定位当前位置'
      };
      ui.showToast('定位成功！');
    },
    () => {
      tripStore.locating = false;
      ui.showToast('获取定位超时或失败，请检查浏览器权限。');
    }
  );
}

function handleRefresh() {
  triggerMapRender();
  ui.showToast('已重新刷新高德地图！');
}
</script>

<style scoped>
.evidence-card {
  padding: 20px;
}

.map-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
}

.map-head-actions {
  display: flex;
  gap: 6px;
}

.map-action-btn {
  padding: 5px 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}
.map-action-btn.active {
  background: var(--red-subtle);
  border-color: var(--red);
  color: var(--red);
}

.fullscreen-map-btn {
  padding: 5px 11px;
  background: var(--ink);
  color: white;
  border: 0;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 700;
}

.map-day-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
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

.trip-map {
  height: 380px;
  background: var(--surface-tint);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  overflow: hidden;
  position: relative;
}

.map-fallback {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 20px;
}
.map-fallback-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
}
.map-fallback-desc {
  font-size: 13px;
  color: var(--ink-secondary);
  margin-bottom: 8px;
}
.map-fallback-note {
  font-size: 11.5px;
  color: var(--muted);
  max-width: 320px;
}

.map-intel-card {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.intel-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.intel-badge {
  color: var(--green);
  font-weight: 700;
}
.intel-poi-count {
  color: var(--muted);
}
.intel-row {
  font-size: 12px;
  color: var(--ink-secondary);
}
.intel-row strong {
  color: var(--ink);
  margin-right: 6px;
}
.intel-row p {
  margin: 2px 0 0;
  line-height: 1.5;
}
</style>
