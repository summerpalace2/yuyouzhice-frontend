import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { saveUserPlan, loadUserChats, getTripChatKey } from '../../app-core/user-store.js';
import { invalidatePageCache } from '../../app-core/page-cache.js';
import { detachChatWorkspace, sendChatMessage } from '../trip-chat/chat-service.js';
import { captureWorkspace } from '../../app-core/workspace-lifecycle.js';
import { transitionMainView } from '../../app-core/main-view-transition.js';

function buildAgentPlanningPrompt(submittedPrompt, constraints = {}, usePreferences = true) {
  const base = String(submittedPrompt || '').trim() || '请帮我规划一次重庆经典旅行方案。';
  const extras = [];
  if (constraints && typeof constraints === 'object') {
    if (constraints.durationDays) extras.push(`游玩天数=${constraints.durationDays}天`);
    if (constraints.companions) extras.push(`同行人=${constraints.companions}`);
    if (constraints.walkingTolerance) extras.push(`步行强度=${constraints.walkingTolerance}`);
    if (constraints.transportPreference) extras.push(`交通偏好=${constraints.transportPreference}`);
    if (constraints.budget) extras.push(`预算=${constraints.budget}`);
  }
  if (!usePreferences) extras.push('本次忽略历史个人偏好');
  return extras.length ? `${base}\n（补充要求：${extras.join('；')}）` : base;
}

export async function plan({
  prompt = null,
  constraints = {},
  usePreferences = true,
  preferenceDecision = '',
  preserveSavedTripId = false,
  renderView,
  renderHeader,
  renderLoader,
  render,
  scheduleTripMap
} = {}) {
  if (!state.user) {
    transitionMainView(state, 'auth');
    state.authMode = 'login';
    state.loginError = '';
    if (renderHeader) renderHeader();
    if (renderView) renderView();
    if (renderLoader) renderLoader();
    toast('AI 完整规划需要先登录，请登录后继续。');
    return;
  }
  detachChatWorkspace();
  const owner = captureWorkspace();
  state.planOperation = owner;
  const submittedPrompt = String(typeof prompt === 'string'
    ? prompt
    : (document.querySelector('#prompt-input')?.value ?? state.prompt) || '').trim();
  if (!submittedPrompt) {
    toast('请先输入你的旅行想法或天数要求。');
    return;
  }

  state.prompt = submittedPrompt;
  state.planRequestError = null;
  if (!preserveSavedTripId) {
    state.savedTripId = null;
    state.itineraryMemorySnapshot = null;
  }
  state.trip = null;
  state.sessionId = null;
  state.activeProposal = null;
  state.plannerProposalDockOpen = false;
  state.selectedStopId = null;
  if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
  state.pinnedStopIds = new Set();
  state.loading = false;
  state.loadingPhase = '';
  state.chatMode = 'agent';
  state.chatDockOpen = true;
  state.chatLoading = false;
  state.agentDraftingPending = true;

  const pendingChatKey = getTripChatKey(null, `agent-plan-${Date.now()}`);
  state.chatSessionId = pendingChatKey;
  state.tripChatHistories = { ...loadUserChats(state.user?.id), ...(state.tripChatHistories || {}) };
  state.chatMessages = [];
  state.tripChatHistories[pendingChatKey] = state.chatMessages;

  transitionMainView(state, 'planning');
  if (render) render();

  const agentPrompt = buildAgentPlanningPrompt(submittedPrompt, constraints, usePreferences);
  try {
    await sendChatMessage({
      inputOverride: agentPrompt,
      preserveInput: true,
      renderView,
      scheduleTripMap
    });
    if (state.planOperation === owner) state.planOperation = null;
    invalidatePageCache('history');
  } catch (error) {
    if (state.planOperation === owner) state.planOperation = null;
    toast(error?.message || '全智能体规划启动失败，请在右侧重试。');
  } finally {
    state.agentDraftingPending = false;
  }
}

/** Refreshes volatile provider data without changing the itinerary revision. */
export async function refreshDynamicData({ render, renderDynamic, scheduleTripMap, silent = false } = {}) {
  if (!state.trip || !state.sessionId || (state.dynamicRefreshing && state.dynamicOperation?.owns())) return false;
  const owner = captureWorkspace();
  const submittedTrip = state.trip;
  const revision = Number(state.trip.version || 1);
  state.dynamicOperation = owner;
  const owns = () => state.dynamicOperation === owner && owner.owns()
    && state.sessionId === owner.sessionId && state.savedTripId === owner.savedTripId;
  state.dynamicRefreshing = true;
  if (renderDynamic) renderDynamic();
  try {
    const data = await request(`/api/planner/sessions/${encodeURIComponent(owner.sessionId)}/dynamic-refresh`, {
      method: 'POST'
    });
    if (!owns() || state.trip !== submittedTrip || Number(state.trip?.version || 1) !== revision
      || (data.trip && Number(data.trip.version || 1) !== revision)) return false;
    if (data.trip) {
      state.trip = data.trip;
      state.dynamicRefreshSessionId = state.sessionId;
      saveUserPlan(state.user?.id, {
        trip: state.trip,
        sessionId: state.sessionId,
        savedTripId: state.savedTripId,
        prompt: state.prompt,
        view: 'planning'
      });
    }
    if (!silent) {
      const resolved = Number(data.dynamicRefresh?.weatherDaysResolved || 0);
      toast(resolved > 0 ? `已刷新 ${resolved} 天天气与地图动态数据。` : '已发起实时查询；当前日期暂未获得可用天气预报。');
    }
    return true;
  } catch (error) {
    if (owns() && !silent) toast(error.message || '刷新实时数据失败。');
    return false;
  } finally {
    const current = owns();
    if (state.dynamicOperation === owner) {
      state.dynamicOperation = null;
      state.dynamicRefreshing = false;
    }
    if (current && renderDynamic) {
      renderDynamic();
      if (scheduleTripMap) scheduleTripMap();
    } else if (current && render) {
      render();
    }
  }
}
