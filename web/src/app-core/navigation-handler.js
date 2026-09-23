/**
 * 处理会改变主页面或认证页面的导航动作。
 *
 * 此处刻意不处理聊天、规划和管理员数据写入；调用方根据 true/false 决定
 * 是否继续将动作交给对应领域 handler。依赖通过参数传入，避免本模块反向依赖 feature。
 */
export function handleNavigationAction({
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
  loadAdminHealth,
  switchAdminSectionInDOM,
  toast
} = {}) {
  const loadAdminOverviewInBackground = () => {
    state.adminLoading = true;
    state.adminLoadError = '';
    void loadAdminHealth({ renderAfterLoad: false })
      .catch((error) => {
        state.adminLoadError = error?.message || '无法读取管理概览。';
        console.warn('管理数据加载失败。', error);
      })
      .finally(() => {
        state.adminLoading = false;
        if (state.view === 'admin') {
          renderHeader();
          renderView();
          renderFloatingBtn();
        }
      });
  };

  if (action === 'go') {
    const requestedView = target.dataset.view;
    const protectedViews = ['home', 'planning', 'explore', 'trips', 'history', 'profile', 'admin'];
    if (!state.user && protectedViews.includes(requestedView)) {
      state.view = 'auth';
      state.authMode = 'login';
      state.loginError = '';
      renderHeader();
      renderView();
      renderFloatingBtn();
      toast('登录后即可使用完整规划与行程管理。');
      return true;
    }

    // 管理页先挂载明确的加载态，再后台读取真实概览；不能让用户停在上一页，
    // 也不能在接口失败时渲染由空对象推导出的 0 值指标。
    if (requestedView === 'admin') {
      if (state.user?.role !== 'admin') {
        toast('只有管理员账号可以进入控制中心。');
        return true;
      }
      state.view = 'admin';
      if (state.adminOverview && isPageDataFresh('admin', { maxAgeMs: 30_000 })) {
        state.adminLoading = false;
        renderHeader();
        renderView();
        renderFloatingBtn();
        return true;
      }
      state.adminLoading = true;
      state.adminLoadError = '';
      renderHeader();
      renderView();
      renderFloatingBtn();
      loadAdminOverviewInBackground();
      return true;
    }

    if (!state.user && requestedView === 'guest-chat' && state.view !== 'guest-chat') {
      state.chatSessionId = startGuestChatSession();
      state.chatMessages = [];
      state.chatInput = '';
      state.chatMeta = null;
      state.chatRoute = 'idle';
      state.chatMode = 'chat';
      state.trip = null;
      state.sessionId = null;
      state.savedTripId = null;
      state.itineraryMemorySnapshot = null;
      state.activeProposal = null;
      state.selectedStopId = null;
      if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
      if (state.pinnedStopIds instanceof Set) state.pinnedStopIds.clear();
    }

    state.view = requestedView;
    if (state.view === 'planning' && !state.trip) {
      const userPlan = loadUserPlan(state.user?.id);
      if (userPlan?.trip) {
        state.trip = userPlan.trip;
        state.sessionId = userPlan.sessionId;
        state.savedTripId = userPlan.savedTripId;
        state.prompt = userPlan.prompt || state.prompt;
        state.chatMode = userPlan.chatMode === 'planner' ? 'planner' : 'chat';
        state.activeProposal = userPlan.activeProposal || null;
        state.selectedOptionId = userPlan.selectedOptionId || 'option-1';
        const chatKey = getTripChatKey(state.savedTripId, state.sessionId);
        state.chatSessionId = chatKey;
        state.tripChatHistories = loadUserChats(state.user?.id);
        state.chatMessages = state.tripChatHistories[chatKey] || [];
      }
    }

    renderHeader();
    renderView();
    renderFloatingBtn();
    if (state.view === 'explore') void loadExplore();
    if (state.view === 'trips') void loadTrips(renderView);
    if (state.view === 'history') void loadHistory(renderView);
    if (state.view === 'profile') void loadProfile(refreshProfileInDOM);
    if (state.view === 'planning' && state.trip) scheduleTripMap();
    if (state.view === 'planning' && state.trip) scheduleDynamicRefresh();
    return true;
  }

  if (action === 'admin-section') {
    if (state.user?.role !== 'admin') {
      toast('只有管理员账号可以进入控制中心。');
      return true;
    }
    const section = target.dataset.section || 'overview';
    if (state.view === 'admin' && switchAdminSectionInDOM(section)) return true;
    state.view = 'admin';
    state.adminSection = section;
    const adminDataFresh = state.adminOverview && isPageDataFresh('admin', { maxAgeMs: 30_000 });
    if (!adminDataFresh) loadAdminOverviewInBackground();
    renderHeader();
    renderView();
    renderFloatingBtn();
    return true;
  }

  if (action === 'switch-perspective' || action === 'enter-planner-test') {
    if (state.user?.role !== 'admin') {
      toast('只有管理员账号可以进入规划测试。');
      return true;
    }
    state.adminPerspective = true;
    state.view = state.trip ? 'planning' : 'home';
    renderHeader();
    renderView();
    renderFloatingBtn();
    toast(state.trip
      ? '已进入管理员规划测试，当前行程可继续局部调整。'
      : '已进入管理员规划测试，请从首页开始生成完整行程。');
    return true;
  }

  if (action === 'login' || action === 'open-auth-page') {
    state.view = 'auth';
    state.authMode = action === 'open-auth-page' && target.dataset.mode === 'register' ? 'register' : 'login';
    state.loginError = '';
    state.loginOpen = false;
    renderHeader();
    renderView();
    renderFloatingBtn();
    return true;
  }

  if (action === 'set-auth-mode') {
    state.authMode = target.dataset.mode === 'register' ? 'register' : 'login';
    state.loginError = '';
    if (state.view === 'auth') renderView();
    else renderModals();
    return true;
  }

  if (action === 'close-login') {
    state.loginOpen = false;
    if (state.view === 'auth') {
      state.view = state.user ? 'home' : 'guest-chat';
      renderHeader();
      renderView();
      renderFloatingBtn();
    } else renderModals();
    return true;
  }

  return false;
}
import { isPageDataFresh } from './page-cache.js';
