import { state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';
import { request } from '../shared/api/client.js';
import { toast } from '../shared/ui/toast.js';
import { isPageDataFresh, markPageDataFresh } from '../app-core/page-cache.js';

const memoryCategoryLabels = {
  PACE: '节奏与体力',
  ACCESSIBILITY: '无障碍需求',
  TRANSPORT: '出行方式',
  DIET: '饮食习惯',
  COMPANION: '同行偏好',
  INTEREST: '旅行兴趣',
  BUDGET: '消费倾向',
  WEATHER: '天气体感',
  TIME: '出行作息',
  STAY: '住宿偏好',
  CUSTOM: '自定义记忆'
};

function memoryCategoryLabel(category) {
  return memoryCategoryLabels[String(category || 'CUSTOM').toUpperCase()] || '自定义记忆';
}

const PRESET_DINING_TAGS = ['老火锅', '烧烤', '江湖菜', '特色小吃', '甜品糖水', '老茶馆', '微辣', '清淡少辣'];
const PRESET_ATTRACTION_TAGS = ['山城夜景', '室内场馆', '魔幻8D', '人文历史', '自然山水', '文创街区', '少爬坡少走路', '江景索道'];

function profileStatsHtml({ trips, memories, history, memoryEnabled = false }) {
  return `
    <div class="profile-stats-grid">
      <div class="profile-stat-card"><div class="stat-name">已存方案</div><div class="stat-val">${trips.length}</div><div class="stat-sub">份持久化行程</div></div>
      <div class="profile-stat-card"><div class="stat-name">前置提示词</div><div class="stat-val" data-profile-prompt-status>${memoryEnabled ? '已启用' : '未开启'}</div><div class="stat-sub">注入AI规划与对话</div></div>
      <div class="profile-stat-card"><div class="stat-name">近期记忆</div><div class="stat-val" data-profile-memory-count>${memories.length}</div><div class="stat-sub">条7天滚动沉淀</div></div>
      <div class="profile-stat-card"><div class="stat-name">变更记录</div><div class="stat-val">${history.length}</div><div class="stat-sub">次偏好调整流水</div></div>
    </div>
  `;
}

function prependPromptPanelHtml() {
  const memoryEnabled = state.profile?.memoryEnabled === true;
  const rawPrompt = state.profile?.profilePrependPrompt || '';
  const promptText = rawPrompt.trim()
    ? rawPrompt
    : '【用户专属旅行偏好画像】暂无特殊偏好，按常规经典游玩。';

  return `
    <section class="panel panel-pad prepend-prompt-panel">
      <div class="prepend-prompt-head">
        <div>
          <span class="memory-kicker">AI PREPEND PLANNING PROMPT</span>
          <div class="panel-title">AI 规划前置提示词</div>
        </div>
        <span class="prepend-prompt-status-badge ${memoryEnabled ? 'is-active' : ''}">
          ${memoryEnabled ? '● 规划注入已启用' : '○ 规划注入已暂停'}
        </span>
      </div>
      <p class="muted" style="font-size:13px;margin:6px 0 14px;line-height:1.55;">
        由右侧近期旅行记忆智能萃取整合。开启后，该画像<b>直接作为后续 AI 行程规划与对话引擎的高优系统前置提示词（Prepend Context）</b>。支持自由修改；右侧新增记忆时会自动增量微调同步，并持久保留你的专属定制内容。
      </p>

      <div class="prepend-prompt-editor-card">
        <div class="prepend-prompt-editor-top">
          <div class="editor-label-row">
            <span class="editor-icon">✨</span>
            <strong>旅行偏好画像（AI 规划直接输入）</strong>
          </div>
          <span class="prepend-prompt-counter"><span id="prepend-prompt-count">${promptText.length}</span> 字</span>
        </div>

        <textarea id="prepend-prompt-editor" class="prepend-prompt-textarea" rows="6" placeholder="点击编辑专属旅行前置提示词，例如：【用户专属旅行偏好画像】偏好老火锅与老茶馆；喜欢山城夜景；节奏从容，少爬坡少走台阶…">${escapeHtml(promptText)}</textarea>

        <div class="prepend-prompt-footer">
          <div class="prepend-prompt-tip-text">
            <span>💡 提示：手动修改后点击保存；右侧新增记忆时会自动增量融合并覆盖旧冲突，且不会冲掉你手动添加的备注。</span>
          </div>
          <div class="prepend-prompt-btn-group">
            <button type="button" class="ghost mini-btn" data-action="resynthesize-prepend-prompt" title="丢弃当前定制，基于右侧全部近期记忆重新提炼">🔄 重新提炼</button>
            <button type="button" class="primary mini-btn" data-action="save-prepend-prompt">💾 保存提示词修改</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function memoryProfilePanelHtml() {
  const memories = state.profile?.memories || [];
  const memoryCandidates = state.profile?.memoryCandidates || [];
  const memoryEnabled = state.profile?.memoryEnabled === true;
  const isExpanded = state.memoriesExpanded === true;
  const visibleMemories = isExpanded ? memories : memories.slice(0, 3);
  const hiddenCount = memories.length - visibleMemories.length;

  return `
    <section class="panel panel-pad memory-profile-panel">
      <div class="memory-profile-head">
        <div>
          <span class="memory-kicker">LONG-TERM MEMORY (7-DAY STREAM)</span>
          <div class="panel-title">我的近期旅行记忆 (7天滚动流)</div>
        </div>
        <button class="memory-switch ${memoryEnabled ? 'is-on' : ''}" data-action="toggle-travel-memory" aria-pressed="${memoryEnabled}" aria-label="${memoryEnabled ? '关闭长期旅行记忆' : '开启长期旅行记忆'}"><i></i>${memoryEnabled ? '已启用' : '未启用'}</button>
      </div>
      <p class="muted memory-profile-copy">${memoryEnabled ? '💡 记忆记录保留 7 天作为溯源证据，期满自动归档淘汰；左侧整合生成的前置提示词永久有效且持续注入 AI 规划。' : '开启后，悠悠会将你的旅行表达提炼为记忆，并在左侧实时合成前置规划提示词。'}</p>
      ${memoryEnabled ? '' : '<div class="memory-enable-cta"><div><strong>让悠悠逐渐了解你的旅行习惯</strong><span>只记录你确认的内容；可随时编辑、删除或关闭。</span></div><button class="primary memory-enable-btn" data-action="enable-travel-memory">开启长期记忆</button></div>'}
      <div class="memory-review-status">
        <span>智能感知：实时提取旅行偏好，互斥冲突项以最新记忆为准自动替换</span>
        <time>7天自动归档淘汰</time>
      </div>
      <div class="memory-priority-line"><span>本次明确输入</span><b>›</b><span>左侧前置提示词画像</span><b>›</b><span>右侧近期记忆溯源</span></div>
      ${memoryCandidates.length ? `<div class="memory-candidate-list"><div class="candidate-list-header"><strong>待你确认的记忆建议</strong><span class="candidate-tip">确认后自动增量融入左侧前置提示词</span></div>${memoryCandidates.map((candidate) => `<article class="memory-candidate-item"><div class="candidate-item-main"><div class="candidate-tags"><span class="travel-memory-category">${escapeHtml(memoryCategoryLabel(candidate.category))}</span><span class="travel-memory-source-badge badge-pending">待确认候选</span></div><b>${escapeHtml(candidate.content)}</b><div class="travel-memory-origin-box"><span class="origin-label">💡 来源提示：</span><span class="origin-text">${candidate.sourceRef ? `历史对话提到“${escapeHtml(candidate.sourceRef)}”` : '由后台智能分析识别'} · 确认后自动增量融入左侧前置提示词。</span></div></div><div class="candidate-item-actions"><button class="ghost mini-btn" data-action="dismiss-profile-memory-candidate" data-id="${escapeHtml(candidate.id)}">忽略</button><button class="primary mini-btn" data-action="confirm-profile-memory-candidate" data-id="${escapeHtml(candidate.id)}">确认记住</button></div></article>`).join('')}</div>` : ''}
      <div class="travel-memory-list">
        ${memories.length ? visibleMemories.map((memory) => {
          const isManual = memory.sourceType === 'USER_EDIT';
          const originText = memory.sourceRef
            ? `源自对话表达“${escapeHtml(memory.sourceRef)}”，经你确认生效。`
            : (isManual ? '由你在个人档案手动添加录入。' : '历史对话中识别表达，经你确认生效。');
          return `
          <article class="travel-memory-item" data-travel-memory-id="${escapeHtml(memory.id)}">
            <div class="travel-memory-body">
              <div class="travel-memory-header-row">
                <span class="travel-memory-category">${escapeHtml(memoryCategoryLabel(memory.category))}</span>
                <span class="travel-memory-source-badge ${isManual ? 'badge-manual' : 'badge-chat'}">
                  ${isManual ? '✍️ 手动档案录入' : '💬 对话提取并确认'}
                </span>
                <span class="travel-memory-ttl-badge">7天有效</span>
              </div>
              <strong class="travel-memory-content">${escapeHtml(memory.content)}</strong>
              <div class="travel-memory-origin-box">
                <span class="origin-label">💡 偏好溯源与影响：</span>
                <span class="origin-text">${originText} 已增量融入左侧前置提示词。</span>
              </div>
              <small class="travel-memory-date">更新于 ${new Date(memory.updatedAt || memory.updated_at || memory.createdAt || memory.created_at || Date.now()).toLocaleDateString('zh-CN')}</small>
            </div>
            <div class="travel-memory-actions">
              <button class="ghost mini-btn" data-action="edit-travel-memory" data-id="${escapeHtml(memory.id)}" data-content="${escapeHtml(memory.content)}" data-category="${escapeHtml(memory.category || 'CUSTOM')}">编辑</button>
              <button class="ghost mini-btn" data-action="delete-travel-memory" data-id="${escapeHtml(memory.id)}">删除</button>
            </div>
          </article>
          `;
        }).join('') : '<div class="notice">暂无近期记忆。聊天中说“我不吃辣”或“喜欢老茶馆”，悠悠会提炼并询问是否记住。</div>'}
      </div>

      ${memories.length > 3 ? `
        <div class="memory-expand-row">
          <button type="button" class="ghost mini-btn expand-memories-toggle" data-action="toggle-expand-memories">
            ${isExpanded ? '▴ 收起部分记忆 (仅看最新3条)' : `▾ 展开其余 ${hiddenCount} 条近期记忆`}
          </button>
        </div>
      ` : ''}

      <div class="add-pref-inline memory-add-row">
        <input id="new-memory-input" placeholder="添加近期旅行记忆，例如：喜欢老茶馆、不吃香菜…" />
        <button class="primary" data-action="add-travel-memory">添加记忆</button>
      </div>
    </section>
  `;
}

export function profileView() {
  if (!state.user) {
    return `
      <main class="page shell">
        <div class="panel trip-empty">
          <div>
            <div class="empty-symbol">档</div>
            <h2>登录后查看旅行档案</h2>
            <p class="muted">沉淀您的专属旅行偏好与行程演变历程。</p>
            <button class="primary" data-action="login">登录查看</button>
          </div>
        </div>
      </main>
    `;
  }

  if (!state.profile) {
    if (state.profileLoadError) {
      return `<main class="page shell"><div class="panel trip-empty"><div><div class="empty-symbol">!</div><h2>旅行档案暂时无法读取</h2><p class="muted">${escapeHtml(state.profileLoadError)}</p><button class="primary" data-action="refresh-profile" ${state.profileLoading ? 'disabled' : ''}>${state.profileLoading ? '重新读取中…' : '重新读取档案'}</button></div></div></main>`;
    }
    return `<main class="page shell"><div class="panel trip-empty"><p>${state.profileLoading ? '正在读取旅行档案……' : '准备读取旅行档案……'}</p></div></main>`;
  }

  const memories = state.profile.memories || [];
  const history = state.profile.preferenceHistory || [];
  const trips = state.profile.trips || [];

  return `
    <main class="page shell">
      <div class="section-title">
        <div>
          <div class="eyebrow">旅行者专属画像与资产</div>
          <h2>旅行档案 · ${escapeHtml(state.user.name || '旅行者')}</h2>
          <p>直观管理您的长期出行偏好、足迹资产与规划演化历程。</p>
        </div>
        <button class="secondary" data-action="refresh-profile" ${state.profileLoading ? 'disabled' : ''}>${state.profileLoading ? '刷新中…' : '刷新档案'}</button>
      </div>

      ${profileStatsHtml({ trips, memories, history, memoryEnabled: state.profile.memoryEnabled === true })}

      <div class="profile-layout-grid">
        ${prependPromptPanelHtml()}
        ${memoryProfilePanelHtml()}

        <section class="panel panel-pad">
          <div class="panel-title">行程版本演进与对比</div>
          <p class="muted" style="font-size:12px;margin:4px 0 12px;">记录初始规划、局部重规划与微调的历史轨迹。</p>
          <div class="timeline-container">
            ${trips.length ? trips.map((trip) => `
              <div class="timeline-item">
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                  <strong>${escapeHtml(trip.title)} (第 ${trip.version} 版)</strong>
                  <span class="timeline-time">${new Date(trip.savedAt).toLocaleString('zh-CN')}</span>
                  <div class="version-badges-row">
                    ${(trip.versionHistory || [{ version: trip.version, label: '保存版本' }]).map((vh) => `
                      <span class="v-badge">V${vh.version} ${escapeHtml(vh.label || '')}${vh.reason ? ` · ${escapeHtml(vh.reason)}` : ''}</span>
                    `).join('')}
                  </div>
                </div>
              </div>
            `).join('') : '<div class="notice">暂无已保存行程版本。</div>'}
          </div>
        </section>
      </div>
    </main>
  `;
}

export async function loadProfile(renderViewCallback, { force = false } = {}) {
  if (!state.user) return;
  if (!force && state.profile && isPageDataFresh('profile')) return state.profile;
  if (state.profileLoading) return state.profile;
  state.profileLoading = true;
  state.profileLoadError = '';
  if (state.view === 'profile' && renderViewCallback) renderViewCallback();
  try {
    state.profile = await request('/api/profile', { timeoutMs: 15000 });
    markPageDataFresh('profile');
    return state.profile;
  } catch (error) {
    state.profileLoadError = error?.message || '无法读取旅行档案，请稍后重试。';
    toast(error.message);
  } finally {
    state.profileLoading = false;
    if (state.view === 'profile' && renderViewCallback) renderViewCallback();
  }
}

export function refreshProfileInDOM() {
  if (state.view !== 'profile') return false;
  const mount = document.getElementById('view-mount');
  if (!mount) return false;
  const scrollY = window.scrollY;
  mount.innerHTML = profileView();
  window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
  return true;
}

export function refreshProfileMemoryInDOM() {
  if (state.view !== 'profile' || !state.profile) return false;
  const panel = document.querySelector('.memory-profile-panel');
  if (!panel) return false;
  panel.outerHTML = memoryProfilePanelHtml();
  document.querySelectorAll('[data-profile-memory-count]').forEach((element) => {
    element.textContent = String((state.profile.memories || []).length);
  });
  return true;
}

export function refreshProfilePrependPromptInDOM() {
  if (state.view !== 'profile' || !state.profile) return false;
  const panel = document.querySelector('.prepend-prompt-panel');
  if (!panel) return false;
  panel.outerHTML = prependPromptPanelHtml();
  document.querySelectorAll('[data-profile-prompt-status]').forEach((element) => {
    element.textContent = state.profile.memoryEnabled === true ? '已启用' : '未开启';
  });
  return true;
}

export const refreshProfileSlotsInDOM = refreshProfilePrependPromptInDOM;
export const preferenceSlotsPanelHtml = prependPromptPanelHtml;

export async function rememberPreference(renderModalsCallback) {
  if (!state.user) return;
  try {
    await request('/api/preferences', { method: 'POST', body: JSON.stringify({ value: state.reason }) });
    state.memoryProposal = null;
    if (renderModalsCallback) renderModalsCallback();
    toast(`已记住“${state.reason}”偏好。`);
  } catch (error) {
    toast(error.message);
  }
}
