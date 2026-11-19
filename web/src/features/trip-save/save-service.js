import { state } from '../../app-core/state.js';
import { deviceId, plannerIdempotencyKey, request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { saveUserPlan, clearUserPlan, saveUserChats, loadUserChats, loadUserPlan, getTripChatKey, loadChatWorkspaceMeta, normalizeChatMessages } from '../../app-core/user-store.js';
import { persistTripWorkspace, persistOpenedTripWorkspace, adoptTripWorkspace } from '../trip-workspace/workspace-service.js';
import { captureWorkspace, captureAuthentication } from '../../app-core/workspace-lifecycle.js';
import { invalidatePageCache, isPageDataFresh, markPageDataFresh } from '../../app-core/page-cache.js';
import { detachChatWorkspace } from '../trip-chat/chat-service.js';
import { transitionMainView } from '../../app-core/main-view-transition.js';

const openOperationKeys = new Map();

export async function saveTrip({ renderModals, renderHeader, renderView, loadTripsCallback } = {}) {
  if (state.draftBackupFailed) return toast('本地草稿尚未备份，请先释放存储空间并重试备份。');
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
    transitionMainView(state, 'trips');
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

export async function openSavedTrip(id, { renderLoader, render, scheduleTripMap, preserveDraft = false } = {}) {
  if (!state.user) return toast('请先登录后打开已保存行程。');
  if (state.openingTripId) return toast('正在打开另一份行程，请稍候。');
  detachChatWorkspace();
  const owner = captureWorkspace();
  const viewAtStart = state.view;
  const navigationGenerationAtStart = Number(state.navigationGeneration) || 0;
  const planOperationAtStart = state.planOperation;
  const ownsOpenOperation = () => state.openOperation === owner
    && owner.owns()
    && (Number(state.navigationGeneration) || 0) === navigationGenerationAtStart
    && state.view === viewAtStart;
  const ownsOpenCommit = () => state.openOperation === owner
    && owner.owns()
    && (Number(state.navigationGeneration) || 0) === navigationGenerationAtStart;
  const ownsOpenPlanningState = () => ownsOpenCommit() && state.view === 'planning';
  state.openingTripId = String(id);
  state.openOperation = owner;
  if (render) render();
  state.loading = true;
  if (renderLoader) renderLoader();
  let responseApplied = false;
  const openKeyStorage = `yuyouzhice:trip-open:${owner.userId || 'unknown'}:${String(id)}`;
  let openOperationKey = openOperationKeys.get(openKeyStorage) || '';
  try { openOperationKey = window.sessionStorage?.getItem(openKeyStorage) || openOperationKey; } catch { /* use page memory fallback */ }
  openOperationKey ||= plannerIdempotencyKey('trip-open');
  openOperationKeys.set(openKeyStorage, openOperationKey);
  try { window.sessionStorage?.setItem(openKeyStorage, openOperationKey); } catch { /* same-page retry still reuses this key */ }
  try {
    const data = await request(`/api/trips/${encodeURIComponent(id)}/open`, {
      method: 'POST', headers: { 'x-planner-open-idempotency-key': openOperationKey }
    });
    openOperationKeys.delete(openKeyStorage);
    try { window.sessionStorage?.removeItem(openKeyStorage); } catch { /* successful open is committed */ }
    if (!ownsOpenOperation()) return;
    const savedTripId = data.savedTripId || id;
    const trip = data.trip;
    trip.savedTripId = savedTripId;
    const prompt = trip?.prompt || trip?.input || state.prompt;
    const activePlan = preserveDraft && owner.userId ? loadUserPlan(owner.userId) : null;
    const isMatchingDraft = Boolean(activePlan?.savedTripId && String(activePlan.savedTripId) === String(savedTripId));

    // 1. 正式行程云端版本核对：对比服务端正式版本与本地草稿所基于的来源版本
    const remoteFormalVersion = Number(
      data.formalTripVersion ?? data.trip?.sourceTripVersion ?? data.trip?.formalTripVersion ?? 0
    );
    const localSourceTripVersion = Number(
      activePlan?.trip?.sourceTripVersion ?? activePlan?.trip?.formalTripVersion ?? 0
    );
    const hasFormalVersionConflict = Boolean(
      isMatchingDraft &&
      activePlan?.trip &&
      remoteFormalVersion > 0 &&
      localSourceTripVersion > 0 &&
      remoteFormalVersion > localSourceTripVersion
    );

    // 2. 本地草稿修改核对（检查本地是否存在与云端正式快照不一致的未同步草稿修改）
    const localVersion = Number(activePlan?.trip?.version || 0);
    const remoteVersion = Number(data.trip?.version || 0);
    const hasLocalModifications = Boolean(
      !hasFormalVersionConflict &&
      isMatchingDraft && activePlan?.trip && (
        localVersion > remoteVersion ||
        (localVersion === remoteVersion && JSON.stringify(activePlan.trip.days) !== JSON.stringify(data.trip?.days))
      )
    );

    const backupKey = `draft_conflict_backup_${owner.userId}_${savedTripId}`;
    const existingBackup = hasFormalVersionConflict || hasLocalModifications
      ? null : getDraftBackup(owner.userId, savedTripId);
    const tripChatKey = getTripChatKey(savedTripId, data.sessionId);
    const tripChatHistories = { ...loadUserChats(owner.userId), ...(state.tripChatHistories || {}) };
    const workspace = data.workspace && typeof data.workspace === 'object' ? data.workspace : {};
    const localMessages = tripChatHistories[tripChatKey] || [];
    const remoteMessages = Array.isArray(workspace.chatMessages) ? workspace.chatMessages : [];
    const localMeta = loadChatWorkspaceMeta(owner.userId, tripChatKey);
    const recoverLocal = localMeta?.dirty && !localMeta.blocked && workspace.chatEpoch
      && localMeta.chatEpoch === workspace.chatEpoch
      && Number(localMeta.workspaceRevision) === Number(workspace.workspaceRevision);
    const chatMessages = normalizeChatMessages(recoverLocal ? localMessages : remoteMessages, {
      plannerSessionId: data.sessionId, version: data.trip?.version
    });
    const chatMode = workspace.chatMode === 'planner'
      ? 'planner'
      : (workspace.chatMode === 'chat' ? 'chat' : 'agent');
    const itineraryMemorySnapshot = workspace.itineraryMemorySnapshot || null;
    tripChatHistories[tripChatKey] = chatMessages;
    let workspaceSync = null;
    if (recoverLocal) {
      // Keep the currently visible workspace untouched while the recovered
      // history is synchronized. The explicit owner/session payload lets this
      // write complete without temporarily replacing global planner state.
      workspaceSync = await persistOpenedTripWorkspace({
        userId: owner.userId,
        savedTripId,
        sessionId: data.sessionId,
        chatEpoch: workspace.chatEpoch,
        expectedRevision: Number(workspace.workspaceRevision),
        chatMode,
        chatMessages,
        shouldCommitLocalState: ownsOpenOperation
      });
    }
    if (!ownsOpenOperation()) return;
    if (workspaceSync?.status === 'conflict') {
      toast('行程对话工作区已在其他请求中更新或重置。本地历史已保留，请重新打开行程后继续。');
      return;
    }

    let backupSaved = false;
    if (hasFormalVersionConflict || hasLocalModifications) {
      // 云端正式行程是唯一权威数据源。先完成可能的工作区同步并再次确认操作仍归属当前导航，
      // 再备份本地草稿并提交新行程，避免 await 期间的旧 Open 污染可见状态或覆盖活动草稿。
      try {
        if (globalThis.window?.localStorage) {
          const backedUpAt = new Date().toISOString();
          globalThis.window.localStorage.setItem(backupKey, JSON.stringify({
            backedUpAt,
            remoteFormalVersion,
            localSourceTripVersion,
            remoteVersion,
            localVersion,
            reason: hasFormalVersionConflict ? 'formal_version_conflict' : 'uncommitted_local_draft_mismatch',
            plan: activePlan
          }));
          backupSaved = true;
          state.draftBackupAvailable = true;
          state.draftBackupFailed = false;
          state.draftBackupFailedTripId = null;
          state.draftBackup = { savedTripId, plan: activePlan, backedUpAt };
          toast(hasFormalVersionConflict
            ? '云端正式行程已在其他设备更新，已加载最新版本；本地未保存修改已备份。'
            : '已加载云端正式行程；本地未保存的草稿修改已备份。');
        }
      } catch {
        backupSaved = false;
      }
      if (!backupSaved) {
        state.draftBackupAvailable = false;
        state.draftBackupFailed = true;
        state.draftBackupFailedTripId = savedTripId;
        toast('本地存储空间不足，草稿备份失败；已保留本地原草稿副本，未覆盖原编辑内容。');
      }
    } else {
      state.draftBackupAvailable = Boolean(existingBackup);
      state.draftBackup = existingBackup || null;
    }

    state.sessionId = data.sessionId;
    state.savedTripId = savedTripId;
    state.legacyMode = Boolean(data.legacyMode);
    state.adjustmentCapability = data.adjustmentCapability || (state.legacyMode ? 'LEGACY' : 'V1_PROPOSAL');
    state.sessionAccessToken = data.sessionAccessToken || null;
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedOptionId = 'option-1';
    state.selectedStopId = null;
    if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
    state.suggestionDismissed = false;
    state.trip = trip;
    state.prompt = prompt;
    state.view = 'planning';
    state.chatSessionId = tripChatKey;
    state.tripChatHistories = tripChatHistories;
    state.chatMessages = chatMessages;
    state.chatMode = chatMode;
    state.itineraryMemorySnapshot = itineraryMemorySnapshot;
    state.chatMeta = null;
    state.chatProposal = null;
    if (workspaceSync?.status === 'failed') {
      // A failed recovery write must not adopt the server snapshot as clean:
      // doing so would erase the dirty marker that lets this local history retry.
      state.chatWorkspace = localMeta || null;
    } else if (workspaceSync?.status !== 'conflict') {
      adoptTripWorkspace(workspaceSync?.workspace || workspace, { userId: owner.userId, savedTripId });
    } else {
      state.chatWorkspace = null;
    }
    saveUserChats(owner.userId, tripChatHistories);
    responseApplied = true;

    // 持久化当前用户的活动规划状态为该打开的行程（无敏感凭据）：
    // 若本地存在未保存草稿修改但备份失败，绝不调用 saveUserPlan 覆盖，
    // 确保用户的未保存修改在本地存储中原样留存，绝不静默破坏原编辑副本！
    const hasUnsavedModifications = Boolean(hasFormalVersionConflict || hasLocalModifications);
    const canSafelyPersistActivePlan = !hasUnsavedModifications || backupSaved;
    if (canSafelyPersistActivePlan) {
      saveUserPlan(owner.userId, {
        trip: state.trip,
        sessionId: state.sessionId,
        savedTripId: state.savedTripId,
        prompt: state.prompt,
        view: 'planning',
        chatMode: state.chatMode
      });
    }

    toast(data.message || '已打开正式行程，可继续调整。');
  } catch (error) {
    if (Number(error?.status) === 409) {
      openOperationKeys.delete(openKeyStorage);
      try { window.sessionStorage?.removeItem(openKeyStorage); } catch { /* next click starts a fresh Open attempt */ }
    }
    if (ownsOpenOperation()) toast(error.message);
  } finally {
    if (state.openOperation === owner) {
      const ownsCurrentOpen = ownsOpenOperation();
      const shouldRenderOpen = responseApplied && ownsOpenPlanningState();
      state.openOperation = null; state.openingTripId = null;
      // `loading` is shared with a newer planning operation. A stale Open must
      // not hide that operation's loader after its workspace generation changes.
      const newerPlanIsActive = state.planOperation
        && state.planOperation !== planOperationAtStart
        && state.planOperation.owns?.();
      if (!newerPlanIsActive) state.loading = false;
      if (shouldRenderOpen) {
        if (render) render();
        if (scheduleTripMap) scheduleTripMap();
      } else if (!responseApplied && ownsCurrentOpen && state.view === 'trips' && render) {
        // Failed Open must restore the trips list so the row is no longer shown busy.
        render();
      }
    }
  }
}

const pendingDeletions = new Map();
const completedDeletions = new Set();
let deletionOrderSnapshot = null;
let currentAuthOwner = null;

function syncAuthOwner() {
  if (!currentAuthOwner || !currentAuthOwner.owns()) {
    pendingDeletions.clear();
    completedDeletions.clear();
    deletionOrderSnapshot = null;
    currentAuthOwner = captureAuthentication();
  }
}

export async function loadTrips(renderViewCallback, { force = false } = {}) {
  if (!state.user) return;
  syncAuthOwner();
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
    const incoming = Array.isArray(data?.trips) ? data.trips : [];
    state.savedTrips = incoming.filter((t) => {
      const tid = String(t.id);
      if (pendingDeletions.has(tid)) {
        const p = pendingDeletions.get(tid);
        if (p) p.latestItem = t;
        return false;
      }
      return !completedDeletions.has(tid);
    });
    markPageDataFresh('trips');
    return state.savedTrips;
  } catch (error) {
    if (!owns()) return;
    state.tripsLoadError = error?.message || '无法读取已保存行程，请稍后重试。';
    toast(error.message);
  } finally {
    // Authentication ownership controls whether a response may update trip data.
    // Loading ownership is narrower: if this is still the latest list operation,
    // it must release its own spinner even after auth changes, or the page can
    // remain stuck when no replacement request takes over.
    if (state.tripsLoadOperation === owner) {
      state.tripsLoading = false;
      state.tripsLoadOperation = null;
      if (state.view === 'trips' && renderViewCallback) renderViewCallback();
    }
  }
}

export async function deleteTrip(id, { renderModals, updateTripsInDOM, loadTripsCallback } = {}) {
  if (!state.user) return toast('请先登录后删除行程。');
  if (typeof syncAuthOwner === 'function') syncAuthOwner();
  const activePending = typeof pendingDeletions !== 'undefined' ? pendingDeletions : (globalThis.__pendingDeletions = globalThis.__pendingDeletions || new Map());
  const activeCompleted = typeof completedDeletions !== 'undefined' ? completedDeletions : (globalThis.__completedDeletions = globalThis.__completedDeletions || new Set());
  let orderSnapshot = typeof deletionOrderSnapshot !== 'undefined' ? deletionOrderSnapshot : globalThis.__deletionOrderSnapshot;
  const owner = captureAuthentication();
  const strId = String(id);
  const displayedTrip = Array.isArray(state.savedTrips)
    ? state.savedTrips.find((item) => String(item.id) === strId) : null;
  const expectedVersion = displayedTrip?.trip?.version;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    invalidatePageCache('trips');
    if (loadTripsCallback) await loadTripsCallback();
    return toast('请刷新行程列表后重试删除。');
  }
  if (displayedTrip) {
    if (!orderSnapshot && Array.isArray(state.savedTrips)) {
      orderSnapshot = state.savedTrips.map((item) => String(item.id));
      if (typeof deletionOrderSnapshot !== 'undefined') deletionOrderSnapshot = orderSnapshot;
      else globalThis.__deletionOrderSnapshot = orderSnapshot;
    }
    const orderIndex = orderSnapshot ? orderSnapshot.indexOf(strId) : -1;
    activePending.set(strId, { item: displayedTrip, orderIndex, owner });
  }
  state.savedTrips = Array.isArray(state.savedTrips)
    ? state.savedTrips.filter((item) => String(item.id) !== strId)
    : state.savedTrips;
  state.deleteConfirm = null;
  if (renderModals) renderModals();
  if (updateTripsInDOM) updateTripsInDOM();
  toast('已从当前列表移除，正在后台删除。');
  try {
    await request(`/api/trips/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: JSON.stringify({ expectedVersion })
    });
    if (!owner.owns()) return;
    activePending.delete(strId);
    if (activePending.size === 0) {
      if (typeof deletionOrderSnapshot !== 'undefined') deletionOrderSnapshot = null;
      globalThis.__deletionOrderSnapshot = null;
    }
    activeCompleted.add(strId);
    const tripChatKey = getTripChatKey(id, null);
    state.tripChatHistories = { ...loadUserChats(state.user?.id), ...(state.tripChatHistories || {}) };
    delete state.tripChatHistories[tripChatKey];
    saveUserChats(state.user?.id, state.tripChatHistories);
    if (String(state.savedTripId || '') === strId) {
      state.savedTripId = null;
      state.itineraryMemorySnapshot = null;
    }
    markPageDataFresh('trips');
    invalidatePageCache('profile', 'history');
    toast('已删除这条行程。');
  } catch (error) {
    if (!owner.owns()) return;
    const pending = activePending.get(strId);
    activePending.delete(strId);
    const itemToRestore = pending?.latestItem || pending?.item;
    if (itemToRestore && Array.isArray(state.savedTrips) && !state.savedTrips.some((t) => String(t.id) === strId)) {
      let insertAt = -1;
      if (orderSnapshot && pending?.orderIndex >= 0) {
        insertAt = state.savedTrips.findIndex((t) => {
          const idx = orderSnapshot.indexOf(String(t.id));
          return idx > pending.orderIndex;
        });
      }
      if (insertAt >= 0) {
        state.savedTrips.splice(insertAt, 0, itemToRestore);
      } else {
        state.savedTrips.push(itemToRestore);
      }
    }
    if (activePending.size === 0) {
      if (typeof deletionOrderSnapshot !== 'undefined') deletionOrderSnapshot = null;
      globalThis.__deletionOrderSnapshot = null;
    }
    invalidatePageCache('trips');
    if (updateTripsInDOM) updateTripsInDOM();
    if (loadTripsCallback) {
      try {
        await loadTripsCallback();
      } catch (_) {}
    }
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

export function getDraftBackup(userId, savedTripId) {
  if (!userId || !savedTripId || !globalThis.window?.localStorage) return null;
  try {
    const raw = globalThis.window.localStorage.getItem(`draft_conflict_backup_${userId}_${savedTripId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function restoreDraftBackup(savedTripId, { render, renderView, scheduleTripMap } = {}) {
  const userId = state.user?.id;
  const targetId = savedTripId || state.savedTripId;
  const backup = getDraftBackup(userId, targetId);
  if (!backup?.plan?.trip || String(backup.plan.savedTripId || '') !== String(targetId)) {
    toast('未找到有效的草稿备份。');
    return false;
  }
  if (state.draftRestorePending) return false;
  if (!state.sessionId || String(state.savedTripId || '') !== String(targetId)) {
    toast('请先打开对应的正式行程，再恢复草稿。');
    return false;
  }
  const owner = captureWorkspace({ exact: true });
  state.draftRestorePending = true;
  let restored = false;
  if (render) render();
  try {
    const result = await request(`/api/trips/${encodeURIComponent(targetId)}/draft/restore`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: owner.sessionId, expectedVersion: Number(state.trip?.version || 0),
        trip: backup.plan.trip })
    });
    if (!owner.owns()) return false;
    if (!result?.trip || result.sessionId !== owner.sessionId) throw new Error('恢复服务未返回有效规划快照。');
    state.trip = result.trip;
    state.prompt = backup.plan.prompt || state.prompt;
    state.chatMode = backup.plan.chatMode || state.chatMode;
    state.draftRestored = true;
    state.draftBackupAvailable = false;
    state.draftBackup = null;
    state.draftBackupFailed = false;
    state.draftBackupFailedTripId = null;
    restored = true;
    saveUserPlan(userId, { trip: state.trip, sessionId: state.sessionId,
      savedTripId: targetId, prompt: state.prompt, view: 'planning', chatMode: state.chatMode });
    const persisted = loadUserPlan(userId);
    const locallySaved = persisted?.sessionId === state.sessionId
      && Number(persisted?.trip?.version) === Number(state.trip?.version)
      && JSON.stringify(persisted?.trip?.days) === JSON.stringify(state.trip?.days);
    if (locallySaved) {
      try { globalThis.window?.localStorage?.removeItem(`draft_conflict_backup_${userId}_${targetId}`); }
      catch { state.draftBackupAvailable = true; }
    } else {
      state.draftBackupAvailable = true;
      state.draftBackupFailed = true;
      state.draftBackupFailedTripId = targetId;
    }
    toast(locallySaved ? '草稿已恢复到当前规划会话，可继续编辑并保存。'
      : '草稿已恢复到服务器，但此设备未能保存活动副本；原备份已保留。');
    if (scheduleTripMap) scheduleTripMap();
    return true;
  } catch (error) {
    if (owner.owns()) toast(error.message || '恢复草稿失败，请重试。');
    return false;
  } finally {
    state.draftRestorePending = false;
    if (restored || owner.owns()) {
      if (render) render();
      else if (renderView) renderView();
    }
  }
}

export function discardDraftBackup(savedTripId, { render } = {}) {
  const userId = state.user?.id;
  const targetId = savedTripId || state.savedTripId;
  if (userId && targetId && globalThis.window?.localStorage) {
    try {
      globalThis.window.localStorage.removeItem(`draft_conflict_backup_${userId}_${targetId}`);
    } catch {
      toast('删除本地备份失败，请检查浏览器存储后重试。');
      return false;
    }
  }
  state.draftBackupAvailable = false;
  state.draftBackup = null;
  state.draftBackupFailed = false;
  state.draftBackupFailedTripId = null;
  toast('已放弃未保存的本地草稿备份，使用云端最新版本。');
  if (render) render();
  return true;
}
