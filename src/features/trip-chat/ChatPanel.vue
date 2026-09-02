<template>
  <aside class="panel chat-panel" aria-label="AI 智能旅行助理">
    <div class="panel-pad">
      <!-- 头部与模式切换 -->
      <div class="chat-header-row">
        <div>
          <div class="panel-title">AI 旅行决策助手</div>
          <span class="chat-subtitle">支持微调行程、景点替换与实时问答</span>
        </div>
        <div class="chat-mode-select-wrap">
          <label for="chat-mode" class="chat-mode-label">推理深度：</label>
          <select id="chat-mode" v-model="chatStore.mode" class="chat-mode-select">
            <option value="normal">标准回复</option>
            <option value="deep">深度推理 (RAG)</option>
          </select>
        </div>
      </div>

      <!-- 模式状态横幅 -->
      <div v-if="bannerInfo" class="mode-badge-banner" :class="bannerInfo.class">
        <div><strong>{{ bannerInfo.title }}</strong> <span v-if="bannerInfo.tag" class="proposal-id-tag">{{ bannerInfo.tag }}</span></div>
        <span class="sub-tip">{{ bannerInfo.tip }}</span>
      </div>

      <!-- 轻量处理建议浮窗 -->
      <div v-if="!chatStore.suggestionDismissed && suggestionInfo" class="suggestion-callout" :class="suggestionInfo.class">
        <div class="suggestion-head">
          <span><strong>{{ suggestionInfo.title }}</strong></span>
          <button class="suggestion-close-btn" type="button" @click="chatStore.suggestionDismissed = true">✕</button>
        </div>
        <p class="suggestion-desc">{{ suggestionInfo.desc }}</p>
        <div class="suggestion-actions">
          <button
            v-for="btn in suggestionInfo.buttons"
            :key="btn.label"
            class="chip primary-chip"
            @click="handleQuickAction(btn.prompt)"
          >
            {{ btn.label }}
          </button>
        </div>
      </div>
      <div v-else-if="chatStore.suggestionDismissed && suggestionInfo" class="reopen-wrap">
        <button class="chip tip-reopen-btn" @click="chatStore.suggestionDismissed = false">💡 查看处理建议</button>
      </div>

      <!-- 消息记录区域 -->
      <div ref="transcriptRef" class="chat-transcript" role="log" aria-live="polite">
        <div v-if="chatStore.messages.length === 0" class="chat-empty">
          <p>你可以直接向 AI 发问，或在左侧点击任一景点的<strong>【选中此站】</strong>进行精准微调。</p>
        </div>
        <div
          v-for="(msg, i) in chatStore.messages"
          :key="i"
          class="chat-message"
          :class="`chat-message-${msg.role}`"
        >
          <div class="chat-message-role">{{ msg.role === 'user' ? '你' : 'Java 智能助手' }}</div>
          <div
            v-if="msg.role === 'user'"
            class="chat-message-content"
          >
            {{ msg.content }}
          </div>
          <div
            v-else
            class="chat-message-content"
            v-html="msg.pending ? renderMarkdownStreaming(msg.content) : renderMarkdownStatic(msg.content)"
          />
        </div>
      </div>

      <!-- Meta 元数据展示 -->
      <div v-if="chatStore.meta" class="chat-meta">
        <span class="chat-meta-pill">模型：{{ chatStore.meta.generation?.provider || 'Java 后端' }}</span>
        <span class="chat-meta-pill">生成：{{ chatStore.meta.generation?.status || '已完成' }}</span>
        <span class="chat-meta-pill">检索：{{ chatStore.meta.retrieval?.status || '已核验' }}</span>
        <span v-if="chatStore.meta.retrieval?.reason" class="chat-meta-reason">{{ chatStore.meta.retrieval.reason }}</span>
      </div>

      <!-- Planner Proposal 提案卡片 -->
      <div v-if="chatStore.activeProposal" class="chat-proposal" :class="{ 'proposal-infeasible': chatStore.activeProposal.feasible === false }">
        <div class="chat-proposal-head">
          <div>
            <strong>{{ chatStore.activeProposal.feasible !== false ? '📋 待确认的行程调整方案' : '⚠️ 调整方案存在硬约束冲突（不可行）' }}</strong>
            <span class="proposal-id-tag">ID: {{ chatStore.activeProposal.proposalId }}</span>
          </div>
          <span class="chip" :class="chatStore.activeProposal.feasible !== false ? 'chip-success' : 'chip-danger'">
            {{ chatStore.activeProposal.feasible !== false ? '局部微调方案' : '不可直接应用' }}
          </span>
        </div>
        <p class="proposal-message">{{ chatStore.activeProposal.message || '悠悠已为您生成调整预览。' }}</p>

        <!-- 候选列表 -->
        <div v-if="chatStore.activeProposal.candidateReplacements?.length" class="candidate-options-group">
          <div class="options-title">请选择心仪的替换候选（默认选中方案 1）：</div>
          <div class="candidate-options-list">
            <label
              v-for="(cand, idx) in chatStore.activeProposal.candidateReplacements"
              :key="cand.optionId || idx"
              class="candidate-option-card"
              :class="{ selected: chatStore.selectedOptionId === (cand.optionId || `option-${idx + 1}`) }"
              @click="chatStore.selectedOptionId = cand.optionId || `option-${idx + 1}`"
            >
              <div class="option-card-head">
                <input
                  type="radio"
                  name="proposal-option"
                  :value="cand.optionId || `option-${idx + 1}`"
                  :checked="chatStore.selectedOptionId === (cand.optionId || `option-${idx + 1}`)"
                />
                <strong>方案 {{ idx + 1 }}：{{ cand.name }}</strong>
                <span class="chip">{{ cand.district || '渝中区' }} · 步行{{ cand.walkDifficulty || '低' }}</span>
              </div>
              <p class="option-summary">{{ cand.summary }}</p>
            </label>
          </div>
        </div>

        <div class="chat-proposal-actions">
          <button
            v-if="chatStore.activeProposal.feasible !== false"
            class="primary mini-btn"
            type="button"
            :disabled="chatStore.loading"
            @click="chatStore.applyProposal()"
          >
            确认应用方案并生成新版
          </button>
          <button class="ghost mini-btn" type="button" @click="chatStore.dismissProposal()">
            暂不修改
          </button>
        </div>
      </div>

      <!-- Chat Proposal 提案卡片 -->
      <div v-else-if="chatStore.chatProposal" class="chat-proposal">
        <div class="chat-proposal-head">
          <strong>待确认的行程修改</strong>
          <span class="chip">建议方案</span>
        </div>
        <p>{{ chatStore.chatProposal.summary || chatStore.chatProposal.message }}</p>
        <div class="chat-proposal-actions">
          <button class="primary mini-btn" @click="chatStore.confirmChatProposal(true)">确认并生成新版本</button>
          <button class="ghost mini-btn" @click="chatStore.confirmChatProposal(false)">暂不修改</button>
        </div>
      </div>

      <!-- 快捷微调指令 -->
      <div class="quick-chips-mount">
        <div class="chip-row">
          <button class="chip" @click="handleQuickAction('少走点路，多点室内景点')">🏛️ 少走路多室内</button>
          <button class="chip" @click="handleQuickAction('晚上看江景，推荐去哪里？')">🌃 晚上江景推荐</button>
          <button class="chip" @click="handleQuickAction('这几天重庆天气如何？')">🌤️ 重庆天气查询</button>
          <button class="chip" @click="handleQuickAction('带父母有什么推荐的美食？')">🍲 父母友好美食</button>
        </div>
      </div>

      <!-- 输入栏 -->
      <form class="chat-input-row" @submit.prevent="chatStore.sendMessage()">
        <input
          v-model="chatStore.input"
          type="text"
          placeholder="问问出行建议、微调站点或寻找地道美食…"
          :disabled="chatStore.loading"
          autocomplete="off"
        />
        <button type="submit" class="primary" :disabled="chatStore.loading">
          {{ chatStore.loading ? '发送中…' : '发送' }}
        </button>
      </form>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue';
