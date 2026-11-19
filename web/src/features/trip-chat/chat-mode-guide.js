const acknowledged = new Set();
const keyFor = userId => `yuyouzhice:chat-mode-guide:v1:${userId || 'guest'}`;

export const CHAT_MODES = {
  chat: { name: '全智能体模式', description: '自主联动天气、高德实景 POI、路网耗时与知识库，自由规划与微调并在写前交你确认。' },
  planner: { name: '全智能体模式', description: '自主联动天气、高德实景 POI、路网耗时与知识库，自由规划与微调并在写前交你确认。' },
  agent: { name: '全智能体模式', description: '自主联动天气、高德实景 POI、路网耗时与知识库，写前人机确认落库。' }
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
  return `<details class="chat-mode-guide" ${force ? 'open' : ''} aria-label="全智能体工作区指南">
    <summary>如何与悠悠一起规划</summary>
    <strong>全智能体原生工作区</strong>
    <p><b>🤖 自由编排与查证</b>：支持按天指定景点、查天气、高德算路网、搜索长尾美食与跨天重排。</p>
    <p><b>🛡️ 写前人机确认 (HIL)</b>：调整行程、固定站点、正式保存或写入偏好均须你点击确认后生效。</p>
    <div><small>可以直接输入需求，也可以从行程里选择站点</small><button type="button" class="primary mini-btn" data-action="acknowledge-chat-mode-guide">知道了</button></div>
  </details>`;
}

export function announceChatMode(mode, toast) {
  const info = CHAT_MODES.agent;
  toast(info.description, { title: `已启用${info.name}`, prominent: true, duration: 4500 });
}
