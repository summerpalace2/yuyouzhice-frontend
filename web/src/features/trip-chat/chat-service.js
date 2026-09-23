import { state } from '../../app-core/state.js';
import { deviceId, plannerIdempotencyKey, request } from '../../shared/api/client.js';
import { renderMarkdownStreaming } from '../../shared/lib/markdown.js';
import { toast } from '../../shared/ui/toast.js';
import { renderChatInDOM } from './chat-panel.js';
import { saveUserChats, saveUserPlan, getGuestChatSessionId, getTripChatKey } from '../../app-core/user-store.js';
import { persistTripWorkspace } from '../trip-workspace/workspace-service.js';

let activeChatAbortController = null;

function persistChatUiState() {
  if (!state.chatSessionId) return;
  state.tripChatHistories = state.tripChatHistories || {};
  state.tripChatHistories[state.chatSessionId] = state.chatMessages;
  saveUserChats(state.user?.id, state.tripChatHistories);
  void persistTripWorkspace();
}

function persistPlannerUiState() {
  if (!state.trip) return;
  saveUserPlan(state.user?.id, {
    trip: state.trip,
    sessionId: state.sessionId,
    savedTripId: state.savedTripId,
    prompt: state.prompt,
    view: 'planning',
    activeProposal: state.activeProposal,
    selectedOptionId: state.selectedOptionId || 'option-1'
  });
}

function persistConversationUiState() {
  persistChatUiState();
  persistPlannerUiState();
}

async function queueTravelMemoryObservation(message) {
  const text = String(message || '').trim();
  if (!text || text.length < 2) return;
  try {
    if (state.user) {
      void request('/api/memories/observe', { method: 'POST', body: JSON.stringify({ message: text, sessionId: state.chatSessionId || '' }) }).catch(() => {});
    }
  } catch {
    // Background memory review is auxiliary and must never make chat fail.
  }
}

export function cancelChatMessage({ renderView } = {}) {
  if (activeChatAbortController) {
    activeChatAbortController.abort();
    activeChatAbortController = null;
  }
  state.chatLoading = false;
  const latest = state.chatMessages.at(-1);
  if (latest?.role === 'assistant' && latest.pending) {
    latest.pending = false;
    latest.content = latest.content || '本次回复已停止，你可以继续提问。';
  }
  persistChatUiState();
  renderChatInDOM({ scrollToBottom: false }, renderView);
  toast('已停止本次回复。');
}

