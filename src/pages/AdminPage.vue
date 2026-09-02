<template>
  <main class="page shell admin-stream-page">
    <div class="section-title">
      <div>
        <div class="eyebrow">Admin Console · 智能管控中心</div>
        <h2>管理控制台</h2>
        <p>实时监控系统流量、Rerank 多级缓存、知识库索引与用户数据统计。</p>
      </div>
      <div class="section-actions">
        <button class="perspective-btn" @click="router.push('/')">切换视角</button>
        <button class="secondary" @click="adminStore.fetchHealth()">刷新数据</button>
      </div>
    </div>

    <!-- 系统指标 KPI -->
    <section class="admin-stream-section">
      <div class="admin-stream-head">
        <h3>系统运行与质量指标</h3>
      </div>
      <div class="admin-kpi-grid">
        <div class="kpi-card">
          <span class="kpi-title">注册用户总数</span>
          <span class="kpi-num">{{ adminStore.overview?.users?.length || 0 }}</span>
          <span class="kpi-sub">包含 {{ adminStore.overview?.metrics?.travelers || 0 }} 位旅行者账号</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">约束满足平均分</span>
          <span class="kpi-num">{{ avgSatisfaction }}</span>
          <span class="kpi-sub">约束满足度精准适配</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">实时数据覆盖率</span>
          <span class="kpi-num">{{ avgCoverage }}</span>
          <span class="kpi-sub">POI 与路径规划全链路覆盖</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-title">待核验未知事实</span>
          <span class="kpi-num">{{ unknownFacts }}</span>
          <span class="kpi-sub">动态事实显式标记与核验</span>
        </div>
      </div>
    </section>

    <!-- Rerank 多级缓存 -->
    <section class="admin-stream-section">
      <div class="admin-stream-head">
        <h3>Rerank 多级智能缓存监控 (L1 Memory / L2 Redis / L3 Model)</h3>
      </div>
      <div class="panel panel-pad">
        <div class="rerank-stats-bar">
          <div class="cache-tier tier-l1">
            <div class="tier-name">L1 本地内存缓存</div>
            <div class="tier-val">{{ rerank ? `${rerank.l1MemoryHits} 次命中` : '暂无实时数据' }}</div>
            <div class="tier-sub">&lt; 1ms 响应</div>
          </div>
          <div class="cache-tier tier-l2">
            <div class="tier-name">L2 Redis 分布式缓存</div>
            <div class="tier-val">{{ rerank ? `${rerank.l2RedisHits} 次命中` : '暂无实时数据' }}</div>
            <div class="tier-sub">&lt; 5ms 高并发保障</div>
          </div>
          <div class="cache-tier tier-l3">
            <div class="tier-name">L3 大模型深度排序</div>
            <div class="tier-val">{{ rerank ? `${rerank.l3ModelCalls} 次降级调用` : '暂无实时数据' }}</div>
            <div class="tier-sub">~180ms 精准重排序</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 知识库语料登记表 -->
    <section class="admin-stream-section">
      <div class="admin-stream-head">
        <div class="head-with-meta">
          <h3>知识库语料登记 (Knowledge Registry) 与在线编辑</h3>
          <span class="head-meta-badge">已索引 {{ corpusDocs }} 篇文档</span>
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="admin-doc-toolbar">
          <input v-model="adminStore.docQuery" placeholder="搜索语料标题、景点、正文关键词..." />
          <div class="doc-toolbar-sub">
            <div class="chip-row">
              <button
                v-for="t in topicList"
                :key="t"
                class="chip"
                :class="{ selected: currentTopic === t }"
                @click="selectTopic(t)"
              >
                {{ t }}
              </button>
            </div>
            <button class="secondary mini-btn" @click="adminStore.docsFolded = !adminStore.docsFolded">
              {{ adminStore.docsFolded ? `展开全部 (${filteredDocs.length} 篇) ↓` : '折叠精选 (6 篇) ↑' }}
            </button>
          </div>
        </div>

        <div class="doc-accordion-list">
          <div
            v-for="doc in displayedDocs"
            :key="doc.docId"
            class="doc-item"
            :class="{ expanded: adminStore.expandedDocs.has(doc.docId) }"
          >
            <div class="doc-item-head" @click="adminStore.toggleDocExpand(doc.docId)">
              <div class="doc-title-group">
                <span class="doc-badge">{{ doc.entityName }}</span>
                <strong>{{ doc.title }}</strong>
                <span class="doc-topic-tag">[{{ doc.topic }}]</span>
              </div>
              <div class="doc-head-actions">
                <button
                  class="secondary mini-btn"
                  @click.stop="adminStore.editingDoc = doc"
                >
                  编辑语料
                </button>
                <span class="expand-icon">{{ adminStore.expandedDocs.has(doc.docId) ? '收起 ↑' : '展开 ↓' }}</span>
              </div>
            </div>
            <div v-if="adminStore.expandedDocs.has(doc.docId)" class="doc-body-view">
              <div class="doc-content-text">{{ doc.content }}</div>
              <div class="doc-meta-footer">
                <span>实体ID: <code>{{ doc.entityId || doc.docId }}</code></span>
                <span>审核状态: <b class="health-ok">{{ doc.reviewStatus || '已核验' }}</b></span>
              </div>
            </div>
          </div>
          <div v-if="displayedDocs.length === 0" class="notice">没有找到匹配的知识库文档。</div>
        </div>
      </div>
    </section>

    <!-- 用户管理 · 只读 与 来源登记表 -->
    <section class="admin-stream-section">
      <div class="admin-stream-head">
        <div class="head-with-meta">
          <h3>用户管理 · 只读</h3>
          <span class="head-meta-badge">共 {{ usersList.length }} 位注册用户</span>
        </div>
      </div>
      <div class="admin-charts-grid">
        <div class="panel panel-pad">
          <div class="panel-title">用户列表与属性概览</div>
          <div class="admin-user-list">
            <div v-for="u in usersList" :key="u.id" class="admin-user-row">
              <div class="user-main-info">
                <div class="user-avatar-circle">{{ (u.name || u.email || '用')[0] }}</div>
                <div>
                  <strong>{{ u.name || '用户' }}</strong>
                  <span class="user-email-meta">{{ u.email }} · {{ u.role === 'admin' ? '系统管理员' : '普通旅行者' }}</span>
                </div>
              </div>
              <div class="user-metrics-chips">
                <span class="tag">行程: {{ u.savedTrips ?? 0 }}</span>
                <span class="tag">偏好: {{ u.preferences ?? 0 }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="panel-title">来源登记表 ({{ sourcesList.length }} 条已核验来源)</div>
          <div class="admin-source-list">
            <div v-for="s in sourcesList.slice(0, 8)" :key="s.title" class="source-row">
              <div class="source-info">
                <strong>{{ s.publisher || s.title }}</strong>
                <span>{{ s.title }}</span>
              </div>
              <div class="source-link-cell">
                <a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" class="source-link-btn">点击跳转原文 ↗</a>
                <span v-else class="health-ok">已核验</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 语料编辑弹窗 -->
    <AdminDocEditor />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/app/stores/admin';
import AdminDocEditor from '@/features/admin-corpus/AdminDocEditor.vue';

const router = useRouter();
const adminStore = useAdminStore();

const topicList = ['全部', 'accessibility', 'transport', 'dynamic', 'warning', 'itinerary'] as const;
const currentTopic = ref('全部');

onMounted(() => {
  adminStore.fetchHealth();
});

function selectTopic(t: string) {
  currentTopic.value = t;
  adminStore.docTopic = t === '全部' ? '' : t;
}

const rerank = computed(() => adminStore.overview?.rerankCache);
const corpusDocs = computed(() => adminStore.overview?.knowledge?.corpus?.documents ?? '—');
const usersList = computed(() => adminStore.overview?.users || []);
const sourcesList = computed(() => adminStore.overview?.knowledge?.sourceRegister || []);

const avgSatisfaction = computed(() => {
  const q = adminStore.overview?.qualityMetrics;
  if (!q || q.available === false) return '—';
  return `${Math.round((q.avgConstraintSatisfaction || 0) * 100)}%`;
});

const avgCoverage = computed(() => {
  const q = adminStore.overview?.qualityMetrics;
  if (!q || q.available === false) return '—';
  return `${Math.round((q.avgDataCoverage || 0) * 100)}%`;
});

const unknownFacts = computed(() => {
  const q = adminStore.overview?.qualityMetrics;
  if (!q || q.available === false) return '—';
  return `${q.unknownFacts || 0} 项`;
});

const filteredDocs = computed(() => {
  const list = adminStore.docs || [];
  const q = adminStore.docQuery.toLowerCase();
  const topic = adminStore.docTopic;

  return list.filter((doc) => {
    if (topic && doc.topic !== topic) return false;
    if (q) {
      const match = [doc.title, doc.entityName, doc.content].join(' ').toLowerCase();
      if (!match.includes(q)) return false;
    }
    return true;
  });
});

const displayedDocs = computed(() => {
  return adminStore.docsFolded ? filteredDocs.value.slice(0, 6) : filteredDocs.value;
});
</script>

<style scoped>
.admin-stream-section {
  margin-bottom: 28px;
}

.admin-stream-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.admin-stream-head h3 {
  font-size: 18px;
  font-weight: 800;
  margin: 0;
}

.admin-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.kpi-card {
  padding: 18px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.kpi-title {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
  display: block;
}
.kpi-num {
  font-size: 26px;
  font-weight: 800;
  color: var(--ink);
  display: block;
  margin: 4px 0;
}
.kpi-sub {
  font-size: 11px;
  color: var(--muted);
}

.rerank-stats-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.cache-tier {
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
  border: 1px solid var(--border);
}
.tier-name {
  font-size: 12px;
  font-weight: 700;
}
.tier-val {
  font-size: 18px;
  font-weight: 800;
  margin: 4px 0;
}
.tier-sub {
  font-size: 11px;
  color: var(--muted);
}

.admin-doc-toolbar {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.admin-doc-toolbar input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13.5px;
}
.doc-toolbar-sub {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.doc-accordion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.doc-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.doc-item-head {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.doc-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-badge {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.doc-topic-tag {
  font-size: 11.5px;
  color: var(--muted);
}
.doc-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.expand-icon {
  font-size: 12px;
  color: var(--muted);
}

.doc-body-view {
  padding: 14px;
  background: var(--surface-tint);
  border-top: 1px solid var(--border);
}
.doc-content-text {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-secondary);
  white-space: pre-wrap;
  margin-bottom: 10px;
}
.doc-meta-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--muted);
}

.admin-charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.admin-user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.user-main-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-avatar-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-tint);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-weight: 700;
}
.user-email-meta {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.user-metrics-chips {
  display: flex;
  gap: 6px;
}

.source-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12.5px;
}
.source-info strong {
  display: block;
}
.source-info span {
  font-size: 11px;
  color: var(--muted);
}
.source-link-btn {
  color: var(--blue);
  text-decoration: none;
  font-size: 11.5px;
  font-weight: 600;
}
</style>
