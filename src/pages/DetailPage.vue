<template>
  <main class="page shell">
    <div v-if="!detail" class="panel trip-empty">
      <p>正在读取景点详细信息……</p>
    </div>

    <div v-else>
      <div class="detail-header-nav">
        <button class="back-to-plan-btn" @click="router.push(tripStore.detailFromView === 'explore' ? '/explore' : '/planning')">
          {{ tripStore.detailFromView === 'explore' ? '← 返回探索地标' : '← 返回定制方案' }}
        </button>
        <div class="detail-district-badge">景点深度介绍 · {{ detail.district }}</div>
      </div>

      <div class="detail-layout">
        <div class="detail-hero" :style="`background-image:url('/images/attractions/${detail.id || detail.attractionId}.svg')`">
          <div class="vertical">山城渝景</div>
          <span class="image-credit">{{ detail.imageSource || '高德 Web Service API' }} · {{ detail.district }}</span>
        </div>

        <section class="detail-copy">
          <div class="eyebrow">Attraction Guide · {{ detail.district }}</div>
          <h1>{{ detail.name }}</h1>
          <p class="intro">{{ detail.intro || detail.summary }}</p>

          <div class="tag-row">
            <span v-for="tag in detail.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>

          <div class="detail-facts">
            <div class="detail-fact">
              <strong>建议时长</strong>
              <div><b>{{ detail.duration || '约 90 分钟' }}</b><small>游玩深度推荐</small></div>
            </div>
            <div class="detail-fact">
              <strong>门票建议</strong>
              <div><b>{{ detail.ticket || '免费开放' }}</b><small>以现场及官方公告为准</small></div>
            </div>
            <div class="detail-fact">
              <strong>最佳时段</strong>
              <div><b>{{ detail.bestTime || '全天开放' }}</b><small>景观最佳游览时段</small></div>
            </div>
            <div class="detail-fact">
              <strong>交通到达</strong>
              <div><b>{{ detail.walk || '轻轨/公交直达' }}</b><small>高德路线核验</small></div>
            </div>
            <div class="detail-fact">
              <strong>适合人群</strong>
              <div><b>{{ detail.fit || '适合各类旅行者' }}</b></div>
            </div>
          </div>

          <div class="detail-actions-bar">
            <button class="secondary mini-btn" @click="handleNavigate(detail.name, detail.location || '')">
              高德导航 · 到这去
            </button>
          </div>

          <div v-if="tripStore.trip" class="add-to-trip-panel">
            <div class="add-select-row">
              <label>选择加入到：</label>
              <select v-model="selectedDay" id="detail-day-select">
                <option v-for="d in totalDays" :key="d" :value="d">第 {{ d }} 天行程</option>
              </select>
            </div>
            <div class="modal-actions detail-actions">
              <button class="primary" @click="handleAddCustom">加入选定天数</button>
              <button
                v-if="tripStore.detailContext?.stopId"
                class="secondary"
                @click="handleReplaceCurrent"
              >
                替换当前站点
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import { navigateTo } from '@/shared/lib/amap';

const router = useRouter();
const tripStore = useTripStore();

const detail = computed(() => tripStore.detail);
const totalDays = computed(() => tripStore.trip?.days?.length || 2);
const selectedDay = ref(1);

function handleNavigate(name: string, location: string) {
  navigateTo(name, location);
}

async function handleAddCustom() {
  if (!detail.value) return;
  await tripStore.updateTripWithAttraction('add', detail.value.id || detail.value.attractionId, selectedDay.value);
  router.push('/planning');
}

async function handleReplaceCurrent() {
  if (!detail.value || !tripStore.detailContext?.stopId) return;
  await tripStore.updateTripWithAttraction(
    'replace',
    detail.value.id || detail.value.attractionId,
    selectedDay.value,
    tripStore.detailContext.stopId
  );
  router.push('/planning');
}
</script>

<style scoped>
.detail-header-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.back-to-plan-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
}
.detail-district-badge {
  font-size: 12.5px;
  color: var(--muted);
}

.detail-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.detail-hero {
  height: 480px;
  background-size: cover;
  background-position: center;
  position: relative;
  background-color: var(--surface-tint);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.vertical {
  writing-mode: vertical-rl;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  letter-spacing: 0.2em;
}

.image-credit {
  background: rgba(28, 25, 23, 0.7);
  color: white;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  backdrop-filter: blur(4px);
  align-self: flex-start;
}

.detail-copy {
  padding: 32px 36px;
  display: flex;
  flex-direction: column;
}

.detail-copy h1 {
  font-size: 28px;
  margin: 0 0 10px;
  font-weight: 800;
}

.intro {
  font-size: 14.5px;
  color: var(--ink-secondary);
  line-height: 1.7;
  margin: 0 0 16px;
}

.tag-row {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}

.detail-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.detail-fact {
  background: var(--surface-tint);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}
.detail-fact strong {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}
.detail-fact b {
  display: block;
  font-size: 13.5px;
  color: var(--ink);
}
.detail-fact small {
  display: block;
  font-size: 10.5px;
  color: var(--muted);
}

.detail-actions-bar {
  margin-bottom: 18px;
}

.add-to-trip-panel {
  padding: 16px;
  background: var(--surface-tint);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  margin-top: auto;
}

.add-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}
.add-select-row select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.detail-actions {
  display: flex;
  gap: 10px;
}
</style>
