import { state } from '../../app-core/state.js';
import { deviceId, request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { saveUserPlan, clearUserPlan, saveUserChats, loadUserChats, getTripChatKey, loadChatWorkspaceMeta } from '../../app-core/user-store.js';
import { persistTripWorkspace, adoptTripWorkspace } from '../trip-workspace/workspace-service.js';
import { captureWorkspace, captureAuthentication } from '../../app-core/workspace-lifecycle.js';
import { invalidatePageCache, isPageDataFresh, markPageDataFresh } from '../../app-core/page-cache.js';
import { detachChatWorkspace } from '../trip-chat/chat-service.js';

export async function saveTrip({ renderModals, renderHeader, renderView, loadTripsCallback } = {}) {
  if (state.tripMutationTicket?.owns()) return toast('行程正在更新，请完成后再保存。');
  if (!state.trip) return toast('还没有可保存的行程。');
  if (state.savingTrip) return toast('行程正在保存，请稍候。');
  if (!state.user) {
    state.pendingAfterLogin = 'save';
    state.loginOpen = true;
    if (renderModals) renderModals();
    return;
  }
  const owner = captureWorkspace({ exact: true });
  const oldKey = state.chatSessionId || getTripChatKey(owner.savedTripId, owner.sessionId);
  const messages = structuredClone(state.tripChatHistories?.[oldKey] || state.chatMessages || []);
  const submittedTrip = structuredClone(state.trip), chatMode = state.chatMode;
  state.savingTrip = true;
  state.saveOperation = owner;
  if (renderView) renderView();
  try {
    const res = await request('/api/trips/save', {
      method: 'POST',
      body: JSON.stringify({
        trip: submittedTrip,
        plannerSessionId: owner.sessionId || null,
        savedTripId: owner.savedTripId || submittedTrip.savedTripId || null
      })
    });
    // 归档并同步该草稿的聊天历史至正式行程专属键
    if (!owner.authenticated()) return;
    const savedId = res.saved?.id || res.savedTripId || res.tripId || (res.trip && res.trip.id);
    const newKey = getTripChatKey(savedId, null);
    const histories = loadUserChats(owner.userId);
    histories[newKey] = histories[oldKey] || histories[newKey] || messages;
    if (oldKey !== newKey) delete histories[oldKey];
    saveUserChats(owner.userId, histories);
    if (owner.owns()) state.tripChatHistories = histories;
    const workspace = res.workspace && adoptTripWorkspace(res.workspace, { userId: owner.userId, savedTripId: savedId });
    if (savedId && workspace) {
      await persistTripWorkspace({
        savedTripId: savedId,
        userId: owner.userId, sessionId: owner.sessionId,
        chatMessages: histories[newKey] || [], chatMode,
        chatEpoch: workspace.chatEpoch, expectedRevision: workspace.workspaceRevision
      }, { immediate: true });
    }
    if (!owner.owns()) return;
    clearUserPlan(owner.userId);

    // 正式行程写入会影响“我的行程”“旅行档案”和会话记录；仅失效这些数据页，
    // 不触碰当前聊天、地图或其它已加载页面。
    invalidatePageCache('trips', 'profile', 'history');
    state.savedTrips = null;

    state.trip = null;
    state.sessionId = null;
    state.savedTripId = null;
    state.view = 'trips';
    toast(res.message || '行程已成功保存！');
    if (renderHeader) renderHeader();
    if (renderView) renderView();
    if (loadTripsCallback) await loadTripsCallback();
  } catch (error) {
    if (owner.owns()) toast(error.message);
  } finally {
    if (state.saveOperation === owner) {
      state.saveOperation = null; state.savingTrip = false;
      if (owner.owns() && state.view === 'planning' && renderView) renderView();
    }
  }
}

export async function openSavedTrip(id, { renderLoader, render, scheduleTripMap } = {}) {
  if (!state.user) return toast('请先登录后打开已保存行程。');
  if (state.openingTripId) return toast('正在打开另一份行程，请稍候。');
  detachChatWorkspace();
  const owner = captureWorkspace();
  state.openingTripId = String(id);
  state.openOperation = owner;
  if (render) render();
  state.loading = true;
  if (renderLoader) renderLoader();
  try {
    const data = await request(`/api/trips/${encodeURIComponent(id)}/open`, { method: 'POST' });
    if (!owner.owns()) return;
    state.sessionId = data.sessionId;
    state.savedTripId = data.savedTripId || id;
    state.legacyMode = Boolean(data.legacyMode);
    state.adjustmentCapability = data.adjustmentCapability || (state.legacyMode ? 'LEGACY' : 'V1_PROPOSAL');
    state.sessionAccessToken = data.sessionAccessToken || null;
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedOptionId = 'option-1';
    state.selectedStopId = null;
    if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
    state.suggestionDismissed = false;
    state.trip = data.trip;
    state.trip.savedTripId = state.savedTripId;
    state.prompt = data.trip?.prompt || data.trip?.input || state.prompt;
    state.view = 'planning';

    // 还原该行程专属的历史对话记录，实现打开时无缝继续之前的对话
    const tripChatKey = getTripChatKey(data.savedTripId || id, data.sessionId);
    state.chatSessionId = tripChatKey;
    state.tripChatHistories = { ...loadUserChats(state.user?.id), ...(state.tripChatHistories || {}) };
    const workspace = data.workspace && typeof data.workspace === 'object' ? data.workspace : {};
    const localMessages = state.tripChatHistories[tripChatKey] || [];
    const remoteMessages = Array.isArray(workspace.chatMessages) ? workspace.chatMessages : [];
    const localMeta = loadChatWorkspaceMeta(owner.userId, tripChatKey);
    const recoverLocal = localMeta?.dirty && !localMeta.blocked && workspace.chatEpoch
      && localMeta.chatEpoch === workspace.chatEpoch
      && Number(localMeta.workspaceRevision) === Number(workspace.workspaceRevision);
    state.chatMessages = recoverLocal ? localMessages : remoteMessages;
    adoptTripWorkspace(workspace, { userId: owner.userId, savedTripId: state.savedTripId });
    state.chatMode = workspace.chatMode === 'planner' ? 'planner' : 'chat';
    state.itineraryMemorySnapshot = workspace.itineraryMemorySnapshot || null;
    state.chatMeta = null;
    state.chatProposal = null;
    state.tripChatHistories[tripChatKey] = state.chatMessages;
    saveUserChats(state.user?.id, state.tripChatHistories);
    if (recoverLocal) {
      await persistTripWorkspace({}, { immediate: true });
    }
    if (!owner.owns()) return;

    // 持久化当前用户的活动规划状态为该打开的行程（无敏感凭据）
    saveUserPlan(state.user?.id, {
      trip: state.trip,
      sessionId: state.sessionId,
      savedTripId: state.savedTripId,
      prompt: state.prompt,
      view: 'planning',
      chatMode: state.chatMode
    });

    toast(data.message || '已打开正式行程，可继续调整。');
  } catch (error) {
    if (owner.owns()) toast(error.message);
  } finally {
    if (state.openOperation === owner) {
      state.openOperation = null; state.openingTripId = null;
      if (owner.owns()) {
        state.loading = false;
        if (render) render();
        if (scheduleTripMap) scheduleTripMap();
      }
    }
  }
}

export async function loadTrips(renderViewCallback, { force = false } = {}) {
  if (!state.user) return;
  if (!force && Array.isArray(state.savedTrips) && isPageDataFresh('trips')) return state.savedTrips;
  if (state.tripsLoading && state.tripsLoadOperation?.owns()) return state.savedTrips;
  const owner = captureAuthentication();
  state.tripsLoadOperation = owner;
  const owns = () => state.tripsLoadOperation === owner && owner.owns();
  state.tripsLoading = true;
  state.tripsLoadError = '';
  if (state.view === 'trips' && renderViewCallback) renderViewCallback();
  try {
    const data = await request('/api/trips', { timeoutMs: 15000 });
    if (!owns()) return;
    state.savedTrips = data.trips || [];
    markPageDataFresh('trips');
    return state.savedTrips;
  } catch (error) {
    if (!owns()) return;
    state.tripsLoadError = error?.message || '无法读取已保存行程，请稍后重试。';
    toast(error.message);
  } finally {
    if (owns()) {
      state.tripsLoading = false;
      if (state.view === 'trips' && renderViewCallback) renderViewCallback();
    }
    if (state.tripsLoadOperation === owner) state.tripsLoadOperation = null;
  }
}

export async function deleteTrip(id, { renderModals, updateTripsInDOM, loadTripsCallback } = {}) {
  if (!state.user) return toast('请先登录后删除行程。');
  const displayedTrip = Array.isArray(state.savedTrips)
    ? state.savedTrips.find((item) => String(item.id) === String(id)) : null;
  const expectedVersion = displayedTrip?.trip?.version;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    invalidatePageCache('trips');
    if (loadTripsCallback) await loadTripsCallback();
    return toast('请刷新行程列表后重试删除。');
  }
  const owner = captureAuthentication();
  const previousTrips = state.savedTrips;
  state.savedTrips = Array.isArray(state.savedTrips)
    ? state.savedTrips.filter((item) => String(item.id) !== String(id))
    : state.savedTrips;
  const optimisticTrips = state.savedTrips;
  state.deleteConfirm = null;
  if (renderModals) renderModals();
  if (updateTripsInDOM) updateTripsInDOM();
  toast('已从当前列表移除，正在后台删除。');
  try {
    await request(`/api/trips/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: JSON.stringify({ expectedVersion })
    });
    if (!owner.owns()) return;
    const tripChatKey = getTripChatKey(id, null);
    state.tripChatHistories = { ...loadUserChats(state.user?.id), ...(state.tripChatHistories || {}) };
    delete state.tripChatHistories[tripChatKey];
    saveUserChats(state.user?.id, state.tripChatHistories);
    if (String(state.savedTripId || '') === String(id)) {
      state.savedTripId = null;
      state.itineraryMemorySnapshot = null;
    }
    markPageDataFresh('trips');
    invalidatePageCache('profile', 'history');
    toast('已删除这条行程。');
  } catch (error) {
    if (!owner.owns()) return;
    if (state.savedTrips === optimisticTrips) state.savedTrips = previousTrips;
    invalidatePageCache('trips');
    if (updateTripsInDOM) updateTripsInDOM();
    else if (loadTripsCallback) await loadTripsCallback();
    toast(error.message);
  }
}

export async function exportTripPdf(id) {
  if (!state.user) return toast('请先登录后导出行程。');
  try {
    const endpoint = `/api/trips/${encodeURIComponent(id)}/pdf`;
    // iOS Safari、微信等移动 WebView 对 Blob + download 支持不一致，常会无提示地
    // 忽略下载。服务端已经返回 RFC 5987 文件名，因此移动端直接交给系统 PDF 查看器
    // / 下载器处理，桌面端仍保留可控的 Blob 下载体验。
    if (/(Android|iPhone|iPad|iPod|Mobile)/i.test(navigator.userAgent || '')) {
      window.location.assign(endpoint);
      toast('正在打开 PDF，可在系统预览页保存或分享。');
      return;
    }
    const response = await fetch(`/api/trips/${encodeURIComponent(id)}/pdf`, {
      credentials: 'same-origin',
      headers: {
        'x-yuyouzhice-device': deviceId(),
        ...(state.csrfToken ? { 'x-yuyouzhice-csrf': state.csrfToken } : {})
      }
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'PDF 导出失败');
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = tripPdfFilename(id);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast('PDF 已生成并开始下载。');
  } catch (error) {
    toast(error.message);
  }
}

function tripPdfFilename(id) {
  const saved = (state.savedTrips || []).find((item) => String(item?.id || '') === String(id));
  const title = saved?.trip?.title
    || (String(state.savedTripId || '') === String(id) ? state.trip?.title : '')
    || '重庆旅行行程';
  const safeTitle = String(title)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '重庆旅行行程';
  return `${safeTitle}-行程手册.pdf`;
}
