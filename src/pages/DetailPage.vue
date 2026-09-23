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
        <div class="detail-district-badge">
          {{ isDining ? '🍽️ 地道美食名店推荐' : (isRuntime ? '高德实时核验 · 探索打卡点' : '景点深度介绍') }} · {{ detail.district }}
        </div>
      </div>

      <div class="detail-layout">
        <div class="detail-hero" :style="heroStyle">
          <div class="vertical">{{ isDining ? '舌尖巴渝' : (isRuntime ? '探索点位' : '山城渝景') }}</div>
          <span class="image-credit">{{ isDining ? '高德美食精选 · 地道风味' : (detail.imageSource || '高德 Web Service API · ' + detail.district) }}</span>
        </div>

        <section class="detail-copy">
          <div class="eyebrow">{{ isDining ? 'Chongqing Local Food & Dining' : (isRuntime ? '高德实时探索点' : 'Attraction Guide') }} · {{ detail.district }}</div>
          <h1>{{ detail.name }}</h1>
          <div v-if="detail.address" class="detail-address-info">
            <span class="detail-address-label">📍 地理位置：</span>
            <span>{{ detail.address }}</span>
            <span v-if="detail.type" class="detail-type-tag">（{{ detail.type }}）</span>
          </div>

          <!-- 美食招牌必吃推荐高亮卡 -->
          <div v-if="isDining && detail.specialtyDish" class="detail-specialty-card">
            <div class="specialty-card-title">🥘 招牌必吃特色菜品</div>
            <div class="specialty-card-content">{{ detail.specialtyDish }}</div>
          </div>

          <p class="intro">{{ detail.intro || detail.summary }}</p>

          <div class="tag-row">
            <span v-for="tag in detail.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>

          <!-- 渝悠悠 AI 智囊深度导览 -->
          <div v-if="displayAiGuide" class="detail-ai-guide-card">
            <div class="ai-guide-header">
              <span class="ai-guide-badge">{{ isDining ? '🍲 渝悠悠美食探店与必点攻略' : '🤖 渝悠悠 AI 智囊导览' }}</span>
              <span class="ai-guide-tag">{{ isDining ? '口味与避坑建议' : (isRuntime ? '文旅与避坑建议' : '地标深度解析') }}</span>
            </div>
            <div class="ai-guide-body">
              <div
                v-for="(para, idx) in displayAiGuideParagraphs"
                :key="idx"
                class="ai-guide-paragraph"
              >
                {{ para }}
              </div>
            </div>
          </div>

          <!-- 美食与景点专属维度网格 -->
          <div v-if="isDining" class="detail-facts detail-dining-facts">
            <div class="detail-fact">
              <strong>招牌风味</strong>
              <div><b>{{ detail.specialtyDish ? '特色必尝' : '地道老字号' }}</b><small>{{ detail.diningType || '午晚餐推荐' }}</small></div>
            </div>
            <div class="detail-fact">
              <strong>参考人均</strong>
              <div><b>{{ detail.costSummary || '约 45-65 元' }}</b><small>按需点餐消费</small></div>
            </div>
            <div class="detail-fact">
              <strong>建议时段</strong>
              <div><b>{{ detail.bestTime || '11:30 - 20:30' }}</b><small>建议避开就餐高峰</small></div>
            </div>
            <div class="detail-fact">
              <strong>就近距离</strong>
              <div><b>{{ detail.walk || '步行可达' }}</b><small>紧邻游玩景区</small></div>
            </div>
            <div class="detail-fact">
              <strong>适宜人群</strong>
              <div><b>{{ detail.fit || '适合自由行、聚餐' }}</b></div>
            </div>
          </div>

          <div v-else class="detail-facts">
            <div class="detail-fact">
              <strong>建议时长</strong>
              <div><b>{{ detail.duration || '约 75 分钟' }}</b><small>游玩深度推荐</small></div>
            </div>
            <div class="detail-fact">
              <strong>门票建议</strong>
              <div><b>{{ detail.ticket || '以现场及官方公告为准' }}</b><small>以现场及官方公告为准</small></div>
            </div>
            <div class="detail-fact">
              <strong>最佳时段</strong>
              <div><b>{{ detail.bestTime || '全天开放' }}</b><small>景观最佳游览时段</small></div>
            </div>
            <div class="detail-fact">
              <strong>交通到达</strong>
              <div><b>{{ detail.walk || '高德路线直达' }}</b><small>高德路线核验</small></div>
            </div>
            <div class="detail-fact">
              <strong>适合人群</strong>
              <div><b>{{ detail.fit || '适合自由行探索' }}</b></div>
            </div>
          </div>

          <div class="detail-actions-bar">
            <button class="primary mini-btn" @click="handleNavigate(detail.name, detail.location || '')">
              {{ isDining ? '🗺️ 高德导航 · 到店就餐' : '高德导航 · 到这去' }}
            </button>
            <button v-if="isDining" class="secondary mini-btn" @click="router.push('/planning')">
              🍲 返回行程调整
            </button>
          </div>

          <div v-if="tripStore.trip && !isDining" class="add-to-trip-panel">
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
const isDining = computed(() => {
  const c = detail.value;
  if (!c) return false;
  return Boolean(
    c.isDining
    || c.specialtyDish
    || c.type === '特色餐饮美食'
    || c.type === 'DINING'
    || (c.id && c.id.includes('dining'))
    || (c.name && (c.name.includes('餐推荐') || c.name.includes('【午餐】') || c.name.includes('【晚餐】')))
  );
});

