import { state } from '../../app-core/state.js';
import { deviceId, request as apiRequest } from '../../shared/api/client.js';
import { renderMarkdownStreaming } from '../../shared/lib/markdown.js';
import { captureWorkspace } from '../../app-core/workspace-lifecycle.js';
import { transitionMainView } from '../../app-core/main-view-transition.js';
import { getTripChatKey, loadUserChats, saveUserChats } from '../../app-core/user-store.js';
import { adoptTripWorkspace } from '../trip-workspace/workspace-service.js';

/**
 * 读取统一智能体 SSE 流（POST /api/agent/stream）。
 *
 * 兼容后端 AgentController 输出的 JSON 信封（{ event, step, phase, toolName, message, data }），
 * 并在收到 done 事件前严格检测意外断流。
 */
export async function readAgentStream(payload = {}, onEvent, signal) {
  let response;
  try {
    response = await fetch('/api/agent/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'x-yuyouzhice-device': deviceId(),
        ...(state.csrfToken ? { 'x-yuyouzhice-csrf': state.csrfToken } : {})
      },
      body: JSON.stringify(payload),
      signal
    });
  } catch (netErr) {
    if (netErr?.name === 'AbortError') throw netErr;
    throw Object.assign(new Error('网络连接异常，无法连接智能体服务。'), { status: 0, cause: netErr });
  }

  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw Object.assign(new Error(data.message || '智能体服务暂不可用。'), { status: response.status, data });
  }
  if (!response.body) {
    throw new Error('Java Core Backend 未返回智能体事件流。');
  }

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
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { event: dispatchedEvent, message: raw, data: {} };
    }
    if (dispatchedEvent === 'done') doneSeen = true;
    if (typeof onEvent === 'function') {
      onEvent(dispatchedEvent, parsed, raw);
    }
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
    }
    if (doneSeen) {
      await reader.cancel().catch(() => {});
      return;
    }
    if (done) break;
  }

  if (buffer && buffer.startsWith('data:')) {
    eventData.push(buffer.slice(5).replace(/^ /, ''));
  }
  dispatch();
  if (!doneSeen) {
    throw new Error('智能体事件流提前结束，未收到完成事件。');
  }
}

/**
 * 提交人机确认（HIL）决策：批准执行（approved=true）或取消（approved=false）。
 */
export async function confirmAgentAction(
  { confirmId = '', approved = false, sessionId = 'default', plannerSessionId = '' } = {},
  { request = apiRequest, signal } = {}
) {
  return request('/api/agent/confirm', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      confirmId: String(confirmId || ''),
      approved: Boolean(approved),
      sessionId: String(sessionId || 'default'),
      plannerSessionId: String(plannerSessionId || '')
    })
  });
}

/**
 * 驱动一次完整的智能体对话轮次并实时更新助手消息轨迹与确认卡。
 */
