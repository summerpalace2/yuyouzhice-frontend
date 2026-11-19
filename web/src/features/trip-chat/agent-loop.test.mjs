import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAgentConfirmDecision, readAgentStream } from './agent-service.js';
import { state, normalizeChatMode } from '../../app-core/state.js';
import { sendChatMessage } from './chat-service.js';
import { chatMessageHtml, chatModeTabsHtml, selectedStopActionHtml, floatingPlannerProposalDock } from './chat-panel.js';
import { stopCard } from '../../entities/trip/stop-card.js';
import { planView } from '../../pages/plan-page.js';
import { handleChatAction } from './chat-action-handler.js';
import { saveUserChats, loadUserChats } from '../../app-core/user-store.js';
import { beginTripMutation, finishTripMutation } from '../../entities/trip/trip-mutation.js';
import { renderMarkdownStatic } from '../../shared/lib/markdown.js';

function sseBody(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

function setupEnv(t, fetchImpl) {
  const oldFetch = globalThis.fetch;
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldState = { ...state };
  const storage = new Map();

  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null
  };
  globalThis.window = {
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v)
    },
    setTimeout: () => 1,
    clearTimeout() {}
  };
  Object.assign(state, {
    view: 'planning',
    user: { id: 'u-alice' },
    sessionId: 'ps-1',
    savedTripId: 'trip-1',
    sessionAccessToken: '',
    chatMode: 'chat',
    chatLoading: false,
    chatMessages: [],
    chatSessionId: 'chat-alice-1',
    trip: { version: 3, city: '重庆', days: [] },
    activeDay: 2,
    selectedStopId: 'stop-2',
    selectedStopIds: new Set(['stop-2']),
    pinnedStopIds: new Set(),
    activeProposal: null,
    csrfToken: 'csrf-tok'
  });

  globalThis.fetch = fetchImpl;
  t.after(() => {
    globalThis.fetch = oldFetch;
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    Object.assign(state, oldState);
  });
}

test('全智能体单一工作区始终维持 agent 模式且不渲染旧版聊天/调整切换按钮', async (t) => {
  setupEnv(t, async () => { assert.fail('切换模式不能发起网络请求'); });
  const notices = [];
  await handleChatAction({
    action: 'switch-agent-mode',
    target: { dataset: {} },
    state,
    toast: (...args) => notices.push(args),
    renderChatInDOM() {},
    saveUserPlan() {},
    persistTripWorkspace() {}
  });
  assert.equal(state.chatMode, 'agent');
  assert.equal(notices[0][1].title, '已启用全智能体模式');

  const guestTabs = chatModeTabsHtml('agent', false);
  assert.match(guestTabs, /switch-agent-mode/);
  assert.doesNotMatch(guestTabs, /switch-chat-mode/);
  assert.doesNotMatch(guestTabs, /switch-adjustment-mode/);
});