const isRuntime = computed(() => {
  const current = detail.value;
  if (!current) return false;
  const id = current.id || current.attractionId || '';
  return id.startsWith('amap-') || id.startsWith('amap:') || current.sourceMode === 'AMAP_RUNTIME';
});

const displayAiGuide = computed(() => {
  if (detail.value?.aiGuide) return detail.value.aiGuide;
  if (!isRuntime.value && (detail.value?.intro || detail.value?.summary)) {
    const introText = detail.value.intro || detail.value.summary || '';
    const fitText = detail.value.fit ? `\n【适宜人群与出行建议】${detail.value.fit}` : '';
    return `【文旅特色与历史风貌】${introText}${fitText}`;
  }
  return '';
});

const displayAiGuideParagraphs = computed(() => {
  if (!displayAiGuide.value) return [];
  return displayAiGuide.value.split('\n').map((s: string) => s.trim()).filter(Boolean);
});
const totalDays = computed(() => tripStore.trip?.days?.length || 2);
const selectedDay = ref(1);
const heroStyle = computed(() => {
  const current = detail.value;
  if (!current) return {};
  const id = current.id || current.attractionId || '';
  if (current.image) return { backgroundImage: `url("${current.image}")` };
  if (isDining.value) {
    return { backgroundImage: 'linear-gradient(135deg, #c2410c 0%, #ea580c 45%, #d97706 100%)' };
  }
  if (id.startsWith('amap-') || id.startsWith('amap:')) {
    return { backgroundImage: 'linear-gradient(145deg, #d95b2b 0%, #8e3d2c 48%, #2d2630 100%)' };
  }
  return { backgroundImage: `url("/images/attractions/${id}.svg")` };
});

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

.detail-address-info {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.detail-address-label {
  font-weight: 600;
  color: var(--ink);
}
.detail-type-tag {
  color: var(--muted);
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

.detail-ai-guide-card {
  margin: 16px 0 20px;
  padding: 16px;
  background: linear-gradient(135deg, #fffaf5 0%, #fef3ec 100%);
  border: 1px solid rgba(217, 91, 43, 0.28);
  border-radius: var(--radius-sm, 10px);
  box-shadow: 0 4px 14px rgba(217, 91, 43, 0.08);
}
.ai-guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.ai-guide-badge {
  font-size: 13.5px;
  font-weight: 800;
  color: #c23e32;
  display: flex;
  align-items: center;
  gap: 5px;
}
.ai-guide-tag {
  font-size: 11px;
  color: #8c4a2f;
  background: rgba(217, 91, 43, 0.12);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.ai-guide-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-guide-paragraph {
  font-size: 13px;
  color: #4a3427;
  line-height: 1.6;
  white-space: pre-wrap;
}

.detail-specialty-card {
  background: #fff7ed;
  border: 1px dashed #fdba74;
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin: 14px 0;
}
.specialty-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #c2410c;
  margin-bottom: 4px;
}
.specialty-card-content {
  font-size: 14.5px;
  font-weight: 600;
  color: #7c2d12;
}

.detail-dining-facts .detail-fact {
  background: #fffaf5;
  border-color: #fed7aa;
}
.detail-dining-facts .detail-fact strong {
  color: #ea580c;
}
</style>
