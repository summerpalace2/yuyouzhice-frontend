import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerProposalHtml } from './chat-panel.js';
import { proposalUnavailable } from './proposal-availability.js';
import { handleChatAction } from './chat-action-handler.js';

test('无候选显示真实失败原因，不能呈现强制应用或路线警告', () => {
  const proposal = { proposalId: 'empty', feasible: false, reasonCodes: ['DINING_CANDIDATES_UNAVAILABLE'], message: '未找到可用候选，请指定一家餐厅。' };
  const html = plannerProposalHtml(proposal);
  assert.match(html, /未找到可用候选/);
  assert.doesNotMatch(html, /force-apply-planner-proposal|confirm-planner-proposal|顺路度较低|仍按/);
  assert.equal(proposalUnavailable(proposal), true);
  const routeWarning = { feasible: false, reasonCodes: ['LONG_TRANSFER'], candidateReplacements: [{ name: '实际候选' }] };
  assert.equal(proposalUnavailable(routeWarning), false);
  assert.match(plannerProposalHtml(routeWarning), /force-apply-planner-proposal/);
});

test('旧对话快捷操作按当前行程重新发起，同时更新模式按钮和醒目通知', async () => {
  const classes = new Set();
  const button = { dataset: { chipAction: 'adjust_plan', chipPayload: '加入甜品停留', chipLabel: '加入甜品' },
    closest() { return this; }, classList: { contains: x => classes.has(x), add: x => classes.add(x) } };
  const notices = [];
  let rendered = 0, sent = '';
  const state = { user: { id: 'fixture' }, view: 'planning', trip: { version: 6 }, chatMode: 'chat', chatMessages: [] };
  await handleChatAction({ action: 'execute-action-chip', target: button, state,
    saveUserPlan() {}, persistTripWorkspace() {}, renderChatInDOM() { rendered++; },
    toast: (...args) => notices.push(args), sendChatMessage: async args => { sent = args.inputOverride; } });
  assert.equal(state.chatMode, 'planner');
  assert.ok(rendered > 0);
  assert.equal(sent, '加入甜品停留');
  assert.equal(notices[0][1].title, '已切换至调整模式');
});
