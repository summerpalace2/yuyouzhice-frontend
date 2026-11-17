import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { loadUserPlan, loadUserChats, saveUserChats, startGuestChatSession, getTripChatKey, loadGuestMemories } from '../../app-core/user-store.js';
import { clearPageCache } from '../../app-core/page-cache.js';
import { detachChatWorkspace } from '../trip-chat/chat-service.js';
import { openSavedTrip } from '../trip-save/save-service.js';
import { invalidateAuthentication, captureAuthentication, captureWorkspace } from '../../app-core/workspace-lifecycle.js';
import { transitionMainView } from '../../app-core/main-view-transition.js';

export async function restoreAuthSession(renderCallbacks = {}) {
  // 会话接口可能比首屏慢；记录启动时视图，避免请求返回游客状态时覆盖
  // 用户在等待期间主动点击的登录、注册或其它导航。
  const viewAtSessionCheck = state.view;
  const authentication = captureAuthentication();
  try {
    const data = await request('/api/auth/session');
    if (!authentication.owns()) return;
    if (data.authenticated) {
      state.user = data.user;
      state.csrfToken = data.csrfToken || null;
      const restoration = captureWorkspace({ exact: true });
      try {
        const profileData = await request('/api/profile', { timeoutMs: 3000 });
        if (!restoration.owns()) return;
        if (profileData && profileData.ok) {
          state.profile = profileData;
        }
      } catch {
        // silent
      }
      if (!restoration.owns()) return;
    } else {
      state.user = null;
      state.csrfToken = null;
      state.profile = { ...(state.profile || {}), memories: loadGuestMemories() };
      if (state.view === viewAtSessionCheck) transitionMainView(state, 'guest-chat');
    }

    if (!authentication.current()) return;
    const guestChat = !state.user && state.view === 'guest-chat';
    // 游客体验只恢复当前访客问答会话；不把 anonymous 下遗留的规划草稿
    // 塞进 chat stream 的 plannerSessionId / 行程上下文。
    const activePlan = state.user ? loadUserPlan(state.user.id) : null;
    if (activePlan?.trip && activePlan.savedTripId) {
      // Formal Trips have an authoritative workspace; a local copy alone cannot
      // prove its transcript postdates a clear on another device.
      const userId = state.user.id;
      state.trip = null;
      state.sessionId = null;
      state.savedTripId = null;
      state.activeProposal = null;
      state.chatSessionId = null;
      state.chatMessages = [];
      state.chatMeta = null;
      state.chatProposal = null;
      state.chatWorkspace = null;
      state.tripChatHistories = loadUserChats(userId);
      transitionMainView(state, 'trips');
      await openSavedTrip(activePlan.savedTripId, { preserveDraft: true });
      if (!authentication.current() || state.user?.id !== userId) return;
      if (renderCallbacks.renderHeader) renderCallbacks.renderHeader();
      if (renderCallbacks.renderView) renderCallbacks.renderView();
      if (renderCallbacks.renderFloatingBtn) renderCallbacks.renderFloatingBtn();
      if (state.user?.role === 'admin' && renderCallbacks.health) await renderCallbacks.health();
      return;
    }
    if (activePlan && activePlan.trip) {
      state.trip = activePlan.trip;
      state.sessionId = activePlan.sessionId;
      state.savedTripId = activePlan.savedTripId;
      state.chatMode = (activePlan.chatMode === 'agent' || activePlan.chatMode === 'planner' || activePlan.chatMode === 'chat') ? activePlan.chatMode : 'agent';
      state.prompt = activePlan.prompt || state.prompt;
      state.activeProposal = activePlan.activeProposal || null;
      state.selectedOptionId = activePlan.selectedOptionId || 'option-1';
      if (activePlan.view && state.user) transitionMainView(state, activePlan.view);
    } else if (state.user && state.view === 'guest-chat') {
      transitionMainView(state, 'home');
    }
    state.tripChatHistories = loadUserChats(state.user?.id);
    const chatKey = guestChat
      ? startGuestChatSession()
      : getTripChatKey(state.savedTripId, state.sessionId);
    if (guestChat) {
      state.trip = null;
      state.sessionId = null;
      state.savedTripId = null;
      state.itineraryMemorySnapshot = null;
      state.activeProposal = null;
      state.chatMode = 'agent';
      state.chatInput = '';
      state.chatMeta = null;
      state.chatRoute = 'idle';
    }
    state.chatSessionId = chatKey;
    state.chatMessages = guestChat ? [] : (state.tripChatHistories[chatKey] || []);

    if (renderCallbacks.renderHeader) renderCallbacks.renderHeader();
    if (renderCallbacks.renderView) renderCallbacks.renderView();
    if (renderCallbacks.renderFloatingBtn) renderCallbacks.renderFloatingBtn();
    if (state.user?.role === 'admin' && renderCallbacks.health) await renderCallbacks.health();
  } catch {
    if (!authentication.current()) return;
    state.user = null;
    state.csrfToken = null;
  }
}

export async function logout(renderCallback) {
  invalidateAuthentication();
  state.draftBackupFailed = false;
  state.draftBackupFailedTripId = null;
  state.draftBackupAvailable = false;
  state.draftBackup = null;
  detachChatWorkspace();
  state.loading = false;
  if (state.user) {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch { }
  }
  state.csrfToken = null;
  clearPageCache();
  state.user = null;
  state.savedTrips = null;
  state.historySessions = null;
  state.historySync = null;
  state.profile = null;
  state.trip = null;
  state.sessionId = null;
  state.savedTripId = null;
  state.itineraryMemorySnapshot = null;
  state.tripChatHistories = loadUserChats(null);
  state.chatSessionId = startGuestChatSession();
  state.chatMessages = [];
  state.chatInput = '';
  state.chatMeta = null;
  state.chatRoute = 'idle';
  state.selectedStopId = null;
  if (state.selectedStopIds instanceof Set) state.selectedStopIds.clear();
  state.chatMode = 'agent';
  transitionMainView(state, 'guest-chat');
  toast('已安全退出登录。');
  if (renderCallback) renderCallback();
}
