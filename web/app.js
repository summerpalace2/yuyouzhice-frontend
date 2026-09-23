/**
 * Web 应用组合根。
 *
 * 这里只装配全局依赖与根事件委托；页面注册在 app-core/router，
 * 具体用户流程逐步下沉到对应 feature handler。架构规则见 docs/frontend-architecture.md。
 */

import './styles.css';

// 1. 领域模型与响应式状态
export { GOLDEN_PROMPT, preferences, state } from './src/app-core/state.js';
import { GOLDEN_PROMPT, preferences, state } from './src/app-core/state.js';
import { saveUserPlan, saveUserChats, loadUserPlan, syncAnonymousDraftToUser, loadUserChats, getTripChatKey, startGuestChatSession } from './src/app-core/user-store.js';
import { persistTripWorkspace } from './src/features/trip-workspace/workspace-service.js';
import { clearPageCache, invalidatePageCache, markPageDataFresh } from './src/app-core/page-cache.js';
import { bootstrapApplication } from './src/app-core/bootstrap.js';
import { handleNavigationAction } from './src/app-core/navigation-handler.js';
import { handleAdminAction } from './src/features/admin-corpus/admin-action-handler.js';
import { handleProfileAction } from './src/features/trip-memory/profile-action-handler.js';
import { handleChatAction } from './src/features/trip-chat/chat-action-handler.js';

// 2. 通用安全与工具函数
export { escapeHtml, sanitizeHtml } from './src/shared/lib/security.js';
import { escapeHtml, sanitizeHtml } from './src/shared/lib/security.js';

export function fact(label, value, status = '未知', note = '') {
  return { label, value, status, note };
}
export function factClass(status) {
  if (status === '未知') return 'fact-unknown';
  if (status === '动态') return 'fact-dynamic';
  if (status === '冲突') return 'fact-conflict';
  return '';
}
export function factLines(facts = []) {
  return facts
    .map(
      (item) =>
        `<div class="fact-line"><span>${escapeHtml(item.label)}</span><b class="${factClass(item.status)}">${escapeHtml(item.value)}</b></div>`
    )
    .join('');
}
export function citations(items = []) {
  return items
    .map(
      (item) =>
        `<span class="citation" title="${escapeHtml(item.note || '')}">${escapeHtml(item.title)} · ${escapeHtml(item.endpoint)}</span>`
    )
    .join('');
}

export { calculateDistanceMeters, formatDistance } from './src/shared/lib/geo.js';
import { calculateDistanceMeters, formatDistance } from './src/shared/lib/geo.js';

export { renderMarkdownStatic, renderMarkdownStreaming } from './src/shared/lib/markdown.js';
import { renderMarkdownStatic, renderMarkdownStreaming } from './src/shared/lib/markdown.js';

// 3. 通用网络与 API Client
export { deviceId, plannerIdempotencyKey, request } from './src/shared/api/client.js';
import { deviceId, plannerIdempotencyKey, request } from './src/shared/api/client.js';

// 4. 地图 SDK 与渲染适配器
export {
  DAY_COLORS,
  loadMapConfig,
  loadAmapSdk,
  mapPoints,
  mapPath,
  clearMapOverlays,
  clearFullscreenMapOverlays,
  navigateTo
} from './src/shared/lib/amap.js';
import {
  DAY_COLORS,
  loadMapConfig,
  loadAmapSdk,
  mapPoints,
  mapPath,
  clearMapOverlays,
  clearFullscreenMapOverlays,
  navigateTo
} from './src/shared/lib/amap.js';

export {
  renderTripMap,
  renderFullscreenMap,
  destroyFullscreenMap,
  destroyTripMap
} from './src/widgets/trip-map/map-renderer.js';
import {
  renderTripMap,
  renderFullscreenMap,
  destroyFullscreenMap,
  destroyTripMap
} from './src/widgets/trip-map/map-renderer.js';

export function scheduleTripMap() {
  if (mapRenderTimer) return;
  mapRenderTimer = window.setTimeout(() => {
    mapRenderTimer = null;
    renderTripMap().catch(() => {});
  }, 0);
}

export { fullscreenMapOverlay } from './src/widgets/trip-map/map-overlay.js';
import { fullscreenMapOverlay } from './src/widgets/trip-map/map-overlay.js';

// 5. 基础 UI 控件与反馈
export { renderToast, toast } from './src/shared/ui/toast.js';
import { renderToast, toast } from './src/shared/ui/toast.js';

export { planningLoader, renderLoader } from './src/shared/ui/loader.js';
import { planningLoader, renderLoader } from './src/shared/ui/loader.js';

export { header, renderHeader } from './src/widgets/header/header.js';
import { header, renderHeader } from './src/widgets/header/header.js';

export {
  feedbackModal,
  memoryModal,
  preferenceModal,
  renderModals
} from './src/widgets/modals/modal-container.js';
import {
  feedbackModal,
  memoryModal,
  preferenceModal,
  renderModals
} from './src/widgets/modals/modal-container.js';

// 6. 实体组件
export { stopCard, weatherBadge } from './src/entities/trip/stop-card.js';
import { stopCard, weatherBadge } from './src/entities/trip/stop-card.js';

export { renderExploreCardHtml } from './src/entities/attraction/explore-card.js';
import { renderExploreCardHtml } from './src/entities/attraction/explore-card.js';

export {
  buildPromptFromPreferences,
  updatePreferenceChipsInDOM
} from './src/entities/user/preferences.js';
import {
  buildPromptFromPreferences,
  updatePreferenceChipsInDOM
} from './src/entities/user/preferences.js';

// 7. 业务特性 Features
export { loginModal } from './src/features/auth/auth-modal.js';
import { loginModal } from './src/features/auth/auth-modal.js';

export { restoreAuthSession, logout } from './src/features/auth/auth-service.js';
import { restoreAuthSession, logout } from './src/features/auth/auth-service.js';

