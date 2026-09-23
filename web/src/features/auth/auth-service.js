import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { loadUserPlan, loadUserChats, saveUserChats, startGuestChatSession, getTripChatKey, loadGuestMemories } from '../../app-core/user-store.js';
import { clearPageCache } from '../../app-core/page-cache.js';

export async function restoreAuthSession(renderCallbacks = {}) {
  // 会话接口可能比首屏慢；记录启动时视图，避免请求返回游客状态时覆盖
  // 用户在等待期间主动点击的登录、注册或其它导航。
  const viewAtSessionCheck = state.view;
  try {
    const data = await request('/api/auth/session');
    if (data.authenticated) {
      state.user = data.user;
      state.csrfToken = data.csrfToken || null;
      try {
        const profileData = await request('/api/profile', { timeoutMs: 3000 });
        if (profileData && profileData.ok) {
          state.profile = profileData;
        }
      } catch {
        // silent
      }
    } else {
      state.user = null;
      state.csrfToken = null;
      state.profile = { ...(state.profile || {}), memories: loadGuestMemories() };
      if (state.view === viewAtSessionCheck) state.view = 'guest-chat';
    }

    const guestChat = !state.user && state.view === 'guest-chat';
    // 游客体验只恢复当前访客问答会话；不把 anonymous 下遗留的规划草稿
    // 塞进 chat stream 的 plannerSessionId / 行程上下文。
    const activePlan = state.user ? loadUserPlan(state.user.id) : null;
    if (activePlan && activePlan.trip) {
      state.trip = activePlan.trip;
      state.sessionId = activePlan.sessionId;
      state.savedTripId = activePlan.savedTripId;
      state.chatMode = activePlan.chatMode === 'planner' ? 'planner' : 'chat';
      state.prompt = activePlan.prompt || state.prompt;
      state.activeProposal = activePlan.activeProposal || null;
      state.selectedOptionId = activePlan.selectedOptionId || 'option-1';
      if (activePlan.view && state.user) state.view = activePlan.view;
    } else if (state.user && state.view === 'guest-chat') {
      state.view = 'home';
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
      state.chatMode = 'chat';
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
    state.user = null;
    state.csrfToken = null;
  }
}

export async function logout(renderCallback) {
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
  state.chatMode = 'chat';
  state.view = 'guest-chat';
  toast('已安全退出登录。');
  if (renderCallback) renderCallback();
}
