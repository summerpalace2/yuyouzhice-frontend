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

export function chatMessageHtml(message) {
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
  const planLineMatch = role === 'assistant' && !message.pending
    ? content.match(/(?:🧭\s*)?(方案\s*([A-CＡ-Ｃ])[：:、\s\-—]([^\n]+))/i)
    : null;
  const planLabel = planLineMatch ? planLineMatch[2] : (role === 'assistant' && !message.pending ? content.match(/方案\s*([A-CＡ-Ｃ])/i)?.[1] : null);
  const planSummary = planLineMatch ? planLineMatch[3].trim().replace(/^[（(]|[）)]$/g, '').slice(0, 45) : '';
  const planPrompt = planSummary
    ? `采用方案${planLabel}：${planSummary}，帮我局部调整行程`
    : `方案${planLabel}选这个，帮我局部调整行程`;
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
        ${message.retryMessage && !plannerSessionError ? `<button class="chat-inline-action" type="button" data-action="retry-chat" data-prompt="${escapeHtml(message.retryMessage)}">重新发送</button>` : ''}
        ${offerChatMode ? '<button class="chat-inline-action chat-mode-fallback-action" type="button" data-action="switch-chat-mode">切换到聊天</button>' : ''}
        ${offerAdjustmentMode ? `<button class="chat-inline-action chat-mode-adjust-action" type="button" data-action="switch-adjustment-mode" data-prompt="${escapeHtml(message.retryMessage || '')}">切换到局部调整</button>` : ''}
      </span>
    </div>
  ` : '';
  const planActionHtml = planLabel ? `
    <div class="chat-message-actions">
      <button class="chip primary-chip" type="button" data-action="quick-ai-action" data-mode="planner" data-prompt="${escapeHtml(planPrompt)}">🧭 采用方案${escapeHtml(planLabel)}，查看局部调整</button>
    </div>
  ` : '';

  const rawSuggestions = Array.isArray(message.actionableSuggestions) ? message.actionableSuggestions : [];
  const suggestions = deduplicateSuggestions(rawSuggestions);
  const chipsHtml = (role === 'assistant' && !message.pending && suggestions.length > 0) ? `
    <div class="chat-action-chips-group" role="group" aria-label="快捷行动建议">
      <div class="chat-action-chips-hint">
        <span class="chat-action-chips-icon">✦</span>
        <span>AI 感知到你的出行偏好，可一键执行调整或沉淀档案：</span>
      </div>
      <div class="chat-action-chips-list">
        ${suggestions.map((sug) => {
          const isApplied = Boolean(sug.applied);
          const isSlotPref = sug.action === 'save_slot_preference';
          const isMemory = sug.action === 'save_memory' || isSlotPref;
          const appliedText = isSlotPref ? '已加入偏好' : (isMemory ? '已沉淀至档案' : '已发起调整');
          return `
          <button class="chat-action-chip ${isMemory ? 'is-memory-chip' : ''} ${isApplied ? 'is-applied' : ''}"
                  type="button"
                  ${isApplied ? 'disabled' : ''}
                  data-action="execute-action-chip"
                  data-chip-action="${escapeHtml(sug.action || '')}"
                  data-chip-payload="${escapeHtml(sug.payload || '')}"
                  data-chip-label="${escapeHtml(sug.label || '')}"
                  title="${escapeHtml(sug.label || '')}">
            <span class="chat-action-chip-icon">${isApplied ? '✓' : escapeHtml(sug.icon || '✦')}</span>
            <span class="chat-action-chip-label">${isApplied ? appliedText : escapeHtml(sug.label || '')}</span>
          </button>
        `;
        }).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="chat-message chat-message-${role}">
      <div class="chat-message-role"><span class="chat-role-mark" aria-hidden="true">${role === 'user' ? '你' : '渝'}</span>${role === 'user' ? '你' : '悠悠助手'}</div>
      <div class="chat-message-content">${bodyHtml}</div>
      ${chipsHtml}
      ${errorHtml}
      ${planActionHtml}
    </div>
  `;
}

export function chatMetaHtml(meta) {
  // 后端通道信息只留在调试数据中，不进入用户对话界面。
  return '';
}

export function plannerProposalHtml(proposal) {
  if (!proposal) return '';
  const changed = Array.isArray(proposal.changedSegments) ? proposal.changedSegments.length : 0;
  const isFeasible = proposal.feasible !== false;
  const alternatives = Array.isArray(proposal.alternatives) ? proposal.alternatives : [];
  const candidates = Array.isArray(proposal.candidateReplacements) ? proposal.candidateReplacements : [];
  const selectedOption = state.selectedOptionId || 'option-1';
  const directCandidate = candidates.find((candidate) => candidate.directReplacement) || candidates[0];
  const isDirectReplacement = proposal.replacementMode === 'DIRECT' || Boolean(directCandidate?.directReplacement);
  const isDiningReplacement = proposal.replacementMode === 'DINING' || candidates.some((c) => c.isDining || c.type === 'DINING');
  const sourceName = proposal.sourceStopName || proposal.intent?.targetStopReference || '当前站点';
  const requestedName = proposal.requestedReplacementName || directCandidate?.requestedName || directCandidate?.name || '目标地点';

  const overline = isDirectReplacement
    ? 'ONE-TO-ONE CHANGE'
    : (isDiningReplacement ? 'LOCAL DINING UPGRADE' : 'LOCAL ITINERARY CHANGE');
  const headerTitle = isFeasible
    ? (isDirectReplacement ? '一对一替换预览' : (isDiningReplacement ? '地道美食调整预览' : '行程调整预览'))
    : '路线提示：仍可按你的选择执行';
  const impactLabel = isFeasible
    ? (isDiningReplacement ? '🍽️ 美食升级' : (changed ? `仅影响 ${changed} 站` : '局部微调'))
    : '顺路度较低';

  return `
    <div class="chat-proposal ${!isFeasible ? 'proposal-infeasible' : ''} ${isDiningReplacement ? 'proposal-dining' : ''}" role="region" aria-label="行程调整方案预览">
      <div class="chat-proposal-head">
        <div>
          <span class="proposal-overline">${overline}</span>
          <strong>${headerTitle}</strong>
        </div>
        <span class="proposal-impact ${isFeasible ? 'is-ready' : 'is-caution'}">${impactLabel}</span>
      </div>
      ${isDirectReplacement ? `<div class="direct-replacement-summary"><span class="direct-replacement-place">${escapeHtml(sourceName)}</span><span class="direct-replacement-arrow">→</span><strong>${escapeHtml(requestedName)}</strong><small>确认后只替换这一站，最终决定权在你</small></div>` : ''}
      <p class="proposal-message">${escapeHtml(isFeasible
        ? (proposal.message || (isDirectReplacement ? '已锁定目标地点；确认后只替换这一站，其余安排保持不变。' : (isDiningReplacement ? '已为您推荐候选餐厅，请选择心仪方案后确认应用。' : '悠悠已为你生成局部调整预览。')))
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

      ${candidates.length > 0 ? `
        <div class="candidate-options-group">
          <div class="options-title-bar">
            <span class="options-title-icon">${isDiningReplacement ? '🍲' : (isDirectReplacement ? '🎯' : '✨')}</span>
            <span class="options-title-text">${isDirectReplacement ? '已精准锁定目标地点，请确认替换：' : (isDiningReplacement ? '为你推荐契合口味的替换餐厅（点击卡片切换）：' : '为你推荐契合行程的候选方案（点击卡片切换）：')}</span>
          </div>
          <div class="candidate-options-list">
            ${candidates.map((cand, idx) => {
              const optId = cand.optionId || `option-${idx + 1}`;
              const isSelected = optId === selectedOption;
              const isDining = cand.isDining || cand.type === 'DINING' || Boolean(cand.specialtyDish);
              const isTopPick = idx === 0 && !isDirectReplacement;
              return `
                <div class="candidate-option-card ${isSelected ? 'selected' : ''} ${isDining ? 'candidate-dining-card' : 'candidate-attraction-card'}" data-action="select-option" data-option-id="${escapeHtml(optId)}">
                  <div class="cand-card-top">
                    <div class="cand-scheme-badge-wrap">
                      <span class="cand-scheme-pill ${isTopPick ? 'cand-scheme-recommended' : ''} ${isDirectReplacement ? 'cand-scheme-direct' : ''}">
                        ${isDirectReplacement ? '🎯 目标锁定' : (isTopPick ? '方案 1 · 智能优选' : `方案 ${idx + 1}`)}
                      </span>
                      ${cand.fit ? `<span class="cand-fit-tag">${escapeHtml(cand.fit)}</span>` : ''}
                    </div>
                    <div class="cand-meta-chips">
                      ${cand.district ? `<span class="cand-chip cand-chip-district">📍 ${escapeHtml(cand.district)}</span>` : ''}
                      ${isDining && (cand.costSummary || cand.averageCost) ? `<span class="cand-chip cand-chip-cost">💰 ${escapeHtml(cand.costSummary || cand.averageCost)}</span>` : ''}
                      ${!isDining && cand.walkDifficulty ? `<span class="cand-chip cand-chip-walk">🚶 步行${escapeHtml(cand.walkDifficulty)}</span>` : ''}
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
                        ${isDining ? '<span class="cand-type-pill">地道美食</span>' : '<span class="cand-type-pill cand-type-attraction">游玩景点</span>'}
                      </div>

                      ${isDining && cand.specialtyDish ? `
                        <div class="cand-specialty-box">
                          <span class="cand-specialty-badge">🥘 招牌必吃</span>
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
          <button class="primary mini-btn proposal-primary-action" type="button" data-action="confirm-planner-proposal">确认并应用</button>
          ${!isDirectReplacement ? `<button class="ghost mini-btn" type="button" data-action="request-other-proposals" data-prompt="${isDiningReplacement ? '换同片区其他美食餐厅' : '换同片区其他景点'}">${isDiningReplacement ? '查看其他餐厅' : '查看其他景点'}</button>` : ''}
        ` : `
          <button class="primary mini-btn proposal-primary-action" type="button" data-action="force-apply-planner-proposal">仍按此方案调整</button>
          ${state.selectedStopId ? `<button class="secondary mini-btn" type="button" data-action="request-other-proposals" data-prompt="${isDiningReplacement ? '换同片区其他美食餐厅' : '换同片区其他景点'}">${isDiningReplacement ? '查看其他餐厅' : '查看替代方案'}</button>` : ''}
        `}
        <button class="ghost mini-btn proposal-dismiss-action" type="button" data-action="dismiss-planner-proposal">取消本次调整</button>
      </div>
    </div>
  `;
}

export function chatProposalHtml(proposal) {
  if (!proposal) return '';
  const changed = Array.isArray(proposal.changedSegments) ? proposal.changedSegments.length : 0;
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
  const selectedStop = state.selectedStopId
    ? state.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === state.selectedStopId)
    : null;
  const isDining = selectedStop?.type === 'DINING' || selectedStop?.icon === '餐';
  const hasPlanningContext = state.view === 'planning' && Boolean(state.trip);
  const isAdjustment = hasPlanningContext && state.chatMode === 'planner';
  const modeLabel = isAdjustment ? (isDining ? '餐饮调整' : '局部调整') : (isDining ? '美食问答' : '聊天');
  const modeDescription = isAdjustment
    ? (isDining ? '只调整餐饮选择与风味类型，确认后才会应用' : '只调整当前行程片段，确认后才会应用')
    : (isDining ? '专注于解答附近餐厅、招牌特色与排队建议' : (hasPlanningContext ? '只回答景点、天气和出行问题，不修改行程' : '游客模式：只回答旅行问题，不修改或保存行程'));
  const selectedStopName = selectedStop
    ? (isDining ? `当前餐饮：${selectedStop.name}` : `当前站点：${selectedStop.name}`)
    : '';
  return `
    <div class="chat-mode-helper ${isAdjustment ? 'is-adjustment' : 'is-chat'} ${isDining ? 'is-dining-helper' : ''}">
      <span class="chat-mode-helper-icon" aria-hidden="true">${isDining ? '🥢' : (isAdjustment ? '✦' : '◌')}</span>
      <span class="chat-mode-helper-copy"><strong>${modeLabel}</strong><small>${modeDescription}</small></span>
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
  const isAdjustment = state.chatMode === 'planner';

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

  const actions = isDining
    ? (isAdjustment ? diningPlannerActions : diningChatActions)
    : (isAdjustment ? scenicPlannerActions : scenicChatActions);

  const title = isDining
    ? (isAdjustment ? '🥢 已选美食 · 餐饮局部调整' : '🍲 已选美食 · 地道赏味问答')
    : (isAdjustment ? '⚡ 已选景点 · 局部调整策略' : '💬 已选景点 · 深度文旅问答');

  const tip = isDining
    ? (isAdjustment ? '点击下方换餐策略即可生成餐饮微调预览：' : '点击下方快捷提问，获取真实口味与避坑攻略：')
    : (isAdjustment ? '点击下方策略即可生成一对一替换预览：' : '点击下方快捷提问，获取真实游玩信息：');

  return `
    <section class="chat-selection-panel ${isAdjustment ? 'is-adjustment' : 'is-chat'} ${isDining ? 'is-dining-panel' : ''}" style="${isDining ? 'border-left: 4px solid #ea580c; background: #fffcf8;' : ''}" aria-live="polite">
      <div class="chat-selection-copy">
        <div class="chat-selection-title-row">
          <strong style="${isDining ? 'color: #9a3412;' : ''}">${title}</strong>
          <button class="chat-selection-clear" type="button" data-action="clear-stop-selection" title="取消选中">✕ 清除选择</button>
        </div>
        <span>当前选择：<b>${escapeHtml(namesText)}</b>。${tip}</span>
      </div>
      <div class="chat-selection-actions" role="group" aria-label="快捷策略与问答">
        ${actions.map(([label, prompt, mode]) => `
          <button class="chat-selection-action ${state.chatLoading ? 'is-disabled' : ''}" style="${isDining ? 'border-color: #fdba74; color: #9a3412;' : ''}" type="button" data-action="quick-ai-action" data-mode="${mode}" data-prompt="${escapeHtml(prompt)}" ${state.chatLoading ? 'disabled' : ''}>${escapeHtml(label)}</button>
        `).join('')}
      </div>
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

export function chatModeTabsHtml(mode = state.chatMode) {
  const isAdjustment = mode === 'planner';
  return `
    <div class="chat-mode-tabs" role="tablist" aria-label="对话模式切换">
      <button type="button"
        class="chat-mode-tab-btn ${!isAdjustment ? 'is-active' : ''}"
        data-action="switch-chat-mode"
        role="tab"
        aria-selected="${!isAdjustment}"
        title="只回答景点、天气、美食等咨询，不改动行程">
        <span class="chat-mode-tab-icon">💬</span>
        <span>自由问答</span>
      </button>
      <button type="button"
        class="chat-mode-tab-btn ${isAdjustment ? 'is-active' : ''}"
        data-action="switch-adjustment-mode"
        role="tab"
        aria-selected="${isAdjustment}"
        title="结合当前行程进行局部调整、加减或替换景点">
        <span class="chat-mode-tab-icon">⚡</span>
        <span>局部规划</span>
      </button>
    </div>
  `;
}

export function chatPanel({ floating = false } = {}) {
  const hasPlanningContext = state.view === 'planning' && Boolean(state.trip);
  const canAdjust = Boolean(hasPlanningContext);
  const chatMode = canAdjust && state.chatMode === 'planner' ? 'planner' : 'chat';
  const isGuestChat = !state.user && !hasPlanningContext;
  const inputPlaceholder = chatMode === 'planner'
    ? (state.selectedStopId ? '输入局部调整要求，例如：换成附近的室内景点…' : '描述要怎样微调当前行程，例如：少走路、多安排室内景点…')
    : hasPlanningContext ? '问问景点、天气、交通或美食，不会直接修改行程…' : '问问重庆景点、天气、交通或美食…';
  const modeTabs = canAdjust ? chatModeTabsHtml(chatMode) : '';
  const compactContextHint = chatMode === 'planner'
    ? '先给出预览，确认后才会改动行程'
    : '只回答问题，不会直接改动行程';
  return `
    <aside class="panel chat-panel ${floating ? 'chat-panel-floating' : ''} ${isGuestChat ? 'chat-panel-guest' : ''}" ${floating ? 'role="dialog" aria-label="悠悠 AI 行程助手"' : 'aria-label="AI 智能旅行助理"'}>
      <div class="panel-pad">
        <div class="chat-header-row">
          <div class="chat-dock-heading">
            <span class="chat-dock-avatar" aria-hidden="true">渝</span>
            <div>
              <div class="panel-title">AI 旅行决策助手</div>
              <span class="chat-dock-live"><i></i> 悠悠在线</span>
            </div>
            <span class="chat-subtitle">${hasPlanningContext ? '聊天，或对当前行程做局部调整' : '游客体验 · 只聊旅行问题'}</span>
          </div>
          <div class="chat-header-controls">
            ${canAdjust && !floating ? modeTabs : (!canAdjust ? '<span class="guest-chat-mode-pill">游客聊天</span>' : '')}
            ${floating ? '<button class="chat-dock-close" type="button" data-action="close-chat-dock" aria-label="收起 AI 助手">×</button>' : ''}
          </div>
        </div>

        <div class="chat-interaction-context ${floating && canAdjust ? 'has-compact-mode-picker' : ''}">
          ${floating && canAdjust ? `<div class="chat-context-topline">${modeTabs}</div>` : ''}
          <div class="chat-mode-banner-mount">
            ${chatModeBannerHtml()}
          </div>
          <div class="chat-selection-mount">
            ${selectedStopActionHtml()}
          </div>
        </div>

        <div class="chat-transcript" role="log" aria-live="polite">
          ${state.chatMessages.length === 0 ? `
            <div class="chat-empty">
              <span class="chat-empty-orb" aria-hidden="true">✦</span>
              <strong>${hasPlanningContext ? '从你的行程开始聊' : '先从旅行问题开始聊'}</strong>
              <p>${hasPlanningContext ? '可以问景点，也可以说“把第二天改得轻松一点”。我会先给你预览，确认后再应用。' : '可以问景点、天气、交通和美食。完整行程规划需要登录账号。'}</p>
            </div>
          ` : state.chatMessages.map(chatMessageHtml).join('')}
        </div>
        ${memoryCandidateHtml()}

        <form class="chat-input-row" data-action="chat-form">
            <textarea
              id="chat-input"
              rows="1"
              placeholder="${inputPlaceholder}"
              aria-label="输入旅行问题或局部调整要求；Enter 发送，Shift 加 Enter 换行"
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

export function floatingChatDock() {
  if (state.view !== 'planning' || !state.trip) return '';
  const attention = state.activeProposal ? '待确认调整' : state.chatLoading ? '正在回复' : '问问悠悠';
  return `
    <div class="chat-dock ${state.chatDockOpen ? 'is-open' : ''}">
      ${state.chatDockOpen ? `<div id="chat-dock-panel" class="chat-dock-panel">${chatPanel({ floating: true })}</div>` : `
        <button class="chat-dock-trigger" type="button" data-action="open-chat-dock" aria-expanded="false" aria-controls="chat-dock-panel">
          <span class="chat-dock-trigger-icon" aria-hidden="true">✦</span>
          <span class="chat-dock-trigger-copy"><strong>悠悠 AI</strong><small>${attention}</small></span>
          ${state.activeProposal ? '<span class="chat-dock-badge">1</span>' : ''}
        </button>
      `}
    </div>
  `;
}

/**
 * 行程调整方案单独占用一个小悬浮窗，避免候选卡片把聊天记录和输入框顶走。
 * 方案窗口和 AI 聊天窗口可以同时打开，用户可先看方案再决定下一步。
 */
export function floatingPlannerProposalDock() {
  if (state.view !== 'planning' || !state.trip || !state.activeProposal) return '';
  if (!state.plannerProposalDockOpen) {
    return `
      <button class="planner-proposal-trigger" type="button" data-action="open-planner-proposal" aria-label="打开局部调整预览">
        <span class="planner-proposal-trigger-icon" aria-hidden="true">🧭</span>
        <span><strong>局部调整</strong><small>等待你的决定</small></span>
        <b>1</b>
      </button>
    `;
  }
  return `
    <section class="planner-proposal-dock" role="dialog" aria-label="局部调整预览">
      <div class="planner-proposal-dock-head">
        <div><span class="planner-proposal-kicker">TRIP DECISION</span><strong>局部调整预览</strong></div>
        <button class="planner-proposal-close" type="button" data-action="close-planner-proposal" aria-label="关闭方案预览">×</button>
      </div>
      <div class="planner-proposal-dock-body">${plannerProposalHtml(state.activeProposal)}</div>
    </section>
  `;
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
    selectionMount.innerHTML = selectedStopActionHtml();
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
      transcript.innerHTML = `
        <div class="chat-empty">
          <p>你可以直接向 AI 发问，或在左侧点击任一景点的<strong>【选中此站】</strong>进行精准微调。</p>
        </div>
      `;
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
  const topline = panel.querySelector('.chat-context-topline');
  if (topline) {
    topline.innerHTML = chatModeTabsHtml(state.chatMode);
  }
  const headerTabs = panel.querySelector('.chat-header-controls .chat-mode-tabs');
  if (headerTabs) {
    headerTabs.outerHTML = chatModeTabsHtml(state.chatMode);
  }
  panel.querySelectorAll('.chat-mode-tab-btn').forEach((btn) => {
    const isPlanner = btn.dataset.action === 'switch-adjustment-mode';
    const isActive = state.chatMode === 'planner' ? isPlanner : !isPlanner;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  const inputEl = panel.querySelector('#chat-input');
  if (inputEl) {
    inputEl.value = state.chatInput;
    inputEl.disabled = state.chatLoading;
    inputEl.placeholder = state.chatMode === 'planner'
      ? (state.selectedStopId ? '输入局部调整要求，例如：换成附近的室内景点…' : '描述要怎样微调当前行程，例如：少走路、多安排室内景点…')
      : '问问景点、天气、交通或美食，不会直接修改行程…';
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
