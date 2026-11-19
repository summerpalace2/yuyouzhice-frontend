import { state } from '../../app-core/state.js';
import { request as apiRequest } from '../../shared/api/client.js';
import { captureWorkspace } from '../../app-core/workspace-lifecycle.js';
import { loadUserChats } from '../../app-core/user-store.js';
import { adoptTripWorkspace } from '../trip-workspace/workspace-service.js';
import { beginTripMutation, finishTripMutation } from '../../entities/trip/trip-mutation.js';
import { highlightAppliedChange } from './workspace-layout.js';
import { confirmAgentAction } from './agent-transport.js';

const inFlightConfirmIds = new Set();

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
  if (typeof approved !== 'boolean') {
    toast?.('确认决定必须为明确的批准或取消。');
    return false;
  }
  if (confirmReq.loading || confirmReq.status !== 'pending' || inFlightConfirmIds.has(confirmId)) {
    return true;
  }

  const requestRevision = Number(state.trip?.version || 0);
  const requestedSession = state.sessionId || '';
  const wrongWorkspace = confirmReq.plannerSessionId !== undefined && confirmReq.plannerSessionId !== requestedSession;
  const expired = confirmReq.expiresAtMillis > 0 && confirmReq.expiresAtMillis <= Date.now();
  const stalePreview = confirmReq.toolName === 'confirm_apply_trip_adjustment'
    && confirmReq.args?.baseRevision != null && Number(confirmReq.args.baseRevision) !== requestRevision;
  if (wrongWorkspace || expired || (approved && stalePreview)) {
    confirmReq.status = 'expired';
    confirmReq.error = '确认方案已过期或行程已变化，请重新生成预览。';
    toast?.(confirmReq.error);
    renderChatInDOM?.({ scrollToBottom: false }, renderView);
    return true;
  }

  const mutatesTrip = approved && state.trip && confirmReq.toolName !== 'confirm_update_user_preferences';
  const ticket = mutatesTrip ? beginTripMutation('agent') : null;
  if (mutatesTrip && !ticket) {
    toast?.('当前行程正在更新，请稍后再确认。');
    return true;
  }
  inFlightConfirmIds.add(confirmId);
  const owner = captureWorkspace({ exact: true });
  const requestUserId = state.user?.id;
  confirmReq.loading = true;
  confirmReq.error = '';
  if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
    for (const btn of document.querySelectorAll('button[data-confirm-id]')) {
      if (btn.getAttribute?.('data-confirm-id') === confirmId) btn.disabled = true;
    }
  }
  renderChatInDOM?.({ scrollToBottom: false }, renderView);

  try {
    const res = await confirmAgentAction({
      confirmId,
      approved,
      sessionId: confirmReq.memorySessionId || memorySessionId || 'default',
      plannerSessionId: requestedSession
    }, { request });

    if (!owner.owns() || state.user?.id !== requestUserId || state.chatMessages !== sourceMessages) {
      return true;
    }
    confirmReq.loading = false;
    // 原地修改 trip 不会改变对象身份，因此还要比较请求时捕获的版本。
    if (Number(state.trip?.version || 0) !== requestRevision) {
      confirmReq.status = 'expired';
      confirmReq.error = '当前行程已更新，已忽略旧确认回执，请刷新核对最新行程。';
      renderChatInDOM?.({ scrollToBottom: false }, renderView);
      return true;
    }
    if (res?.data?.applied || res?.data?.saved) {
      if ((res.workspaceSessionId || res.data.sessionId) !== requestedSession) {
        throw new Error('确认回执不属于当前行程，已保留当前状态，请刷新核对。');
      }
    }
    if (res?.data?.applied) {
      const revision = res.data.currentVersion;
      if (!Number.isSafeInteger(revision) || revision <= requestRevision || res.data.trip?.version !== revision) {
        throw new Error('确认回执版本不一致，已保留当前行程，请刷新核对。');
      }
    }

    if (res?.cancelled || (!approved && res?.approved !== true)) {
      confirmReq.status = 'cancelled';
      confirmReq.receipt = res || { ok: true, cancelled: true };
      toast?.('已取消该操作，当前行程与偏好均未修改。');
    } else if (res?.ok) {
      confirmReq.status = 'approved';
      confirmReq.receipt = res;
      if (res.data?.applied && res.data?.trip) {
        state.trip = res.data.trip;
        const pins = res.data.pinnedStopIds ?? res.data.trip.pinnedStopIds;
        if (Array.isArray(pins)) state.pinnedStopIds = new Set(pins);
        const remainingIds = new Set((state.trip.days || []).flatMap(day => (day.stops || []).map(stop => stop.id)));
        if (!remainingIds.has(state.selectedStopId)) state.selectedStopId = null;
        state.selectedStopIds = new Set([...(state.selectedStopIds || [])].filter(id => remainingIds.has(id)));
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
        highlightAppliedChange(confirmReq, state);
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
  } finally {
    inFlightConfirmIds.delete(confirmId);
    confirmReq.loading = false;
    if (ticket) finishTripMutation(ticket);
  }
}