import { useChatStore } from '@/app/stores/chat';
import { useTripStore } from '@/app/stores/trip';
import { renderMarkdownStatic, renderMarkdownStreaming } from '@/shared/lib/markdown';

const chatStore = useChatStore();
const tripStore = useTripStore();
const transcriptRef = ref<HTMLElement | null>(null);

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick();
    if (transcriptRef.value) {
      transcriptRef.value.scrollTop = transcriptRef.value.scrollHeight;
    }
  }
);

function handleQuickAction(prompt: string) {
  chatStore.input = prompt;
  chatStore.sendMessage();
}

const bannerInfo = computed(() => {
  if (chatStore.activeProposal) {
    const isFeasible = chatStore.activeProposal.feasible !== false;
    return {
      class: isFeasible ? 'mode-proposal-banner' : 'mode-conflict-banner',
      title: isFeasible ? '📋 待确认的行程调整方案' : '⚠️ 调整方案存在硬约束冲突',
      tag: `ID: ${chatStore.activeProposal.proposalId || ''}`,
      tip: isFeasible ? '请在下方核对方案并确认应用，生成新版本' : '请查看替代建议或选择其他景点'
    };
  }
  if (tripStore.selectedStopId) {
    const stop = tripStore.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === tripStore.selectedStopId);
    return {
      class: 'mode-replace-banner',
      title: `🎯 景点替换模式：【${stop?.name || '选中站点'}】`,
      tag: '',
      tip: '点击快捷指令或直接输入“换个同片区景点”即可生成备选'
    };
  }
  return null;
});