export { slots, constraintValues } from './src/features/trip-planning/slots-form.js';
import { slots, constraintValues } from './src/features/trip-planning/slots-form.js';

export { plan, refreshDynamicData } from './src/features/trip-planning/planner-service.js';
import { plan, refreshDynamicData } from './src/features/trip-planning/planner-service.js';
import { buildSpatialContinuationOptions } from './src/features/trip-planning/spatial-recovery.js';

export { replanModal } from './src/features/trip-replan/replan-modal.js';
import { replanModal } from './src/features/trip-replan/replan-modal.js';

export { removeStop, confirmReplan } from './src/features/trip-replan/replan-service.js';
import { removeStop, confirmReplan } from './src/features/trip-replan/replan-service.js';

export {
  chatMessageHtml,
  chatMetaHtml,
  plannerProposalHtml,
  chatProposalHtml,
  chatModeBannerHtml,
  suggestionCalloutHtml,
  quickChipsHtml,
  chatPanel,
  renderChatInDOM,
  resizeChatInput,
  renderPlannerProposalDockInDOM
} from './src/features/trip-chat/chat-panel.js';
import {
  chatMessageHtml,
  chatMetaHtml,
  plannerProposalHtml,
  chatProposalHtml,
  chatModeBannerHtml,
  suggestionCalloutHtml,
  quickChipsHtml,
  chatPanel,
  renderChatInDOM,
  resizeChatInput,
  renderPlannerProposalDockInDOM
} from './src/features/trip-chat/chat-panel.js';

export {
  readChatStream,
  sendChatMessage,
  cancelChatMessage,
  applyPlannerProposal
} from './src/features/trip-chat/chat-service.js';
import {
  readChatStream,
  sendChatMessage,
  cancelChatMessage,
  applyPlannerProposal
} from './src/features/trip-chat/chat-service.js';

export { deleteModal } from './src/features/trip-save/delete-modal.js';
import { deleteModal } from './src/features/trip-save/delete-modal.js';

export {
  saveTrip,
  openSavedTrip,
  loadTrips,
  deleteTrip,
  exportTripPdf
} from './src/features/trip-save/save-service.js';
import {
  saveTrip,
  openSavedTrip,
  loadTrips,
  deleteTrip,
  exportTripPdf
} from './src/features/trip-save/save-service.js';

export {
  updateExploreGridInDOM,
  loadExplore,
  addExploreAttraction,
  searchAmapPois,
  triggerAmapExploreSearch
} from './src/features/explore-search/explore-service.js';
import {
  updateExploreGridInDOM,
  loadExplore,
  addExploreAttraction,
  searchAmapPois,
  triggerAmapExploreSearch
} from './src/features/explore-search/explore-service.js';

export {
  floatingAdminReturnBtn,
  updateAdminDocListInDOM,
  health,
  loadRerankStats,
  loadIntentShadowStats,
  probeIntentCapability,
  clearRerankCache
} from './src/features/admin-corpus/admin-service.js';
import {
  floatingAdminReturnBtn,
  updateAdminDocListInDOM,
  health,
  loadRerankStats,
  loadIntentShadowStats,
  probeIntentCapability,
  clearRerankCache
} from './src/features/admin-corpus/admin-service.js';

// 8. 页面视图组件
export { homeView } from './src/pages/home-page.js';
import { homeView } from './src/pages/home-page.js';

export { planView, refreshPlanningDynamicInDOM, refreshPlanningLocationInDOM, refreshPlanningConstraintsInDOM } from './src/pages/plan-page.js';
import { planView, refreshPlanningDynamicInDOM, refreshPlanningLocationInDOM, refreshPlanningConstraintsInDOM } from './src/pages/plan-page.js';

export { detailView, openDetail, updateTripWithAttraction } from './src/pages/detail-page.js';
import { detailView, openDetail, updateTripWithAttraction } from './src/pages/detail-page.js';

export { exploreView } from './src/pages/explore-page.js';
import { exploreView } from './src/pages/explore-page.js';

export { tripsView, refreshTripsInDOM } from './src/pages/trips-page.js';
import { tripsView, refreshTripsInDOM } from './src/pages/trips-page.js';

export { historyView, loadHistory, loadHistorySession } from './src/pages/history-page.js';
import { historyView, loadHistory, loadHistorySession } from './src/pages/history-page.js';

export { profileView, loadProfile, rememberPreference, refreshProfileInDOM, refreshProfileMemoryInDOM, refreshProfileSlotsInDOM } from './src/pages/profile-page.js';
import { profileView, loadProfile, rememberPreference, refreshProfileInDOM, refreshProfileMemoryInDOM, refreshProfileSlotsInDOM } from './src/pages/profile-page.js';

export {
  adminView,
  switchAdminSectionInDOM,
  refreshRerankPanelInDOM,
  updateAdminAttractionListInDOM,
  updateAdminUserListInDOM
} from './src/pages/admin-page.js';
import {
  adminView,
  switchAdminSectionInDOM,
  refreshRerankPanelInDOM,
  updateAdminAttractionListInDOM,
  updateAdminUserListInDOM
} from './src/pages/admin-page.js';

export { guestChatView } from './src/pages/guest-chat-page.js';
import { guestChatView } from './src/pages/guest-chat-page.js';

export { authView } from './src/pages/auth-page.js';
import { authView } from './src/pages/auth-page.js';

// 9. 视图路由表与 AppShell
// 向现有测试和调试入口兼容导出；真实渲染只读取 router.js 中这份注册表。
export { views } from './src/app-core/router.js';

export {
  renderAppShell,
  renderView,
  renderFloatingBtn,
  render
} from './src/app-core/app-shell.js';
import {
  renderAppShell,
  renderView,
  renderFloatingBtn,
  render
} from './src/app-core/app-shell.js';

// DOM 根容器引用与计时器
const app = document.querySelector('#app');
const eventRoot = app;
let dynamicRefreshTimer = null;
let plannerContextPrefetch = null;

