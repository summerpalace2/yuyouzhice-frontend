import assert from 'node:assert/strict';
import test from 'node:test';
import { deduplicateSuggestions, ensurePreferenceSuggestion } from './chat-service.js';
import { handleChatAction } from './chat-action-handler.js';
import { chatMessageHtml } from './chat-panel.js';
import { state } from '../../app-core/state.js';

test('deduplicateSuggestions strictly enforces unique actions, normalized labels, and max 3 count', () => {
  const inputChips = [
    { action: 'add_stop', label: '沿途加一站甜点/糖水小憩', payload: '在当前行程加入一处甜点或特色糖水小憩停留' },
    { action: 'add_stop', label: '加一站甜品(20分钟)', payload: '加一站甜品' },
    { action: 'save_memory', label: '沉淀偏好：喜爱甜点/特色糖水', payload: '喜爱甜点/特色糖水' },
    { action: 'replace_stop', label: '将磁器口换为甜品街', payload: '换为甜品街' },
    { action: 'another_action', label: '多余卡片', payload: '多余卡片' }
  ];

  const result = deduplicateSuggestions(inputChips);

  // 1. 同 action 类型的重复项被剔除
  assert.equal(result.filter(c => c.action === 'add_stop').length, 1);
  assert.equal(result[0].label, '沿途加一站甜点/糖水小憩');

  // 2. 总数不超过 3
  assert.ok(result.length <= 3, `Expected at most 3 chips, got ${result.length}`);
  assert.equal(result.length, 3);
  assert.equal(result[1].action, 'save_memory');
  assert.equal(result[2].action, 'replace_stop');
});

test('deduplicateSuggestions strips parenthesized text when checking label duplication', () => {
  const inputChips = [
    { action: 'action_1', label: '糖水小憩(推荐)' },
    { action: 'action_2', label: '糖水小憩（30分钟）' }
  ];
  const result = deduplicateSuggestions(inputChips);
  assert.equal(result.length, 1, 'Near-duplicate labels with parentheses should be deduplicated');
});

test('handleChatAction execute-action-chip marks model as applied and debounces double-click', async () => {
  state.view = 'planning';
  state.chatMode = 'chat';
  state.trip = { id: 'trip-1', days: [] };
  state.chatLoading = false;
  state.chatMessages = [
    {
      role: 'assistant',
      content: '建议吃甜食',
      pending: false,
      actionableSuggestions: [
        { action: 'add_stop', label: '沿途加一站甜点/糖水小憩', payload: '在当前行程加入一处甜点或特色糖水小憩停留' }
      ]
    }
  ];

  let sendChatMessageCallCount = 0;
  let lastPrompt = '';
  const mockContext = {
    state,
    toast: () => {},
    renderView: () => {},
    renderFloatingBtn: () => {},
    renderChatInDOM: () => {},
    renderPlannerProposalDockInDOM: () => {},
    saveUserPlan: () => {},
    saveUserChats: () => {},
    persistTripWorkspace: () => {},
    getTripChatKey: () => 'chat-key',
    sendChatMessage: async ({ inputOverride }) => {
      sendChatMessageCallCount++;
      lastPrompt = inputOverride;
      state.chatMessages.push({ role: 'user', content: inputOverride }, { role: 'assistant', content: '调整预览已生成', pending: false });
    },
    cancelChatMessage: () => {},
    applyPlannerProposal: async () => {},
    planFromCurrent: async () => {}
  };

  const fakeButton = {
    dataset: {
      chipAction: 'add_stop',
      chipPayload: '在当前行程加入一处甜点或特色糖水小憩停留',
      chipLabel: '沿途加一站甜点/糖水小憩'
    },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    disabled: false,
    innerHTML: '',
    closest() { return this; }
  };

  // 第一次点击
  await handleChatAction({
    ...mockContext,
    action: 'execute-action-chip',
    target: fakeButton
  });

  assert.equal(sendChatMessageCallCount, 1, 'sendChatMessage should be called once');
  assert.equal(lastPrompt, '在当前行程加入一处甜点或特色糖水小憩停留');
  assert.equal(fakeButton.disabled, true, 'Button should be disabled immediately');
  assert.equal(fakeButton.classList.contains('is-applied'), true, 'Button should have is-applied class');
  assert.equal(state.chatMode, 'planner', 'Mode should switch to planner for itinerary addition');
  assert.equal(state.chatMessages[0].actionableSuggestions[0].applied, true, 'Suggestion in state.chatMessages must be marked applied');

  // 第二次点击（防抖防重）
  await handleChatAction({
    ...mockContext,
    action: 'execute-action-chip',
    target: fakeButton
  });

  assert.equal(sendChatMessageCallCount, 1, 'Double click must not trigger sendChatMessage again');
});

