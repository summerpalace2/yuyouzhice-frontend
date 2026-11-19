import { changeDestination } from './workspace-layout.js';
import { proposalUnavailable } from './proposal-availability.js';
import { chatModeGuideHtml } from './chat-mode-guide.js';
import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';
import { renderMarkdownStatic, renderMarkdownStreaming } from '../../shared/lib/markdown.js';
import { deduplicateSuggestions } from './chat-service.js';

function sanitizeAssistantText(text) {
  if (!text) return '';
  return text
    .replace(/（?规划会话\s*session-[a-zA-Z0-9_-]+[，,]?\s*/gi, '')
    .replace(/规划会话[=：:]\s*session-[a-zA-Z0-9_-]+/gi, '当前行程草稿')
    .replace(/session-[a-zA-Z0-9_-]+/gi, '当前会话')
    .replace(/正式保存行程\s*[=：:]\s*未提供[）)]?/gi, '尚未保存为正式行程')
    .replace(/正式保存行程\s*[=：:]\s*trip-[a-zA-Z0-9_-]+/gi, '已关联正式行程');
}

const AGENT_TOOL_LABELS = Object.freeze({
  query_weather_forecast: '实时天气',
  search_poi_and_dining: '地点候选检索',
  calculate_route_matrix: '路线耗时核算',
  search_travel_knowledge: '知识库核验',
  get_current_trip_draft: '读取当前行程',
  preview_trip_adjustment: '沙箱预演调整',
  confirm_apply_trip_adjustment: '行程变更确认',
  get_user_preferences: '读取个人偏好',
  confirm_update_user_preferences: '偏好更新确认',
  create_trip_plan: '新建行程草案',
  confirm_update_pinned_stops: '固定站点确认',
  confirm_save_formal_trip: '保存正式行程确认'
});

function resolveAgentToolLabel(item) {
  if (item?.toolLabel) return String(item.toolLabel);
  if (item?.toolName === 'search_poi_and_dining') {
    const category = String(item.category || '').toUpperCase();
    const summary = String(item.summary || '');
    if (category === 'SCENIC' || /景点/.test(summary)) return '景点候选检索';
    if (category === 'DINING' || /餐饮|美食/.test(summary)) return '餐饮美食检索';
    return '地点候选检索';
  }
  return AGENT_TOOL_LABELS[item?.toolName] || item?.toolName || '工具调用';
}

function renderAgentTraceHtml(message) {
  const steps = Array.isArray(message?.agentSteps) ? message.agentSteps : [];
  const tools = Array.isArray(message?.toolResults) ? message.toolResults : [];
  if (!steps.length && !tools.length) return '';
  const rounds = steps.length ? Math.max(1, steps[steps.length - 1]?.step || 1) : 1;
  const pills = tools.map((item) => {
    const label = resolveAgentToolLabel(item);
    const cls = item.ok ? 'is-ok' : 'is-fail';
    const icon = item.ok ? '✓' : '!';
    return `<span class="agent-tool-pill ${cls}" title="${escapeHtml(item.summary || '')}"><i>${icon}</i> <b>${escapeHtml(label)}</b>${item.summary ? ` · ${escapeHtml(item.summary)}` : ''}</span>`;
  }).join('');
  if (!pills) {
    return `
      <div class="agent-trace" aria-label="智能体执行轨迹">
        <div class="agent-trace-head">🤖 智能体推理 · 第 ${rounds} 轮</div>
      </div>
    `;
  }
  return `
    <details class="agent-trace agent-trace-details" ${message.pending ? 'open' : ''} aria-label="智能体执行轨迹">
      <summary class="agent-trace-head">🤖 智能体已调用 ${tools.length} 项工具 · 共 ${rounds} 轮 <span class="agent-trace-toggle">${message.pending ? '执行中' : '展开/收起'}</span></summary>
      <div class="agent-tool-pills">${pills}</div>
    </details>
  `;
}

function renderAgentCitationsHtml(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return '';
  const labels = citations.slice(0, 4).map((c) => {
    const title = typeof c === 'string' ? c : (c?.title || c?.source || c?.docTitle || '官方知识条目');
    return `<span class="agent-citation-chip">📚 ${escapeHtml(String(title))}</span>`;
  }).join('');
  return `<div class="agent-citations" aria-label="核验参考来源">${labels}</div>`;
}

