import test from 'node:test';
import assert from 'node:assert/strict';
import { state, normalizeChatMode } from '../../app-core/state.js';
import { sendChatMessage } from './chat-service.js';
import { chatMessageHtml, chatModeTabsHtml, selectedStopActionHtml } from './chat-panel.js';
import { handleChatAction } from './chat-action-handler.js';

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

test('切换至智能体模式仅更新模式状态并支持游客态显示', async (t) => {
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
  assert.equal(notices[0][1].title, '已切换至智能体模式');

  const guestTabs = chatModeTabsHtml('agent', false);
  assert.match(guestTabs, /switch-chat-mode/);
  assert.match(guestTabs, /switch-agent-mode/);
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
          data: { applied: true, currentVersion: 4, trip: { version: 4, city: '重庆', days: [{ day: 1 }] } }
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
          data: { saved: true, tripId: 'formal-888', currentVersion: 1 }
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
});
