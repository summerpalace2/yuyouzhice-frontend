/**
 * 用户专属规划状态与聊天历史持久化存储管理器
 *
 * 核心特性：
 * 1. 按用户 ID (userId) 独立隔离存储规划草稿与聊天记录；
 * 2. 匿名用户在首页规划后，登录时自动将规划与对话无缝平移至该用户；
 * 3. 页面刷新或切换导航后，自动保留并恢复各用户的独立规划页与聊天副本；
 * 4. 每个规划独立绑定唯一聊天会话键，再次规划时旧聊天记录完整存档不丢失。
 */

const PREFIX_PLAN = 'yuyouzhice_active_plan_';
const PREFIX_CHATS = 'yuyouzhice_chat_histories_';

/**
 * 游客会话只在当前页面生命周期内有效。重新打开网站或重新进入游客页时
 * 必须换新 ID，避免复用浏览器持久化记录和 Java/Redis 中的旧对话上下文。
 */
function createGuestChatSessionId() {
  const cryptoApi = globalThis.crypto || globalThis.window?.crypto;
  const suffix = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `guest-chat-${suffix}`.slice(0, 128);
}

let activeGuestChatSessionId = createGuestChatSessionId();

export function getGuestChatSessionId() {
  return activeGuestChatSessionId;
}

export function startGuestChatSession() {
  activeGuestChatSessionId = createGuestChatSessionId();
  return activeGuestChatSessionId;
}

const PREFIX_GUEST_MEMORIES = 'yuyouzhice_guest_memories';

export function loadGuestMemories() {
  try {
    const raw = window.localStorage?.getItem(PREFIX_GUEST_MEMORIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGuestMemories(memories) {
  try {
    window.localStorage?.setItem(PREFIX_GUEST_MEMORIES, JSON.stringify(memories || []));
  } catch {}
}

function getUserKey(userId) {
  return userId && String(userId).trim() ? String(userId).trim() : 'anonymous';
}

function isObsoleteGuestAuthError(message) {
  if (!message || typeof message !== 'object') return false;
  const text = `${message.content || ''}\n${message.error || ''}`;
  return /聊天功能需要登录，请先登录后再试|需要登录后才能继续聊天/.test(text);
}

function normalizeChatHistories(chatsData) {
  if (!chatsData || typeof chatsData !== 'object' || Array.isArray(chatsData)) return {};
  return Object.fromEntries(Object.entries(chatsData).map(([chatKey, messages]) => [
    chatKey,
    Array.isArray(messages)
      // 旧版本的匿名鉴权错误永远不代表真实旅行对话，且修复后不会再出现。
      // 对所有旧键清理，避免它在 default -> guest-chat 迁移时被一并带入。
      ? messages.filter((message) => !isObsoleteGuestAuthError(message)).map((message) => {
        if (!message || typeof message !== 'object' || !message.pending) return message;
        return {
          ...message,
          pending: false,
          content: message.content || '本次回复未完成，请重新提问。'
        };
      })
      : []
  ]));
}

export function getTripChatKey(savedTripId, sessionId) {
  if (savedTripId && String(savedTripId).trim()) {
    return `trip-${String(savedTripId).trim()}`;
  }
  if (sessionId && String(sessionId).trim()) {
    return `plan-${String(sessionId).trim()}`;
  }
  return 'default';
}

export function saveUserPlan(userId, planData) {
  try {
    const key = PREFIX_PLAN + getUserKey(userId);
    if (!planData || !planData.trip) {
      window.localStorage.removeItem(key);
      return;
    }
    const previous = JSON.parse(window.localStorage.getItem(key) || '{}');
    const requestedChatMode = planData.chatMode === 'planner' || planData.chatMode === 'chat'
      ? planData.chatMode
      : null;
    const payload = {
      trip: planData.trip,
      sessionId: planData.sessionId || null,
      savedTripId: planData.savedTripId || null,
      prompt: planData.prompt || '',
      view: planData.view || 'planning',
      activeProposal: planData.activeProposal || null,
      selectedOptionId: planData.selectedOptionId || 'option-1',
      // 对话用途是当前行程的 UI 偏好。未显式传入时沿用已有值，避免刷新后
      // 用户刚选好的“聊天/局部调整”被保存行程动作覆盖。
      chatMode: requestedChatMode || (previous.chatMode === 'planner' ? 'planner' : 'chat'),
      updatedAt: Date.now()
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('[UserStore] 保存规划草稿失败:', err);
  }
}

export function loadUserPlan(userId) {
  try {
    const key = PREFIX_PLAN + getUserKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[UserStore] 读取规划草稿失败:', err);
    return null;
  }
}

export function clearUserPlan(userId) {
  try {
    const key = PREFIX_PLAN + getUserKey(userId);
    window.localStorage.removeItem(key);
  } catch {}
}

export function saveUserChats(userId, chatsData) {
  try {
    const key = PREFIX_CHATS + getUserKey(userId);
    if (!chatsData || Object.keys(chatsData).length === 0) return;
    window.localStorage.setItem(key, JSON.stringify(normalizeChatHistories(chatsData)));
  } catch (err) {
    console.warn('[UserStore] 保存聊天记录失败:', err);
  }
}

export function loadUserChats(userId) {
  try {
    const key = PREFIX_CHATS + getUserKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    return normalizeChatHistories(JSON.parse(raw) || {});
  } catch (err) {
    console.warn('[UserStore] 读取聊天记录失败:', err);
    return {};
  }
}

/**
 * 用户从匿名状态登录后，将匿名状态下的规划草稿和对话无缝同步绑定到新用户
 */
export function syncAnonymousDraftToUser(newUserId) {
  if (!newUserId || newUserId === 'anonymous') return;
  try {
    const anonPlan = loadUserPlan('anonymous');
    const anonChats = loadUserChats('anonymous');

    if (anonPlan && anonPlan.trip) {
      saveUserPlan(newUserId, anonPlan);
      clearUserPlan('anonymous');
    }

    if (anonChats && Object.keys(anonChats).length > 0) {
      const userChats = loadUserChats(newUserId);
      const merged = { ...anonChats, ...userChats };
      saveUserChats(newUserId, merged);
      try { window.localStorage.removeItem(PREFIX_CHATS + 'anonymous'); } catch {}
    }
  } catch (err) {
    console.warn('[UserStore] 同步匿名草稿失败:', err);
  }
}