const suggestionInfo = computed(() => {
  if (tripStore.selectedStopId) {
    const stop = tripStore.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === tripStore.selectedStopId);
    const name = stop?.name || '当前站点';
    return {
      class: 'suggestion-replace',
      title: `🎯 已选中【${name}】`,
      desc: '您可以要求 AI 替换此景点、缩短停留时间或更改前后路线。',
      buttons: [
        { label: '🔄 换同片区景点', prompt: `把【${name}】替换为同片区其他景点` },
        { label: '🏛️ 换室内景点', prompt: `把【${name}】换成室内景点` }
      ]
    };
  }
  return null;
});
</script>

<style scoped>
.chat-panel {
  margin-top: 24px;
}

.chat-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.chat-subtitle {
  font-size: 12px;
  color: var(--muted);
}

.chat-mode-select-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chat-mode-label {
  font-size: 12px;
  color: var(--ink-secondary);
}
.chat-mode-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--surface);
}

.chat-transcript {
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 14px 0;
  padding: 12px;
  background: var(--surface-tint);
  border-radius: var(--radius);
  border: 1px solid var(--border-subtle);
}

.chat-empty {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  padding: 30px 0;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 88%;
}

.chat-message-user {
  align-self: flex-end;
}
.chat-message-user .chat-message-content {
  background: linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%);
  color: white;
  border-radius: 14px 14px 2px 14px;
}

.chat-message-assistant {
  align-self: flex-start;
}
.chat-message-assistant .chat-message-content {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink);
  border-radius: 14px 14px 14px 2px;
}

.chat-message-role {
  font-size: 11px;
  color: var(--muted);
}
.chat-message-user .chat-message-role {
  text-align: right;
}

.chat-message-content {
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.6;
}

.chat-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  margin-bottom: 12px;
}
.chat-meta-pill {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  color: var(--ink-secondary);
}
.chat-meta-reason {
  color: var(--muted);
}

.chat-proposal {
  background: var(--surface);
  border: 1px solid #bfdbfe;
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 14px;
}
.proposal-infeasible {
  border-color: var(--red-border);
  background: var(--red-subtle);
}

.chat-proposal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.proposal-id-tag {
  font-size: 11px;
  color: var(--muted);
  margin-left: 6px;
}

.candidate-options-group {
  margin: 12px 0;
}
.options-title {
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 8px;
}
.candidate-options-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}
.candidate-option-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.15s ease;
}
.candidate-option-card.selected {
  border-color: var(--blue);
  background: #eff6ff;
}

.chat-proposal-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.chat-input-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.chat-input-row input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  background: var(--surface);
}

.mode-badge-banner {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
  font-size: 12.5px;
}
.mode-proposal-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}
.mode-conflict-banner {
  background: var(--red-subtle);
  border: 1px solid var(--red-border);
  color: var(--red-deep);
}
.mode-replace-banner {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.suggestion-callout {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
  background: var(--surface-tint);
  border: 1px solid var(--border);
}
.suggestion-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12.5px;
}
.suggestion-desc {
  font-size: 12px;
  color: var(--ink-secondary);
  margin: 0 0 8px;
}
.suggestion-actions {
  display: flex;
  gap: 6px;
}
</style>