export async function runAgentStreamTurn({
  input,
  assistant,
  controller,
  owns,
  isTurnActive,
  adoptTurnBaseline,
  memorySessionId,
  activeStopId = '',
  activeStopName = '',
  requestDay = 1,
  requestVersion = null,
  renderView,
  renderChatInDOM,
  persistChatUiState,
  saveUserPlan,
  scheduleTripMap,
  toast
} = {}) {
  assistant.agentSteps = [];
  assistant.toolResults = [];
  assistant.citations = [];
  assistant.confirmRequest = null;

  try {
    await readAgentStream({
      message: input,
      sessionId: memorySessionId || 'default',
      mode: 'deep',
      plannerSessionId: state.sessionId || '',
      tripId: state.savedTripId || '',
      baseRevision: state.trip ? Number(state.trip.version || requestVersion || 1) : null,
      activeCity: state.trip?.city || '重庆',
      activeDay: state.trip ? Number(requestDay || 1) : null,
      activeStopId: activeStopId || '',
      activeStopName: activeStopName || ''
    }, (eventName, envelope) => {
      if (!owns()) return;
      const stepNum = Number(envelope?.step || 0);
      const phase = String(envelope?.phase || '');
      const toolName = String(envelope?.toolName || '');
      const msgText = String(envelope?.message || '');
      const data = envelope?.data && typeof envelope.data === 'object' ? envelope.data : {};

      if (eventName === 'agent_step') {
        const label = stepNum > 0 ? `第 ${stepNum} 步 · ${msgText || phase}` : (msgText || '正在处理…');
        assistant.progress = label;
        assistant.agentSteps.push({ step: stepNum, phase, toolName, message: msgText });
        renderChatInDOM?.({ scrollToBottom: false }, renderView);
      } else if (eventName === 'tool_result') {
        const ok = data.ok !== false;
        const resolvedTool = toolName || String(data.tool || '');
        assistant.toolResults.push({
          step: stepNum,
          toolName: resolvedTool,
          ok,
          summary: msgText || String(data.summary || (ok ? '已完成' : '执行失败'))
        });
        if (ok && data.createdTrip && data.plannerSessionId) {
          const oldChatKey = state.chatSessionId;
          state.sessionId = String(data.plannerSessionId);
          state.trip = data.createdTrip;
          state.savedTripId = null;
          state.activeProposal = null;
          state.selectedOptionId = 'option-1';
          state.selectedStopId = null;
          state.pinnedStopIds = new Set(Array.isArray(data.createdTrip?.pinnedStopIds) ? data.createdTrip.pinnedStopIds : []);
          const nextChatKey = getTripChatKey(null, state.sessionId);
          if (nextChatKey) {
            state.chatSessionId = nextChatKey;
            state.tripChatHistories = state.tripChatHistories || {};
            state.tripChatHistories[nextChatKey] = state.chatMessages;
            if (oldChatKey && oldChatKey !== nextChatKey) delete state.tripChatHistories[oldChatKey];
            saveUserChats?.(state.user?.id, state.tripChatHistories);
          }
          adoptTurnBaseline?.({
            sessionId: state.sessionId,
            savedTripId: state.savedTripId,
            version: Number(state.trip?.version || 1)
          });
          if (state.view !== 'planning') {
            transitionMainView(state, 'planning');
            state.chatDockOpen = true;
          }
          saveUserPlan?.(state.user?.id, {
            trip: state.trip,
            sessionId: state.sessionId,
            savedTripId: null,
            prompt: state.prompt,
            view: state.view,
            chatMode: state.chatMode
          });
          renderView?.();
          scheduleTripMap?.();
          toast?.('智能体已为您生成新行程草案！');
        }
        renderChatInDOM?.({ scrollToBottom: false }, renderView);
      } else if (eventName === 'citations') {
        const list = Array.isArray(data.citations) ? data.citations : [];
        if (list.length > 0) {
          assistant.citations = list;
        }
      } else if (eventName === 'confirm_request') {
        const confirmId = String(data.confirmId || '');
        assistant.confirmRequest = {
          confirmId,
          toolName: toolName || String(data.tool || ''),
          toolCallId: String(data.toolCallId || ''),
          summary: msgText || String(data.summary || '以下操作涉及修改行程或个人偏好，请确认后执行。'),
          args: data.args && typeof data.args === 'object' ? data.args : {},
          expiresAtMillis: Number(data.expiresAtMillis || 0),
          status: 'pending',
          loading: false,
          error: '',
          receipt: null
        };
        if (!assistant.content.trim()) {
          assistant.content = '我已准备好变更方案，请核对下方确认卡后决定是否执行：';
        }
        assistant.pending = false;
        renderChatInDOM?.({ scrollToBottom: true }, renderView);
      } else if (eventName === 'message') {
        assistant.content = (assistant.content || '') + msgText;
        assistant.pending = true;
        if (typeof document !== 'undefined') {
          const transcript = document.querySelector('.chat-panel .chat-transcript');
          const lastMsg = transcript?.querySelector('.chat-message-assistant:last-child .chat-message-content');
          if (lastMsg) {
            lastMsg.innerHTML = renderMarkdownStreaming(assistant.content);
            if (transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 120) {
              transcript.scrollTop = transcript.scrollHeight;
            }
          }
        }
      } else if (eventName === 'error') {
        assistant.error = msgText || '智能体执行遇到异常';
        assistant.failureKind = 'temporary';
        if (!assistant.content.trim()) {
          assistant.content = assistant.error;
        }
        assistant.pending = false;
        renderChatInDOM?.({ scrollToBottom: true }, renderView);
      }
    }, controller?.signal);
  } catch (error) {
    assistant.pending = false;
    const activeTurn = typeof isTurnActive === 'function' ? isTurnActive() : owns();
    if (!activeTurn && !owns()) return;
    if (error?.name === 'AbortError') {
      assistant.content = assistant.content || '本次回复已停止，你可以继续提问。';
      return;
    }
    assistant.error = error?.message || '智能体服务暂时不可用';
    assistant.failureKind = Number(error?.status || 0) === 401 ? 'auth' : 'temporary';
    if (!assistant.content.trim()) {
      assistant.content = assistant.error;
    }
    toast?.(assistant.error);
  } finally {
    assistant.pending = false;
    const activeTurn = typeof isTurnActive === 'function' ? isTurnActive() : owns();
    if (!activeTurn && !owns()) return;
    state.chatLoading = false;
    if (!assistant.content.trim() && !assistant.error && !assistant.confirmRequest) {
      assistant.content = '已完成核查，但暂未生成有效回答，请换个问法再试。';
    }
    persistChatUiState?.();
    renderChatInDOM?.({ scrollToBottom: true }, renderView);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.setTimeout(() => document.querySelector('#chat-input')?.focus(), 0);
    }
  }
}

/**
 * 处理用户点击 HIL 确认卡上的【确认执行】或【取消】动作（包含工作区与列表归属保护及防重放）。
 */
