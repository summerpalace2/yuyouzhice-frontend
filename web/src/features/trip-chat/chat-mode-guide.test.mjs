import test from 'node:test';
import assert from 'node:assert/strict';
import { chatModeGuideHtml, acknowledgeChatModeGuide, needsChatModeGuide } from './chat-mode-guide.js';
import { handleChatAction } from './chat-action-handler.js';

test('首次引导说明两种用途，确认后按账号记住，仍可主动查看', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.match(chatModeGuideHtml('first-use'), /智能体模式/);
  assert.match(chatModeGuideHtml('first-use'), /以对话为主导/);
  assert.match(chatModeGuideHtml('first-use'), /以局部修改为主导/);
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

test('两种切换明确提示模式名称与用途，保留原调整问题且不发送请求', async () => {
  const notices = [];
  const state = { user: { id: 'switch-fixture' }, trip: { days: [] }, chatMode: 'chat' };
  const common = { state, target: { dataset: { prompt: '把第二天改轻松一点' } },
    toast: (...args) => notices.push(args), renderChatInDOM() {}, saveUserPlan() {}, persistTripWorkspace() {},
    sendChatMessage() { assert.fail('切换不应发送请求'); } };
  await handleChatAction({ ...common, action: 'switch-adjustment-mode' });
  assert.equal(state.chatMode, 'planner');
  assert.equal(state.chatInput, '把第二天改轻松一点');
  assert.equal(notices[0][1].title, '已切换至调整模式');
  assert.match(notices[0][0], /确认后应用/);
  assert.equal(notices[0][1].prominent, true);
  await handleChatAction({ ...common, action: 'switch-chat-mode' });
  assert.equal(state.chatMode, 'chat');
  assert.equal(notices[1][1].title, '已切换至聊天模式');
  assert.match(notices[1][0], /以对话为主导/);
});