// 根节点继续使用事件委托，但每个动作只交给一个领域处理器。
// 未命中的 handler 不应被所有点击逐一 await，避免把普通 UI 操作串成异步链。
const ACTION_OWNER = new Map([
  ...[
    'select-place-candidate', 'confirm-region-reference', 'retry-spatial-plan'
  ].map((action) => [action, 'planning']),
  ...[
    'go', 'admin-section', 'switch-perspective', 'enter-planner-test',
    'login', 'open-auth-page', 'set-auth-mode', 'close-login'
  ].map((action) => [action, 'navigation']),
  ...[
    'admin-doc-topic', 'toggle-admin-docs-fold', 'toggle-doc-expand', 'edit-doc',
    'admin-attraction-filter', 'admin-user-role-filter',
    'view-user-detail', 'close-user-detail', 'view-feedback-detail',
    'close-feedback-detail', 'close-doc-edit', 'toggle-user-role',
    'clear-admin-rerank-cache', 'probe-admin-intent-capability', 'reset-user-data',
    'delete-user', 'cancel-user-action', 'confirm-user-action'
  ].map((action) => [action, 'admin']),
  ...[
    'refresh-profile', 'add-custom-preference', 'confirm-memory-candidate',
    'dismiss-memory-candidate', 'add-travel-memory', 'edit-travel-memory',
    'delete-travel-memory', 'confirm-profile-memory-candidate',
    'dismiss-profile-memory-candidate', 'toggle-travel-memory',
    'enable-travel-memory', 'remove-preference',
    'toggle-slot-tag', 'remove-slot-tag', 'add-custom-slot-tag',
    'save-prepend-prompt', 'resynthesize-prepend-prompt', 'toggle-expand-memories'
  ].map((action) => [action, 'profile']),
  ...[
    'select-stop', 'cancel-select-stop', 'clear-selected-stop', 'clear-stop-selection',
    'toggle-pin-stop', 'select-option', 'dismiss-suggestion', 'reopen-suggestion',
    'replan-v1', 'confirm-planner-proposal', 'force-apply-planner-proposal',
    'open-planner-proposal', 'close-planner-proposal', 'switch-chat-mode',
    'switch-adjustment-mode', 'request-other-proposals', 'open-chat-dock',
    'close-chat-dock', 'dismiss-planner-proposal', 'reset-chat',
    'unpin-and-retry', 'cancel-chat', 'retry-chat', 'quick-ai-action',
    'quick-same-district-replace', 'execute-action-chip'
  ].map((action) => [action, 'chat'])
]);

const PLANNER_CONTEXT_WAIT_MS = 1500;

/**
 * 登录后后台预取轻量规划上下文。
 * 规划点击时优先消费已完成的 Promise；未完成时最多短暂等待，超时则按当前输入继续规划。
 */
function prefetchPlannerContext() {
  const userId = String(state.user?.id || '');
  if (!userId) {
    plannerContextPrefetch = null;
    return null;
  }
  if (plannerContextPrefetch?.userId === userId) return plannerContextPrefetch.promise;

  const promise = request('/api/planner/context', { timeoutMs: 5000 })
    .then((data) => {
      if (data) {
        if (!state.profile) {
          state.profile = data;
        } else {
          if (data.profilePrependPrompt) state.profile.profilePrependPrompt = data.profilePrependPrompt;
          if (Array.isArray(data.memories)) state.profile.memories = data.memories;
          if (Array.isArray(data.diningSlots)) state.profile.diningSlots = data.diningSlots;
          if (Array.isArray(data.attractionSlots)) state.profile.attractionSlots = data.attractionSlots;
        }
      }
      return { userId, data };
    })
    .catch(() => null);
  plannerContextPrefetch = { userId, promise };
  return promise;
}

async function readPlannerContext() {
  if (state.profile) return state.profile;
  const currentUserId = String(state.user?.id || '');
  const promise = prefetchPlannerContext();
  if (!promise) return null;

  const result = await Promise.race([
    promise,
    new Promise((resolve) => window.setTimeout(() => resolve(null), PLANNER_CONTEXT_WAIT_MS))
  ]);
  return result?.userId === currentUserId ? result.data : null;
}

function scheduleDynamicRefresh() {
  if (!state.user || !state.trip || !state.sessionId || state.dynamicRefreshing
      || state.dynamicRefreshSessionId === state.sessionId || dynamicRefreshTimer) return;
  dynamicRefreshTimer = window.setTimeout(() => {
    dynamicRefreshTimer = null;
    void refreshDynamicData({ renderDynamic: refreshPlanningDynamicInDOM, scheduleTripMap, silent: true }).catch(() => {
      // 动态数据属于后台增强能力；失败时保留当前方案，不制造未处理 Promise。
    });
  }, 0);
}
let toastTimer = null;
let mapRenderTimer = null;

/**
 * 申请浏览器原生定位权限并获取用户实时位置
 */
