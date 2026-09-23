<template>
  <main class="page shell">
    <div class="section-title">
      <div>
        <div class="eyebrow">Explore & Discover Chongqing</div>
        <h2>探索重庆 · 核心地标与全网检索</h2>
        <p>24 大核心精选地标权威把控，百度全网文旅检索海量探索，点击即可加入行程或咨询 AI。</p>
      </div>
    </div>

    <!-- 搜索模式切换 Tabs -->
    <div class="explore-mode-tabs">
      <button
        class="mode-tab-btn"
        :class="{ active: searchMode === 'core' }"
        @click="searchMode = 'core'"
      >
        🏛️ 精选 24 大核心地标 ({{ filteredItems.length }})
      </button>
      <button
        class="mode-tab-btn"
        :class="{ active: searchMode === 'baidu' }"
        @click="switchBaiduSearch()"
      >
        🌐 百度全网文旅与美食检索
      </button>
    </div>

    <!-- 24 核心地标工具栏 -->
    <section v-if="searchMode === 'core'" class="panel panel-pad explore-toolbar">
      <input
        v-model="tripStore.exploreQuery"
        placeholder="搜索景点名称、区县（渝中区/江北区）、特色（夜景/少走路/火锅/室内）……"
      />
      <div class="chip-row">
        <button
          v-for="cat in allCategories"
          :key="cat"
          class="chip"
          :class="{ selected: currentCategory === cat }"
          @click="selectCategory(cat)"
        >
          {{ cat }}
        </button>
      </div>
    </section>

    <!-- 百度全网搜索工具栏 -->
    <section v-else class="panel panel-pad explore-toolbar baidu-toolbar">
      <div class="baidu-search-input-row">
        <input
          v-model="baiduQuery"
          placeholder="搜索任意重庆小众景点、区县（江津/大足/巫山）、特色美食（火锅/泉水鸡/米花糖）…"
          @keyup.enter="triggerBaiduSearch()"
        />
        <button class="primary" :disabled="baiduLoading" @click="triggerBaiduSearch()">
          {{ baiduLoading ? '检索中…' : '百度搜索' }}
        </button>
      </div>
      <div class="chip-row">
        <span class="quick-label">热门全网检索：</span>
        <button
          v-for="kw in hotSearchKeywords"
          :key="kw"
          class="chip"
          :class="{ selected: baiduQuery === kw }"
          @click="triggerBaiduSearch(kw)"
        >
          {{ kw }}
        </button>
      </div>
    </section>

    <!-- 24 核心地标网格 -->
    <section v-if="searchMode === 'core'" class="explore-grid">
      <ExploreCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        :has-trip="Boolean(tripStore.trip)"
        :already-in-trip="isItemInTrip(item.id)"
        :total-days="tripStore.trip?.days?.length || 2"
        @open-detail="handleOpenDetail"
        @add-attraction="handleAddAttraction"
      />
      <div v-if="filteredItems.length === 0" class="panel trip-empty" style="grid-column: 1 / -1;">
        <div class="empty-symbol">查</div>
        <h2>未在精选 24 核心地标中找到匹配项</h2>
        <p class="muted">没有找到与“{{ tripStore.exploreQuery }}”相关的核心地标。</p>
        <button class="primary" style="margin-top: 12px;" @click="switchBaiduSearch(tripStore.exploreQuery)">
          🔍 立即使用百度全网搜索“{{ tripStore.exploreQuery }}”
        </button>
      </div>
    </section>

    <!-- 百度全网搜索结果网格 -->
    <section v-else class="baidu-results-grid">
      <div v-if="baiduLoading" class="panel trip-empty" style="grid-column: 1 / -1;">
        <p>正在从百度全网检索关于“{{ baiduQuery }}”的文旅与美食信息……</p>
      </div>
      <div v-else-if="baiduResults.length === 0" class="panel trip-empty" style="grid-column: 1 / -1;">
        <div class="empty-symbol">搜</div>
        <h2>未检索到匹配结果</h2>
        <p class="muted">请尝试更换检索关键词或点击上方的热门搜索标签。</p>
      </div>
      <article
        v-for="(item, idx) in baiduResults"
        :key="idx"
        class="panel baidu-card"
      >
        <div class="baidu-card-header">
          <span class="baidu-category-badge">{{ item.category || '全网收录' }}</span>
          <span class="baidu-source-tag">{{ item.source || '百度全网搜索' }}</span>
        </div>
        <h3>{{ item.title }}</h3>
        <p class="baidu-snippet">{{ item.snippet }}</p>
        <div class="modal-actions baidu-actions">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="button ghost mini-btn baidu-link-btn"
          >
            打开百度查看原文 ↗
          </a>
          <button
            class="secondary mini-btn"
            @click="handleAskAi(item.title)"
          >
            向 AI 咨询此地
          </button>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import { useChatStore } from '@/app/stores/chat';