export async function executeAgentConfirmDecision({
  confirmId,
  approved,
  messageIndex,
  memorySessionId,
  renderView,
  scheduleTripMap,
  renderChatInDOM,
  saveUserChats,
  saveUserPlan,
  persistTripWorkspace,
  getTripChatKey,
  invalidatePageCache,
  toast,
  request = apiRequest
} = {}) {
  const sourceMessages = state.chatMessages;
  const targetMsg = Number.isInteger(messageIndex) && sourceMessages?.[messageIndex]
    ? sourceMessages[messageIndex]
    : sourceMessages?.find((m) => m?.confirmRequest?.confirmId === confirmId);
  const confirmReq = targetMsg?.confirmRequest;
  if (!confirmReq || confirmReq.confirmId !== confirmId) {
    toast?.('未找到对应的确认请求，请刷新或重新提问。');
    return false;
  }
  if (confirmReq.loading || confirmReq.status !== 'pending') {
    return true;
  }

  const owner = captureWorkspace({ exact: true });
  const requestUserId = state.user?.id;
  confirmReq.loading = true;
  confirmReq.error = '';
  renderChatInDOM?.({ scrollToBottom: false }, renderView);

  try {
    const res = await confirmAgentAction({
      confirmId,
      approved: Boolean(approved),
      sessionId: memorySessionId || 'default',
      plannerSessionId: state.sessionId || ''
    }, { request });

    if (!owner.owns() || state.user?.id !== requestUserId || state.chatMessages !== sourceMessages) {
      return true;
    }
    confirmReq.loading = false;

    if (!approved || res?.cancelled) {
      confirmReq.status = 'cancelled';
      confirmReq.receipt = res || { ok: true, cancelled: true };
      toast?.('已取消该操作，当前行程与偏好均未修改。');
    } else if (res?.ok) {
      confirmReq.status = 'approved';
      confirmReq.receipt = res;
      if (res.data?.applied && res.data?.trip) {
        state.trip = res.data.trip;
        if (Array.isArray(res.data?.pinnedStopIds)) {
          state.pinnedStopIds = new Set(res.data.pinnedStopIds);
        }
        state.activeProposal = null;
        state.selectedOptionId = 'option-1';
        saveUserPlan?.(state.user?.id, {
          trip: state.trip,
          sessionId: state.sessionId,
          savedTripId: state.savedTripId,
          prompt: state.prompt,
          view: state.view || 'planning',
          chatMode: state.chatMode,
          activeProposal: null,
          selectedOptionId: 'option-1'
        });
        toast?.(res.message || `行程已更新（v${res.data.currentVersion || state.trip.version}）`);
        if (renderView) renderView();
        if (scheduleTripMap) scheduleTripMap();
      } else if (res.data?.saved && res.data?.tripId) {
        const oldChatKey = state.chatSessionId || getTripChatKey?.(null, state.sessionId);
        const savedId = String(res.data.tripId);
        state.savedTripId = savedId;
        if (state.trip) {
          state.trip.savedTripId = savedId;
          state.trip.formalTripId = savedId;
          if (res.data?.trip?.title) state.trip.title = String(res.data.trip.title);
          if (res.data?.currentVersion) state.trip.sourceTripVersion = Number(res.data.currentVersion);
        }
        if (oldChatKey) {
          const newChatKey = getTripChatKey?.(savedId, null);
          if (newChatKey && newChatKey !== oldChatKey) {
            const histories = loadUserChats?.(state.user?.id) || { ...(state.tripChatHistories || {}) };
            histories[newChatKey] = state.chatMessages;
            delete histories[oldChatKey];
            saveUserChats?.(state.user?.id, histories);
            state.tripChatHistories = histories;
            state.chatSessionId = newChatKey;
          }
        }
        if (res.workspace) {
          adoptTripWorkspace(res.workspace, { userId: state.user?.id, savedTripId: savedId });
        }
        invalidatePageCache?.('trips', 'history', 'profile');
        saveUserPlan?.(state.user?.id, {
          trip: state.trip,
          sessionId: state.sessionId,
          savedTripId: state.savedTripId,
          prompt: state.prompt,
          view: state.view || 'planning',
          chatMode: state.chatMode
        });
        toast?.(res.message || '正式行程已保存。');
        if (renderView) renderView();
      } else {
        if (res.tool === 'confirm_update_user_preferences') {
          invalidatePageCache?.('profile');
        }
        toast?.(res.message || '确认操作已执行成功。');
      }
    } else {
      confirmReq.status = 'expired';
      confirmReq.error = res?.message || '确认执行未生效';
      toast?.(confirmReq.error);
    }

    const chatKey = state.chatSessionId || getTripChatKey?.(state.savedTripId, state.sessionId);
    if (chatKey) {
      state.tripChatHistories = { ...(state.tripChatHistories || {}), [chatKey]: state.chatMessages };
      saveUserChats?.(state.user?.id, state.tripChatHistories);
    }
    void persistTripWorkspace?.();
    renderChatInDOM?.({ scrollToBottom: false }, renderView);
    return true;
  } catch (err) {
    if (!owner.owns() || state.user?.id !== requestUserId || state.chatMessages !== sourceMessages) {
      return true;
    }
    confirmReq.loading = false;
    const status = Number(err?.status || 0);
    if (status === 404 || status === 409 || status === 410 || status === 403) {
      confirmReq.status = 'expired';
    }
    confirmReq.error = err?.message || '确认请求提交失败，请重试。';
    toast?.(confirmReq.error);
    renderChatInDOM?.({ scrollToBottom: false }, renderView);
    return true;
  }
}