export async function getUserLocation() {
  if (!navigator.geolocation) {
    return toast('您的浏览器或设备不支持地理定位功能。');
  }
  state.locating = true;
  toast('正在向浏览器请求定位权限并获取位置...');
  if (!refreshPlanningLocationInDOM()) renderView();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.locating = false;
      const coords = [position.coords.longitude, position.coords.latitude];
      const accuracy = position.coords.accuracy;

      let nearestStop = null;
      let minDistance = Infinity;
      if (state.trip?.days) {
        state.trip.days.forEach((day) => {
          (day.stops || []).forEach((stop) => {
            if (Array.isArray(stop.mapContext?.coordinates)) {
              const dist = calculateDistanceMeters(coords, stop.mapContext.coordinates);
              if (dist !== null && dist < minDistance) {
                minDistance = dist;
                nearestStop = stop;
              }
            }
          });
        });
      }

      state.userLocation = {
        coordinates: coords,
        accuracy,
        nearestStop: nearestStop ? nearestStop.name : null,
        distanceText: nearestStop ? `距离最近站点【${nearestStop.name}】约 ${formatDistance(minDistance)}` : '',
        locatedAt: new Date().toISOString()
      };

      toast(`定位成功！${state.userLocation.distanceText ? state.userLocation.distanceText : ''}`);
      if (!refreshPlanningLocationInDOM()) renderView();
      if (state.mapFullscreen) {
        renderFullscreenMap().catch(() => {});
      } else {
        renderTripMap().catch(() => {});
      }
    },
    (err) => {
      state.locating = false;
      if (!refreshPlanningLocationInDOM()) renderView();
      const msg = err.code === 1 ? '定位请求被拒绝，请在浏览器地址栏允许位置访问权限。' : '获取定位超时或失败，请稍后重试。';
      toast(msg);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

/**
 * 用户反馈提交
 */
export async function sendFeedback(value, reason = '') {
  if (!state.trip) return;
  try {
    await request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        value,
        reason,
        tripId: state.savedTripId || state.trip.savedTripId || null,
        sessionId: state.sessionId,
        version: state.trip.version,
        prompt: state.prompt
      })
    });
    state.feedbackSent = true;
    state.feedbackOpen = false;
    state.feedbackReason = '';
    state.feedbackDraft = '';
    renderModals();
    toast(value === 'letter' ? '这封反馈已送达。感谢你帮我们把行程做得更好。' : '已记录你的反馈。');
  } catch (error) {
    toast(error.message);
  }
}

// 调度包装辅助（传递全局上下文回调）
async function doPlan(opts = {}) {
  await plan({
    usePreferences: opts.usePreferences ?? false,
    ...opts,
    renderView,
    renderHeader,
    renderLoader,
    render,
    scheduleTripMap
  });
}

/**
 * 在调用规划接口前确认是否引入账号级偏好与长期旅行记忆。
 * 本次表单条件会被暂存，用户选择后只发起一次 /api/plan 请求。
 */
async function requestPlan(opts = {}) {
  if (state.planningRequestActive) {
    toast('规划请求正在处理中，请稍候。');
    return;
  }

  const promptInput = document.querySelector('#prompt-input');
  const usePrefs = typeof opts.usePreferences === 'boolean'
    ? opts.usePreferences
    : (state.useMemoriesInPlan !== false);
  const decision = typeof opts.preferenceDecision === 'string' && opts.preferenceDecision
    ? opts.preferenceDecision
    : (usePrefs ? 'use' : 'ignore');

  const requestOptions = {
    ...opts,
    usePreferences: usePrefs,
    preferenceDecision: decision,
    prompt: typeof opts.prompt === 'string'
      ? opts.prompt
      : (promptInput ? promptInput.value : state.prompt)
  };
  state.prompt = requestOptions.prompt;

  state.planningRequestActive = true;
  try {
    await doPlan(requestOptions);
  } finally {
    state.planningRequestActive = false;
  }
}

async function doRemoveStop(stopId) {
  await removeStop(stopId, { renderLoader, renderView, scheduleTripMap });
}

async function doConfirmReplan() {
  await confirmReplan({ renderModals, renderLoader, render, scheduleTripMap });
}

async function doSaveTrip() {
  await saveTrip({ renderModals, renderHeader, renderView, loadTripsCallback: () => loadTrips(renderView, { force: true }) });
}

async function doOpenSavedTrip(id) {
  await openSavedTrip(id, { renderLoader, render, scheduleTripMap });
}

async function doDeleteTrip(id) {
  await deleteTrip(id, { renderModals, updateTripsInDOM: refreshTripsInDOM, loadTripsCallback: () => loadTrips(renderView, { force: true }) });
}

async function doLoadHistorySession(id) {
  await loadHistorySession(id, { renderLoader, render, scheduleTripMap });
}

async function doAddExploreAttraction(id, day) {
  await addExploreAttraction(id, day, { render, scheduleTripMap });
}

async function doOpenDetail(id, context = {}) {
  const stop = state.trip?.days?.flatMap((d) => d.stops || [])
    .find((s) => s.id === context.stopId || s.id === id || s.venueId === id);
  if (stop && (stop.type === 'DINING' || stop.icon === '餐' || !id || id.startsWith('dining-'))) {
    state.activeDiningStop = stop;
    renderModals();
    return;
  }
  await openDetail(id, context, { renderHeader, renderView });
}

async function doUpdateTripWithAttraction(operation, target) {
  await updateTripWithAttraction(operation, target, { renderLoader, render, scheduleTripMap });
}

async function doSendChatMessage(options = undefined, maybePreserveInput = false) {
  const opts = typeof options === 'string'
    ? { inputOverride: options, preserveInput: maybePreserveInput }
    : (options && typeof options === 'object' ? options : {});
  await sendChatMessage({ renderView, scheduleTripMap, ...opts });
}

async function doApplyPlannerProposal(options = {}) {
  await applyPlannerProposal({ renderView, scheduleTripMap, renderChatInDOM, ...options });
}

async function doHealth({ renderAfterLoad = true } = {}) {
  const showAdminLoading = renderAfterLoad && state.view === 'admin';
  if (showAdminLoading) {
    state.adminLoading = true;
    state.adminLoadError = '';
    renderView();
  }
  try {
    await health(null);
  } catch (error) {
    if (state.view === 'admin') state.adminLoadError = error?.message || '无法读取管理概览。';
    throw error;
  } finally {
    if (showAdminLoading) state.adminLoading = false;
  }
  if (renderAfterLoad) render();
}

async function doLogout() {
  await logout(render);
  plannerContextPrefetch = null;
}

async function doRememberPreference() {
  await rememberPreference(renderModals);
}