import { request } from '@/shared/api/client';
import type { BaiduSearchResultItem } from '@/shared/types/contracts';
import ExploreCard from '@/entities/attraction/ExploreCard.vue';

const router = useRouter();
const tripStore = useTripStore();
const chatStore = useChatStore();

const searchMode = ref<'core' | 'baidu'>('core');
const currentCategory = ref('全部');
const baiduQuery = ref('');
const baiduLoading = ref(false);
const baiduResults = ref<BaiduSearchResultItem[]>([]);

const hotSearchKeywords = ['江津米花糖', '南山泉水鸡', '大足石刻', '九宫格老火锅', '重庆特色江湖菜', '万盛黑山谷'];

const allCategories = computed(() => ['全部', ...tripStore.exploreCategories]);

onMounted(() => {
  tripStore.loadExplore();
});

function selectCategory(cat: string) {
  currentCategory.value = cat;
  tripStore.exploreCategory = cat === '全部' ? '' : cat;
}

const filteredItems = computed(() => {
  const items = tripStore.exploreItems || [];
  const q = tripStore.exploreQuery.toLowerCase();
  const cat = tripStore.exploreCategory;

  return items.filter((item) => {
    if (cat && item.category !== cat) return false;
    if (q) {
      const match = [item.name, item.district, item.category, ...(item.tags || []), item.summary].join(' ').toLowerCase();
      if (!match.includes(q)) return false;
    }
    return true;
  });
});

function isItemInTrip(id: string) {
  return Boolean(tripStore.trip?.days?.some((d) => d.stops.some((s) => s.venueId === id)));
}

function handleOpenDetail(id: string) {
  tripStore.openDetail(id, { fromView: 'explore' });
  router.push('/detail');
}

async function handleAddAttraction(id: string, day: number) {
  await tripStore.addExploreAttraction(id, day);
  router.push('/planning');
}

function switchBaiduSearch(keyword?: string) {
  searchMode.value = 'baidu';
  if (keyword) {
    baiduQuery.value = keyword;
    triggerBaiduSearch(keyword);
  } else if (!baiduQuery.value) {
    triggerBaiduSearch('重庆 景点 美食');
  }
}

async function triggerBaiduSearch(keyword?: string) {
  const q = (keyword !== undefined ? keyword : (baiduQuery.value || tripStore.exploreQuery || '重庆')).trim();
  if (!q) return;
  baiduQuery.value = q;
  searchMode.value = 'baidu';
  baiduLoading.value = true;
  try {
    const res = await request<{ ok: boolean; results: BaiduSearchResultItem[] }>(`/api/search/baidu?q=${encodeURIComponent(q)}&limit=10`);
    baiduResults.value = Array.isArray(res?.results) ? res.results : [];
  } catch {
    baiduResults.value = [
      {
        title: `在百度搜索“${q}”`,
        snippet: `点击前往百度，查看更多关于【${q}】的重庆旅游攻略、游客评价与地道餐饮推荐。`,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent('重庆 ' + q)}`,
        source: '百度全网直达',
        category: '全网资讯'
      }
    ];
  } finally {
    baiduLoading.value = false;
  }
}

function handleAskAi(title: string) {
  chatStore.input = `请帮我介绍一下【${title}】，如果加入重庆行程有什么游玩或就餐建议？`;
  router.push('/planning');
}
</script>

<style scoped>
.explore-mode-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}

.mode-tab-btn {
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--ink-secondary);
}

.mode-tab-btn:hover {
  border-color: var(--border-focus);
}

.mode-tab-btn.active {
  background: var(--ink);
  color: #ffffff;
  border-color: var(--ink);
}

.explore-toolbar {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.explore-toolbar input {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  background: var(--surface);
}

.baidu-search-input-row {
  display: flex;
  gap: 10px;
}
.baidu-search-input-row input {
  flex: 1;
}

.quick-label {
  font-size: 12px;
  color: var(--muted);
  align-self: center;
}

.explore-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.baidu-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}

.baidu-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: all 0.2s ease;
}
.baidu-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border-focus);
}

.baidu-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.baidu-category-badge {
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}

.baidu-source-tag {
  font-size: 11px;
  color: var(--muted);
}

.baidu-card h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--ink);
}

.baidu-snippet {
  font-size: 13px;
  color: var(--ink-secondary);
  line-height: 1.6;
  margin: 0 0 16px;
  flex: 1;
}

.baidu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.baidu-link-btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.trip-empty {
  padding: 40px;
  text-align: center;
}
.empty-symbol {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-tint);
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  font-size: 20px;
  color: var(--red);
}
</style>
