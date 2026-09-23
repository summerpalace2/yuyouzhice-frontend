<template>
  <main class="page shell">
    <!-- 无行程空态 -->
    <div v-if="!tripStore.trip" class="panel trip-empty">
      <div>
        <div class="empty-symbol">行</div>
        <h2>还没有行程草稿</h2>
        <p class="muted">先从首页输入你的重庆旅行需求并开始规划。</p>
        <button class="primary" @click="router.push('/')">返回首页开始规划</button>
      </div>
    </div>

    <!-- 行程看板 -->
    <div v-else>
      <div class="section-title">
        <div>
          <div class="eyebrow">专属定制方案 · 可自由微调</div>
          <h2>{{ tripStore.trip.title }}</h2>
          <p>
            {{ tripStore.trip.subtitle || '定制旅行方案' }} · 第 {{ tripStore.trip.version }} 版
            <span v-if="tripStore.trip.routeDataStatus === 'ESTIMATED'" class="planner-version-pill">部分路线耗时为估算值</span>
          </p>
        </div>
        <div class="section-actions">
          <button class="secondary" @click="handleFeedback('helpful')">有帮助</button>
          <button class="secondary" @click="ui.feedbackOpen = true">改进建议</button>
          <button class="primary" @click="handleSaveTrip">保存行程</button>
        </div>
      </div>

      <PlanningLoader :loading="tripStore.loading" :phase="tripStore.loadingPhase" />

      <div class="workspace-grid">
        <!-- 旅行条件展示与编辑 -->
        <SlotsForm
          :constraints="tripStore.trip.constraints"
          :editing="tripStore.constraintEditing"
          @edit="tripStore.constraintEditing = true"
          @cancel="tripStore.constraintEditing = false"
          @submit="handleReplanWithConstraints"
        />

        <!-- 行程安排详情 -->
        <section class="panel plan-details-panel">
          <div class="plan-header">
            <div>
              <h2>行程安排详情</h2>
              <p>共 {{ tripStore.trip.days.length }} 天行程 · 已自动去重与路线优化</p>
            </div>
            <div class="plan-status-actions">
              <span class="status-pill">{{ tripStore.trip.sourceMode || 'Java Core AI' }}</span>
              <button
                class="secondary mini-btn"
                type="button"
                :disabled="tripStore.dynamicRefreshing"
                title="仅在有具体行程日期时匹配高德天气预报"
                @click="tripStore.refreshDynamicData()"
              >
                {{ tripStore.dynamicRefreshing ? '刷新中…' : '刷新天气与路线' }}
              </button>
            </div>
          </div>

          <!-- 策略卡片已精简移除 -->

          <div v-for="day in tripStore.trip.days" :key="day.day" class="day-block">
            <div class="day-head">
              <strong>{{ day.dateLabel || `第${day.day}天` }}</strong>
              <span
                v-if="day.weather"
                class="weather-badge"
                :class="day.weather.status === '动态' ? 'weather-live' : 'weather-pending'"
                :title="day.weather.note || '天气信息需在出发前核验'"
              >
                {{ day.weather.value || '天气待确认' }}
              </span>
            </div>
            <div v-if="day.departureContext" class="day-context">出发参考：{{ day.departureContext }}</div>
            <StopCard
              v-for="stop in day.stops"
              :key="stop.id"
              :stop="stop"
              :day-number="day.day"
              :is-selected="tripStore.selectedStopId === stop.id"
              :is-pinned="tripStore.pinnedStopIds.has(stop.id)"
              @select-stop="handleSelectStop"
              @toggle-pin="handleTogglePin"
              @open-detail="handleOpenDetail"
              @navigate="handleNavigate"
              @open-replan="ui.openReplan"
              @remove-stop="tripStore.removeStop"
            />
          </div>
        </section>

        <!-- 高德地图卡片 -->
        <TripMapView />
      </div>

      <!-- AI 智能对话面板 -->
      <ChatPanel />
    </div>

    <!-- 弹窗集 -->
    <ReplanModal
      :target-stop-id="ui.replanTargetStopId"
      :target-stop-name="currentReplanStopName"
      @close="ui.closeReplan()"
      @confirm="tripStore.confirmReplan"
    />
    <FullscreenMapOverlay />
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';
import { navigateTo } from '@/shared/lib/amap';
import type { TripConstraints } from '@/shared/types/contracts';

import PlanningLoader from '@/shared/ui/PlanningLoader.vue';
import SlotsForm from '@/features/trip-planning/SlotsForm.vue';
import StrategyCards from '@/entities/trip/StrategyCards.vue';
import StopCard from '@/entities/trip/StopCard.vue';
import TripMapView from '@/widgets/TripMapView.vue';
import FullscreenMapOverlay from '@/widgets/FullscreenMapOverlay.vue';
import ChatPanel from '@/features/trip-chat/ChatPanel.vue';
import ReplanModal from '@/features/trip-replan/ReplanModal.vue';

const router = useRouter();
const tripStore = useTripStore();
const authStore = useAuthStore();
const ui = useUiStore();

const currentReplanStopName = computed(() => {
  if (!ui.replanTargetStopId || !tripStore.trip) return '';
  const stop = tripStore.trip.days.flatMap((d) => d.stops).find((s) => s.id === ui.replanTargetStopId);
  return stop?.name || '';
});

function handleSelectStop(id: string, day: number) {
  tripStore.selectedStopId = tripStore.selectedStopId === id ? null : id;
  tripStore.activeDay = day;
}

function handleTogglePin(id: string) {
  if (tripStore.pinnedStopIds.has(id)) {
    tripStore.pinnedStopIds.delete(id);
  } else {
    tripStore.pinnedStopIds.add(id);
  }
}

function handleOpenDetail(venueId: string, stop?: any) {
  tripStore.openDetail(venueId, { fromView: 'planning', stop });
  router.push('/detail');
}

function handleNavigate(name: string, location: string) {
  navigateTo(name, location);
}

async function handleReplanWithConstraints(constraints: TripConstraints) {
  tripStore.constraintEditing = false;
  await tripStore.planTrip({ constraints });
}

async function handleSaveTrip() {
  if (!authStore.user) {
    authStore.openLogin('login', 'save');
    return;
  }
  await tripStore.saveTrip();
  router.push('/trips');
}

function handleFeedback(val: string) {
  ui.showToast(val === 'helpful' ? '感谢你的评价！' : '已记录你的反馈。');
}
</script>

<style scoped>
.trip-empty {
  padding: 60px 20px;
  text-align: center;
}
.empty-symbol {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--surface-tint);
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
  font-size: 24px;
  font-weight: 800;
  color: var(--red);
}

.workspace-grid {
  display: grid;
  grid-template-columns: 280px 1fr 340px;
  gap: 20px;
  align-items: start;
}

.plan-details-panel {
  padding: 24px;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.plan-header h2 {
  font-size: 20px;
  margin: 0 0 4px;
  font-weight: 800;
}
.plan-header p {
  color: var(--muted);
  font-size: 13px;
  margin: 0;
}

.status-pill {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--red);
}

.plan-status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.planner-version-pill {
  background: #fef3c7;
  color: #92400e;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  margin-left: 8px;
}

.day-block {
  margin-bottom: 24px;
}

.day-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 14px;
  font-size: 15px;
}

.day-context {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 12px;
}

.weather-badge {
  background: #eff6ff;
  color: #2563eb;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}

.weather-pending {
  background: #fff7ed;
  color: #c2410c;
}
</style>
