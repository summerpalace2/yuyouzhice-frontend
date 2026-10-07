import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../../app-core/state.js';
import { sendChatMessage, applyPlannerProposal } from './chat-service.js';
import { chatMessageHtml, plannerProposalHtml } from './chat-panel.js';

function setup(t, respond) {
  const oldFetch = globalThis.fetch, oldDocument = globalThis.document, oldWindow = globalThis.window;
  const oldState = { ...state };
  const storage = new Map();
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
  globalThis.window = { localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) }, setTimeout: () => 1, clearTimeout() {} };
  Object.assign(state, { view: 'planning', user: null, sessionId: 'test-session', savedTripId: null, sessionAccessToken: 'fixture',
    chatMode: 'planner', chatLoading: false, chatMessages: [], chatSessionId: 'fixture-chat', trip: { version: 1, days: [] },
    activeDay: 1, selectedStopId: null, selectedStopIds: new Set(), pinnedStopIds: new Set(), activeProposal: null,
    legacyMode: false, adjustmentCapability: 'V1_PROPOSAL', plannerProposalDockOpen: false });
  const requests = [];
  globalThis.fetch = async (path, opts) => { requests.push(path); return { ok: true, json: async () => respond(path, opts) }; };
  t.after(() => { globalThis.fetch = oldFetch; globalThis.document = oldDocument; globalThis.window = oldWindow; Object.assign(state, oldState); });
  return requests;
}

test('调整模式无法识别时只澄清，不掉入聊天流重新规划', async t => {
  const paths = setup(t, () => ({ type: 'UNKNOWN', requiresClarification: true, clarificationQuestion: '请指定所选方案的地点。' }));
  await sendChatMessage({ inputOverride: '方案A选这个，帮我局部调整行程' });
  assert.deepEqual(paths, ['/api/planner/conversation']);
  assert.equal(state.chatMessages.at(-1).content, '请指定所选方案的地点。');
  assert.equal(state.chatLoading, false);
  assert.equal(state.activeProposal, null);
});

test('同一请求复用当前版本待确认预览，应用成功留下明确回执', async t => {
  const proposal = { proposalId: 'p1', baseRevision: 1, expiresAt: Date.now() + 60000, canApply: true, feasible: true, message: '已生成预览。' };
  const paths = setup(t, path => path.endsWith('/apply') ? { applied: true, currentVersion: 2, trip: { version: 2, days: [] } } : proposal);
  await sendChatMessage({ inputOverride: '将傍晚和晚间行程优化为最佳夜景观景点' });
  await sendChatMessage({ inputOverride: '将傍晚和晚间行程优化为最佳夜景观景点' });
  assert.deepEqual(paths, ['/api/planner/conversation']);
  assert.match(state.chatMessages.at(-1).content, /已有待确认预览/);
  assert.equal(state.trip.version, 1);
  await applyPlannerProposal();
  assert.deepEqual(paths, ['/api/planner/conversation', '/api/planner/adjust/apply']);
  assert.equal(state.trip.version, 2); assert.equal(state.activeProposal, null);
  assert.match(state.chatMessages.at(-1).content, /调整已应用.*第 2 版/);
});

test('行程版本变化后重新生成，不复用旧方案', async t => {
  const paths = setup(t, () => ({ proposalId: 'new', baseRevision: 2, expiresAt: Date.now() + 60000 }));
  Object.assign(state, { trip: { version: 2 }, activeProposal: { proposalId: 'old', baseRevision: 1, requestMessage: '优化夜间路线', requestDay: 1, requestStopId: null, expiresAt: Date.now() + 60000 } });
  await sendChatMessage({ inputOverride: '优化夜间路线' });
  assert.deepEqual(paths, ['/api/planner/conversation']); assert.equal(state.activeProposal.proposalId, 'new');
});

test('普通文章里的方案字母不能产生丢失内容的调整按钮，结构化快捷操作保留完整内容', () => {
  const text = '方案A｜最省力：两江游游船\n码头信息待核验\n方案B｜不坐船：观景广场';
  assert.doesNotMatch(chatMessageHtml({ role: 'assistant', content: text }), /data-prompt=.*方案A选这个/);
  assert.doesNotMatch(chatMessageHtml({ role: 'assistant', content: text }), /采用方案A，查看局部调整/);
  const html = chatMessageHtml({ role: 'assistant', content: text, actionableSuggestions: [{ action: 'adjust_plan', label: '优化夜间路线', payload: '将傍晚和晚间行程优化为夜景路线', icon: '🧭' }] });
  assert.match(html, /data-chip-payload="将傍晚和晚间行程优化为夜景路线"/);
});

test('预览呈现实际前后差异，空改动不允许确认应用', () => {
  const html = plannerProposalHtml({ feasible: true, stopChanges: [{ before: { name: '原站点', time: '20:00' }, after: { name: '夜景站点', time: '20:00' } }] });
  assert.match(html, /原站点 20:00 → 夜景站点 20:00/);
  const empty = plannerProposalHtml({ canApply: false, reasonCodes: ['NO_ACTUAL_CHANGE'], message: '没有产生实际改动' });
  assert.match(empty, /没有产生实际改动/); assert.doesNotMatch(empty, /confirm-planner-proposal|force-apply-planner-proposal/);
});
