const acknowledged = new Set();
const keyFor = userId => `yuyouzhice:chat-mode-guide:v1:${userId || 'guest'}`;

export const CHAT_MODES = {
  chat: { name: '聊天模式', description: '以对话为主导，咨询景点、美食、天气和交通。' },
  planner: { name: '调整模式', description: '以局部修改为主导，增删或替换行程站点，先预览、确认后应用。' },
  agent: { name: '智能体模式', description: '自主联动天气、路网、知识库与行程工具，写操作须人工确认。' }
};

export function needsChatModeGuide(userId) {
  const key = keyFor(userId);
  if (acknowledged.has(key)) return false;
  try { return globalThis.localStorage?.getItem(key) !== 'acknowledged'; }
  catch { return true; }
}

export function acknowledgeChatModeGuide(userId) {
  const key = keyFor(userId);
  acknowledged.add(key);
  try { globalThis.localStorage?.setItem(key, 'acknowledged'); } catch { /* Session fallback. */ }
}

export function chatModeGuideHtml(userId, force = false) {
  if (!force && !needsChatModeGuide(userId)) return '';
  return `<section class="chat-mode-guide" aria-label="智能体与对话模式说明">
    <strong>先了解三种对话模式</strong>
    <p><b>🤖 智能体模式</b>：${CHAT_MODES.agent.description}</p>
    <p><b>💬 聊天模式</b>：${CHAT_MODES.chat.description}</p>
    <p><b>⚡ 调整模式</b>：${CHAT_MODES.planner.description}</p>
    <div><small>随时点击上方按钮切换</small><button type="button" class="primary mini-btn" data-action="acknowledge-chat-mode-guide">知道了</button></div>
  </section>`;
}

export function announceChatMode(mode, toast) {
  const key = mode === 'planner' ? 'planner' : (mode === 'agent' ? 'agent' : 'chat');
  const info = CHAT_MODES[key];
  toast(info.description, { title: `已切换至${info.name}`, prominent: true, duration: 4500 });
}
