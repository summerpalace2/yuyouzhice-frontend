import { groupTravelMemories, memoryGroupHtml } from '../features/trip-memory/memory-groups.js';
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
      <div class="profile-stat-card"><div class="stat-name">已存方案</div><div class="stat-val">${trips.length}</div><div class="stat-sub">份已保存行程</div></div>
      <div class="profile-stat-card"><div class="stat-name">偏好参考</div><div class="stat-val" data-profile-prompt-status>${memoryEnabled ? '已启用' : '未开启'}</div><div class="stat-sub">用于规划与聊天</div></div>
      <div class="profile-stat-card"><div class="stat-name">近期记忆</div><div class="stat-val" data-profile-memory-count>${groupTravelMemories(memories).length}</div><div class="stat-sub">类偏好 · ${memories.length} 条近期来源</div></div>
      <div class="profile-stat-card"><div class="stat-name">变更记录</div><div class="stat-val">${history.length}</div><div class="stat-sub">次偏好调整</div></div>
    </div>
  `;
}

function prependPromptPanelHtml() {
  const memoryEnabled = state.profile?.memoryEnabled === true;
  const rawPrompt = state.profile?.profilePrependPrompt || '';
  const promptText = rawPrompt.trim()
    ? rawPrompt
    : '【用户专属旅行偏好画像】暂无特殊偏好，按常规经典游玩。';
  const manualText = state.profile?.userCustomizedPrompt || '';
  const legacyText = state.profile?.legacyUserCustomizedPrompt || '';

  return `
    <section class="panel panel-pad prepend-prompt-panel">
      <div class="prepend-prompt-head">
        <div>
          <div class="panel-title">我的旅行偏好摘要</div>
        </div>
        <span class="prepend-prompt-status-badge ${memoryEnabled ? 'is-active' : ''}">
          ${memoryEnabled ? '● 已启用偏好参考' : '○ 已暂停偏好参考'}
        </span>
      </div>
      <p class="muted" style="font-size:13px;margin:6px 0 14px;line-height:1.55;">
        这里整理了你已确认的旅行习惯。开启后，悠悠会在规划和聊天时参考；有新要求时，仍以本次输入为准。你也可以单独补充备注。
      </p>

      <div class="prepend-prompt-editor-card">
        <div class="prepend-prompt-editor-top">
          <div class="editor-label-row">
            <span class="editor-icon">✨</span>
            <strong>当前偏好摘要</strong>
          </div>
          <span class="prepend-prompt-counter"><span id="prepend-prompt-count">${manualText.length}</span> 字备注</span>
        </div>

        <textarea class="prepend-prompt-textarea" rows="6" readonly aria-label="当前生效的旅行偏好画像">${escapeHtml(promptText)}</textarea>
        <label for="prepend-prompt-editor">手动备注（单独保存）</label>
        <textarea id="prepend-prompt-editor" class="prepend-prompt-textarea" rows="3" placeholder="只填写你的补充要求，例如酒店希望安静；自动偏好请在旅行习惯列表中编辑。">${escapeHtml(manualText)}</textarea>
        ${state.profile?.manualPromptNeedsReview && legacyText ? `<details><summary>旧版提示词需要确认备注</summary><p>旧整稿混合了自动偏好与手动内容，已保留原文。请将仍需保留的手动要求复制到备注区保存；旧整稿不再自动参与规划。</p><pre>${escapeHtml(legacyText)}</pre></details>` : ''}

        <div class="prepend-prompt-footer">
          <div class="prepend-prompt-tip-text">
            <span>💡 自动画像来自旅行习惯列表；手动备注独立保存，可留空清除。重新提炼会刷新自动画像并保留备注。</span>
          </div>
          <div class="prepend-prompt-btn-group">
            <button type="button" class="ghost mini-btn" data-action="resynthesize-prepend-prompt" title="基于近期记忆刷新画像，保留手动备注">🔄 重新提炼</button>
            <button type="button" class="primary mini-btn" data-action="save-prepend-prompt">💾 保存手动备注</button>
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
  const groups = groupTravelMemories(memories);
  const visibleGroups = isExpanded ? groups : groups.slice(0, 3);
  const hiddenCount = groups.length - visibleGroups.length;

  return `
    <section class="panel panel-pad memory-profile-panel">
      <div class="memory-profile-head">
        <div>
          <div class="panel-title">已记住的旅行习惯</div>
        </div>
        <button class="memory-switch ${memoryEnabled ? 'is-on' : ''}" data-action="toggle-travel-memory" aria-pressed="${memoryEnabled}" aria-label="${memoryEnabled ? '关闭长期旅行记忆' : '开启长期旅行记忆'}"><i></i>${memoryEnabled ? '已启用' : '未启用'}</button>
      </div>
      <p class="muted memory-profile-copy">${memoryEnabled ? '💡 同类偏好集中展示，同义项合并；最近 7 天的确认原文作为来源保留，展开后可单独编辑或删除。' : '开启后，悠悠会将你的旅行表达提炼为记忆，并在左侧实时合成前置规划提示词。'}</p>
      ${memoryEnabled ? '' : '<div class="memory-enable-cta"><div><strong>让悠悠逐渐了解你的旅行习惯</strong><span>只记录你确认的内容；可随时编辑、删除或关闭。</span></div><button class="primary memory-enable-btn" data-action="enable-travel-memory">开启长期记忆</button></div>'}
      <div class="memory-review-status">
        <span>智能感知：实时提取旅行偏好，互斥冲突项以最新记忆为准自动替换</span>
        <time>7天自动归档淘汰</time>
      </div>
      <div class="memory-priority-line"><span>本次明确输入</span><b>›</b><span>偏好摘要</span><b>›</b><span>近期记忆来源</span></div>
      ${memoryCandidates.length ? `<div class="memory-candidate-list"><div class="candidate-list-header"><strong>待你确认的记忆建议</strong><span class="candidate-tip">确认后自动增量融入左侧前置提示词</span></div>${memoryCandidates.map((candidate) => `<article class="memory-candidate-item"><div class="candidate-item-main"><div class="candidate-tags"><span class="travel-memory-category">${escapeHtml(memoryCategoryLabel(candidate.category))}</span><span class="travel-memory-source-badge badge-pending">待确认候选</span></div><b>${escapeHtml(candidate.content)}</b><div class="travel-memory-origin-box"><span class="origin-label">💡 来源提示：</span><span class="origin-text">${candidate.sourceRef ? `历史对话提到“${escapeHtml(candidate.sourceRef)}”` : '由后台智能分析识别'} · 确认后自动增量融入左侧前置提示词。</span></div></div><div class="candidate-item-actions"><button class="ghost mini-btn" data-action="dismiss-profile-memory-candidate" data-id="${escapeHtml(candidate.id)}">忽略</button><button class="primary mini-btn" data-action="confirm-profile-memory-candidate" data-id="${escapeHtml(candidate.id)}">确认记住</button></div></article>`).join('')}</div>` : ''}
      <div class="travel-memory-list">
        ${groups.length ? visibleGroups.map(group => memoryGroupHtml(group, memoryCategoryLabel(group.category))).join('') : '<div class="notice">暂无近期记忆。聊天中说“我不吃辣”或“喜欢老茶馆”，悠悠会提炼并询问是否记住。</div>'}
      </div>

      ${groups.length > 3 ? `
        <div class="memory-expand-row">
          <button type="button" class="ghost mini-btn expand-memories-toggle" data-action="toggle-expand-memories">
            ${isExpanded ? '▴ 收起部分记忆 (仅看最新3类)' : `▾ 展开其余 ${hiddenCount} 类偏好`}
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
          <h1>旅行档案 · ${escapeHtml(state.user.name || '旅行者')}</h1>
          <p>管理已记住的旅行习惯、补充特别要求，回看每次行程的变化。</p>
        </div>
        <button class="secondary" data-action="refresh-profile" ${state.profileLoading ? 'disabled' : ''}>${state.profileLoading ? '刷新中…' : '刷新档案'}</button>
      </div>

      ${profileStatsHtml({ trips, memories, history, memoryEnabled: state.profile.memoryEnabled === true })}

      <div class="profile-layout-grid">
        ${memoryProfilePanelHtml()}
        ${prependPromptPanelHtml()}

        <details class="panel panel-pad profile-versions">
          <summary>行程版本记录</summary>
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
        </details>
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
    element.textContent = String(groupTravelMemories(state.profile.memories || []).length);
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
