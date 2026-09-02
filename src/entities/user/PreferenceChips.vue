<template>
  <div class="preference-capsules">
    <div class="capsule-group">
      <span class="capsule-label">游玩天数</span>
      <div class="capsule-list">
        <button
          v-for="item in ['1天速览', '2天经典', '3天深度', '4天全景']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.duration === item }"
          @click="toggleSingle('duration', item)"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <div class="capsule-group">
      <span class="capsule-label">同行人员</span>
      <div class="capsule-list">
        <button
          v-for="item in ['独自出发', '情侣双人', '带父母', '亲子家庭', '朋友结伴']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.companions === item }"
          @click="toggleSingle('companions', item)"
        >
          {{ item === '带父母' ? '长辈同行' : item }}
        </button>
      </div>
    </div>

    <div class="capsule-group">
      <span class="capsule-label">步行节奏</span>
      <div class="capsule-list">
        <button
          v-for="item in ['少走路', '经典适中', '深度打卡']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.pace === item }"
          @click="toggleSingle('pace', item)"
        >
          {{ item === '少走路' ? '轻松少走台阶' : item }}
        </button>
      </div>
    </div>

    <div class="capsule-group">
      <span class="capsule-label">出行方式</span>
      <div class="capsule-list">
        <button
          v-for="item in ['轻轨地铁优先', '公交优先', '打车为主']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.transport === item }"
          @click="toggleSingle('transport', item)"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <div class="capsule-group">
      <span class="capsule-label">餐饮风味</span>
      <div class="capsule-list">
        <button
          v-for="item in ['九宫格老火锅', '地道江湖菜', '街头小吃小面', '清淡不辣', '本地菜优先']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.dining.has(item) }"
          @click="toggleSet('dining', item)"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <div class="capsule-group">
      <span class="capsule-label">体验主题</span>
      <div class="capsule-list">
        <button
          v-for="item in ['8D魔幻', '山城夜景', '人文历史', '市井烟火', '自然奇观', '天然温泉']"
          :key="item"
          class="pref-chip"
          :class="{ active: preferences.themes.has(item) }"
          @click="toggleSet('themes', item)"
        >
          {{ item }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTripStore } from '@/app/stores/trip';

const tripStore = useTripStore();
const preferences = tripStore.preferences;

function toggleSingle(cat: 'duration' | 'companions' | 'pace' | 'transport', val: string) {
  preferences[cat] = preferences[cat] === val ? '' : val;
  tripStore.prompt = tripStore.buildPromptFromPreferences();
}

function toggleSet(cat: 'dining' | 'themes', val: string) {
  if (preferences[cat].has(val)) {
    preferences[cat].delete(val);
  } else {
    preferences[cat].add(val);
  }
  tripStore.prompt = tripStore.buildPromptFromPreferences();
}
</script>

<style scoped>
.preference-capsules {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.capsule-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.capsule-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink-secondary);
  width: 68px;
  flex-shrink: 0;
}

.capsule-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pref-chip {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pref-chip:hover {
  border-color: var(--red-border);
  background: var(--surface-tint);
}

.pref-chip.active {
  background: var(--red-subtle);
  border-color: var(--red);
  color: var(--red);
  font-weight: 700;
}
</style>
