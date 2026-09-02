<template>
  <main class="page shell">
    <div v-if="!authStore.user" class="panel trip-empty">
      <div class="empty-symbol">档</div>
      <h2>登录后查看旅行档案</h2>
      <p class="muted">沉淀您的专属旅行偏好与行程演变历程。</p>
      <button class="primary" @click="authStore.openLogin('login')">登录查看</button>
    </div>

    <div v-else-if="!tripStore.profile" class="panel trip-empty">
      <p>正在读取旅行档案……</p>
    </div>

    <div v-else>
      <div class="section-title">
        <div>
          <div class="eyebrow">旅行者专属画像与资产</div>
          <h2>旅行档案 · {{ authStore.user.name || '旅行者' }}</h2>
          <p>直观管理您的长期出行偏好、足迹资产与规划演化历程。</p>
        </div>
        <button class="secondary" @click="tripStore.loadProfile()">刷新档案</button>
      </div>

      <!-- 4 维指标看板 -->
      <div class="profile-stats-grid">
        <div class="profile-stat-card">
          <div class="stat-name">已存方案</div>
          <div class="stat-val">{{ tripsList.length }}</div>
          <div class="stat-sub">份持久化行程</div>
        </div>
        <div class="profile-stat-card">
          <div class="stat-name">偏好设定</div>
          <div class="stat-val">{{ preferencesList.length }}</div>
          <div class="stat-sub">项长期偏好</div>
        </div>
        <div class="profile-stat-card">
          <div class="stat-name">变更记录</div>
          <div class="stat-val">{{ historyList.length }}</div>
          <div class="stat-sub">次偏好调整流水</div>
        </div>
        <div class="profile-stat-card">
          <div class="stat-name">评价反馈</div>
          <div class="stat-val">{{ feedbackList.length }}</div>
          <div class="stat-sub">条互动记录</div>
        </div>
      </div>

      <!-- 偏好与演化栅格 -->
      <div class="profile-layout-grid">
        <section class="panel panel-pad">
          <div class="panel-title">我的长期偏好标签</div>
          <p class="muted" style="font-size:12px;margin:4px 0 12px;">后续 AI 规划会自动优先参考已确认的偏好标签。</p>
          <div class="preference-tags-container">
            <span v-for="val in preferencesList" :key="val" class="pref-tag-badge">
              <span>{{ val }}</span>
              <button class="pref-tag-del" @click="handleRemovePref(val)">×</button>
            </span>
            <div v-if="preferencesList.length === 0" class="notice">暂无长期偏好。在行程重规划后选择“记住偏好”即可沉淀在此。</div>
          </div>

          <div class="add-pref-inline">
            <input v-model="newPrefInput" placeholder="输入自定义偏好（如：喜欢老茶馆、不吃香菜）..." />
            <button class="primary" @click="handleAddPref">添加偏好</button>
          </div>
        </section>

        <section class="panel panel-pad">
          <div class="panel-title">行程版本演进与对比</div>
          <p class="muted" style="font-size:12px;margin:4px 0 12px;">记录初始规划、局部重规划与微调的历史轨迹。</p>
          <div class="timeline-container">
            <div v-for="trip in tripsList" :key="trip.id" class="timeline-item">
              <div class="timeline-marker" />
              <div class="timeline-content">
                <strong>{{ trip.title }} (第 {{ trip.version }} 版)</strong>
                <span class="timeline-time">{{ new Date(trip.savedAt).toLocaleString('zh-CN') }}</span>
              </div>
            </div>
            <div v-if="tripsList.length === 0" class="notice">暂无已保存行程版本。</div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTripStore } from '@/app/stores/trip';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';
import { request } from '@/shared/api/client';

const tripStore = useTripStore();
const authStore = useAuthStore();
const ui = useUiStore();
const newPrefInput = ref('');

onMounted(() => {
  if (authStore.user) {
    tripStore.loadProfile();
  }
});

const preferencesList = computed(() => tripStore.profile?.preferences || []);
const historyList = computed(() => tripStore.profile?.preferenceHistory || []);
const tripsList = computed(() => tripStore.profile?.trips || []);
const feedbackList = computed(() => tripStore.profile?.feedback || []);

async function handleAddPref() {
  const val = newPrefInput.value.trim();
  if (!val) return;
  try {
    await request('/api/preferences', { method: 'POST', body: JSON.stringify({ value: val }) });
    newPrefInput.value = '';
    await tripStore.loadProfile();
    ui.showToast(`已添加偏好“${val}”！`);
  } catch (err: any) {
    ui.showToast(err.message);
  }
}

async function handleRemovePref(val: string) {
  try {
    await request(`/api/preferences/${encodeURIComponent(val)}`, { method: 'DELETE' });
    await tripStore.loadProfile();
    ui.showToast('已移除该偏好标签。');
  } catch (err: any) {
    ui.showToast(err.message);
  }
}
</script>

<style scoped>
.profile-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.profile-stat-card {
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stat-name {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}
.stat-val {
  font-size: 26px;
  font-weight: 800;
  color: var(--ink);
  margin: 4px 0;
}
.stat-sub {
  font-size: 11.5px;
  color: var(--muted);
}

.profile-layout-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.preference-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.pref-tag-badge {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pref-tag-del {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
}
.pref-tag-del:hover {
  color: var(--red);
}

.add-pref-inline {
  display: flex;
  gap: 8px;
}
.add-pref-inline input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.timeline-item {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.timeline-marker {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--red);
  margin-top: 6px;
}
.timeline-content strong {
  display: block;
  font-size: 13.5px;
}
.timeline-time {
  font-size: 11.5px;
  color: var(--muted);
}
</style>