test('调整卡片重绘期间防重复提交，失败后恢复并允许重试', async () => {
  state.user = null;
  state.view = 'planning';
  state.chatMode = 'planner';
  state.trip = { version: 1, days: [] };
  state.chatLoading = false;
  const suggestion = { action: 'add_stop', label: '沿途加一站', payload: '加入某景点' };
  state.chatMessages = [{ role: 'assistant', content: '建议加站', actionableSuggestions: [suggestion] }];
  const makeButton = () => ({
    dataset: { chipAction: suggestion.action, chipLabel: suggestion.label, chipPayload: suggestion.payload },
    disabled: false, innerHTML: '', closest() { return this; },
    classList: {
      values: new Set(), add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); }, contains(value) { return this.values.has(value); }
    }
  });
  let finishFirst;
  let calls = 0;
  const context = {
    action: 'execute-action-chip', state, toast() {}, renderChatInDOM() {},
    saveUserPlan() {}, persistTripWorkspace() {}, cancelChatMessage() {},
    sendChatMessage: async () => {
      calls++;
      if (calls === 1) await new Promise(resolve => { finishFirst = resolve; });
      state.chatMessages.push({ role: 'user', content: suggestion.payload }, calls === 1
        ? { role: 'assistant', error: '网络错误', content: '提交失败', pending: false }
        : { role: 'assistant', content: '预览已生成', pending: false });
    }
  };
  const firstButton = makeButton();
  const first = handleChatAction({ ...context, target: firstButton });
  assert.equal(suggestion.sending, true);
  assert.match(chatMessageHtml(state.chatMessages[0]), /正在提交调整/);
  assert.match(chatMessageHtml(state.chatMessages[0]), /disabled/);
  await handleChatAction({ ...context, target: makeButton() });
  assert.equal(calls, 1, '重绘后的同一卡片不得再次发起请求');
  finishFirst();
  await first;
  assert.equal(suggestion.sending, undefined);
  assert.equal(suggestion.applied, false);
  assert.equal(firstButton.disabled, false);
  assert.doesNotMatch(chatMessageHtml(state.chatMessages[0]), /已发起调整/);
  await handleChatAction({ ...context, target: makeButton() });
  assert.equal(calls, 2);
  assert.equal(suggestion.applied, true);
  assert.match(chatMessageHtml(state.chatMessages[0]), /已发起调整/);
});

test('兜底偏好卡片尊重清淡与否定语义', () => {
  const tag = trait => ensurePreferenceSuggestion([], { trait })[0]?.payload;
  assert.equal(JSON.parse(tag('清淡少辣')).tag, '清淡少辣');
  assert.equal(tag('不吃辣'), undefined);
  assert.equal(tag('不喜欢甜食'), undefined);
  assert.equal(tag('对辣椒过敏'), undefined);
  assert.equal(JSON.parse(tag('偏好甜品糖水')).tag, '甜品糖水');
  assert.equal(JSON.parse(tag('饮食偏好麻辣浓郁与地道火锅')).tag, '老火锅');
});

test('handleChatAction execute-action-chip save_memory immediately saves to profile and clears candidate', async () => {
  state.user = null; // Guest mode
  state.profile = { memories: [] };
  state.memoryCandidate = { content: '偏好老茶馆与慢生活品茗' };
  state.chatMessages = [
    {
      role: 'assistant',
      content: '建议喝茶',
      pending: false,
      actionableSuggestions: [
        { action: 'save_memory', label: '沉淀偏好：偏好特色老茶馆与品茗', payload: '偏好特色老茶馆与品茗' }
      ]
    }
  ];

  const fakeMemoryButton = {
    dataset: {
      chipAction: 'save_memory',
      chipPayload: '偏好特色老茶馆与品茗',
      chipLabel: '沉淀偏好：偏好特色老茶馆与品茗'
    },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    disabled: false,
    innerHTML: '',
    closest() { return this; }
  };

  let renderedChat = false;
  await handleChatAction({
    action: 'execute-action-chip',
    target: fakeMemoryButton,
    state,
    toast: () => {},
    renderView: () => {},
    renderFloatingBtn: () => {},
    renderChatInDOM: () => { renderedChat = true; },
    renderPlannerProposalDockInDOM: () => {},
    saveUserPlan: () => {},
    saveUserChats: () => {},
    persistTripWorkspace: () => {},
    getTripChatKey: () => 'chat-key',
    sendChatMessage: async () => {},
    cancelChatMessage: () => {},
    applyPlannerProposal: async () => {},
    planFromCurrent: async () => {}
  });

  assert.equal(state.profile.memories.length, 1, 'Memory must be immediately populated in state.profile.memories');
  assert.equal(state.profile.memories[0].content, '偏好特色老茶馆与品茗');
  assert.equal(state.memoryCandidate, null, 'Conflicting memoryCandidate must be dismissed upon saving memory');
  assert.equal(fakeMemoryButton.classList.contains('is-applied'), true, 'Chip should be marked is-applied');
  assert.equal(renderedChat, true, 'Chat must be re-rendered to update UI');
});