test('智能体模式流式接收推理步骤、工具回执、引用并渲染 HIL 确认卡片', async (t) => {
  const requests = [];
  setupEnv(t, async (path, opts) => {
    requests.push({ path, opts });
    return {
      ok: true,
      status: 200,
      body: sseBody([
        'event: agent_step\ndata: {"event":"agent_step","step":1,"phase":"reasoning","message":"正在核查天气与草稿"}\n\n',
        'event: tool_result\ndata: {"event":"tool_result","step":1,"toolName":"query_weather_forecast","message":"已查询重庆天气：小雨","data":{"ok":true}}\n\n',
        'event: citations\ndata: {"event":"citations","step":0,"data":{"citations":[{"title":"三峡博物馆开放公告"}]}}\n\n',
        'event: confirm_request\ndata: {"event":"confirm_request","step":2,"toolName":"confirm_apply_trip_adjustment","message":"将第2天南山一棵树替换为三峡博物馆","data":{"confirmId":"cfg_999","tool":"confirm_apply_trip_adjustment","args":{"proposalId":"prop-2","baseRevision":3}}}\n\n',
        'event: done\ndata: {"event":"done","step":0,"message":"complete"}\n\n'
      ])
    };
  });
  state.chatMode = 'agent';

  await sendChatMessage({ inputOverride: '明天下雨就把南山一棵树换成博物馆' });
  const agentRequests = requests.filter((r) => r.path === '/api/agent/stream');
  assert.equal(agentRequests.length, 1);
  const sentPayload = JSON.parse(agentRequests[0].opts.body);
  assert.equal(sentPayload.plannerSessionId, 'ps-1');
  assert.equal(sentPayload.baseRevision, 3);
  assert.equal(sentPayload.activeDay, 2);

  const assistantMsg = state.chatMessages.at(-1);
  assert.equal(assistantMsg.agentSteps.length, 1);
  assert.equal(assistantMsg.toolResults[0].toolName, 'query_weather_forecast');
  assert.equal(assistantMsg.citations[0].title, '三峡博物馆开放公告');
  assert.equal(assistantMsg.confirmRequest.confirmId, 'cfg_999');
  assert.equal(assistantMsg.confirmRequest.status, 'pending');

  const html = chatMessageHtml(assistantMsg, state.chatMessages.length - 1);
  assert.match(html, /agent-tool-pill is-ok/);
  assert.match(html, /三峡博物馆开放公告/);
  assert.match(html, /data-action="agent-confirm-approve"/);
  assert.match(html, /data-confirm-id="cfg_999"/);
});

test('HIL 确认执行更新行程与拒绝取消均带防重放与工作区隔离保护', async (t) => {
  const calls = [];
  setupEnv(t, async (path, opts) => {
    calls.push({ path, body: JSON.parse(opts.body) });
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          modified: true,
          tool: 'confirm_apply_trip_adjustment',
          message: '行程调整已应用至 v4',
          data: { applied: true, sessionId: 'ps-1', currentVersion: 4, trip: { version: 4, city: '重庆', days: [{ day: 1 }] } }
        })
      };
    }
    return {
      ok: true,
      json: async () => ({ ok: true, approved: false, cancelled: true, modified: false })
    };
  });

  state.chatMessages = [{
    role: 'assistant',
    content: '请确认变更',
    confirmRequest: { confirmId: 'cfg_1', toolName: 'confirm_apply_trip_adjustment', status: 'pending', loading: false }
  }, {
    role: 'assistant',
    content: '请确认取消',
    confirmRequest: { confirmId: 'cfg_2', toolName: 'confirm_update_user_preferences', status: 'pending', loading: false }
  }];

  const baseCtx = {
    state,
    toast() {},
    renderView() {},
    renderChatInDOM() {},
    saveUserChats() {},
    saveUserPlan() {},
    persistTripWorkspace() {},
    getTripChatKey: () => 'chat-alice-1',
    scheduleTripMap() {}
  };

  await handleChatAction({
    ...baseCtx,
    action: 'agent-confirm-approve',
    target: { dataset: { confirmId: 'cfg_1', messageIndex: '0' } }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.approved, true);
  assert.equal(state.trip.version, 4);
  assert.equal(state.chatMessages[0].confirmRequest.status, 'approved');

  // 已消费后再次点击不会重发请求
  await handleChatAction({
    ...baseCtx,
    action: 'agent-confirm-approve',
    target: { dataset: { confirmId: 'cfg_1', messageIndex: '0' } }
  });
  assert.equal(calls.length, 1);

  // 取消操作不改动行程
  await handleChatAction({
    ...baseCtx,
    action: 'agent-confirm-cancel',
    target: { dataset: { confirmId: 'cfg_2', messageIndex: '1' } }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.approved, false);
  assert.equal(state.chatMessages[1].confirmRequest.status, 'cancelled');
  assert.equal(state.trip.version, 4);
});