export async function readChatStream(message, sessionId, mode, context = {}, onEvent, signal) {
  if (typeof context === 'function') {
    onEvent = context;
    context = {};
  }
  const params = new URLSearchParams({
    message,
    sessionId,
    mode,
    plannerSessionId: String(context.plannerSessionId || ''),
    tripId: String(context.tripId || ''),
    currentVersion: String(context.currentVersion || ''),
    activeDay: String(context.activeDay || ''),
    activeStopId: String(context.activeStopId || ''),
    activeStopName: String(context.activeStopName || '')
  });
  let response;
  try {
    response = await fetch(`/api/chat/stream?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'text/event-stream', 'x-yuyouzhice-device': deviceId() },
      signal
    });
  } catch (netErr) {
    if (netErr?.name === 'AbortError') throw netErr;
    throw Object.assign(new Error('网络连接异常，无法连接到 Java 对话模型。'), { status: 0, cause: netErr });
  }
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch {}
    throw Object.assign(new Error(payload.message || 'Java 对话模型暂不可用。'), { status: response.status, data: payload });
  }
  if (!response.body) throw new Error('Java Core Backend 未返回对话流。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let eventData = [];
  let doneSeen = false;
  const dispatch = () => {
    if (!eventData.length) return;
    const dispatchedEvent = eventName || 'message';
    const raw = eventData.join('\n');
    if (dispatchedEvent === 'done') doneSeen = true;
    if (typeof onEvent === 'function') onEvent(dispatchedEvent, raw);
    eventName = 'message';
    eventData = [];
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line === '') dispatch();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) eventData.push(line.slice(5).replace(/^ /, ''));
      // SSE comments/ids are intentionally ignored by the browser renderer.
    }
    if (doneSeen) {
      await reader.cancel();
      return;
    }
    if (done) break;
  }
  if (buffer) {
    if (buffer.startsWith('data:')) eventData.push(buffer.slice(5).replace(/^ /, ''));
  }
  dispatch();
  if (!doneSeen) {
    throw new Error('Java 对话流提前结束，未收到完成事件。');
  }
}

export function shouldUsePlannerChannel(input) {
  if (state.view !== 'planning') return false;
  // 路由由用户在右上角明确选择。规划模式的每一轮都走 Java Planner，
  // 避免选中站点后再用关键词猜测，导致后续追问掉回普通 SSE 流。
  if (state.chatMode === 'planner') return true;
  return false;
}

function setPlannerChatMeta(response = {}) {
  state.chatMeta = {
    channel: 'planner',
    hasProposal: Boolean(response.proposalId)
  };
}

function friendlyPlannerError(error) {
  if (error?.status === 401) return '行程规划需要登录，请先登录后再试。';
  if (error?.status === 404 || error?.data?.code === 'PLANNER_SESSION_NOT_FOUND') {
    return '当前规划会话需要重新建立，行程草稿仍然保留。';
  }
  if (error?.status === 409) return '行程刚刚发生变化，请刷新当前行程后再试。';
  return '这次规划暂时没有返回结果。你可以切换到聊天模式继续咨询，或稍后重试。';
}

function chatErrorText(raw) {
  if (raw && typeof raw === 'object') {
    return [raw.code, raw.message, raw.error, raw.detail].filter(Boolean).join(' ');
  }
  const text = String(raw || '');
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') return chatErrorText(parsed);
  } catch {}
  return text;
}

function isEmptyChatResult(raw) {
  return /未返回(?:完整)?内容|没有返回(?:完整)?内容|未能完成本次回答|空回复|无内容|empty(?:\s+response|\s+content)|no\s+content/i.test(chatErrorText(raw));
}

function chatUnknownReply(activeStopName = '') {
  const target = activeStopName ? `“${activeStopName}”` : '这条问题';
  return `我暂时没有查到${target}的完整资料。你可以换个问法，或者告诉我更关心开放时间、交通、亮点还是适合人群，我再继续帮你查。`;
}

function classifyChatFailure(error) {
  const status = Number(error?.status || 0);
  const detail = chatErrorText(error?.data || error?.message || error);
  if (status === 401) {
    return { kind: 'auth', message: '聊天功能需要登录，请先登录后再试。' };
  }
  if (status === 403) {
    return { kind: 'auth', message: '当前账号暂时没有使用聊天服务的权限，请联系管理员。' };
  }
  if (isEmptyChatResult(detail)) {
    return { kind: 'unknown', message: chatUnknownReply() };
  }
  if (status === 408 || status === 504 || /超时|timeout|连接中断|网络连接异常|提前结束|未收到完成事件/i.test(detail)) {
    return { kind: 'temporary', message: '我刚才查询得有点慢，暂时还没拿到完整结果。你可以稍后重试，或者换个更具体的问题。' };
  }
  return { kind: 'temporary', message: '我刚才没有拿到完整回答。你可以稍后重试，也可以换个更具体的问法。' };
}

/**
 * 从大模型回答文本中解析 <action_chip ... /> 标签，
 * 并返回清洗后的纯正文文本与结构化卡片数组。
 */
export function extractActionChips(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { cleanContent: '', chips: [] };
  }
  const chips = [];
  const tagRegex = /<action_chip(?:\s+|(?=[a-zA-Z_-]))([^>]+?)\s*\/?>/gi;
  let match;
  while ((match = tagRegex.exec(rawContent)) !== null) {
    const attrStr = match[1];
    const attrs = {};
    const attrRegex = /([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      const key = attrMatch[1];
      const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      attrs[key] = val;
    }
    if (attrs.action && attrs.label) {
      chips.push({
        action: attrs.action,
        icon: attrs.icon || '✦',
        label: attrs.label,
        payload: attrs.payload || attrs.label
      });
    }
  }

  // 清洗正文中的标签，并剔除末尾可能残缺的流式标签前缀（如 "<action_chip"）
  let cleanContent = rawContent.replace(tagRegex, '');
  cleanContent = cleanContent.replace(/<action_chip(?:\s+|(?=[a-zA-Z_-]))?[^>]*$/i, '');
  cleanContent = cleanContent.trimEnd();

  return { cleanContent, chips };
}

/**
 * 对行动建议卡片进行语义去重与数量控制：
 * 1. 同一行动类型（如 add_stop, save_memory, replace_stop 等）全局最多保留 1 个最精准的卡片；
 * 2. 标签文本唯一（剔除括号补充说明如 "(20分钟)"、空白等）；
 * 3. 总体卡片数量严格限制在 2~3 个以内，彻底杜绝重复。
 */
export function deduplicateSuggestions(chips) {
  if (!Array.isArray(chips) || chips.length === 0) return [];
  const seenActions = new Set();
  const seenLabels = new Set();
  const result = [];
  for (const chip of chips) {
    if (!chip || !chip.action || !chip.label) continue;
    const actionKey = String(chip.action).trim().toLowerCase();
    const normLabel = String(chip.label).trim().replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '');
    if (seenActions.has(actionKey)) continue;
    if (seenLabels.has(normLabel)) continue;

    seenActions.add(actionKey);
    seenLabels.add(normLabel);
    result.push(chip);
    if (result.length >= 3) break;
  }
  return result;
}

export async function sendChatMessage(options = {}, maybePreserveInput = false) {
  let opts = options;
  if (typeof options === 'string') {
    opts = { inputOverride: options, preserveInput: maybePreserveInput === true };
  } else if (opts?.inputOverride && typeof opts.inputOverride === 'object') {
    opts = { ...opts, ...opts.inputOverride };
  }
  const { renderView, scheduleTripMap, inputOverride, preserveInput = false } = opts || {};
  const inputEl = document.querySelector('#chat-input');
  const hasInputOverride = typeof inputOverride === 'string';
  const input = String(hasInputOverride ? inputOverride : ((inputEl ? inputEl.value : state.chatInput) || state.chatInput || '')).trim();
  if (!input || state.chatLoading) return;
  if (input.length > 4000) return toast('对话内容过长，请分段发送。');
  let usePlannerChannel = false;
  try {
    // 在写入 pending/loading 状态前完成路由判断，避免前置异常遗留永久 loading。
    usePlannerChannel = shouldUsePlannerChannel(input);
  } catch (error) {
    console.error('Chat channel routing failed', error);
    toast('聊天请求初始化失败，请重试。');
    return;
  }
  state.chatRoute = usePlannerChannel ? 'planner' : 'chat';
  console.info('[CHAT_ROUTE]', {
    channel: state.chatRoute,
    messageLength: input.length,
    hasPlannerSession: Boolean(state.sessionId),
    hasSelectedStop: Boolean(state.selectedStopId)
  });
  const tripChatKey = !state.user && state.view === 'guest-chat'
    ? getGuestChatSessionId()
    : (state.chatSessionId || getTripChatKey(state.savedTripId, state.sessionId));
  state.chatSessionId = tripChatKey;
  state.chatMessages.push({ role: 'user', content: input });
  const assistant = { role: 'assistant', content: '', rawContent: '', pending: true, retryMessage: input };
  state.chatMessages.push(assistant);
  if (!hasInputOverride || !preserveInput) {
    state.chatInput = '';
    if (inputEl) inputEl.value = '';
  }
  state.chatMeta = null;
  state.tripChatHistories = state.tripChatHistories || {};
  state.tripChatHistories[tripChatKey] = state.chatMessages;
  persistChatUiState();
  void queueTravelMemoryObservation(input);
  activeChatAbortController?.abort();
  activeChatAbortController = new AbortController();
  state.chatLoading = true;
  renderChatInDOM({ scrollToBottom: true }, renderView);
  const activeStop = state.trip?.days?.flatMap((day) => day.stops || [])
    .find((stop) => stop.id === state.selectedStopId);
  const activeStopName = activeStop?.name || '';

  // 1. 详情页规划微调会话通道：全量自然语言统一路由至服务端语义处理入口，不再通过前端关键词正则拦截
  if (usePlannerChannel) {
    if (!state.sessionId) {
      state.sessionId = state.savedTripId || state.trip?.id || null;
    }
    if (!state.sessionId) {
      assistant.content = '当前行程的局部调整会话已失效。请从“我的行程”重新打开这份行程后再调整；也可以切换到聊天继续咨询。';
      assistant.error = '当前行程暂时无法进入局部调整';
      assistant.offerChatMode = true;
      assistant.pending = false;
      state.chatLoading = false;
      persistConversationUiState();
      renderChatInDOM({ scrollToBottom: true }, renderView);
      toast('当前行程需要重新打开后才能局部调整。');
      return;
    }
    if (state.legacyMode || state.adjustmentCapability === 'LEGACY' || state.trip?.plannerVersion === 'legacy-v0') {
      const isAdjustmentIntent = /(不想去|换一个|替换|换掉|有没有替换|有替换方案吗|换个地方|推荐其他|删除|去掉|移除|下雨|雨天|避雨|太赶|太累|少推荐|少安排|加上|添加|加入|换成第|选第|应用方案|改|重新排|重排)/.test(input);
      if (isAdjustmentIntent) {
        state.activeProposal = null;
        assistant.content = '当前保存行程暂时不能生成调整预览。你可以切换到聊天模式继续咨询，或重新生成一份行程。';
        assistant.offerChatMode = true;
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        toast('传统基准规划模式下已禁用 AI 局部调整。');
        return;
      }
    }

    try {
      const convRes = await request('/api/planner/conversation', {
        method: 'POST',
        signal: activeChatAbortController.signal,
        body: JSON.stringify({
          sessionId: state.sessionId,
          planId: state.sessionId,
          baseRevision: state.trip ? Number(state.trip.version || 1) : 1,
          message: input,
          context: {
            activeDay: Number(state.activeDay || 1),
            selectedStopId: state.selectedStopId || null,
            selectedStopIds: Array.from(state.selectedStopIds || []),
            activeProposalId: state.activeProposal ? state.activeProposal.proposalId : null,
            pinnedStopIds: Array.from(state.pinnedStopIds || [])
          },
          sessionAccessToken: state.sessionAccessToken || '',
          idempotencyKey: plannerIdempotencyKey('planner-conversation')
        })
      });
      setPlannerChatMeta(convRes);

      if (convRes.legacyMode || convRes.adjustmentCapability === 'LEGACY') {
        state.legacyMode = true;
        state.adjustmentCapability = 'LEGACY';
        state.activeProposal = null;
        state.selectedOptionId = 'option-1';
        assistant.content = convRes.message || '当前保存行程不支持新版 AI 局部调整，请重新生成 V1 行程。';
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        toast('当前保存行程处于 Legacy 模式，已禁用新版 AI 局部调整。');
        return;
      }
      state.legacyMode = false;
      state.adjustmentCapability = convRes.adjustmentCapability || 'V1_PROPOSAL';

      // QA 问答类型响应（如果 planner 给出的只是一句泛化的兜底回复，且并未命中具体景点，也应平滑进入流式大模型深层回答）
      if (convRes.type === 'PLACE_QUESTION' || convRes.operation === 'QA') {
        const answer = String(convRes.answer || convRes.message || '').trim();
        const isGenericFallback = !answer
          || answer.includes('关于重庆旅游景点，您可以随时在行程中点击卡片提问')
          || answer.includes('暂时没有从高德核验到该景点的详情')
          || answer.includes('高德暂时没有找到');
        if (!isGenericFallback) {
          assistant.content = answer;
          assistant.pending = false;
          state.chatLoading = false;
          persistConversationUiState();
          renderChatInDOM({ scrollToBottom: true }, renderView);
          return;
        }
      }

      // 仅变更选项选中态，不直接修改行程
      if (convRes.type === 'PROPOSAL_OPTION_SELECTED' || convRes.operation === 'OPTION_SELECT') {
        if (convRes.selectedOptionId) {
          state.selectedOptionId = convRes.selectedOptionId;
          document.querySelectorAll('.candidate-option-card').forEach((el) => {
            const isThis = el.dataset.optionId === convRes.selectedOptionId;
            el.classList.toggle('selected', isThis);
            const radio = el.querySelector('input[type="radio"]');
            if (radio) radio.checked = isThis;
          });
        }
        assistant.content = convRes.message || '已为您选中国方案。请在下方方案卡片中点击【确认应用】以生效。';
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }

      // 单轮精准澄清响应（仅针对明确的排程调整意图，如加景点缺少地点等）
      const isUnknownIntent = convRes.type === 'UNKNOWN' || convRes.operation === 'UNKNOWN';
      if (!isUnknownIntent && (convRes.requiresClarification || convRes.type === 'CLARIFICATION')) {
        assistant.content = convRes.clarificationQuestion || convRes.message || '请补充具体景点信息。';
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }

      // 生成了 Proposal 预览方案卡片
      if (convRes.proposalId) {
        state.activeProposal = convRes;
        state.selectedOptionId = 'option-1';
        state.plannerProposalDockOpen = true;
        state.suggestionDismissed = false;
        assistant.content = convRes.message || (convRes.feasible ? '已为你生成调整方案预览，请打开独立方案窗口查看。' : '这次调整不太建议，我已准备好坚持当前选择或换其他方案。');
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }

      // 确认应用成功后更新行程
      if (convRes.applied && convRes.trip) {
        state.trip = convRes.trip;
        state.activeProposal = null;
        state.plannerProposalDockOpen = false;
        state.selectedStopId = null;
        if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
        state.suggestionDismissed = false;
        saveUserPlan(state.user?.id, {
          trip: state.trip,
          sessionId: state.sessionId,
          savedTripId: state.savedTripId,
          prompt: state.prompt,
          view: 'planning',
          activeProposal: null,
          selectedOptionId: state.selectedOptionId || 'option-1'
        });
        persistChatUiState();
        assistant.content = convRes.message || '调整方案已成功应用并生成新版本！';
        assistant.pending = false;
        state.chatLoading = false;
        toast(`行程调整已应用！当前为第 ${convRes.currentVersion || convRes.trip.version} 版`);
        if (renderView) renderView();
        if (scheduleTripMap) scheduleTripMap();
        return;
      }

      // 如果是非排程调整操作（如泛化的景点推荐咨询、闲聊或通用问答），
      // 不在规划通道内硬性拦截，而是平滑穿透并流转入下方的通用流式问答通道 (readChatStream)。
      if (!isUnknownIntent) {
        assistant.content = convRes.answer || convRes.message || '规划请求已收到，请补充具体的景点或调整目标。';
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }
    } catch (err) {
      const sessionUnavailable = err?.status === 404
        && (err.data?.code === 'PLANNER_SESSION_NOT_FOUND' || err.data?.recoverable === true);
      if (sessionUnavailable) {
        const message = '当前规划会话已过期，但行程草稿仍保留。请重新生成行程，或从“我的行程”重新打开已保存行程。';
        state.activeProposal = null;
        state.sessionAccessToken = null;
        state.sessionId = null;
        state.legacyMode = false;
        state.adjustmentCapability = 'V1_PROPOSAL';
        assistant.error = '规划会话需要恢复';
        assistant.offerChatMode = true;
        assistant.content = message;
        assistant.pending = false;
        state.chatLoading = false;
        saveUserPlan(state.user?.id, {
          trip: state.trip,
          sessionId: null,
          savedTripId: state.savedTripId,
          prompt: state.prompt,
          view: 'planning'
        });
        toast(message);
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }
      const expired = err.status === 400 && /过期|不存在|expired/i.test(`${err.message || ''} ${err.data?.code || ''}`);
      if (expired) {
        state.activeProposal = null;
        state.selectedOptionId = 'option-1';
        assistant.content = '调整方案已过期，请重新发送调整要求生成新的预览。';
        assistant.pending = false;
        state.chatLoading = false;
        persistConversationUiState();
        toast(assistant.content);
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }
      if (err.status === 409) {
        toast('行程版本已在其他操作中更新（409 Conflict），正在重新加载最新行程...');
        state.activeProposal = null;
        try {
          const reloaded = await request(`/api/planner/sessions/${encodeURIComponent(state.sessionId)}`);
          if (reloaded.trip) state.trip = reloaded.trip;
        } catch {}
        if (renderView) renderView();
        persistConversationUiState();
        return;
      }
      if (err?.name === 'AbortError') {
        assistant.pending = false;
        assistant.content = assistant.content || '本次回复已停止，你可以继续提问。';
        state.chatLoading = false;
        activeChatAbortController = null;
        persistConversationUiState();
        renderChatInDOM({ scrollToBottom: true }, renderView);
        return;
      }
      const plannerError = friendlyPlannerError(err);
      assistant.error = plannerError;
      assistant.content = '这次规划没有生成结果。你可以切换到聊天模式继续咨询，或稍后重试。';
      assistant.offerChatMode = true;
      assistant.pending = false;
      state.chatLoading = false;
      activeChatAbortController = null;
      persistConversationUiState();
      renderChatInDOM({ scrollToBottom: true }, renderView);
      toast(plannerError);
      return;
    }
  }

  // 2. 通用问答与兜底流式通道
  try {
    let assistantMeta = null;
    // 用户看到的是“聊天模式”，底层聊天检索统一走 Agentic RAG 深度链路。
    await readChatStream(input, state.chatSessionId, 'deep', {
      plannerSessionId: state.sessionId || '',
      tripId: state.savedTripId || '',
      currentVersion: state.trip?.version || '',
      activeDay: state.activeDay || '',
      activeStopId: activeStop?.id || '',
      activeStopName: activeStop?.name || ''
    }, (eventName, raw) => {
      if (eventName === 'progress') {
        let progress = raw;
        try {
          const parsed = JSON.parse(raw);
          progress = parsed?.message || raw;
          assistant.progressStage = parsed?.stage || '';
        } catch {}
        assistant.progress = String(progress || '正在处理请求');
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } else if (eventName === 'meta') {
        try {
          state.chatMeta = JSON.parse(raw);
          assistantMeta = state.chatMeta?.assistant || null;
          const suggestions = state.chatMeta?.actionableSuggestions || state.chatMeta?.assistant?.actionableSuggestions;
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            assistant.actionableSuggestions = deduplicateSuggestions(suggestions);
          }
          const pref = state.chatMeta?.detectedPreference || state.chatMeta?.assistant?.detectedPreference;
          if (pref) {
            assistant.detectedPreference = pref;
          }
        } catch {
          state.chatMeta = { retrieval: { reason: raw } };
        }
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } else if (eventName === 'message' || eventName === 'text') {
        let text = raw;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'string') text = parsed;
        } catch {}
        assistant.rawContent = (assistant.rawContent || '') + text;
        const { cleanContent, chips } = extractActionChips(assistant.rawContent);
        assistant.content = cleanContent;
        if (chips.length > 0) {
          const merged = [...(assistant.actionableSuggestions || []), ...chips];
          assistant.actionableSuggestions = deduplicateSuggestions(merged);
        }
        assistant.pending = true;

        const transcript = document.querySelector('.chat-panel .chat-transcript');
        if (transcript) {
          const lastMsg = transcript.querySelector('.chat-message-assistant:last-child .chat-message-content');
          if (lastMsg) {
            lastMsg.innerHTML = renderMarkdownStreaming(assistant.content);
            const isNearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 120;
            if (isNearBottom) {
              transcript.scrollTop = transcript.scrollHeight;
            }
          }
        }
      } else if (eventName === 'sentiment') {
        assistant.sentiment = raw;
      } else if (eventName === 'error') {
        const failure = classifyChatFailure(raw);
        assistant.failureKind = failure.kind;
        if (failure.kind === 'unknown') {
          // “查不到资料”是正常的内容结果，不把用户推进红色错误态。
          delete assistant.error;
          assistant.content = assistant.content || chatUnknownReply(activeStopName);
        } else {
          assistant.error = failure.kind === 'auth' ? failure.message : '本次查询暂时未完成';
          assistant.content = assistant.content || failure.message;
        }
        assistant.offerAdjustmentMode = false;
        assistant.pending = false;
        renderChatInDOM({ scrollToBottom: true }, renderView);
      }
    }, activeChatAbortController.signal);
  } catch (error) {
    assistant.pending = false;
    if (error?.name === 'AbortError') {
      assistant.content = assistant.content || '本次回复已停止，你可以继续提问。';
      return;
    }
    const failure = classifyChatFailure(error);
    assistant.failureKind = failure.kind;
    if (failure.kind === 'unknown') {
      delete assistant.error;
      assistant.content = assistant.content || chatUnknownReply(activeStopName);
    } else {
      assistant.error = failure.kind === 'auth' ? failure.message : '本次查询暂时未完成';
      assistant.content = assistant.content || failure.message;
      toast(failure.message);
    }
    assistant.offerAdjustmentMode = false;
  } finally {
    assistant.pending = false;
    activeChatAbortController = null;
    state.chatLoading = false;
    if (assistant.rawContent) {
      const { cleanContent, chips } = extractActionChips(assistant.rawContent);
      assistant.content = cleanContent;
      if (chips.length > 0) {
        const merged = [...(assistant.actionableSuggestions || []), ...chips];
        assistant.actionableSuggestions = deduplicateSuggestions(merged);
      }
    }
    if (!assistant.content.trim() && !assistant.error) {
      assistant.content = chatUnknownReply(activeStopName);
    }
    if (assistant.actionableSuggestions?.some((s) => s.action === 'save_memory')) {
      state.memoryCandidate = null;
    } else if (!assistant.error && !assistant.pending) {
      await queueTravelMemoryObservation(input);
    }
    persistChatUiState();
    renderChatInDOM({ scrollToBottom: true }, renderView);
    window.setTimeout(() => document.querySelector('#chat-input')?.focus(), 0);
  }
}

export async function applyPlannerProposal({ renderView, scheduleTripMap, renderChatInDOM: passedRenderChatInDOM } = {}) {
  const chatRender = passedRenderChatInDOM || renderChatInDOM;
  const safeRenderChat = (opts, rv) => {
    if (typeof chatRender === 'function') {
      try {
        chatRender(opts, rv);
      } catch (e) {
        console.warn('[chat-service] safeRenderChat failed:', e);
      }
    }
  };
  if (!state.activeProposal) return;
  if (state.legacyMode || state.adjustmentCapability === 'LEGACY') {
    state.activeProposal = null;
    toast('当前保存行程处于 Legacy 模式，不支持新版 AI 局部调整。');
    safeRenderChat({ scrollToBottom: false }, renderView);
    return;
  }
  const baseRevision = Number(state.activeProposal.baseRevision || state.trip?.version || 1);
  const expectedVersion = baseRevision + 1;
  state.chatLoading = true;
  safeRenderChat({ scrollToBottom: false }, renderView);
  try {
    const res = await request('/api/planner/adjust/apply', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        proposalId: state.activeProposal.proposalId,
        optionId: state.selectedOptionId || 'option-1',
        baseRevision,
        forceApply: true,
        sessionAccessToken: state.sessionAccessToken || '',
        idempotencyKey: plannerIdempotencyKey('planner-apply')
      })
    });
    const currentVersion = Number(res.currentVersion ?? res.trip?.version);
    if (!res.trip || currentVersion !== expectedVersion) {
      throw Object.assign(new Error('服务端返回的行程版本不是严格的 Revision +1，已保留当前行程。'), { status: 502 });
    }
    state.trip = res.trip;
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedStopId = null;
    if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.stop').forEach((element) => {
        element.classList.remove('selected-stop-card');
        const button = element.querySelector('[data-action="select-stop"], [data-action="clear-selected-stop"]');
        if (button) {
          button.classList.remove('active-btn');
          button.dataset.action = 'select-stop';
          const isDining = element.classList.contains('dining-stop-card');
          button.textContent = isDining ? '选中此餐' : '选中此站';
        }
        element.querySelector('.chip-selected')?.remove();
      });
    }
    state.suggestionDismissed = false;
    state.plannerVersion = res.plannerVersion || state.trip?.plannerVersion || state.plannerVersion;
    saveUserPlan(state.user?.id, {
      trip: state.trip,
      sessionId: state.sessionId,
      savedTripId: state.savedTripId,
      prompt: state.prompt,
      view: 'planning'
    });
    toast(`已成功应用调整！当前为第 ${currentVersion} 版`);
    if (renderView) renderView();
    if (scheduleTripMap) scheduleTripMap();
    safeRenderChat({ scrollToBottom: false }, renderView);
  } catch (error) {
    const expired = error.status === 400 && /过期|不存在|expired/i.test(`${error.message || ''} ${error.data?.code || ''}`);
    const sessionUnavailable = error?.status === 404
      && (error.data?.code === 'PLANNER_SESSION_NOT_FOUND' || error.data?.recoverable === true);
    if (sessionUnavailable) {
      const message = '当前规划会话已过期，但行程草稿仍保留。请重新生成行程，或从“我的行程”重新打开已保存行程。';
      state.activeProposal = null;
      state.sessionAccessToken = null;
      state.sessionId = null;
      state.legacyMode = false;
      state.adjustmentCapability = 'V1_PROPOSAL';
      saveUserPlan(state.user?.id, {
        trip: state.trip,
        sessionId: null,
        savedTripId: state.savedTripId,
        prompt: state.prompt,
        view: 'planning'
      });
      toast(message);
      safeRenderChat({ scrollToBottom: false }, renderView);
    } else if (error.status === 409) {
      toast('行程版本已在其他操作中更新（409 Conflict），正在重新加载最新行程...');
      state.activeProposal = null;
      if (state.sessionId) {
        try {
          const latest = await request(`/api/planner/sessions/${encodeURIComponent(state.sessionId)}`);
          if (latest.trip) state.trip = latest.trip;
          state.legacyMode = Boolean(latest.legacyMode);
          state.adjustmentCapability = latest.adjustmentCapability || (state.legacyMode ? 'LEGACY' : 'V1_PROPOSAL');
        } catch {}
      }
      if (renderView) renderView();
    } else if (expired) {
      state.activeProposal = null;
      state.selectedOptionId = 'option-1';
      toast('调整方案已过期，请重新发送调整要求生成新的预览。');
      safeRenderChat({ scrollToBottom: false }, renderView);
    } else {
      toast(error?.status === 401 ? '行程规划需要登录，请先登录后再试。' : '这次方案暂时没有应用成功，请重新生成预览后再试。');
    }
  } finally {
    state.chatLoading = false;
    safeRenderChat({ scrollToBottom: false }, renderView);
  }
}
