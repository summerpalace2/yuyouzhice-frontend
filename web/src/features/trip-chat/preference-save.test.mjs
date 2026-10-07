import test from 'node:test';
import assert from 'node:assert/strict';
import { handleChatAction } from './chat-action-handler.js';
import { chatMessageHtml } from './chat-panel.js';
import { state as sharedState } from '../../app-core/state.js';

function setup(action = 'save_slot_preference') {
  const suggestion = { action, label: '将【人文历史】加入景点偏好', payload: action === 'save_memory' ? '偏好人文历史' : JSON.stringify({ slot: 'attraction', tag: '人文历史' }) };
  const state = sharedState;
  Object.assign(state, { user: { id: 'test-user' }, trip: null, sessionId: null, savedTripId: null,
    chatSessionId: 'test-chat', chatLoading: false, profile: { memories: [] }, chatMessages: [{ role: 'assistant', actionableSuggestions: [suggestion] }] });
  const classes = new Set();
  const button = { dataset: { chipAction: action, chipPayload: suggestion.payload, chipLabel: suggestion.label }, disabled: false, innerHTML: '原按钮', closest() { return this; }, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } };
  const toasts = [];
  const context = { action: 'execute-action-chip', target: button, state, toast: message => toasts.push(message), renderChatInDOM() {}, renderView() {}, saveUserChats() {}, getTripChatKey: () => 'test-chat', sendChatMessage: () => assert.fail('保存偏好不能修改行程') };
  return { suggestion, state, button, context, toasts };
}

const memory = { id: 'server-memory', content: '偏好人文历史', category: 'INTEREST', status: 'CONFIRMED' };

test('人文历史按钮等待确认后保存为旅行记忆，并刷新规划画像', async () => {
  const f = setup();
  const calls = [];
  let resolveSave;
  f.context.request = async (path, options) => {
    calls.push({ path, body: options?.body && JSON.parse(options.body) });
    if (path === '/api/memories') return new Promise(resolve => { resolveSave = resolve; });
    return { ok: true, memories: [memory], profilePrependPrompt: '• 景观偏好：偏好人文历史；' };
  };
  const saving = handleChatAction(f.context);
  assert.equal(f.suggestion.applied, undefined, '请求尚未确认时不能标成功');
  assert.equal(calls[0].path, '/api/memories', '必须写入档案读取的同一存储');
  assert.equal(calls[0].body.category, 'INTEREST');
  resolveSave({ ok: true, memory });
  await saving;
  assert.equal(f.state.profile.memories[0].id, memory.id);
  assert.match(f.state.profile.profilePrependPrompt, /人文历史/);
  assert.equal(f.suggestion.savedMemoryId, memory.id);
  assert.equal(f.suggestion.applied, true);
  assert.equal(f.button.disabled, true);
  assert.deepEqual(calls.map(c => c.path), ['/api/memories', '/api/profile']);
});

for (const action of ['save_slot_preference', 'save_memory']) {
  test(`${action} 保存失败后可重试，重绘不显示成功`, async () => {
    const f = setup(action);
    f.context.request = async () => { throw new Error('服务暂不可用'); };
    await handleChatAction(f.context);
    assert.equal(Boolean(f.suggestion.applied), false);
    assert.equal(f.suggestion.savedMemoryId, undefined);
    assert.equal(f.button.disabled, false);
    assert.equal(f.button.innerHTML, '原按钮');
    assert.equal(f.button.classList.contains('is-applied'), false);
    assert.match(f.toasts[0], /服务暂不可用/);
  });
}

test('缺少服务端记忆 ID 的响应不能伪造保存成功', async () => {
  const f = setup('save_memory');
  f.context.request = async () => ({ ok: true });
  await handleChatAction(f.context);
  assert.equal(Boolean(f.suggestion.applied), false);
  assert.equal(f.state.profile.memories.length, 0);
});

test('记忆已保存但档案刷新失败时保留真实保存证据并提示刷新失败', async () => {
  const f = setup();
  f.context.request = async path => {
    if (path === '/api/memories') return { ok: true, memory };
    throw new Error('读取失败');
  };
  await handleChatAction(f.context);
  assert.equal(f.suggestion.savedMemoryId, memory.id);
  assert.equal(f.state.profile.memories[0].id, memory.id);
  assert.match(f.toasts[0], /已保存.*刷新/);
});

test('游客标签也进入本地确认记忆，供登录后同步', async () => {
  const f = setup();
  f.state.user = null;
  f.context.request = () => assert.fail('游客不能假装已写云端');
  await handleChatAction(f.context);
  assert.equal(f.state.profile.memories.length, 1);
  assert.equal(f.state.profile.memories[0].category, 'INTEREST');
  assert.equal(f.state.profile.memories[0].content, '偏好人文历史');
  assert.equal(f.suggestion.savedMemoryId, f.state.profile.memories[0].id);
});

test('旧的提前 applied 标记没有保存证据时，历史按钮允许重新确认', () => {
  const f = setup();
  f.suggestion.applied = true;
  const html = chatMessageHtml(f.state.chatMessages[0]);
  assert.doesNotMatch(html, /已加入偏好/);
  assert.doesNotMatch(html, /\sdisabled/);
  f.suggestion.savedMemoryId = memory.id;
  sharedState.profile = { memories: [memory] };
  assert.match(chatMessageHtml(f.state.chatMessages[0]), /已加入偏好/);
});