// 挂载全局事件委托监听
if (eventRoot) {
  // <details> 自己管理展开/收起，但将状态同步到 store，避免任何后续根视图重绘把它折叠。
  eventRoot.addEventListener('toggle', (event) => {
    if (event.target instanceof HTMLDetailsElement && event.target.classList.contains('admin-users-disclosure')) {
      state.adminUsersExpanded = event.target.open;
    }
  }, true);
  eventRoot.addEventListener('input', (event) => {
    if (event.target.id === 'prompt-input') state.prompt = event.target.value;
    if (event.target.id === 'chat-input') {
      state.chatInput = event.target.value;
      resizeChatInput(event.target);
    }
    if (event.target.id === 'explore-query') {
      state.exploreQuery = event.target.value;
      updateExploreGridInDOM();
      triggerAmapExploreSearch(event.target.value);
    }
    if (event.target.id === 'admin-doc-search') {
      state.adminDocQuery = event.target.value;
      updateAdminDocListInDOM();
    }
    if (event.target.id === 'admin-attraction-search') {
      state.adminAttractionQuery = event.target.value;
      updateAdminAttractionListInDOM();
    }
    if (event.target.id === 'admin-user-search') {
      state.adminUserQuery = event.target.value;
      updateAdminUserListInDOM();
    }
    if (event.target.id === 'prepend-prompt-editor') {
      const counter = document.getElementById('prepend-prompt-count');
      if (counter) counter.textContent = String(event.target.value.length);
    }
  });

  eventRoot.addEventListener('change', (event) => {
    if (event.target.id === 'chat-mode') {
      state.chatMode = event.target.value === 'planner' ? 'planner' : 'chat';
      saveUserPlan(state.user?.id, {
        trip: state.trip,
        sessionId: state.sessionId,
        savedTripId: state.savedTripId,
        prompt: state.prompt,
        view: state.view,
        chatMode: state.chatMode
      });
      void persistTripWorkspace();
      renderChatInDOM({ scrollToBottom: false }, renderView);
      toast(state.chatMode === 'planner'
        ? '已切换到局部调整：只处理当前行程片段，确认后才会应用。'
        : '已切换到聊天：可以继续咨询景点、天气和出行建议。');
    }
  });

  eventRoot.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape' && state.plannerProposalDockOpen) {
      state.plannerProposalDockOpen = false;
      renderPlannerProposalDockInDOM();
      return;
    }
    if (event.key === 'Escape' && state.chatDockOpen) {
      state.chatDockOpen = false;
      renderFloatingBtn();
      return;
    }
    if (event.target.id === 'chat-input' && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      state.chatInput = event.target.value;
      await doSendChatMessage();
      return;
    }
    if (event.target.id === 'explore-query' && event.key === 'Enter') {
      event.preventDefault();
      updateExploreGridInDOM();
      void searchAmapPois(event.target.value);
    }
  });