test('create_trip_plan 新建行程实时采纳与 pin/save HIL 确认同步及选中站点 Agent 快捷动作', async (t) => {
  let mapScheduled = 0;
  let renderedCount = 0;
  setupEnv(t, async (path) => {
    if (path === '/api/agent/stream') {
      return {
        ok: true,
        status: 200,
        body: sseBody([
          'event: tool_result\ndata: {"event":"tool_result","step":1,"toolName":"create_trip_plan","message":"已生成新行程草案（1 天，v1）","data":{"ok":true,"plannerSessionId":"ps-created-7","currentVersion":1,"createdTrip":{"title":"周末山城两日游","version":1,"city":"重庆","pinnedStopIds":[],"days":[{"day":1,"stops":[{"id":"stop-1","name":"洪崖洞"}]}]}}}\n\n',
          'event: message\ndata: {"event":"message","step":0,"message":"已为您生成重庆周末行程。","data":{}}\n\n',
          'event: done\ndata: {"event":"done","step":0,"message":"complete"}\n\n'
        ])
      };
    }
    if (path === '/api/agent/confirm') {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          modified: true,
          tool: 'confirm_save_formal_trip',
          message: '正式行程已保存',
          data: { saved: true, sessionId: 'ps-created-7', tripId: 'formal-888', currentVersion: 1 }
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  });

  state.view = 'home';
  state.trip = null;
  state.sessionId = null;
  state.savedTripId = null;
  state.chatMode = 'agent';

  await sendChatMessage({
    inputOverride: '帮我规划周末两天重庆游',
    renderView() { renderedCount++; },
    scheduleTripMap() { mapScheduled++; }
  });

  assert.equal(state.sessionId, 'ps-created-7');
  assert.equal(state.view, 'planning');
  assert.equal(state.trip.title, '周末山城两日游');
  assert.equal(state.chatLoading, false);
  const createdAssistant = state.chatMessages.at(-1);
  assert.equal(createdAssistant.pending, false);
  assert.equal(createdAssistant.content, '已为您生成重庆周末行程。');
  assert.ok(mapScheduled >= 1);
  assert.ok(renderedCount >= 1);

  // 验证 Agent 模式下选中站点渲染智能体专属快捷动作
  state.selectedStopId = 'stop-1';
  const quickHtml = selectedStopActionHtml();
  assert.match(quickHtml, /data-mode="agent"/);
  assert.match(quickHtml, /固定为必去站点/);

  // 验证保存正式行程 HIL 确认写入 state.savedTripId 并清 trips 缓存
  state.chatMessages.push({
    role: 'assistant',
    content: '确认保存吗？',
    confirmRequest: { confirmId: 'cfg_save_1', toolName: 'confirm_save_formal_trip', status: 'pending', loading: false }
  });
  const invalidated = [];
  await handleChatAction({
    action: 'agent-confirm-approve',
    target: { dataset: { confirmId: 'cfg_save_1', messageIndex: String(state.chatMessages.length - 1) } },
    state,
    toast() {},
    renderView() {},
    renderChatInDOM() {},
    saveUserChats() {},
    saveUserPlan() {},
    persistTripWorkspace() {},
    getTripChatKey: () => 'chat-alice-1',
    invalidatePageCache: (key) => invalidated.push(key),
    scheduleTripMap() {}
  });
  assert.equal(state.savedTripId, 'formal-888');
  assert.ok(invalidated.includes('trips'));
  assert.equal(normalizeChatMode(undefined), 'agent');

  // 验证全智能体工作区内联渲染、高德实景/弹性休闲卡片及旧 Proposal 浮窗退场
  state.view = 'planning';
  state.chatDockOpen = true;
  state.trip = {
    title: '全智能体自由游',
    subtitle: '轻松亲子',
    version: 1,
    planMode: 'AGENT_NATIVE',
    constraints: {},
    days: [{
      day: 1,
      dateLabel: '2026-11-17 · 第1天 · 亲子探索',
      agentNotes: '今日微雨建议优先室内与短接驳',
      stops: [
        { id: 's1', name: '洪崖洞', type: 'SCENIC', icon: '景', verifiedSource: 'AMAP_POI', openingHours: '全天开放', bookingPolicy: '免费免预约' },
        { id: 's2', name: '江边咖啡小憩', type: 'FREE_TIME', icon: '休', time: '15:30', duration: '约 45 分钟' }
      ]
    }]
  };
  const pageHtml = planView();
  assert.match(pageHtml, /全智能体自由编排/);
  assert.match(pageHtml, /planning-agent-rail/);
  assert.match(pageHtml, /✓ 高德实景/);
  assert.match(pageHtml, /🧘 弹性休闲/);
  assert.equal(floatingPlannerProposalDock(), '');
  assert.equal((pageHtml.match(/id="chat-input"/g) || []).length, 1);
  assert.doesNotMatch(pageHtml, /chat-dock-trigger/);
  assert.match(stopCard(state.trip.days[0].stops[0], 1, 1), /免费免预约/);
});

for (const reason of ['wrong-workspace', 'expired', 'old-preview']) {
  test(`confirmation rejects ${reason} before sending a write`, async t => {
    setupEnv(t, async () => assert.fail('must not send stale approval'));
    const card = { confirmId: 'c', status: 'pending', toolName: 'confirm_apply_trip_adjustment',
      plannerSessionId: reason === 'wrong-workspace' ? 'other' : state.sessionId,
      expiresAtMillis: reason === 'expired' ? Date.now() - 1 : Date.now() + 60000,
      args: { baseRevision: reason === 'old-preview' ? 2 : 3 } };
    state.chatMessages = [{ confirmRequest: card }];
    await executeAgentConfirmDecision({ confirmId: 'c', approved: true });
    assert.equal(card.status, 'expired');
    assert.equal(state.trip.version, 3);
  });
}

test('confirmation cannot overwrite a draft mutated in-place while waiting', async t => {
  setupEnv(t, async () => {});
  const card = { confirmId: 'c', status: 'pending' };
  state.chatMessages = [{ confirmRequest: card }];
  await executeAgentConfirmDecision({ confirmId: 'c', approved: true, request: async () => {
    state.trip.version = 5;
    return { ok: true, data: { applied: true, sessionId: 'ps-1', currentVersion: 4, trip: { version: 4 } } };
  } });
  assert.equal(state.trip.version, 5);
  assert.equal(card.status, 'expired');
});

test('SSE releases the reader when rendering a streamed event throws', async t => {
  let cancelled = false;
  const stream = new ReadableStream({ start(ctrl) {
    ctrl.enqueue(new TextEncoder().encode('event: message\ndata: {}\n\n'));
  }, cancel() { cancelled = true; } });
  setupEnv(t, async () => ({ ok: true, body: stream }));
  await assert.rejects(readAgentStream({}, () => { throw new Error('render failed'); }), /render failed/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test('confirmation card displays escaped authoritative old and new values', t => {
  setupEnv(t, async () => {});
  const html = chatMessageHtml({ role: 'assistant', content: '', confirmRequest: {
    confirmId: 'c', status: 'pending', args: { stopChanges: [{ action: 'UPDATED', stopName: '<script>x</script>',
      fields: { time: { before: '09:00', after: '11:00' } } }] }
  } });
  assert.match(html, /原安排<\/small>09:00[\s\S]*建议安排<\/small>11:00/);
  assert.doesNotMatch(html, /<script>x/);
});

test('lost approval response followed by cancel still displays the original approved receipt', async t => {
  setupEnv(t, async () => {});
  const card = { confirmId: 'c', status: 'pending' };
  state.chatMessages = [{ confirmRequest: card }];
  await executeAgentConfirmDecision({ confirmId: 'c', approved: false, request: async () => ({
    ok: true, approved: true, modified: true, data: { applied: true, sessionId: 'ps-1', currentVersion: 4, trip: { version: 4, days: [] } }
  }) });
  assert.equal(card.status, 'approved');
  assert.equal(state.trip.version, 4);
});


test('失败重发复用动作 ID 和完整请求快照，主动新发同一句话则产生新动作', async (t) => {
  const payloads = [];
  setupEnv(t, async (path, opts) => {
    if (path !== '/api/agent/stream') return { ok: true, json: async () => ({}) };
    payloads.push(JSON.parse(opts.body));
    if (payloads.length === 1) {
      const saved = loadUserChats('u-alice')[state.chatSessionId].at(-1);
      assert.deepEqual(saved.agentOperation.payload, payloads[0]);
      assert.equal(saved.pending, false);
      assert.ok(saved.error);
      throw new Error('connection lost');
    }
    return { ok: true, body: sseBody(['event: done\ndata: {}\n\n']) };
  });
  state.chatMode = 'agent';
  await sendChatMessage({ inputOverride: '创建重庆一日游' });
  const failed = state.chatMessages.at(-1);
  assert.ok(failed.error);
  assert.match(payloads[0].operationId, /^[A-Za-z0-9_-]{1,128}$/);
  assert.match(chatMessageHtml(failed, 1), /data-message-index="1"/);
  state.activeDay = 7; // 选中的天数变化不应偷偷重写重试请求。
  await handleChatAction({ action: 'retry-chat', target: { dataset: { messageIndex: '1', prompt: '创建重庆一日游' }, classList: { add() {}, remove() {} } }, state, sendChatMessage });
  // 若动作名未匹配，明确失败，防止仅测试内部帮助函数。
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[1], payloads[0]);
  await sendChatMessage({ inputOverride: '创建重庆一日游' });
  assert.equal(payloads.length, 3);
  assert.notEqual(payloads[2].operationId, payloads[0].operationId);
});

test('行程版本变化后拒绝旧动作重试，不发送新请求也不追加消息', async (t) => {
  let calls = 0;
  setupEnv(t, async () => { calls++; throw new Error('offline'); });
  state.chatMode = 'agent';
  await sendChatMessage({ inputOverride: '换成博物馆' });
  const operation = state.chatMessages.at(-1).agentOperation;
  const beforeCalls = calls, beforeMessages = state.chatMessages.length;
  state.trip.version++;
  await sendChatMessage({ inputOverride: '换成博物馆', retryOperation: operation });
  assert.equal(calls, beforeCalls);
  assert.equal(state.chatMessages.length, beforeMessages);
});

test('同一网络块 done 后的事件不会再执行', async (t) => {
  setupEnv(t, async () => ({ ok: true, body: sseBody([
    'event: done\ndata: {}\n\nevent: tool_result\ndata: {"danger":"late"}\n\n'
  ]) }));
  const seen = [];
  await readAgentStream({}, name => seen.push(name));
  assert.deepEqual(seen, ['done']);
});

function pendingConfirmation() {
  const card = { confirmId: 'cfg-scope', toolName: 'confirm_apply_trip_adjustment', status: 'pending',
    loading: false, plannerSessionId: state.sessionId, memorySessionId: 'original-chat', args: { baseRevision: 3 } };
  state.chatMessages = [{ role: 'assistant', content: '确认', confirmRequest: card }];
  return card;
}

for (const authorizedAlias of [false, true]) {
  test(`确认回执跨 Java 会话时${authorizedAlias ? '仅接受 BFF 授权映射' : '拒绝覆盖当前行程'}`, async (t) => {
    setupEnv(t, async () => { throw new Error('use injected request'); });
    const card = pendingConfirmation();
    let body;
    await executeAgentConfirmDecision({ confirmId: card.confirmId, approved: true, messageIndex: 0,
      memorySessionId: 'wrong-new-chat', request: async (_, opts) => {
        body = JSON.parse(opts.body);
        return { ok: true, modified: true, ...(authorizedAlias ? { workspaceSessionId: 'ps-1' } : {}),
          data: { applied: true, sessionId: 'java-other', currentVersion: 4, trip: { version: 4, days: [] } } };
      }
    });
    assert.equal(body.sessionId, 'original-chat');
    assert.equal(state.trip.version, authorizedAlias ? 4 : 3);
    assert.equal(card.status, authorizedAlias ? 'approved' : 'pending');
    assert.equal(card.loading, false);
    assert.equal(state.tripMutationTicket, null);
    if (!authorizedAlias) assert.match(card.error, /不属于当前行程/);
  });
}

test('确认执行与直接编辑共享写锁，忙时不提交确认请求', async (t) => {
  setupEnv(t, async () => { assert.fail('cannot submit while direct mutation owns lock'); });
  const card = pendingConfirmation();
  const ticket = beginTripMutation('direct');
  assert.ok(ticket);
  try {
    await executeAgentConfirmDecision({ confirmId: card.confirmId, approved: true, messageIndex: 0 });
    assert.equal(state.tripMutationTicket, ticket);
    assert.equal(card.loading, false);
    assert.equal(card.status, 'pending');
  } finally { finishTripMutation(ticket); }
});

test('切换工作区后旧确认返回会释放旧卡状态，但不会覆盖新行程或清除新锁', async (t) => {
  setupEnv(t, async () => { throw new Error('use injected request'); });
  const card = pendingConfirmation();
  let resolve;
  const waiting = new Promise(r => { resolve = r; });
  const work = executeAgentConfirmDecision({ confirmId: card.confirmId, approved: true, messageIndex: 0, request: () => waiting });
  assert.equal(card.loading, true);
  state.sessionId = 'ps-new'; state.savedTripId = 'trip-new'; state.trip = { version: 10, days: [] };
  state.chatMessages = [];
  const newTicket = beginTripMutation('direct');
  state.loading = true;
  resolve({ ok: true, data: { applied: true, sessionId: 'ps-1', currentVersion: 4, trip: { version: 4 } } });
  await work;
  assert.equal(card.loading, false);
  assert.equal(card.status, 'pending');
  assert.equal(state.trip.version, 10);
  assert.equal(state.tripMutationTicket, newTicket);
  assert.equal(state.loading, true);
  finishTripMutation(newTicket);
});

test('旧流的 finally 不会清除另一个工作区的聊天 loading', async (t) => {
  let resolve;
  setupEnv(t, () => new Promise(r => { resolve = r; }));
  state.chatMode = 'agent';
  const work = sendChatMessage({ inputOverride: '介绍下附近景点' });
  const oldAssistant = state.chatMessages.at(-1);
  state.sessionId = 'ps-new'; state.savedTripId = 'trip-new';
  state.chatMessages = [{ role: 'assistant', content: '', pending: true }];
  state.chatLoading = true;
  resolve({ ok: true, body: sseBody(['event: message\ndata: {"message":"旧回复"}\n\nevent: done\ndata: {}\n\n']) });
  await work;
  assert.equal(state.chatLoading, true);
  assert.equal(state.chatMessages[0].content, '');
  assert.equal(oldAssistant.pending, false);
});

test('恢复聊天记录清除瞬时执行状态，保留原确认单和重试身份，不改变实时消息对象', t => {
  setupEnv(t, async () => {});
  const live = { role: 'assistant', pending: true, content: '等待确认',
    confirmRequest: { confirmId: 'cfg-recover', loading: true, status: 'pending' },
    agentOperation: { operationId: 'action-recover', payload: { message: '修改' } } };
  saveUserChats('u-alice', { history: [live] });
  const restored = loadUserChats('u-alice').history[0];
  assert.equal(restored.pending, false);
  assert.equal(restored.confirmRequest.loading, false);
  assert.equal(restored.confirmRequest.confirmId, 'cfg-recover');
  assert.equal(restored.confirmRequest.status, 'pending');
  assert.deepEqual(restored.agentOperation, live.agentOperation);
  assert.equal(live.pending, true);
  assert.equal(live.confirmRequest.loading, true);
});


test('新建草稿回执的版本不一致时保留旧工作区', async t => {
  setupEnv(t, async () => ({ ok: true, body: sseBody([
    'event: tool_result\ndata: {"toolName":"create_trip_plan","data":{"ok":true,"plannerSessionId":"new-draft","currentVersion":2,"createdTrip":{"version":1,"days":[]}}}\n\nevent: done\ndata: {}\n\n'
  ]) }));
  state.chatMode = 'agent';
  const trip = state.trip;
  await sendChatMessage({ inputOverride: '重新创建行程' });
  assert.equal(state.trip, trip);
  assert.equal(state.sessionId, 'ps-1');
  assert.match(state.chatMessages.at(-1).error, /版本不一致/);
  assert.equal(state.chatLoading, false);
});


test('确认执行入口拒绝字符串布尔值，防止 false 文本被强制转换成批准', async t => {
  setupEnv(t, async () => { assert.fail('非法批准类型不能发起请求'); });
  const card = pendingConfirmation();
  const result = await executeAgentConfirmDecision({ confirmId: card.confirmId, approved: 'false', messageIndex: 0 });
  assert.equal(result, false);
  assert.equal(card.status, 'pending');
  assert.equal(card.loading, false);
});

test('并发双击确认按钮只发送一次 /api/agent/confirm 请求', async t => {
  let hits = 0;
  let release;
  setupEnv(t, async () => { assert.fail('use injected request'); });
  const card = pendingConfirmation();
  const req = () => {
    hits += 1;
    return new Promise((resolve) => {
      release = () => resolve({ ok: true, approved: true, modified: true, data: { applied: true, sessionId: 'ps-1', currentVersion: 4, trip: { version: 4, days: [] } } });
    });
  };
  const first = executeAgentConfirmDecision({ confirmId: card.confirmId, approved: true, messageIndex: 0, request: req });
  const second = executeAgentConfirmDecision({ confirmId: card.confirmId, approved: true, messageIndex: 0, request: req });
  release();
  await Promise.all([first, second]);
  assert.equal(hits, 1);
  assert.equal(card.status, 'approved');
});

test('Markdown 渲染自动清理未配对的粗体星号但保留代码块内容', () => {
  const html = renderMarkdownStatic('### **Day 1 调整建议\n- **湖广会馆：替代十八梯**\n- 正常**加粗**示例\n`const pow = "a**b";`');
  assert.doesNotMatch(html, /\*\*Day/);
  assert.doesNotMatch(html, /\*\*湖广会馆/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<code class="inline-code">const pow = &quot;a\*\*b&quot;;<\/code>/);
});

test('景点类检索胶囊展示「景点候选检索」而非「POI/餐饮检索」', (t) => {
  setupEnv(t, async () => {});
  const html = chatMessageHtml({
    role: 'assistant',
    content: '已为您找到替代景点。',
    toolResults: [
      { step: 1, toolName: 'search_poi_and_dining', toolLabel: '景点候选检索', category: 'SCENIC', ok: true, summary: '检索到 5 条重庆景点候选' }
    ]
  }, 0);
  assert.match(html, /景点候选检索/);
  assert.doesNotMatch(html, /POI\/餐饮检索/);
});

test('流式事件中断（已收到步骤但未收到 done）自动重试一次并完成', async (t) => {
  let streamCalls = 0;
  setupEnv(t, async (path) => {
    if (path !== '/api/agent/stream') return { ok: true, json: async () => ({}) };
    streamCalls += 1;
    if (streamCalls === 1) {
      return {
        ok: true,
        status: 200,
        body: sseBody([
          'event: agent_step\ndata: {"event":"agent_step","step":1,"phase":"reasoning","message":"正在检索景点"}\n\n'
        ])
      };
    }
    return {
      ok: true,
      status: 200,
      body: sseBody([
        'event: message\ndata: {"event":"message","step":0,"message":"自动重试后已为您补充推荐。"}\n\n',
        'event: done\ndata: {"event":"done","step":0,"message":"complete"}\n\n'
      ])
    };
  });
  state.chatMode = 'agent';
  await sendChatMessage({ inputOverride: '把十八梯换成其他景点' });
  const last = state.chatMessages.at(-1);
  assert.equal(streamCalls, 2);
  assert.ok(!last.error);
  assert.match(last.content, /自动重试后已为您补充推荐/);
});
