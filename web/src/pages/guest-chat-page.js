import { state } from '../app-core/state.js';
import { chatPanel } from '../features/trip-chat/chat-panel.js';

export function guestChatView() {
  const messageCount = Array.isArray(state.chatMessages) ? state.chatMessages.length : 0;
  return `
    <main class="page shell guest-page">
      <header class="section-title"><div><h1>问问悠悠</h1><p>咨询重庆的景点、交通和美食。登录后可规划和保存行程。</p></div></header>
      <section class="guest-chat-column" aria-label="游客对话">${chatPanel({ floating: false })}</section>
      ${messageCount ? `<p class="guest-history-note">本次对话已有 ${messageCount} 条消息，登录后可在当前浏览器继续查看。</p>` : ''}
    </main>
  `;
}
