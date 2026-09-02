<template>
  <main class="page shell">
    <div class="section-title">
      <div>
        <div class="eyebrow">Explore Chongqing</div>
        <h2>探索重庆 24 大精选地标</h2>
        <p>涵盖夜景、城市、人文、8D魔幻、古镇美食与自然风光，点击即可加入行程。</p>
      </div>
    </div>

    <section class="panel panel-pad explore-toolbar">
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

    <section class="explore-grid">
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
        <h2>没有匹配的景点</h2>
        <p class="muted">请尝试更换关键词或清除分类筛选。</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import ExploreCard from '@/entities/attraction/ExploreCard.vue';

const router = useRouter();
const tripStore = useTripStore();
const currentCategory = ref('全部');

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
</script>

<style scoped>
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

.explore-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
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
