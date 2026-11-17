import test from 'node:test';
import assert from 'node:assert/strict';
import { chatModeGuideHtml, acknowledgeChatModeGuide, needsChatModeGuide } from './chat-mode-guide.js';
import { handleChatAction } from './chat-action-handler.js';

test('首次引导说明全智能体自由编排与人机确认能力，确认后按账号记住', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.match(chatModeGuideHtml('first-use'), /全智能体原生工作区/);
  assert.match(chatModeGuideHtml('first-use'), /写前人机确认/);
  acknowledgeChatModeGuide('first-use');
  assert.equal(chatModeGuideHtml('first-use'), '');
  assert.equal(values.get('yuyouzhice:chat-mode-guide:v1:first-use'), 'acknowledged');
  assert.equal(needsChatModeGuide('another-user'), true);
  assert.match(chatModeGuideHtml('first-use', true), /知道了/);
  delete globalThis.localStorage;
});

test('浏览器存储不可用时仍能关闭说明，不阻断聊天', () => {
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(needsChatModeGuide('storage-blocked'), true);
  assert.doesNotThrow(() => acknowledgeChatModeGuide('storage-blocked'));
  assert.equal(needsChatModeGuide('storage-blocked'), false);
  delete globalThis.localStorage;
});

test('全智能体模式下任何模式动作均稳态归位 agent 且保留草稿输入不发请求', async () => {
  const notices = [];
  const state = { user: { id: 'switch-fixture' }, trip: { days: [] }, chatMode: 'agent' };
  const common = { state, target: { dataset: { prompt: '把第二天改轻松一点' } },
    toast: (...args) => notices.push(args), renderChatInDOM() {}, saveUserPlan() {}, persistTripWorkspace() {},
    sendChatMessage() { assert.fail('切换不应发送请求'); } };
  await handleChatAction({ ...common, action: 'switch-agent-mode' });
  assert.equal(state.chatMode, 'agent');
  assert.equal(state.chatInput, '把第二天改轻松一点');
  assert.equal(notices[0][1].title, '已启用全智能体模式');
  assert.equal(notices[0][1].prominent, true);
  await handleChatAction({ ...common, action: 'switch-chat-mode' });
  assert.equal(state.chatMode, 'agent');
});