test('handleChatAction execute-action-chip save_slot_preference saves slot tag and updates profile', async () => {
  state.user = null;
  state.profile = { diningSlots: [], attractionSlots: [] };
  state.chatMessages = [
    {
      role: 'assistant',
      content: '重庆烧烤推荐',
      pending: false,
      actionableSuggestions: [
        { action: 'save_slot_preference', label: '将【烧烤】加入美食偏好', payload: JSON.stringify({ slot: 'dining', tag: '烧烤' }) }
      ]
    }
  ];

  const fakeChipButton = {
    dataset: {
      chipAction: 'save_slot_preference',
      chipPayload: JSON.stringify({ slot: 'dining', tag: '烧烤' }),
      chipLabel: '将【烧烤】加入美食偏好'
    },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    disabled: false,
    innerHTML: '',
    closest() { return this; }
  };

  let renderedChat = false;
  await handleChatAction({
    action: 'execute-action-chip',
    target: fakeChipButton,
    state,
    toast: () => {},
    renderView: () => {},
    renderFloatingBtn: () => {},
    renderChatInDOM: () => { renderedChat = true; },
    renderPlannerProposalDockInDOM: () => {},
    saveUserPlan: () => {},
    saveUserChats: () => {},
    persistTripWorkspace: () => {},
    getTripChatKey: () => 'chat-key',
    sendChatMessage: async () => {},
    cancelChatMessage: () => {},
    applyPlannerProposal: async () => {},
    planFromCurrent: async () => {}
  });

  assert.equal(state.profile.diningSlots.includes('烧烤'), true, 'Dining slot 烧烤 should be added to profile');
  assert.equal(fakeChipButton.classList.contains('is-applied'), true, 'Chip should be marked is-applied');
  assert.equal(renderedChat, true, 'Chat must be re-rendered to update UI');
});

test('ensurePreferenceSuggestion automatically synthesizes preference save chip when missing', () => {
  const chipsOnlyAdjustments = [
    { action: 'replace_meal', icon: '🌶️', label: '把午餐火锅调整为中辣红汤+鸳鸯锅', payload: '替换为红汤火锅' },
    { action: 'add_stop', icon: '🍧', label: '午餐后顺路加一站解辣糖水小憩', payload: '加一站糖水' }
  ];

  const result = ensurePreferenceSuggestion(chipsOnlyAdjustments);

  // 必须自动补齐偏好沉淀卡片
  const hasPrefChip = result.some(c => c.action === 'save_slot_preference' || c.action === 'save_memory');
  assert.equal(hasPrefChip, true, 'Must automatically inject preference save chip');
  const spicyPref = result.find(c => c.action === 'save_slot_preference');
  assert.ok(spicyPref, 'Should inject save_slot_preference');
  assert.equal(spicyPref.label.includes('老火锅'), true);
  assert.ok(result.length <= 3, 'Total chips must not exceed 3');
});

test('handleChatAction execute-action-chip correctly handles bracket extraction for attraction slot', async () => {
  state.profile = { diningSlots: [], attractionSlots: [] };
  state.user = null;

  const fakeChipButton = {
    dataset: {
      chipAction: 'save_slot_preference',
      chipLabel: '将【人文历史】加入景点偏好',
      chipPayload: '巴渝人文古迹历史' // 非 JSON payload
    },
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    disabled: false,
    innerHTML: '',
    closest() { return this; }
  };

  await handleChatAction({
    action: 'execute-action-chip',
    target: fakeChipButton,
    state,
    toast: () => {},
    renderView: () => {},
    renderFloatingBtn: () => {},
    renderChatInDOM: () => {},
    renderPlannerProposalDockInDOM: () => {},
    saveUserPlan: () => {},
    saveUserChats: () => {},
    persistTripWorkspace: () => {},
    getTripChatKey: () => 'chat-key',
    sendChatMessage: async () => {},
    cancelChatMessage: () => {},
    applyPlannerProposal: async () => {},
    planFromCurrent: async () => {}
  });

  assert.equal(state.profile.attractionSlots.includes('人文历史'), true, 'Attraction slot 人文历史 should be extracted and added to attractionSlots');
  assert.equal(state.profile.diningSlots.includes('人文历史'), false, 'Attraction slot must NOT be added to diningSlots');
  assert.equal(fakeChipButton.classList.contains('is-applied'), true);
});