function renderAgentConfirmCardHtml(confirmReq, messageIndex) {
  if (!confirmReq || !confirmReq.confirmId) return '';
  const isPending = confirmReq.status === 'pending';
  const isApproved = confirmReq.status === 'approved';
  const isCancelled = confirmReq.status === 'cancelled';
  const isExpired = confirmReq.status === 'expired';
  const isTripTool = confirmReq.toolName === 'confirm_apply_trip_adjustment';
  const badgeMap = {
    confirm_apply_trip_adjustment: '行程变更确认',
    confirm_update_pinned_stops: '站点固定确认',
    confirm_save_formal_trip: '正式保存确认',
    confirm_update_user_preferences: '个人偏好更新确认'
  };
  const badgeText = badgeMap[confirmReq.toolName] || '敏感操作确认';
  const args = confirmReq.args && typeof confirmReq.args === 'object' ? confirmReq.args : {};
  const details = [];

  if (args.optionId) details.push(`方案选项：${args.optionId}`);
  if (args.baseRevision !== undefined && args.baseRevision !== null) details.push(`基准版本：v${args.baseRevision}`);
  if (args.walkingTolerance) details.push(`步行强度：${args.walkingTolerance}`);
  if (args.transportPreference) details.push(`交通偏好：${args.transportPreference}`);
  if (args.stayArea) details.push(`住宿片区：${args.stayArea}`);
  const dayPreviewHtml = Array.isArray(args.days) && args.days.length
    ? `<div class="agent-confirm-days-preview">${args.days.slice(0, 5).map((d) => {
        const stops = Array.isArray(d.stops) ? d.stops.map((s) => s?.name).filter(Boolean).join(' → ') : '';
        return `<div><b>第${escapeHtml(String(d.day || ''))}天${d.theme ? ` · ${escapeHtml(d.theme)}` : ''}</b>：${escapeHtml(stops || '自由安排')}</div>`;
      }).join('')}</div>`
    : '';

  // 差异来自后端保存的提案，逐项展示旧值和新值，所有动态内容统一转义。
  const fieldLabels = { time: '时段', startTime: '开始时间', duration: '停留时长', name: '地点',
    date: '日期', theme: '主题', title: '标题', summary: '说明', recommendationReason: '推荐理由',
    routePreference: '交通偏好', position: '位置' };
  const formatValue = value => {
    if (value == null) return '未设置';
    if (value.day != null && Number.isInteger(value.index)) return `第 ${value.day} 天 · 第 ${value.index + 1} 站`;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  const changesHtml = Array.isArray(args.stopChanges) && args.stopChanges.length
    ? `<ul class="agent-confirm-changes">${args.stopChanges.map(change => {
        const action = { ADDED: '新增', REMOVED: '移除', MOVED: '移动', UPDATED: '更新' }[change.action] || '更新';
        const deltas = Object.entries(change.fields || {});
        const fields = deltas.map(([field, delta]) => {
          const label = escapeHtml(fieldLabels[field] || field);
          const before = escapeHtml(formatValue(delta?.before));
          const after = escapeHtml(formatValue(delta?.after));
          return `<dl class="agent-confirm-field" aria-label="${label}：${before} → ${after}">
            <dt>${label}</dt><dd><small>原安排</small>${before}</dd><dd><small>建议安排</small>${after}</dd>
          </dl>`;
        }).join('');
        return `<li><strong>${escapeHtml(action)} ${escapeHtml(change.stopName || '')}</strong>${fields}</li>`;
      }).join('')}</ul>` : '';

  const destination = changeDestination(confirmReq, state);
  const statusTag = isApproved
    ? '<span class="agent-confirm-status is-approved">✓ 已确认执行</span>'
    : (isCancelled
      ? '<span class="agent-confirm-status is-cancelled">✕ 已取消</span>'
      : (isExpired ? '<span class="agent-confirm-status is-expired">⚠ 已失效/需重发</span>' : ''));

  return `
    <section class="agent-confirm-card ${isPending ? 'is-pending' : 'is-settled'}" role="region" aria-label="${escapeHtml(badgeText)}">
      <div class="agent-confirm-head">
        <span class="agent-confirm-badge">${escapeHtml(badgeText)}</span>
        ${statusTag}
      </div>
      <p class="agent-confirm-summary">${escapeHtml(confirmReq.summary || '请确认是否执行此变更操作。')}</p>
      ${changesHtml}
      ${dayPreviewHtml}
      ${details.length ? `<div class="agent-confirm-meta">${details.map((d) => `<span>${escapeHtml(d)}</span>`).join('')}</div>` : ''}
      ${confirmReq.error ? `<div class="agent-confirm-error">${escapeHtml(confirmReq.error)}</div>` : ''}
      ${destination ? `<button type="button" class="secondary mini-btn" data-action="view-updated-itinerary" data-id="${escapeHtml(destination.id || '')}" data-day="${escapeHtml(String(destination.day || ''))}">${destination.id ? '查看更新后的站点' : destination.day ? '查看更新后的当天行程' : '查看更新后的行程'}</button>` : ''}
      ${isPending ? `
        <div class="agent-confirm-actions">
          <button type="button" class="primary mini-btn"
                  data-action="agent-confirm-approve"
                  data-confirm-id="${escapeHtml(confirmReq.confirmId)}"
                  data-message-index="${messageIndex}"
                  ${confirmReq.loading ? 'disabled' : ''}>${confirmReq.loading ? '正在执行…' : (isTripTool ? '应用修改' : '确认执行')}</button>
          <button type="button" class="ghost mini-btn"
                  data-action="agent-confirm-cancel"
                  data-confirm-id="${escapeHtml(confirmReq.confirmId)}"
                  data-message-index="${messageIndex}"
                  ${confirmReq.loading ? 'disabled' : ''}>暂不修改</button>
        </div>
      ` : ''}
    </section>
  `;
}

export function chatMessageHtml(message, messageIndex = -1) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const rawContent = String(message.content || '');
  const content = role === 'assistant' ? sanitizeAssistantText(rawContent) : rawContent;
  const errorText = String(message.error || '');
  const plannerSessionError = role === 'assistant'
    && /规划会话(?:不存在|已过期|需要恢复)|无权访问|PLANNER_SESSION_NOT_FOUND/i.test(`${content} ${errorText}`);
  const offerChatMode = Boolean(message.offerChatMode || plannerSessionError);
  // 聊天模式只负责问答；局部调整动作只能由规划模式明确产生，
  // 避免一次普通问答失败就把用户误导到行程修改流程。
  const canOfferAdjustmentMode = Boolean(state.chatMode === 'planner' && state.user && state.view === 'planning' && state.trip);
  const offerAdjustmentMode = canOfferAdjustmentMode && Boolean(message.offerPlannerMode);
  const normalizedContent = content.trim().replace(/\s+/g, ' ');
  const normalizedError = errorText.trim().replace(/\s+/g, ' ');
  const duplicatedError = Boolean(normalizedContent && normalizedError && normalizedContent === normalizedError);
  const errorSummary = duplicatedError
    ? (/登录/.test(errorText) ? '需要登录后才能继续聊天' : '这次回复没有完成，请重试')
    : errorText;
  let bodyHtml;
  if (role === 'user') {
    bodyHtml = escapeHtml(message.content || '').replace(/\n/g, '<br />');
  } else if (message.pending) {
    const progressHtml = message.progress
      ? `<span class="chat-progress" aria-live="polite">${escapeHtml(message.progress)}</span>`
      : '';
    const contentHtml = content
      ? renderMarkdownStreaming(content)
      : '<span class="typing-cursor">正在请求后端模型…</span>';
    bodyHtml = progressHtml + contentHtml;
  } else {
    bodyHtml = renderMarkdownStatic(content);
  }

  const errorClass = message.failureKind === 'temporary' ? ' chat-message-error-soft' : '';
  const errorHtml = message.error ? `
    <div class="chat-message-error${errorClass}" role="alert">
      <span class="chat-error-copy">⚠️ ${escapeHtml(errorSummary)}</span>
      <span class="chat-error-actions">
        ${!state.user && /登录/.test(errorText) ? '<button class="chat-inline-action chat-login-action" type="button" data-action="open-auth-page" data-mode="login">去登录</button>' : ''}
        ${message.retryMessage && !plannerSessionError ? `<button class="chat-inline-action" type="button" data-action="retry-chat" data-message-index="${messageIndex}" data-prompt="${escapeHtml(message.retryMessage)}">重新发送</button>` : ''}
      </span>
    </div>
  ` : '';
  const rawSuggestions = Array.isArray(message.actionableSuggestions) ? message.actionableSuggestions : [];
  const suggestions = deduplicateSuggestions(rawSuggestions);
  const hasMemory = suggestions.some((sug) => sug.action === 'save_memory' || sug.action === 'save_slot_preference');
  const hasAdjust = suggestions.some((sug) => sug.action !== 'save_memory' && sug.action !== 'save_slot_preference');
  const hintText = (hasMemory && hasAdjust)
    ? 'AI 感知到你的出行偏好，可一键执行调整或沉淀档案：'
    : (hasMemory ? 'AI 感知到你的出行偏好，可一键沉淀至个人档案：' : 'AI 为你提供以下快捷行程微调建议：');
  const chipsHtml = (role === 'assistant' && !message.pending && suggestions.length > 0) ? `
    <div class="chat-action-chips-group" role="group" aria-label="快捷行动建议">
      <div class="chat-action-chips-hint">
        <span class="chat-action-chips-icon">✦</span>
        <span>${escapeHtml(hintText)}</span>
      </div>
      <div class="chat-action-chips-list">
        ${suggestions.map((sug) => {
          const isSlotPref = sug.action === 'save_slot_preference';
          const isMemory = sug.action === 'save_memory' || isSlotPref;
          // Old chips were marked applied before saving. Require a real memory receipt.
          const isApplied = Boolean(sug.applied && (!isMemory || (sug.savedMemoryId
            && (!Array.isArray(state.profile?.memories) || state.profile.memories.some(m => m.id === sug.savedMemoryId)))));
          const isSending = Boolean(sug.sending);
          const appliedText = isSlotPref ? '已加入偏好' : (isMemory ? '已沉淀至档案' : '已发起调整');
          return `
          <button class="chat-action-chip ${isMemory ? 'is-memory-chip' : ''} ${isApplied ? 'is-applied' : ''} ${isSending ? 'is-active-loading' : ''}"
                  type="button"
                  ${isApplied || isSending ? 'disabled' : ''}
                  data-action="execute-action-chip"
                  data-chip-action="${escapeHtml(sug.action || '')}"
                  data-chip-payload="${escapeHtml(sug.payload || '')}"
                  data-chip-label="${escapeHtml(sug.label || '')}"
                  title="${escapeHtml(sug.label || '')}">
            <span class="chat-action-chip-icon">${isSending ? '⏳' : isApplied ? '✓' : escapeHtml(sug.icon || '✦')}</span>
            <span class="chat-action-chip-label">${isSending ? '正在提交调整...' : isApplied ? appliedText : escapeHtml(sug.label || '')}</span>
          </button>
        `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const agentTraceHtml = role === 'assistant' ? renderAgentTraceHtml(message) : '';
  const agentCitationsHtml = role === 'assistant' ? renderAgentCitationsHtml(message.citations) : '';
  const agentConfirmHtml = role === 'assistant' ? renderAgentConfirmCardHtml(message.confirmRequest, messageIndex) : '';

  return `
    <div class="chat-message chat-message-${role}">
      <div class="chat-message-role"><span class="chat-role-mark" aria-hidden="true">${role === 'user' ? '你' : '渝'}</span>${role === 'user' ? '你' : '悠悠助手'}</div>
      ${agentTraceHtml}
      <div class="chat-message-content">${bodyHtml}</div>
      ${agentConfirmHtml}
      ${agentCitationsHtml}
      ${chipsHtml}
      ${errorHtml}
    </div>
  `;
}

export function chatMetaHtml(meta) {
  // 后端通道信息只留在调试数据中，不进入用户对话界面。
  return '';
}

export function plannerProposalHtml(proposal) {
  if (!proposal) return '';
  const selectedChanges = proposal.optionStopChanges?.[state.selectedOptionId || 'option-1'] || proposal.stopChanges || [];
  const changed = selectedChanges.length;
  if (proposalUnavailable(proposal, state.selectedOptionId || 'option-1')) {
    const validOptions = Object.entries(proposal.optionStatus || {}).filter(([id,status]) => status.canApply !== false);
    return `<div class="chat-proposal proposal-unavailable" role="status">
      <div class="chat-proposal-head"><strong>暂未生成可应用的方案</strong></div>
      <p>${escapeHtml(proposal.message || '未找到可用候选，请补充具体地点或调整搜索条件。')}</p>
      ${validOptions.length ? `<p>当前所选候选不能应用，可以改选其他方案：</p>${validOptions.map(([id]) => `<button class="secondary mini-btn" type="button" data-action="select-option" data-option-id="${escapeHtml(id)}">查看${escapeHtml(id.replace('option-', '方案'))}</button>`).join('')}` : ''}
      <div class="chat-proposal-actions"><button class="ghost mini-btn" type="button" data-action="dismiss-planner-proposal" data-close-only="true">关闭提示</button></div>
    </div>`;
  }
  const selectedStatus = proposal.optionStatus?.[state.selectedOptionId || 'option-1'];
  const isFeasible = (selectedStatus?.feasible ?? proposal.feasible) !== false;
  const alternatives = Array.isArray(proposal.alternatives) ? proposal.alternatives : [];
  const candidates = Array.isArray(proposal.candidateReplacements) ? proposal.candidateReplacements : [];
  const selectedOption = state.selectedOptionId || 'option-1';
  const directCandidate = candidates.find((candidate) => candidate.directReplacement) || candidates[0];
  const isDirectReplacement = proposal.replacementMode === 'DIRECT' || Boolean(directCandidate?.directReplacement);

  const isTeaOrSnack = proposal.replacementMode === 'TEA_BREAK'
    || candidates.some((c) => c.slotType === 'TEA_BREAK' || c.isTeaVenue || (c.name && (c.name.includes('茶') || c.name.includes('甜') || c.name.includes('品茗'))));
  const isAddStop = proposal.intent?.operation === 'ADD_STOP'
    || proposal.intent?.type === 'ADD_STOP'
    || proposal.replacementMode === 'TEA_BREAK'
    || proposal.replacementMode === 'DINING_ADD';
  const isDiningReplacement = proposal.replacementMode === 'DINING' || (!isTeaOrSnack && candidates.some((c) => c.isDining || c.type === 'DINING'));
  const isDining = isDiningReplacement || proposal.replacementMode === 'DINING_ADD' || isTeaOrSnack;

  const sourceName = proposal.sourceStopName || proposal.intent?.targetStopReference || '当前站点';
  const requestedName = proposal.requestedReplacementName || directCandidate?.requestedName || directCandidate?.name || '目标地点';

  const overline = isTeaOrSnack
    ? (isAddStop ? 'LOCAL TEA & DESSERT ADDITION' : 'LOCAL TEA BREAK UPGRADE')
    : (isAddStop
      ? (isDining ? 'LOCAL DINING ADDITION' : 'LOCAL ITINERARY ADDITION')
      : (isDirectReplacement
        ? 'ONE-TO-ONE CHANGE'
        : (isDining ? 'LOCAL DINING UPGRADE' : 'LOCAL ITINERARY CHANGE')));

  const headerTitle = isFeasible
    ? (isTeaOrSnack
      ? (isAddStop ? '特色茶歇加站预览' : '地道茶歇调整预览')
      : (isAddStop
        ? (isDining ? '特色餐饮加站预览' : '行程加站游览预览')
        : (isDirectReplacement ? '一对一替换预览' : (isDining ? '地道美食调整预览' : '行程调整预览'))))
    : '路线提示：仍可按你的选择执行';

  const impactLabel = isFeasible
    ? (isTeaOrSnack
      ? '🍵 惬意茶歇'
      : (isAddStop
        ? (isDining ? '🍽️ 美食加站' : '📍 新增游玩')
        : (isDining ? '🍽️ 美食升级' : (changed ? `仅影响 ${changed} 站` : '局部微调'))))
    : '顺路度较低';

  return `
    <div class="chat-proposal ${!isFeasible ? 'proposal-infeasible' : ''} ${isDining ? 'proposal-dining' : ''}" role="region" aria-label="行程调整方案预览">
      <div class="chat-proposal-head">
        <div>
          <span class="proposal-overline">${overline}</span>
          <strong>${headerTitle}</strong>
        </div>
        <span class="proposal-impact ${isFeasible ? 'is-ready' : 'is-caution'}">${impactLabel}</span>
      </div>
      ${isDirectReplacement ? `<div class="direct-replacement-summary"><span class="direct-replacement-place">${escapeHtml(sourceName)}</span><span class="direct-replacement-arrow">→</span><strong>${escapeHtml(requestedName)}</strong><small>确认后只替换这一站，最终决定权在你</small></div>` : ''}
      <p class="proposal-message">${escapeHtml(isFeasible
        ? (proposal.message || (isDirectReplacement ? '已锁定目标地点；确认后只替换这一站，其余安排保持不变。' : (isTeaOrSnack ? '已为您推荐特色茶歇方案，请选择心仪茶社后确认应用。' : (isDining ? '已为您推荐候选餐厅，请选择心仪方案后确认应用。' : '悠悠已为你生成局部调整预览。'))))
        : '按当前时间与路线，采用后当天可能更赶一些。这个提示不会阻止你修改，是否采用仍由你决定。')}</p>

      ${!isFeasible ? `
        <div class="proposal-alert" role="note">
          <span class="proposal-alert-icon" aria-hidden="true">✦</span>
          <div><strong>你的选择优先。</strong><span> 我会保留这个替换目标，同时准备更顺路的备选。</span></div>
          ${alternatives.length ? `
            <div class="proposal-alternative-hint">可参考：${escapeHtml(alternatives.slice(0, 2).join('、'))}</div>
          ` : ''}
        </div>
      ` : ''}

      ${Array.isArray(selectedChanges) && selectedChanges.length ? `<div class="proposal-change-summary" role="status"><strong>确认后将发生以下改动：</strong><ul>${selectedChanges.map(change => `<li>${escapeHtml(change.before?.name || '新增站点')} ${escapeHtml(change.before?.time || '')} → ${escapeHtml(change.after?.name || '移除')} ${escapeHtml(change.after?.time || '')}</li>`).join('')}</ul><small>预览尚未应用</small></div>` : ''}
      ${candidates.length > 0 ? `
        <div class="candidate-options-group">
          <div class="options-title-bar">
            <span class="options-title-icon">${isTeaOrSnack ? '🫖' : (isDining ? '🍲' : (isDirectReplacement ? '🎯' : '✨'))}</span>
            <span class="options-title-text">${isDirectReplacement
              ? '已精准锁定目标地点，请确认替换：'
              : (isTeaOrSnack
                ? (isAddStop ? '为你推荐契合偏好的特色茶歇/小憩方案（点击卡片切换）：' : '为你推荐契合口味的特色茶社（点击卡片切换）：')
                : (isDining
                  ? (isAddStop ? '为你推荐契合偏好的特色加餐方案（点击卡片切换）：' : '为你推荐契合口味的替换餐厅（点击卡片切换）：')
                  : (isAddStop ? '为你推荐契合行程的新增游览方案（点击卡片切换）：' : '为你推荐契合行程的候选方案（点击卡片切换）：')))}</span>
          </div>
          <div class="candidate-options-list">
            ${candidates.map((cand, idx) => {
              const optId = cand.optionId || `option-${idx + 1}`;
              const isSelected = optId === selectedOption;
              const isCandTea = cand.slotType === 'TEA_BREAK' || cand.isTeaVenue || (cand.name && (cand.name.includes('茶') || cand.name.includes('甜') || cand.name.includes('品茗')));
              const isDiningCard = cand.isDining || cand.type === 'DINING' || Boolean(cand.specialtyDish) || isCandTea;
              const isTopPick = idx === 0 && !isDirectReplacement;
              return `
                <div class="candidate-option-card ${isSelected ? 'selected' : ''} ${isDiningCard ? 'candidate-dining-card' : 'candidate-attraction-card'}" data-action="select-option" data-option-id="${escapeHtml(optId)}">
                  <div class="cand-card-top">
                    <div class="cand-scheme-badge-wrap">
                      <span class="cand-scheme-pill ${isTopPick ? 'cand-scheme-recommended' : ''} ${isDirectReplacement ? 'cand-scheme-direct' : ''}">
                        ${isDirectReplacement ? '🎯 目标锁定' : (isTopPick ? '方案 1 · 智能优选' : `方案 ${idx + 1}`)}
                      </span>
                      ${cand.fit ? `<span class="cand-fit-tag">${escapeHtml(cand.fit)}</span>` : ''}
                    </div>
                    <div class="cand-meta-chips">
                      ${cand.district ? `<span class="cand-chip cand-chip-district">📍 ${escapeHtml(cand.district)}</span>` : ''}
                      ${isDiningCard && (cand.costSummary || cand.averageCost) ? `<span class="cand-chip cand-chip-cost">💰 ${escapeHtml(cand.costSummary || cand.averageCost)}</span>` : ''}
                      ${!isDiningCard && cand.walkDifficulty ? `<span class="cand-chip cand-chip-walk">🚶 步行${escapeHtml(cand.walkDifficulty)}</span>` : ''}
                      ${cand.walk ? `<span class="cand-chip cand-chip-dist">🚶 ${escapeHtml(cand.walk)}</span>` : ''}
                    </div>
                  </div>

                  <div class="cand-card-body">
                    <div class="cand-radio-col">
                      <input type="radio" name="proposal-option" value="${escapeHtml(optId)}" ${isSelected ? 'checked' : ''} class="cand-radio-input" />
                      <span class="cand-radio-dot-circle" aria-hidden="true"></span>
                    </div>
                    <div class="cand-info-col">
                      <div class="cand-name-row">
                        <strong class="cand-venue-name">${escapeHtml(cand.requestedName || cand.name)}</strong>
                        ${isCandTea ? '<span class="cand-type-pill cand-type-tea">特色茶歇</span>' : (isDiningCard ? '<span class="cand-type-pill">地道美食</span>' : '<span class="cand-type-pill cand-type-attraction">游玩景点</span>')}
                      </div>

                      ${isDiningCard && cand.specialtyDish ? `
                        <div class="cand-specialty-box">
                          <span class="cand-specialty-badge">${isCandTea ? '🍵 招牌品茗' : '🥘 招牌必吃'}</span>
                          <span class="cand-specialty-dish">${escapeHtml(cand.specialtyDish)}</span>
                        </div>
                      ` : ''}

                      ${cand.summary ? `<p class="cand-summary">${escapeHtml(cand.summary)}</p>` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="chat-proposal-actions">
        ${isFeasible ? `
          <button class="primary mini-btn proposal-primary-action" type="button" ${state.applyPending ? 'disabled' : ''} data-action="confirm-planner-proposal">确认并应用</button>
          ${!isDirectReplacement ? `<button class="ghost mini-btn" type="button" data-action="request-other-proposals" data-prompt="${isTeaOrSnack ? '换同片区其他茶馆茶社' : (isDining ? '换同片区其他美食餐厅' : '换同片区其他景点')}">${isTeaOrSnack ? '查看其他茶社' : (isDining ? '查看其他餐厅' : '查看其他景点')}</button>` : ''}
        ` : `
          <button class="primary mini-btn proposal-primary-action" type="button" ${state.applyPending ? 'disabled' : ''} data-action="force-apply-planner-proposal">仍按此方案调整</button>
          ${state.selectedStopId ? `<button class="secondary mini-btn" type="button" data-action="request-other-proposals" data-prompt="${isTeaOrSnack ? '换同片区其他茶馆茶社' : (isDining ? '换同片区其他美食餐厅' : '换同片区其他景点')}">${isTeaOrSnack ? '查看其他茶社' : (isDining ? '查看其他餐厅' : '查看替代方案')}</button>` : ''}
        `}
        <button class="ghost mini-btn proposal-dismiss-action" type="button" data-action="dismiss-planner-proposal">取消本轮调整</button>
      </div>
    </div>
  `;
}

export function chatProposalHtml(proposal) {
  if (!proposal) return '';
  const selectedChanges = proposal.optionStopChanges?.[state.selectedOptionId || 'option-1'] || proposal.stopChanges || [];
  const changed = selectedChanges.length;
  return `
    <div class="chat-proposal" role="region" aria-label="行程修改方案">
      <div class="chat-proposal-head"><strong>待确认的行程修改</strong><span class="chip">${changed ? `影响 ${changed} 个站点` : '仅建议，不会自动修改'}</span></div>
      <p>${escapeHtml(proposal.summary || proposal.message || '悠悠已准备一份修改方案。')}</p>
      ${proposal.reason ? `<div class="muted">依据：${escapeHtml(proposal.reason)}</div>` : ''}
      ${proposal.requiresConfirmation ? `<div class="chat-proposal-actions"><button class="primary mini-btn" data-action="confirm-chat-proposal">确认并生成新版本</button><button class="ghost mini-btn" data-action="dismiss-chat-proposal">暂不修改</button></div>` : ''}
    </div>
  `;
}

export function chatModeBannerHtml() {
  if (!state.user && state.view === 'guest-chat') return '';
  const selectedStop = state.selectedStopId
    ? state.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === state.selectedStopId)
    : null;
  const isDining = selectedStop?.type === 'DINING' || selectedStop?.icon === '餐';
  const hasPlanningContext = state.view === 'planning' && Boolean(state.trip);
  const isAgent = state.chatMode === 'agent';
  if (isAgent && hasPlanningContext) {
    return chatModeGuideHtml(state.user?.id, state.chatModeGuideOpen)
      || '<button class="chat-mode-help" data-action="show-chat-mode-guide">助手使用说明</button>';
  }
  const isAdjustment = !isAgent && hasPlanningContext && state.chatMode === 'planner';
  const modeLabel = isAgent ? '智能体模式' : (isAdjustment ? '调整模式' : '聊天模式');
  const modeDescription = isAgent
    ? '自主查天气、算路程、检知识库与预演调整，修改前会先请你确认'
    : (isAdjustment
      ? (isDining ? '只调整餐饮选择与风味类型，确认后才会应用' : '只调整当前行程片段，确认后才会应用')
      : (isDining ? '专注于解答附近餐厅、招牌特色与排队建议' : (hasPlanningContext ? '只回答景点、天气和出行问题，不修改行程' : '游客模式：只回答旅行问题，不修改或保存行程')));
  const selectedStopName = selectedStop
    ? (isDining ? `当前餐饮：${selectedStop.name}` : `当前站点：${selectedStop.name}`)
    : '';
  return `
    ${hasPlanningContext ? chatModeGuideHtml(state.user?.id, state.chatModeGuideOpen) : ''}
    <div class="chat-mode-helper ${isAdjustment ? 'is-adjustment' : 'is-chat'} ${isDining ? 'is-dining-helper' : ''}">
      <span class="chat-mode-helper-icon" aria-hidden="true">${isDining ? '🥢' : (isAdjustment ? '✦' : '◌')}</span>
      <span class="chat-mode-helper-copy"><strong>${modeLabel}</strong><small>${modeDescription}</small></span>
      ${hasPlanningContext ? '<button type="button" class="chat-mode-help" data-action="show-chat-mode-guide">模式说明</button>' : ''}
      ${selectedStopName ? `<span class="chat-selected-stop" style="${isDining ? 'background: #ffedd5; color: #c2410c;' : ''}">${escapeHtml(selectedStopName)}</span>` : ''}
    </div>
  `;
}

function selectedStopsForChat() {
  if (!state.selectedStopId) return [];
  const stop = state.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === state.selectedStopId);
  return stop ? [stop] : [];
}

export function selectedStopActionHtml() {
  if (state.view !== 'planning' || !state.trip) return '';
  const selectedStops = selectedStopsForChat();
  if (!selectedStops.length) return '';
  const stop = selectedStops[0];
  const isDining = stop.type === 'DINING' || stop.icon === '餐';
  const selectedText = `【${stop.name}】`;
  const namesText = stop.name;
  const isAgent = state.chatMode === 'agent';
  const isAdjustment = !isAgent && state.chatMode === 'planner';

  const scenicPlannerActions = [
    ['🔄 推荐同片区替换', `请推荐${selectedText}的同片区可替换景点`, 'planner'],
    ['🏛️ 推荐室内景点', `请为${selectedText}推荐适合替换的室内景点`, 'planner'],
    ['🚶 推荐低步行景点', `请为${selectedText}推荐步行量更低的替换景点`, 'planner'],
    ['🌿 推荐小众平替', `请为${selectedText}推荐小众平替的替换景点`, 'planner']
  ];
  const scenicChatActions = [
    ['ℹ️ 咨询景点亮点与玩法', `请详细介绍${selectedText}的主要特色与游玩亮点。`, 'chat'],
    ['🚇 交通与到达方式', `请问到${selectedText}周边公共交通与步行路线怎么走最方便？`, 'chat'],
    ['🕒 开放时间与门票建议', `请介绍${selectedText}的开放时间、门票建议与避坑贴士。`, 'chat'],
    ['⏳ 建议游玩时长', `游玩${selectedText}大概需要多少时间？适合什么时间段去？`, 'chat']
  ];

  const diningPlannerActions = [
    ['🍲 换成地道老火锅', `请把${selectedText}替换为周边好评的地道九宫格老火锅`, 'planner'],
    ['🥘 换成特色江湖菜', `请把${selectedText}替换为附近地道的重庆江湖菜或老字号中餐`, 'planner'],
    ['🥗 换成清淡汤锅小吃', `请把${selectedText}替换为清淡不辣的养生汤锅或名特产小吃`, 'planner'],
    ['☕ 换成周边茶歇小憩', `请把${selectedText}替换为附近环境舒适的特色茶馆或咖啡小憩点`, 'planner']
  ];
  const diningChatActions = [
    ['🍜 招牌必点特色菜品', `请详细介绍${selectedText}的招牌必点菜品与风味特色。`, 'chat'],
    ['🌶️ 辣度口味与忌口适配', `请问${selectedText}口味偏辣吗？有没有微辣或清淡不辣的菜式？`, 'chat'],
    ['⏱️ 营业时间与排队建议', `请问${selectedText}饭点就餐需要排队吗？一般什么时候去人较少？`, 'chat'],
    ['🚶 步行路线与就餐环境', `从前一站如何步行前往${selectedText}？就餐环境与周边好不好找？`, 'chat']
  ];

  const scenicAgentActions = [
    ['🔄 预演同片区替换', `请结合当前草稿预演把${selectedText}换成同片区优质景点`, 'agent'],
    ['🏛️ 查天气+室内备选', `请先查明天天气，再为${selectedText}推荐室内替代方案`, 'agent'],
    ['🚇 算路线与耗时', `请帮我核算前往${selectedText}的步行和地铁通勤耗时`, 'agent'],
    ['📌 固定为必去站点', `请帮我把${selectedText}固定为必去站点不要被重排`, 'agent']
  ];
  const diningAgentActions = [
    ['🍲 预演同片区换餐', `请帮我预演把${selectedText}换成附近评分高的特色美食`, 'agent'],
    ['🥗 预演不辣清淡备选', `请帮我预演把${selectedText}换成清淡不辣的餐厅并比较路程`, 'agent'],
    ['🌶️ 查招牌与忌口提示', `请查证${selectedText}的招牌菜与口味特色`, 'agent'],
    ['📌 固定这家餐厅', `请把${selectedText}固定在当前行程中`, 'agent']
  ];

  const actions = isAgent
    ? (isDining ? diningAgentActions : scenicAgentActions)
    : (isDining
      ? (isAdjustment ? diningPlannerActions : diningChatActions)
      : (isAdjustment ? scenicPlannerActions : scenicChatActions));

  const day = state.trip.days?.find(d => d.stops?.some(s => s.id === stop.id));
  const when = [day && `第 ${day.day} 天`, stop.time].filter(Boolean).join(' · ');
  return `
    <section class="chat-selection-panel" aria-label="当前调整站点">
      <div class="workspace-stop-context"><strong>${escapeHtml([when, namesText].filter(Boolean).join(' · '))}</strong>
        <button class="chat-selection-clear" type="button" data-action="clear-stop-selection">清除选择</button></div>
      <details class="workspace-stop-shortcuts"><summary>站点快捷操作</summary>
      <div class="chat-selection-actions" role="group" aria-label="快捷策略与问答">
        ${actions.map(([label, prompt, mode]) => `
          <button class="chat-selection-action ${state.chatLoading ? 'is-disabled' : ''}" style="${isDining ? 'border-color: #fdba74; color: #9a3412;' : ''}" type="button" data-action="quick-ai-action" data-mode="${mode}" data-prompt="${escapeHtml(prompt)}" ${state.chatLoading ? 'disabled' : ''}>${escapeHtml(label)}</button>
        `).join('')}
      </div>
    </details>
    </section>
  `;
}

export function suggestionCalloutHtml() {
  // 主页已经负责完整行程规划；AI 浮窗只保留聊天或局部调整，不再渲染额外建议卡和快捷操作。
  return '';
}

export function quickChipsHtml() {
  return '';
}

function memoryCandidateHtml() {
  const candidate = state.memoryCandidate;
  if (!candidate) return '';
  return `
    <section class="chat-memory-candidate" aria-live="polite">
      <span class="chat-memory-candidate-icon" aria-hidden="true">✦</span>
      <div><strong>要把这件事记住吗？</strong><p>${escapeHtml(candidate.content)}</p><small>${state.user ? '仅在你确认后，才会用于未来的旅行规划。' : '确认后将记住该偏好，登录后可永久同步至云端。'}</small></div>
      <div class="chat-memory-candidate-actions"><button class="primary mini-btn" type="button" data-action="confirm-memory-candidate">记住</button><button class="ghost mini-btn" type="button" data-action="dismiss-memory-candidate">仅本次</button></div>
    </section>
  `;
}

export function chatModeTabsHtml(mode = state.chatMode, canAdjust = true) {
  return `
    <div class="chat-mode-tabs agent-only-header" role="status" aria-label="全智能体工作区">
      <button type="button"
        class="chat-mode-tab-btn is-active"
        data-action="switch-agent-mode"
        aria-pressed="true"
        title="全智能体原生编排：自主调用天气、高德实景 POI、算路网、知识库与自由行程编辑工具">
        <span class="chat-mode-tab-icon">🤖</span>
        <span>全智能体工作区</span>
      </button>
    </div>
  `;
}

function chatEmptyHtml(hasTrip) {
  return `<div class="chat-empty">
    <strong>${hasTrip ? '想调整哪一站？' : '想了解重庆的什么地方？'}</strong>
    <p>${hasTrip ? '选中站点或直接描述修改，确认后应用到行程。' : '例如，傍晚从李子坝去洪崖洞怎么走？'}</p>
  </div>`;
}

export function chatPanel({ floating = false } = {}) {
  const hasPlanningContext = state.view === 'planning' && Boolean(state.trip);
  const canAdjust = Boolean(hasPlanningContext);
  const chatMode = 'agent';
  const isGuestChat = !state.user && !hasPlanningContext;
  const inputPlaceholder = hasPlanningContext
    ? '输入调整需求，或提问攻略…'
    : (isGuestChat ? '问问景点、交通或美食…' : '告诉悠悠旅行天数、同行人和想去的地方…');
  const modeTabs = chatModeTabsHtml(chatMode, canAdjust);
  return `
    <aside class="panel chat-panel ${floating ? 'chat-panel-floating' : 'chat-panel-inline'} ${isGuestChat ? 'chat-panel-guest' : ''}" ${floating ? 'role="dialog" aria-label="悠悠 AI 行程助手"' : 'aria-label="全智能体旅行协同工作区"'}>
      <div class="panel-pad">
        <div class="chat-header-row">
          <div class="chat-dock-heading">
            <span class="chat-dock-avatar" aria-hidden="true">渝</span>
            <div>
              <div class="panel-title">悠悠 · 旅行助手</div>
            </div>
            <span class="chat-subtitle">${hasPlanningContext ? '先预览，再确认修改' : '旅行咨询'}</span>
          </div>
          <div class="chat-header-controls">
            ${!floating && (!hasPlanningContext || state.chatMode !== 'agent') ? modeTabs : ''}
            ${hasPlanningContext ? '<button type="button" class="workspace-expand" data-action="expand-assistant">展开助手</button><button type="button" class="workspace-split" data-action="open-chat-dock">恢复双栏</button>' : ''}
            ${hasPlanningContext ? '<button class="chat-dock-close" type="button" data-action="close-chat-dock" title="收起智能体面板" aria-label="收起智能体面板">×</button>' : ''}
          </div>
        </div>

        <div class="chat-interaction-context ${floating && canAdjust ? 'has-compact-mode-picker' : ''}">
          ${floating && canAdjust ? `<div class="chat-context-topline">${modeTabs}</div>` : ''}
          <div class="chat-mode-banner-mount">
            ${chatModeBannerHtml()}
          </div>

        </div>

        <div class="chat-transcript" role="log" aria-live="polite">
          ${state.chatMessages.length === 0 ? `
            ${chatEmptyHtml(hasPlanningContext)}
          ` : state.chatMessages.map(chatMessageHtml).join('')}
        </div>
        <div class="chat-selection-mount">
            ${selectedStopActionHtml()}
          </div>
        ${memoryCandidateHtml()}

        <form class="chat-input-row" data-action="chat-form">
            <textarea
              id="chat-input"
              rows="1"
              placeholder="${inputPlaceholder}"
              aria-label="输入旅行规划或自由调整指令；Enter 发送，Shift 加 Enter 换行"
              title="Enter 发送 · Shift + Enter 换行"
            ${state.chatLoading ? 'disabled' : ''}
            >${escapeHtml(state.chatInput)}</textarea>
          ${state.chatLoading
            ? '<button type="button" class="secondary" data-action="cancel-chat">停止生成</button>'
            : '<button type="submit" class="primary">发送</button>'
          }
        </form>
      </div>
    </aside>
  `;
}

/**
 * 全智能体原生模式下，方案差异确认卡内联于智能体对话流展示，下线旧版独立 Proposal 浮窗。
 */
export function floatingPlannerProposalDock() {
  return '';
}

export function renderPlannerProposalDockInDOM() {
  const root = document.querySelector('#planner-proposal-dock-root');
  if (!root) return;
  root.className = `planner-proposal-dock-root ${state.chatDockOpen ? 'with-chat' : ''}`;
  root.innerHTML = floatingPlannerProposalDock();
}

export function renderChatInDOM({ scrollToBottom = true } = {}, renderViewCallback) {
  const panel = document.querySelector('.chat-panel');
  if (!panel) {
    renderPlannerProposalDockInDOM();
    if (renderViewCallback) renderViewCallback();
    return;
  }

  // 1. 更新模式专属标识条 (chat-mode-banner)
  const bannerMount = panel.querySelector('.chat-mode-banner-mount');
  if (bannerMount) {
    bannerMount.innerHTML = chatModeBannerHtml();
  }

  // 景点选择是聊天框内的即时上下文，不需要重刷整页；切换模式或多选站点时同步更新。
  const selectionMount = panel.querySelector('.chat-selection-mount');
  if (selectionMount) {
    const shortcutsOpen = selectionMount.querySelector('.workspace-stop-shortcuts')?.open;
    selectionMount.innerHTML = selectedStopActionHtml();
    const shortcuts = selectionMount.querySelector('.workspace-stop-shortcuts');
    if (shortcuts && shortcutsOpen) shortcuts.open = true;
  } else {
    // 兼容热更新中仍保留旧布局的浮窗，不影响当前对话继续进行。
    panel.querySelector('.chat-selection-panel')?.remove();
    const selectionHtml = selectedStopActionHtml();
    if (bannerMount && selectionHtml) bannerMount.insertAdjacentHTML('afterend', selectionHtml);
  }

  // 2. 更新聊天消息记录区 (transcript)
  const transcript = panel.querySelector('.chat-transcript');
  if (transcript) {
    if (state.chatMessages.length === 0) {
      transcript.innerHTML = chatEmptyHtml(state.view === 'planning' && Boolean(state.trip));
    } else {
      transcript.innerHTML = state.chatMessages.map(chatMessageHtml).join('');
    }
    if (scrollToBottom) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  panel.querySelector('.chat-memory-candidate')?.remove();
  const liveInputRow = panel.querySelector('.chat-input-row');
  if (state.memoryCandidate && liveInputRow) {
    liveInputRow.insertAdjacentHTML('beforebegin', memoryCandidateHtml());
  }

  // 规划 Proposal 统一由独立方案窗承载，聊天窗不再渲染旧版 Chat Proposal，
  // 避免历史兼容状态与当前方案窗重复占位。
  panel.querySelector('.chat-proposal')?.remove();
  // 兼容热更新或旧版本已挂载的面板：清掉不再面向用户展示的内部状态区。
  panel.querySelector('.chat-meta')?.remove();
  panel.querySelector('.chat-context-strip')?.remove();
  panel.querySelector('.chat-suggestion-mount')?.remove();
  panel.querySelector('.quick-chips-mount')?.remove();

  renderPlannerProposalDockInDOM();

  // 3. 模式切换 Tabs 与输入框状态同步
  const canAdjustNow = state.view === 'planning' && Boolean(state.trip);
  const topline = panel.querySelector('.chat-context-topline');
  if (topline) {
    topline.innerHTML = chatModeTabsHtml(state.chatMode, canAdjustNow);
  }
  const headerTabs = panel.querySelector('.chat-header-controls .chat-mode-tabs');
  if (headerTabs) {
    headerTabs.outerHTML = chatModeTabsHtml(state.chatMode, canAdjustNow);
  }
  panel.querySelectorAll('.chat-mode-tab-btn').forEach((btn) => {
    const btnMode = btn.dataset.action === 'switch-adjustment-mode'
      ? 'planner'
      : (btn.dataset.action === 'switch-agent-mode' ? 'agent' : 'chat');
    const isActive = state.chatMode === btnMode;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  const inputEl = panel.querySelector('#chat-input');
  if (inputEl) {
    inputEl.value = state.chatInput;
    inputEl.disabled = state.chatLoading;
    inputEl.placeholder = state.chatMode === 'agent'
      ? (canAdjustNow ? '输入调整需求，或提问攻略…' : '问问天气、路线或美食攻略…')
      : (state.chatMode === 'planner'
        ? (state.selectedStopId ? '输入局部调整要求，例如：换成附近的室内景点…' : '描述要怎样微调当前行程，例如：少走路、多安排室内景点…')
        : '问问景点、天气、交通或美食，不会直接修改行程…');
    resizeChatInput(inputEl);
  }
  const modeSelect = panel.querySelector('#chat-mode');
  if (modeSelect) modeSelect.value = state.chatMode === 'planner' ? 'planner' : 'chat';
  const inputRow = panel.querySelector('.chat-input-row');
  const actionBtn = inputRow?.querySelector('button');
  if (inputRow) {
    const shouldShowCancel = Boolean(state.chatLoading);
    const isCancelButton = actionBtn?.dataset.action === 'cancel-chat';
    if (actionBtn && shouldShowCancel !== isCancelButton) {
      actionBtn.outerHTML = shouldShowCancel
        ? '<button type="button" class="secondary" data-action="cancel-chat">停止生成</button>'
        : '<button type="submit" class="primary">发送</button>';
    } else if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = shouldShowCancel ? '停止生成' : '发送';
    } else {
      inputRow.insertAdjacentHTML('beforeend', shouldShowCancel
        ? '<button type="button" class="secondary" data-action="cancel-chat">停止生成</button>'
        : '<button type="submit" class="primary">发送</button>');
    }
  }
}

/**
 * 聊天输入随内容增长到可读高度；达到上限后改为输入框内部滚动，
 * 防止长文本把浮窗消息区和发送按钮挤出视口。
 */
export function resizeChatInput(input) {
  if (!(input instanceof HTMLTextAreaElement)) return;
  const maxHeight = 144;
  input.style.height = 'auto';
  const nextHeight = Math.min(input.scrollHeight, maxHeight);
  input.style.height = `${Math.max(42, nextHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
