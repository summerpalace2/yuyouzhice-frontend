<template>
  <main class="page shell">
    <div v-if="!authStore.user" class="panel trip-empty">
      <div class="empty-symbol">史</div>
      <h2>登录后查看历史规划会话</h2>
      <p class="muted">登录后每次智能规划与局部微调都会保存在您的账号中。</p>
      <button class="primary" @click="authStore.openLogin('login')">登录 / 注册</button>
    </div>

    <div v-else-if="tripStore.historySessions === null" class="panel trip-empty">
      <p>正在读取历史规划会话……</p>
    </div>

    <div v-else-if="tripStore.historySessions.length === 0" class="panel trip-empty">
      <div class="empty-symbol">空</div>
      <h2>暂无历史规划会话</h2>
      <p class="muted">开始一次 AI 规划，会话将自动记录在此。</p>
      <button class="primary" @click="router.push('/')">立即规划</button>
    </div>

    <div v-else>
      <div class="section-title">
        <div>
          <div class="eyebrow">跨设备历史同步</div>
          <h2>历史会话</h2>
          <p>点击任意会话即可恢复并继续调整行程。</p>
        </div>
        <button class="secondary" @click="tripStore.loadHistory()">刷新会话</button>
      </div>

      <div class="notice history-sync">
        <strong>跨设备会话同步就绪</strong>
        <span>共 {{ tripStore.historySessions.length }} 条记录 · 最近同步于 {{ syncTime }}</span>
      </div>

      <article v-for="item in tripStore.historySessions" :key="item.id" class="panel trip-card">
        <div>
          <div class="eyebrow">{{ new Date(item.createdAt).toLocaleString('zh-CN') }} · 第 {{ item.version }} 版</div>
          <h3>{{ item.title || '重庆旅行规划' }}</h3>
          <p>{{ item.prompt || '默认需求' }} {{ item.replanHistory?.length ? ` · 已局部微调 ${item.replanHistory.length} 次` : '' }}</p>
        </div>
        <div class="trip-actions">
          <button class="primary" @click="handleRestore(item.id)">恢复并继续规划 →</button>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import { useAuthStore } from '@/app/stores/auth';

const router = useRouter();
const tripStore = useTripStore();
const authStore = useAuthStore();

onMounted(() => {
  if (authStore.user) {
    tripStore.loadHistory();
  }
});

const syncTime = computed(() => {
  const sync = tripStore.historySync;
  return sync?.latestUpdatedAt ? new Date(sync.latestUpdatedAt).toLocaleString('zh-CN') : '刚刚';
});

async function handleRestore(id: string) {
  await tripStore.loadHistorySession(id);
  router.push('/planning');
}
</script>

<style scoped>
.history-sync {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  align-items: center;
}

.trip-card {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.trip-card h3 {
  font-size: 18px;
  margin: 4px 0 6px;
  font-weight: 700;
}
.trip-card p {
  font-size: 13.5px;
  color: var(--ink-secondary);
  margin: 0;
}

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
</style>
