import assert from 'node:assert/strict';
import test from 'node:test';
import { deduplicateSuggestions } from './chat-service.js';
import { handleChatAction } from './chat-action-handler.js';
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

