import { readAgentStream } from './agent-transport.js';
import { rememberAgentWorkspace } from './agent-operation.js';
export { readAgentStream, confirmAgentAction } from './agent-transport.js';
export { executeAgentConfirmDecision } from './agent-confirmation.js';
import { state } from '../../app-core/state.js';
import { renderMarkdownStreaming } from '../../shared/lib/markdown.js';
import { transitionMainView } from '../../app-core/main-view-transition.js';
import { getTripChatKey, saveUserChats } from '../../app-core/user-store.js';

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
  const sourceMessages = state.chatMessages;
  const sourceUser = state.user?.id;
  const stillVisible = () => sourceMessages === state.chatMessages && sourceUser === state.user?.id;

  try {
    const requestPayload = assistant.agentOperation?.payload || {
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
    };
    if (assistant.agentOperation) {
      requestPayload.operationId = assistant.agentOperation.operationId;
      assistant.agentOperation.payload = requestPayload;
      // 请求发出前保存重试快照，刷新页面后仍可使用同一个动作身份。
      persistChatUiState?.();
    }
    const MAX_STREAM_RETRIES = 1;
    for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
      let eventsReceived = 0;
      let tripMutatedInTurn = false;
      let streamErrorMessage = '';
      try {
        await readAgentStream(requestPayload, (eventName, envelope) => {
          if (!owns() || !stillVisible()) return;
          eventsReceived += 1;
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
              toolLabel: String(data.toolLabel || ''),
              category: String(data.category || ''),
              ok,
              summary: msgText || String(data.summary || (ok ? '已完成' : '执行失败'))
            });
            if (ok && data.createdTrip && data.plannerSessionId) {
              const revision = data.currentVersion;
              if (!Number.isSafeInteger(revision) || revision < 1 || data.createdTrip.version !== revision)
                throw Object.assign(new Error('新草稿回执版本不一致，已保留当前行程。'), { retryableStream: false });
              if (String(data.plannerSessionId) === String(state.sessionId) && revision < Number(state.trip?.version || 0))
                throw Object.assign(new Error('新草稿回执已过期，已保留较新的行程。'), { retryableStream: false });
              tripMutatedInTurn = true;
              const oldChatKey = state.chatSessionId;
              state.sessionId = String(data.plannerSessionId);
              state.trip = data.createdTrip;
              state.savedTripId = null;
              state.activeProposal = null;
              state.selectedOptionId = 'option-1';
              state.selectedStopId = null;
              state.selectedStopIds = new Set();
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
              rememberAgentWorkspace(assistant.agentOperation, state);
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
              plannerSessionId: state.sessionId || '',
              memorySessionId: requestPayload.sessionId || 'default',
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
            streamErrorMessage = msgText || '智能体执行遇到异常';
            const canRetryLater = attempt < MAX_STREAM_RETRIES
              && !tripMutatedInTurn
              && !assistant.confirmRequest
              && !assistant.content.trim();
            if (!canRetryLater) {
              assistant.error = streamErrorMessage;
              assistant.retryMessage = assistant.retryMessage || input;
              assistant.failureKind = 'temporary';
              if (!assistant.content.trim()) {
                assistant.content = assistant.error;
              }
              assistant.pending = false;
              renderChatInDOM?.({ scrollToBottom: true }, renderView);
            }
          }
        }, controller?.signal);

        if (streamErrorMessage && attempt < MAX_STREAM_RETRIES
            && !tripMutatedInTurn && !assistant.confirmRequest && !assistant.content.trim()
            && !controller?.signal?.aborted && owns() && stillVisible()) {
          assistant.agentSteps = [];
          assistant.toolResults = [];
          assistant.citations = [];
          assistant.error = '';
          assistant.progress = '连接波动，正在自动重试…';
          renderChatInDOM?.({ scrollToBottom: false }, renderView);
          continue;
        }
        break;
      } catch (streamErr) {
        if (streamErr?.name === 'AbortError' || streamErr?.retryableStream === false) {
          throw streamErr;
        }
        const canRetryMidStream = attempt < MAX_STREAM_RETRIES
          && eventsReceived > 0
          && !tripMutatedInTurn
          && !assistant.confirmRequest
          && !assistant.content.trim()
          && Number(streamErr?.status || 0) !== 401
          && !controller?.signal?.aborted
          && owns()
          && stillVisible();
        if (canRetryMidStream) {
          assistant.agentSteps = [];
          assistant.toolResults = [];
          assistant.citations = [];
          assistant.error = '';
          assistant.progress = '连接波动，正在自动重试…';
          renderChatInDOM?.({ scrollToBottom: false }, renderView);
          continue;
        }
        throw streamErr;
      }
    }
  } catch (error) {
    assistant.pending = false;
    const activeTurn = typeof isTurnActive === 'function' ? isTurnActive() : owns();
    if (!stillVisible() || (!activeTurn && !owns())) return;
    if (error?.name === 'AbortError') {
      assistant.content = assistant.content || '本次回复已停止，你可以继续提问。';
      return;
    }
    assistant.error = error?.message || '智能体服务暂时不可用';
    assistant.retryMessage = assistant.retryMessage || input;
    assistant.failureKind = Number(error?.status || 0) === 401 ? 'auth' : 'temporary';
    if (!assistant.content.trim()) {
      assistant.content = assistant.error;
    }
    toast?.(assistant.error);
  } finally {
    assistant.pending = false;
    const activeTurn = typeof isTurnActive === 'function' ? isTurnActive() : owns();
    if (!stillVisible() || (!activeTurn && !owns())) return;
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
