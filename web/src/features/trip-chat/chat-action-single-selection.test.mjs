import assert from 'node:assert/strict';
import test from 'node:test';
import { handleChatAction } from './chat-action-handler.js';
import { chatModeBannerHtml, selectedStopActionHtml } from './chat-panel.js';
import { state } from '../../app-core/state.js';

function createMockTrip() {
  return {
    days: [
      {
        day: 1,
        stops: [
          { id: 'stop-1', name: '磁器口古镇', district: '沙坪坝区', type: 'SCENIC' },
          { id: 'stop-2', name: '白公馆', district: '沙坪坝区', type: 'SCENIC' },
          { id: 'stop-3', name: '九宫格老火锅', district: '沙坪坝区', type: 'DINING', icon: '餐' }
        ]
      }
    ]
  };
}

test('only one attraction can be selected; selecting another automatically deselects previous one', async () => {
  state.trip = createMockTrip();
  state.view = 'planning';
  state.chatMode = 'planner';
  state.selectedStopId = null;
  if (!(state.selectedStopIds instanceof Set)) state.selectedStopIds = new Set();
  state.selectedStopIds.clear();

  const toasts = [];
  const mockContext = {
    state,
    toast: (msg) => toasts.push(msg),
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
  };

  // 1. 选中第一个景点：磁器口古镇
  await handleChatAction({
    ...mockContext,
    action: 'select-stop',
    target: { dataset: { id: 'stop-1', name: '磁器口古镇', day: '1' } }
  });

  assert.equal(state.selectedStopId, 'stop-1');
  assert.equal(state.selectedStopIds.size, 1);
  assert.equal(state.selectedStopIds.has('stop-1'), true);
  assert.match(toasts.at(-1), /已选中【磁器口古镇】/);

  const banner1 = chatModeBannerHtml();
  assert.match(banner1, /当前站点：磁器口古镇/);
  assert.doesNotMatch(banner1, /已选 \d+ 个/);

  const actions1 = selectedStopActionHtml();
  assert.match(actions1, /当前选择：<b>磁器口古镇<\/b>/);
  assert.match(actions1, /请推荐【磁器口古镇】的同片区可替换景点/);
  assert.doesNotMatch(actions1, /白公馆/);

  // 2. 选中第二个景点：白公馆 -> 之前的磁器口古镇必须自动取消选中！
  await handleChatAction({
    ...mockContext,
    action: 'select-stop',
    target: { dataset: { id: 'stop-2', name: '白公馆', day: '1' } }
  });

  assert.equal(state.selectedStopId, 'stop-2', '只能选中新点击的景点');
  assert.equal(state.selectedStopIds.size, 1, 'selectedStopIds 中必须只有 1 个景点');
  assert.equal(state.selectedStopIds.has('stop-1'), false, '之前选中的景点已被取消');
  assert.equal(state.selectedStopIds.has('stop-2'), true, '当前选中的景点为白公馆');
  assert.match(toasts.at(-1), /已选中【白公馆】/);

  const banner2 = chatModeBannerHtml();
  assert.match(banner2, /当前站点：白公馆/);
  assert.doesNotMatch(banner2, /磁器口古镇/);
  assert.doesNotMatch(banner2, /已选 \d+ 个/);

  const actions2 = selectedStopActionHtml();
  assert.match(actions2, /当前选择：<b>白公馆<\/b>/);
  assert.match(actions2, /请推荐【白公馆】的同片区可替换景点/);
  assert.doesNotMatch(actions2, /磁器口古镇/);

  // 3. 再次点击当前已选中的白公馆 -> 取消选中
  await handleChatAction({
    ...mockContext,
    action: 'select-stop',
    target: { dataset: { id: 'stop-2', name: '白公馆', day: '1' } }
  });

  assert.equal(state.selectedStopId, null, '再次点击应取消选中');
  assert.equal(state.selectedStopIds.size, 0, 'selectedStopIds 必须清空');
  assert.match(toasts.at(-1), /已取消选择【白公馆】/);
  assert.equal(selectedStopActionHtml(), '');

  // 4. 选中餐饮站点 -> 换餐模式
  await handleChatAction({
    ...mockContext,
    action: 'select-stop',
    target: { dataset: { id: 'stop-3', name: '九宫格老火锅', day: '1' } }
  });

  assert.equal(state.selectedStopId, 'stop-3');
  assert.equal(state.selectedStopIds.size, 1);
  assert.match(toasts.at(-1), /已选中【九宫格老火锅】/);
  const banner3 = chatModeBannerHtml();
  assert.match(banner3, /当前餐饮：九宫格老火锅/);

  // 5. 调用清除选择 action
  await handleChatAction({
    ...mockContext,
    action: 'clear-stop-selection',
    target: {}
  });

  assert.equal(state.selectedStopId, null);
  assert.equal(state.selectedStopIds.size, 0);
  assert.match(toasts.at(-1), /已清除景点选择/);
});