function buildPromptFromConstraints(c) {
  const parts = [];
  if (c.startPlace) {
    parts.push(`从${c.startPlace}出发`);
  }
  if (c.timeBudgetMinutes > 0) {
    parts.push(`${c.timeBudgetMinutes}分钟短途规划`);
  } else if (c.durationDays > 0) {
    parts.push(`重庆${c.durationDays}天旅游方案`);
  }
  if (c.companions && c.companions !== '未提供') {
    parts.push(c.companions);
  }
  if (c.walkingTolerance === '低') {
    parts.push('少走路');
  }
  if (Array.isArray(c.interests) && c.interests.length > 0) {
    parts.push(c.interests.join('、'));
  }
  if (c.transportPreference && c.transportPreference !== '未提供') {
    parts.push(c.transportPreference);
  }
  if (c.dietPreference && c.dietPreference !== '未提供') {
    parts.push(c.dietPreference);
  }
  if (c.stayArea && c.stayArea !== '未提供') {
    parts.push(`住在${c.stayArea}`);
  }
  return parts.join('，') || '重庆旅游规划方案';
}

  eventRoot.addEventListener('submit', async (event) => {
    const action = event.target.dataset.action;
    if (action === 'chat-form') {
      event.preventDefault();
      await doSendChatMessage();
      return;
    }
    if (action === 'constraints-form') {
      event.preventDefault();
      state.constraintEditing = false;
      const values = constraintValues(event.target);
      const updatedPrompt = buildPromptFromConstraints(values);
      state.prompt = updatedPrompt;
      await requestPlan({
        prompt: updatedPrompt,
        constraints: values,
        usePreferences: false,
        preferenceDecision: 'ignore',
        preserveSavedTripId: Boolean(state.savedTripId)
      });
      return;
    }
    if (action === 'spatial-refine-form') {
      event.preventDefault();
      const prompt = String(new FormData(event.target).get('prompt') || '').trim();
      if (!prompt) {
        toast('请先补充或修正地点条件。');
        return;
      }
      const options = buildSpatialContinuationOptions({ trip: state.trip, prompt, action: 'refine' });
      await requestPlan(options);
      return;
    }
    if (action === 'save-doc-form') {
      event.preventDefault();
      const title = document.querySelector('#edit-doc-title')?.value;
      const content = document.querySelector('#edit-doc-content')?.value;
      const docId = state.editingDoc?.id;
      try {
        if (docId) {
          await request('/api/admin/knowledge/update', {
            method: 'POST',
            body: JSON.stringify({ docId, title, content })
          });
        }
        toast(`语料文档“${title}”已成功保存并重新建立索引！`);
      } catch {
        toast(`语料文档“${title}”已更新！`);
      }
      state.editingDoc = null;
      renderModals();
      await doHealth();
      return;
    }
    if (action === 'upload-knowledge-form') {
      event.preventDefault();
      const form = event.target;
      const values = new FormData(form);
      const file = values.get('file');
      if (!file || typeof file.size !== 'number' || file.size === 0) {
        toast('请先选择要上传的知识文档。');
        return;
      }
      try {
        await request('/api/admin/knowledge/upload', { method: 'POST', body: values });
        form.reset();
        toast('知识文档已上传，正在解析并建立索引。');
        await doHealth();
      } catch (error) {
        toast(error.message || '知识文档上传失败。');
      }
      return;
    }
    if (action !== 'auth-form') return;

    event.preventDefault();
    state.loading = true;
    state.loginError = '';
    renderLoader();

    try {
      const registering = state.authMode === 'register';
      const form = event.target;
      const formData = new FormData(form);
      const data = await request(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
          name: formData.get('name'),
          sessionId: state.sessionId || null
        })
      });
      clearPageCache();
      state.csrfToken = data.csrfToken || null;
      state.user = data.user;
      state.loginOpen = false;
      const enteredFromAuthPage = state.view === 'auth' || state.view === 'guest-chat';
      const after = state.pendingAfterLogin;
      state.pendingAfterLogin = null;

      // 登录/注册成功后，自动将匿名状态下的规划草稿平移同步绑定至该用户
      syncAnonymousDraftToUser(state.user?.id);
      if (state.trip) {
        saveUserPlan(state.user?.id, {
          trip: state.trip,
          sessionId: state.sessionId,
          savedTripId: state.savedTripId,
          prompt: state.prompt,
          view: state.view
        });
      } else {
        // 若当前内存无草稿，尝试恢复该用户之前专属的活动草稿
        const savedPlan = loadUserPlan(state.user?.id);
        if (savedPlan && savedPlan.trip) {
          state.trip = savedPlan.trip;
          state.sessionId = savedPlan.sessionId;
          state.savedTripId = savedPlan.savedTripId;
          state.prompt = savedPlan.prompt || state.prompt;
          state.chatMode = savedPlan.chatMode === 'planner' ? 'planner' : 'chat';
          state.activeProposal = savedPlan.activeProposal || null;
          state.plannerProposalDockOpen = false;
          state.selectedOptionId = savedPlan.selectedOptionId || 'option-1';
          if (savedPlan.view) state.view = savedPlan.view;
        }
      }
      if (enteredFromAuthPage && state.view === 'auth') state.view = state.trip ? 'planning' : 'home';

      state.tripChatHistories = loadUserChats(state.user?.id);
      const chatKey = getTripChatKey(state.savedTripId, state.sessionId);
      state.chatSessionId = chatKey;
      state.chatMessages = state.tripChatHistories[chatKey] || [];

      renderModals();
      renderHeader();
      renderView();
      renderFloatingBtn();
      if (state.view === 'planning' && state.trip) scheduleTripMap();
      if (state.view === 'planning' && state.trip) scheduleDynamicRefresh();
      toast(data.message);
      // 预取轻量规划上下文，下一次点击规划时不再先等待账号档案接口。
      void prefetchPlannerContext();
      if (after === 'save') await doSaveTrip();
      if (after === 'memory') await doRememberPreference();
      if (after === 'feedback') await sendFeedback(state.pendingFeedback || 'needs-work');
      // 管理员登录后的监控数据异步刷新，不能阻塞已经完成的登录与规划跳转。
      if (state.user?.role === 'admin') void doHealth({ renderAfterLoad: false }).catch((error) => console.warn('管理数据加载失败。', error));
    } catch (error) {
      state.loginError = error.message;
      if (state.view === 'auth') renderView();
      else renderModals();
    } finally {
      state.loading = false;
      renderLoader();
    }
  });

  eventRoot.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    const owner = ACTION_OWNER.get(action);
    try {
      if (owner === 'navigation') {
        handleNavigationAction({
          action,
          target,
          state,
          renderHeader,
          renderView,
          renderFloatingBtn,
          renderModals,
          loadUserPlan,
          loadUserChats,
          getTripChatKey,
          startGuestChatSession,
          loadExplore,
          loadTrips,
          loadHistory,
          loadProfile,
          refreshProfileInDOM,
          scheduleTripMap,
          scheduleDynamicRefresh,
          loadAdminHealth: doHealth,
          switchAdminSectionInDOM,
          toast
        });
        return;
      }
      if (owner === 'admin') {
        await handleAdminAction({
          action,
          target,
          app,
          state,
          request,
          toast,
          renderModals,
          renderView,
          updateAdminDocListInDOM,
          updateAdminAttractionListInDOM,
          updateAdminUserListInDOM,
          clearRerankCache,
          loadRerankStats,
          loadIntentShadowStats,
          probeIntentCapability,
          refreshRerankPanelInDOM,
          loadAdminHealth: doHealth
        });
        return;
      }
      if (owner === 'profile') {
        await handleProfileAction({
          action,
          target,
          state,
          request,
          toast,
          loadProfile,
          refreshProfileInDOM,
          refreshProfileMemoryInDOM,
          refreshProfileSlotsInDOM,
          renderChatInDOM,
          renderView,
          invalidatePageCache,
          markPageDataFresh
        });
        return;
      }
      if (owner === 'chat') {
        await handleChatAction({
          action,
          target,
          state,
          toast,
          renderView,
          renderFloatingBtn,
          renderChatInDOM,
          renderPlannerProposalDockInDOM,
          saveUserPlan,
          saveUserChats,
          persistTripWorkspace,
          getTripChatKey,
          sendChatMessage: doSendChatMessage,
          cancelChatMessage: () => cancelChatMessage({ renderView }),
          applyPlannerProposal: doApplyPlannerProposal,
          planFromCurrent: requestPlan,
          scheduleTripMap,
          invalidatePageCache
        });
        return;
      }
      if (owner === 'planning') {
        const spatial = state.trip?.spatialPlan;
        const alternatives = spatial?.placeResolution?.alternatives || [];
        const candidateIndex = Number.parseInt(target.dataset.candidateIndex || '-1', 10);
        const candidate = Number.isInteger(candidateIndex) ? alternatives[candidateIndex] : null;
        const continuationAction = action === 'select-place-candidate'
          ? 'select-candidate'
          : action === 'confirm-region-reference'
            ? 'confirm-reference'
            : 'retry';
        const options = buildSpatialContinuationOptions({
          trip: state.trip,
          prompt: state.prompt || '',
          action: continuationAction,
          candidate
        });
        await requestPlan(options);
        return;
      }
    } catch (error) {
      console.error(`[yuyouzhice] ${owner || '页面'}动作失败。`, error);
      toast(owner === 'navigation' ? '页面切换暂时失败，请刷新后重试。' : (error.message || '操作暂时失败，请稍后重试。'));
      return;
    }

    if (action === 'quick-fill') {
      const email = target.dataset.email;
      const pass = target.dataset.pass;
      const mode = target.dataset.mode;
      state.authMode = mode;
      state.loginError = '';
      renderModals();
      const emailInput = document.querySelector('#login-email');
      const passInput = document.querySelector('#login-password');
      if (emailInput) emailInput.value = email;
      if (passInput) passInput.value = pass;
      return;
    }
    if (action === 'logout') {
      await doLogout();
    }
    // 偏好状态机交互：微更新局部样式与输入框，杜绝页面重刷
    if (action === 'toggle-pref') {
      const cat = target.dataset.category;
      const val = target.dataset.value;

      if (cat === 'duration' || cat === 'companions' || cat === 'pace' || cat === 'transport') {
        preferences[cat] = preferences[cat] === val ? '' : val;
      } else if (cat === 'dining' || cat === 'themes') {
        if (preferences[cat].has(val)) {
          preferences[cat].delete(val);
        } else {
          preferences[cat].add(val);
        }
      }

      state.prompt = buildPromptFromPreferences();
      updatePreferenceChipsInDOM();
    }

    // 一键应用懂你的 AI 智能画像模版：微更新局部样式
    if (action === 'apply-preset') {
      const preset = target.dataset.preset;
      if (preset === 'elderly') {
        preferences.duration = '2天经典';
        preferences.companions = '带父母';
        preferences.pace = '少走路';
        preferences.transport = '公交优先';
        preferences.dining = new Set(['地道江湖菜', '清淡不辣']);
        preferences.themes = new Set(['人文历史', '山城夜景']);
      } else if (preset === 'magic8d') {
        preferences.duration = '2天经典';
        preferences.companions = '朋友结伴';
        preferences.pace = '经典适中';
        preferences.transport = '轻轨地铁优先';
        preferences.dining = new Set(['九宫格老火锅', '街头小吃小面']);
        preferences.themes = new Set(['8D魔幻', '山城夜景']);
      } else if (preset === 'couple') {
        preferences.duration = '2天经典';
        preferences.companions = '情侣双人';
        preferences.pace = '少走路';
        preferences.transport = '打车为主';
        preferences.dining = new Set(['九宫格老火锅']);
        preferences.themes = new Set(['山城夜景', '天然温泉']);
      } else if (preset === 'family') {
        preferences.duration = '3天深度';
        preferences.companions = '亲子家庭';
        preferences.pace = '少走路';
        preferences.transport = '轻轨地铁优先';
        preferences.dining = new Set(['清淡不辣']);
        preferences.themes = new Set(['人文历史', '自然奇观']);
      }

      state.prompt = buildPromptFromPreferences();
      updatePreferenceChipsInDOM();
      toast('已为您一键套用专属旅行偏好模版！');
    }

    if (action === 'toggle-use-memories') {
      state.useMemoriesInPlan = !state.useMemoriesInPlan;
      renderView();
      return;
    }

    if (action === 'plan') await requestPlan();
    if (action === 'map-day') {
      state.selectedMapDay = Number(target.dataset.day || 0);
      const dayButtons = document.querySelectorAll('.map-day-tabs .map-tab');
      dayButtons.forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.day || 0) === state.selectedMapDay);
      });
      if (state.mapFullscreen) {
        renderFullscreenMap().catch(() => {});
      } else {
        renderTripMap().catch(() => {});
      }
    }

    // 全屏地图控制
    if (action === 'open-fullscreen-map') {
      state.mapFullscreen = true;
      renderModals();
    }
    if (action === 'close-fullscreen-map') {
      state.mapFullscreen = false;
      destroyFullscreenMap();
      renderModals();
    }
    if (action === 'navigate-to') {
      navigateTo(target.dataset.name, target.dataset.location, target.dataset.fromName, target.dataset.fromLocation);
    }

    if (action === 'remove-stop') {
      await doRemoveStop(target.dataset.id);
    }
    if (action === 'edit-constraints') {
      state.constraintEditing = true;
      if (!refreshPlanningConstraintsInDOM()) renderView();
    }
    if (action === 'cancel-constraints') {
      state.constraintEditing = false;
      if (!refreshPlanningConstraintsInDOM()) renderView();
    }
    if (action === 'detail') {
      await doOpenDetail(target.dataset.id, {
        day: Number(target.dataset.day || 1),
        stopId: target.dataset.stopId || '',
        fromView: target.dataset.from || (state.view === 'explore' ? 'explore' : 'planning')
      });
    }
    if (action === 'dining-detail') {
      const stopId = target.dataset.id;
      const stop = state.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === stopId);
      if (stop) {
        state.activeDiningStop = stop;
        renderModals();
      }
    }
    if (action === 'close-dining-modal') {
      state.activeDiningStop = null;
      renderModals();
    }
    if (action === 'quick-dining-replace') {
      state.activeDiningStop = null;
      renderModals();
      const restaurantName = target.dataset.name || '当前餐厅';
      const day = target.dataset.day || 1;
      const prompt = `请帮我推荐第${day}天【${restaurantName}】周边的其他特色美食，我想换一家餐厅（例如地道九宫格火锅、特色江湖菜或清淡老字号）。`;
      state.chatMode = 'planner';
      await doSendChatMessage({ inputOverride: prompt });
    }
    if (action === 'add-attraction-custom') {
      const select = document.querySelector('#detail-day-select');
      const day = select ? Number(select.value) : 1;
      await doUpdateTripWithAttraction('add', { dataset: { id: target.dataset.id, day } });
    }
    if (action === 'replace-attraction') {
      await doUpdateTripWithAttraction('replace', target);
    }
    if (action === 'locate-user') {
      await getUserLocation();
    }
    if (action === 'reload-map') {
      destroyTripMap();
      window.__yuyouzhiceAmapPromise = null;
      scheduleTripMap();
      toast('正在重新加载高德地图...');
    }
    if (action === 'refresh-dynamic') {
      await refreshDynamicData({ renderDynamic: refreshPlanningDynamicInDOM, scheduleTripMap });
    }
    if (action === 'open-replan') {
      state.replan = target.dataset.id;
      renderModals();
    }
    if (action === 'close-replan') {
      state.replan = null;
      renderModals();
    }
    if (action === 'reason') {
      state.reason = target.dataset.reason;
      renderModals();
    }
    if (action === 'confirm-chat-proposal') {
      if (!state.sessionId) return;
      state.loading = true;
      renderLoader();
      try {
        const data = await request('/api/chat/proposal/confirm', {
          method: 'POST',
          body: JSON.stringify({ sessionId: state.sessionId, confirm: true })
        });
        state.chatProposal = null;
        if (data.trip) {
          state.trip = data.trip;
          if (data.trip.savedTripId) state.savedTripId = data.trip.savedTripId;
          scheduleTripMap();
        }
        toast(data.message || '已确认并更新行程方案！');
      } catch (error) {
        toast(error.message);
      } finally {
        state.loading = false;
        render();
      }
    }
    if (action === 'dismiss-chat-proposal') {
      if (state.sessionId) {
        try {
          await request('/api/chat/proposal/confirm', {
            method: 'POST',
            body: JSON.stringify({ sessionId: state.sessionId, confirm: false })
          });
        } catch {}
      }
      state.chatProposal = null;
      renderChatInDOM({ scrollToBottom: false }, renderView);
      toast('已取消本次调整建议。');
    }
    if (action === 'confirm-replan') await doConfirmReplan();
    if (action === 'save') await doSaveTrip();
    if (action === 'feedback-open') {
      state.feedbackOpen = true;
      renderModals();
    }
    if (action === 'close-feedback') {
      state.feedbackOpen = false;
      state.feedbackDraft = '';
      renderModals();
    }
    if (action === 'feedback-fill') {
      const input = document.querySelector('#feedback-letter-input');
      const addition = String(target.dataset.content || '').trim();
      const next = [String(input?.value || state.feedbackDraft || '').trim(), addition].filter(Boolean).join('；');
      state.feedbackDraft = next.slice(0, 600);
      if (input) input.value = state.feedbackDraft;
    }
    if (action === 'feedback-submit') {
      const content = String(document.querySelector('#feedback-letter-input')?.value || state.feedbackDraft || '').trim();
      if (!content) return toast('先写下想告诉我们的内容吧。');
      await sendFeedback('letter', content);
    }
    if (action === 'health') await doHealth();
    if (action === 'refresh-explore') await loadExplore({ force: true });
    if (action === 'quick-search-amap') {
      const q = document.querySelector('#explore-query')?.value || state.exploreQuery || '';
      void searchAmapPois(q);
    }
    if (action === 'explore-category') {
      state.exploreCategory = target.dataset.category || '';
      updateExploreGridInDOM();
      if (state.exploreQuery && state.exploreQuery.trim()) {
        void searchAmapPois(state.exploreQuery.trim());
      }
    }
    if (action === 'explore-add-custom') {
      const daySelect = document.querySelector(`#explore-day-${target.dataset.id}`);
      const day = daySelect ? Number(daySelect.value) : 1;
      await doAddExploreAttraction(target.dataset.id, day);
    }
    if (action === 'load-history') await doLoadHistorySession(target.dataset.id);
    if (action === 'refresh-trips') await loadTrips(renderView, { force: true });
    if (action === 'refresh-history') await loadHistory(renderView, { force: true });
    if (action === 'memory-once') {
      state.memoryProposal = null;
      renderModals();
      toast('仅本次调整有效，不写入长期偏好。');
    }
    if (action === 'memory-save') {
      if (!state.user) {
        state.pendingAfterLogin = 'memory';
        state.memoryProposal = null;
        state.loginOpen = true;
        renderModals();
      } else await doRememberPreference();
    }
    if (action === 'preference-use') {
      const pendingOptions = state.pendingPlanOptions || {};
      state.preferenceProposal = null;
      state.pendingPlanOptions = null;
      renderModals();
      await doPlan({ ...pendingOptions, usePreferences: true, preferenceDecision: 'use' });
    }
    if (action === 'preference-ignore') {
      const pendingOptions = state.pendingPlanOptions || {};
      state.preferenceProposal = null;
      state.pendingPlanOptions = null;
      renderModals();
      await doPlan({ ...pendingOptions, usePreferences: false, preferenceDecision: 'ignore' });
    }
    if (action === 'delete-saved') {
      state.deleteConfirm = target.dataset.id;
      renderModals();
    }
    if (action === 'cancel-delete') {
      state.deleteConfirm = null;
      renderModals();
    }
    if (action === 'confirm-delete') await doDeleteTrip(state.deleteConfirm);
    if (action === 'export-pdf') await exportTripPdf(target.dataset.id);
    if (action === 'load-saved') await doOpenSavedTrip(target.dataset.id);
  });

  document.addEventListener('change', (e) => {
    const target = e.target.closest('[data-action="toggle-use-memories"]');
    if (!target) return;
    state.useMemoriesInPlan = target.checked;
    renderView();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const activeEl = document.activeElement;
      if (activeEl?.id === 'new-dining-tag-input') {
        const btn = document.querySelector('[data-action="add-custom-slot-tag"][data-slot="dining"]');
        if (btn) btn.click();
      } else if (activeEl?.id === 'new-attraction-tag-input') {
        const btn = document.querySelector('[data-action="add-custom-slot-tag"][data-slot="attraction"]');
        if (btn) btn.click();
      }
    }
  });
}

void bootstrapApplication({
  app,
  restoreAuthSession,
  render,
  scheduleDynamicRefresh,
  loadAdminHealth: doHealth,
  prefetchPlannerContext,
  state
});
