import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../../app-core/state.js';
import { invalidateAuthentication } from '../../app-core/workspace-lifecycle.js';
import { handleNavigationAction } from '../../app-core/navigation-handler.js';
import {
  getTripChatKey, loadChatWorkspaceMeta, loadUserChats, loadUserPlan,
  saveChatWorkspaceMeta, saveUserChats, saveUserPlan
} from '../../app-core/user-store.js';
import { detachChatWorkspace } from '../trip-chat/chat-service.js';
import { persistTripWorkspace } from '../trip-workspace/workspace-service.js';
import { openDetail } from '../../pages/detail-page.js';
import { openSavedTrip } from './save-service.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  invalidateAuthentication();
  const storage = new Map();
  const previousTrip = {
    prompt: '原来的草稿', version: 2,
    days: [{ day: 1, stops: [{ id: 'kept-stop', name: '保留的站点' }] }]
  };
  Object.assign(state, {
    user: { id: 'owner' }, csrfToken: null,
    view: 'trips', trip: previousTrip, sessionId: 'previous-session', savedTripId: 'previous-trip',
    prompt: '原来的草稿', chatSessionId: 'plan-previous-session', chatMessages: [],
    tripChatHistories: {}, itineraryMemorySnapshot: null, sessionAccessToken: null,
    adjustmentCapability: null, activeProposal: null, plannerProposalDockOpen: false,
    selectedOptionId: 'option-1', selectedStopId: null, selectedStopIds: new Set(),
    suggestionDismissed: false, draftBackupAvailable: false, draftBackup: null,
    draftBackupFailed: false, draftBackupFailedTripId: null,
    openingTripId: null, openOperation: null, planOperation: null,
    loading: false, loadingPhase: '', chatWorkspace: null, navigationGeneration: 0
  });
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    sessionStorage: {
      getItem: (key) => storage.get(`session:${key}`) ?? null,
      setItem: (key, value) => storage.set(`session:${key}`, String(value)),
      removeItem: (key) => storage.delete(`session:${key}`)
    },
    setTimeout: () => 1,
    clearTimeout() {}
  };
  globalThis.document = { getElementById: () => null };
  saveUserPlan('owner', {
    trip: previousTrip, sessionId: 'previous-session', savedTripId: 'previous-trip',
    prompt: '原来的草稿', view: 'planning', chatMode: 'chat'
  });
  return { storage, previousTrip };
}

function navigateToProfile() {
  assert.equal(handleNavigationAction({
    action: 'go', target: { dataset: { view: 'profile' } }, state,
    renderHeader() {}, renderView() {}, renderFloatingBtn() {},
    loadProfile() {}, refreshProfileInDOM() {}, toast() {}
  }), true);
}

function navigateToTrips() {
  assert.equal(handleNavigationAction({
    action: 'go', target: { dataset: { view: 'trips' } }, state,
    renderHeader() {}, renderView() {}, renderFloatingBtn() {},
    loadTrips() {}, toast() {}
  }), true);
}

function navigateToPlanning() {
  assert.equal(handleNavigationAction({
    action: 'go', target: { dataset: { view: 'planning' } }, state,
    renderHeader() {}, renderView() {}, renderFloatingBtn() {},
    scheduleTripMap() {}, scheduleDynamicRefresh() {}, toast() {}
  }), true);
}

function openResponse(savedTripId = 'opened-trip', workspace = undefined) {
  return {
    sessionId: 'opened-session', savedTripId,
    formalTripVersion: 4,
    trip: { prompt: '新打开的行程', version: 1, days: [{ day: 1, stops: [] }] },
    ...(workspace ? { workspace } : {}),
    message: '已打开正式行程。'
  };
}

test('late Open response after navigation does not replace the visible workspace or saved local draft', async () => {
  const { previousTrip } = setup();
  const response = deferred();
  let fetchStarted;
  globalThis.fetch = (url) => {
    fetchStarted = url;
    return response.promise;
  };

  const opening = openSavedTrip('opened-trip');
  assert.equal(fetchStarted, '/api/trips/opened-trip/open');
  navigateToProfile();
  response.resolve({ ok: true, status: 200, json: async () => openResponse() });
  await opening;

  assert.equal(state.view, 'profile');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
  assert.deepEqual(loadUserPlan('owner').trip, previousTrip);
  assert.equal(state.loading, false);
  assert.equal(state.openOperation, null);
});

test('late Open stays stale when navigation leaves and returns to the original view', async () => {
  const { previousTrip } = setup();
  const response = deferred();
  globalThis.fetch = () => response.promise;

  const opening = openSavedTrip('opened-trip');
  navigateToProfile();
  navigateToTrips();
  response.resolve({ ok: true, status: 200, json: async () => openResponse() });
  await opening;

  assert.equal(state.view, 'trips');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
  assert.equal(state.loading, false);
});

test('late Open cleanup does not clear a newer planning operation loader', async () => {
  const { previousTrip } = setup();
  const response = deferred();
  globalThis.fetch = () => response.promise;

  const opening = openSavedTrip('opened-trip');
  const currentPlanOperation = { id: 'new-plan-operation', owns: () => true };
  detachChatWorkspace();
  Object.assign(state, {
    planOperation: currentPlanOperation,
    view: 'planning',
    loading: true,
    loadingPhase: '正在理解新的规划请求'
  });
  response.resolve({ ok: true, status: 200, json: async () => openResponse() });
  await opening;

  assert.equal(state.view, 'planning');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.planOperation, currentPlanOperation);
  assert.equal(state.loading, true);
  assert.equal(state.loadingPhase, '正在理解新的规划请求');
  assert.equal(state.openOperation, null);
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
});

test('stale Open cannot clear loading after the invalidated older planner finishes', async () => {
  setup();
  const oldPlanOperation = { id: 'old-plan-operation', owns: () => false };
  state.planOperation = oldPlanOperation;
  const response = deferred();
  globalThis.fetch = () => response.promise;

  const opening = openSavedTrip('opened-trip');
  state.planOperation = null;
  response.resolve({ ok: true, status: 200, json: async () => openResponse() });
  await opening;

  assert.equal(state.planOperation, null);
  assert.equal(state.loading, false);
});

test('recoverLocal waits successfully then commits the opened planner and local chat', async () => {
  const { storage } = setup();
  const chatKey = getTripChatKey('opened-trip', 'opened-session');
  const localMessages = [{ role: 'user', content: '本地保留的消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-open', workspaceRevision: 5, dirty: true, blocked: false
  });
  const workspacePut = deferred();
  let resolvePutStarted;
  const putStarted = new Promise((resolve) => { resolvePutStarted = resolve; });
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) return Promise.resolve({
      ok: true, status: 200,
      json: async () => openResponse('opened-trip', {
        chatEpoch: 'epoch-open', workspaceRevision: 5, chatMode: 'planner',
        chatMessages: [{ role: 'assistant', content: '服务器消息' }]
      })
    });
    assert.match(url, /\/api\/trips\/opened-trip\/workspace$/);
    resolvePutStarted();
    return workspacePut.promise;
  };
  let renderCount = 0, mapCount = 0;

  const opening = openSavedTrip('opened-trip', {
    render: () => { renderCount++; },
    scheduleTripMap: () => { mapCount++; }
  });
  await putStarted;
  assert.equal(state.view, 'trips');
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(state.trip.prompt, '原来的草稿');
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).dirty, true);
  assert.equal(renderCount, 1);
  assert.equal(mapCount, 0);

  workspacePut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-open', workspaceRevision: 6, chatMode: 'planner', chatMessages: localMessages
  } }) });
  await opening;

  assert.equal(state.view, 'planning');
  assert.equal(state.sessionId, 'opened-session');
  assert.equal(state.savedTripId, 'opened-trip');
  assert.equal(state.chatMode, 'planner');
  assert.deepEqual(state.chatMessages, localMessages);
  assert.deepEqual(loadUserChats('owner')[chatKey], localMessages);
  assert.equal(loadUserPlan('owner').savedTripId, 'opened-trip');
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).workspaceRevision, 6);
  assert.equal(state.loading, false);
  assert.equal(renderCount, 2);
  assert.equal(mapCount, 1);
  assert.equal(storage.get('yuyouzhice_active_plan_owner') !== undefined, true);
});

test('recovered Open rebases its workspace revision after an earlier same-key PUT', async () => {
  setup();
  const savedTripId = `queued-trip-${Date.now()}`;
  const sessionId = `${savedTripId}-session`;
  const chatKey = getTripChatKey(savedTripId, sessionId);
  const localMessages = [{ role: 'user', content: '排队前的本地消息' }];
  state.savedTripId = savedTripId;
  state.sessionId = sessionId;
  state.chatSessionId = chatKey;
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-queued', workspaceRevision: 5, dirty: false, blocked: false
  });
  const firstPut = deferred(), secondPut = deferred();
  let resolveFirstStarted, resolveSecondStarted, resolveOpenStarted;
  const firstStarted = new Promise((resolve) => { resolveFirstStarted = resolve; });
  const secondStarted = new Promise((resolve) => { resolveSecondStarted = resolve; });
  const openStarted = new Promise((resolve) => { resolveOpenStarted = resolve; });
  const requestBodies = [];
  globalThis.fetch = (url, options = {}) => {
    if (url.endsWith('/open')) {
      resolveOpenStarted();
      return Promise.resolve({ ok: true, status: 200, json: async () => openResponse(savedTripId, {
        chatEpoch: 'epoch-queued', workspaceRevision: 5, chatMode: 'chat', chatMessages: []
      }) });
    }
    if (url.endsWith('/workspace')) {
      const body = JSON.parse(options.body);
      requestBodies.push(body);
      if (requestBodies.length === 1) {
        resolveFirstStarted();
        return firstPut.promise;
      }
      resolveSecondStarted();
      return secondPut.promise;
    }
    throw new Error(`unexpected request ${url}`);
  };

  const earlierWrite = persistTripWorkspace({
    userId: 'owner', savedTripId, sessionId, chatEpoch: 'epoch-queued',
    expectedRevision: 5, chatMessages: [{ role: 'assistant', content: '较早写入' }]
  }, { immediate: true });
  await firstStarted;
  const opening = openSavedTrip(savedTripId);
  await openStarted;
  await Promise.resolve();

  firstPut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-queued', workspaceRevision: 6, chatMode: 'chat', chatMessages: []
  } }) });
  await secondStarted;
  assert.equal(requestBodies[0].expectedRevision, 5);
  assert.equal(requestBodies[1].expectedRevision, 6);
  secondPut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-queued', workspaceRevision: 7, chatMode: 'chat', chatMessages: localMessages
  } }) });
  await Promise.all([earlierWrite, opening]);

  assert.equal(state.savedTripId, savedTripId);
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).workspaceRevision, 7);
});

test('immediate reopen uses stale Open PUT acknowledgement to rebase same-epoch revision', async () => {
  const { previousTrip } = setup();
  const savedTripId = `reopen-ack-${Date.now()}`;
  const chatKey = getTripChatKey(savedTripId, 'opened-session');
  const localMessages = [{ role: 'user', content: '需保留的消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-same', workspaceRevision: 5, dirty: true, blocked: false
  });
  const firstPut = deferred(), secondPut = deferred();
  let firstPutStarted, secondPutStarted, secondOpenStarted;
  const waitFirstPut = new Promise((resolve) => { firstPutStarted = resolve; });
  const waitSecondPut = new Promise((resolve) => { secondPutStarted = resolve; });
  const waitSecondOpen = new Promise((resolve) => { secondOpenStarted = resolve; });
  let openCount = 0, putCount = 0;
  const bodies = [];
  globalThis.fetch = (url, options = {}) => {
    if (url.endsWith('/open')) {
      openCount++;
      if (openCount === 2) secondOpenStarted();
      return Promise.resolve({ ok: true, status: 200, json: async () => openResponse(savedTripId, {
        chatEpoch: 'epoch-same', workspaceRevision: 5, chatMode: 'chat', chatMessages: []
      }) });
    }
    if (url.endsWith('/workspace')) {
      bodies.push(JSON.parse(options.body));
      putCount++;
      if (putCount === 1) { firstPutStarted(); return firstPut.promise; }
      secondPutStarted();
      return secondPut.promise;
    }
    throw new Error(`unexpected request ${url}`);
  };

  const firstOpen = openSavedTrip(savedTripId);
  await waitFirstPut;
  navigateToProfile();
  navigateToTrips();
  const secondOpen = openSavedTrip(savedTripId);
  await waitSecondOpen;
  await new Promise((resolve) => setImmediate(resolve));

  firstPut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-same', workspaceRevision: 6, chatMode: 'chat', chatMessages: localMessages
  } }) });
  await waitSecondPut;
  await firstOpen;
  assert.equal(bodies[0].expectedRevision, 5);
  assert.equal(bodies[1].expectedRevision, 6);
  secondPut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-same', workspaceRevision: 7, chatMode: 'chat', chatMessages: localMessages
  } }) });
  await secondOpen;

  assert.equal(state.savedTripId, savedTripId);
  assert.equal(state.sessionId, 'opened-session');
  assert.deepEqual(state.chatMessages, localMessages);
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).workspaceRevision, 7);
  assert.notEqual(state.trip, previousTrip);
});

test('reopen aborts old local-message commit when stale queued acknowledgement changed epoch', async () => {
  const { previousTrip } = setup();
  const savedTripId = `reopen-epoch-${Date.now()}`;
  const chatKey = getTripChatKey(savedTripId, 'opened-session');
  const localMessages = [{ role: 'user', content: '不能灌回新epoch的旧消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-old', workspaceRevision: 5, dirty: true, blocked: false
  });
  const chatsBefore = loadUserChats('owner');
  const metaBefore = loadChatWorkspaceMeta('owner', chatKey);
  const firstPut = deferred();
  let firstPutStarted, secondOpenStarted;
  const waitFirstPut = new Promise((resolve) => { firstPutStarted = resolve; });
  const waitSecondOpen = new Promise((resolve) => { secondOpenStarted = resolve; });
  let openCount = 0, putCount = 0;
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) {
      openCount++;
      if (openCount === 2) secondOpenStarted();
      return Promise.resolve({ ok: true, status: 200, json: async () => openResponse(savedTripId, {
        chatEpoch: 'epoch-old', workspaceRevision: 5, chatMode: 'chat', chatMessages: []
      }) });
    }
    if (url.endsWith('/workspace')) {
      putCount++;
      if (putCount === 1) { firstPutStarted(); return firstPut.promise; }
      throw new Error('epoch-conflicted Open must not send a second PUT');
    }
    throw new Error(`unexpected request ${url}`);
  };
  const originalWarn = console.warn;
  console.warn = () => {};

  const firstOpen = openSavedTrip(savedTripId);
  await waitFirstPut;
  navigateToProfile();
  navigateToTrips();
  const secondOpen = openSavedTrip(savedTripId);
  await waitSecondOpen;
  await new Promise((resolve) => setImmediate(resolve));

  firstPut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-new', workspaceRevision: 6, chatMode: 'chat', chatMessages: []
  } }) });
  try {
    await Promise.all([firstOpen, secondOpen]);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(putCount, 1);
  assert.equal(state.view, 'trips');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.savedTripId, 'previous-trip');
  assert.deepEqual(loadUserChats('owner'), chatsBefore);
  assert.deepEqual(loadChatWorkspaceMeta('owner', chatKey), metaBefore);
  assert.match(state.toast, /更新或重置/);
});

test('navigation during recovered-workspace write leaves no stale Open state, chat, render, or save', async () => {
  const { previousTrip } = setup();
  const chatKey = getTripChatKey('opened-trip', 'opened-session');
  const localMessages = [{ role: 'user', content: '本地保留的消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-open', workspaceRevision: 5, dirty: true, blocked: false
  });
  const chatsBefore = loadUserChats('owner');
  const workspaceMetaBefore = loadChatWorkspaceMeta('owner', chatKey);
  const workspacePut = deferred();
  let resolvePutStarted;
  const putStarted = new Promise((resolve) => { resolvePutStarted = resolve; });
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) return Promise.resolve({
      ok: true, status: 200,
      json: async () => openResponse('opened-trip', {
        chatEpoch: 'epoch-open', workspaceRevision: 5, chatMode: 'planner',
        chatMessages: [{ role: 'assistant', content: '服务器消息' }]
      })
    });
    resolvePutStarted();
    return workspacePut.promise;
  };
  let renderCount = 0, mapCount = 0;
  const priorChatWorkspace = { marker: 'previous-workspace' };
  state.chatWorkspace = priorChatWorkspace;

  const opening = openSavedTrip('opened-trip', {
    render: () => { renderCount++; },
    scheduleTripMap: () => { mapCount++; }
  });
  await putStarted;
  assert.equal(state.view, 'trips');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(state.chatWorkspace, null);
  assert.deepEqual(loadUserChats('owner'), chatsBefore);
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
  state.chatWorkspace = priorChatWorkspace;

  navigateToProfile();
  navigateToPlanning();
  const renderCountAfterNavigation = renderCount;
  workspacePut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-open', workspaceRevision: 6, chatMode: 'planner', chatMessages: localMessages
  } }) });
  await opening;

  assert.equal(state.view, 'planning');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(state.chatWorkspace, priorChatWorkspace);
  assert.deepEqual(loadUserChats('owner'), chatsBefore);
  assert.deepEqual(loadChatWorkspaceMeta('owner', chatKey), workspaceMetaBefore);
  assert.equal(loadUserPlan('owner').savedTripId, 'previous-trip');
  assert.equal(renderCount, renderCountAfterNavigation);
  assert.equal(mapCount, 0);
  assert.equal(state.openOperation, null);
  assert.equal(state.openingTripId, null);
});

test('leaving a pending Open releases its busy row so a new Open can succeed', async () => {
  setup();
  const firstResponse = deferred();
  const secondResponse = deferred();
  globalThis.fetch = (url) => url.includes('first-trip') ? firstResponse.promise : secondResponse.promise;

  const firstOpen = openSavedTrip('first-trip');
  navigateToProfile();
  assert.equal(state.openOperation, null);
  assert.equal(state.openingTripId, null);
  navigateToTrips();

  const secondOpen = openSavedTrip('second-trip');
  const secondOperation = state.openOperation;
  assert.equal(state.openingTripId, 'second-trip');
  assert.ok(secondOperation);

  firstResponse.resolve({ ok: true, status: 200, json: async () => openResponse('first-trip') });
  await firstOpen;
  assert.equal(state.openOperation, secondOperation);
  assert.equal(state.openingTripId, 'second-trip');
  assert.equal(state.savedTripId, 'previous-trip');

  secondResponse.resolve({ ok: true, status: 200, json: async () => openResponse('second-trip') });
  await secondOpen;
  assert.equal(state.savedTripId, 'second-trip');
  assert.equal(state.sessionId, 'opened-session');
  assert.equal(state.openOperation, null);
  assert.equal(state.openingTripId, null);
});

test('failed recovered-workspace write keeps local chat marked dirty', async () => {
  const { previousTrip } = setup();
  const chatKey = getTripChatKey('opened-trip', 'opened-session');
  const localMessages = [{ role: 'user', content: '待同步的本地消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-open', workspaceRevision: 5, dirty: true, blocked: false
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) return Promise.resolve({
      ok: true, status: 200,
      json: async () => openResponse('opened-trip', {
        chatEpoch: 'epoch-open', workspaceRevision: 5, chatMode: 'planner', chatMessages: []
      })
    });
    return Promise.resolve({ ok: false, status: 503, json: async () => ({ message: 'offline' }) });
  };

  try {
    await openSavedTrip('opened-trip');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(state.view, 'planning');
  assert.equal(state.trip.prompt, '新打开的行程');
  assert.deepEqual(state.chatMessages, localMessages);
  assert.deepEqual(loadUserChats('owner')[chatKey], localMessages);
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).dirty, true);
  assert.equal(state.chatWorkspace.dirty, true);
  assert.notEqual(state.trip, previousTrip);
});

test('stale recovered-workspace 409 does not block or replace local workspace metadata', async () => {
  setup();
  const savedTripId = `stale-conflict-${Date.now()}`;
  const chatKey = getTripChatKey(savedTripId, 'opened-session');
  const localMessages = [{ role: 'user', content: '仍待同步的消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-open', workspaceRevision: 5, dirty: true, blocked: false
  });
  const metaBefore = loadChatWorkspaceMeta('owner', chatKey);
  const putResponse = deferred();
  let resolvePutStarted;
  const putStarted = new Promise((resolve) => { resolvePutStarted = resolve; });
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) return Promise.resolve({
      ok: true, status: 200,
      json: async () => openResponse(savedTripId, {
        chatEpoch: 'epoch-open', workspaceRevision: 5, chatMode: 'chat', chatMessages: []
      })
    });
    resolvePutStarted();
    return putResponse.promise;
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  const opening = openSavedTrip(savedTripId);
  await putStarted;
  navigateToProfile();
  putResponse.resolve({ ok: false, status: 409, json: async () => ({
    message: 'workspace conflict', workspace: {
      chatEpoch: 'epoch-newer', workspaceRevision: 6, chatMode: 'chat', chatMessages: []
    }
  }) });
  try {
    await opening;
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(state.view, 'profile');
  assert.deepEqual(loadChatWorkspaceMeta('owner', chatKey), metaBefore);
  assert.equal(loadChatWorkspaceMeta('owner', chatKey).blocked, false);
  assert.equal(state.savedTripId, 'previous-trip');
  assert.equal(state.openOperation, null);
});

test('opening a detail page during recovered-workspace sync fences the staged Open', async () => {
  const { previousTrip } = setup();
  state.view = 'planning';
  const chatKey = getTripChatKey('opened-trip', 'opened-session');
  const localMessages = [{ role: 'user', content: '本地消息' }];
  state.tripChatHistories = { [chatKey]: localMessages };
  saveUserChats('owner', state.tripChatHistories);
  saveChatWorkspaceMeta('owner', chatKey, {
    chatEpoch: 'epoch-open', workspaceRevision: 5, dirty: true, blocked: false
  });
  const metaBefore = loadChatWorkspaceMeta('owner', chatKey);
  const workspacePut = deferred();
  let resolvePutStarted;
  const putStarted = new Promise((resolve) => { resolvePutStarted = resolve; });
  globalThis.fetch = (url) => {
    if (url.endsWith('/open')) return Promise.resolve({
      ok: true, status: 200,
      json: async () => openResponse('opened-trip', {
        chatEpoch: 'epoch-open', workspaceRevision: 5, chatMode: 'chat', chatMessages: []
      })
    });
    if (url.endsWith('/workspace')) {
      resolvePutStarted();
      return workspacePut.promise;
    }
    if (url === '/api/attractions/poi-detail') return Promise.resolve({
      ok: true, status: 200, json: async () => ({ detail: { name: '目标景点' } })
    });
    throw new Error(`unexpected request ${url}`);
  };

  const opening = openSavedTrip('opened-trip');
  await putStarted;
  await openDetail('poi-detail', { name: '目标景点' });
  assert.equal(state.view, 'detail');
  assert.equal(state.detail.name, '目标景点');

  workspacePut.resolve({ ok: true, status: 200, json: async () => ({ workspace: {
    chatEpoch: 'epoch-open', workspaceRevision: 6, chatMode: 'chat', chatMessages: localMessages
  } }) });
  await opening;

  assert.equal(state.view, 'detail');
  assert.equal(state.trip, previousTrip);
  assert.equal(state.sessionId, 'previous-session');
  assert.equal(state.savedTripId, 'previous-trip');
  assert.deepEqual(loadChatWorkspaceMeta('owner', chatKey), metaBefore);
});

test('failed Open rerenders the trips view and releases its busy row', async () => {
  setup();
  globalThis.fetch = async () => ({ ok: false, status: 404,
    json: async () => ({ message: '行程不存在。' }) });
  let renderCount = 0;

  await openSavedTrip('missing-trip', { render: () => { renderCount++; } });

  assert.equal(state.view, 'trips');
  assert.equal(state.openingTripId, null);
  assert.equal(state.openOperation, null);
  assert.equal(state.loading, false);
  assert.equal(renderCount, 2);
});

test('Open retry reuses the same operation key after a lost response and clears it on success', async () => {
  setup();
  const requests = [];
  let failOnce = true;
  globalThis.fetch = async (url, options = {}) => {
    if (!url.endsWith('/open')) throw new Error(`unexpected request ${url}`);
    requests.push(options);
    if (failOnce) {
      failOnce = false;
      throw new TypeError('simulated network response loss');
    }
    return { ok: true, status: 200, json: async () => openResponse('retry-trip') };
  };

  await openSavedTrip('retry-trip');
  const failedKey = requests[0].headers['x-planner-open-idempotency-key'];
  assert.match(failedKey, /^trip-open-/);
  assert.equal(window.sessionStorage.getItem('yuyouzhice:trip-open:owner:retry-trip'), failedKey);

  await openSavedTrip('retry-trip');
  assert.equal(requests[1].headers['x-planner-open-idempotency-key'], failedKey);
  assert.equal(window.sessionStorage.getItem('yuyouzhice:trip-open:owner:retry-trip'), null);
});

test('same-view admin subnavigation does not invalidate a pending Open', () => {
  setup();
  state.view = 'admin';
  state.user.role = 'admin';
  const before = Number(state.navigationGeneration) || 0;
  handleNavigationAction({
    action: 'admin-section', target: { dataset: { section: 'users' } }, state,
    switchAdminSectionInDOM: () => true, toast() {}
  });
  handleNavigationAction({
    action: 'close-login', target: { dataset: {} }, state,
    renderModals() {}
  });
  assert.equal(state.view, 'admin');
  assert.equal(Number(state.navigationGeneration) || 0, before);
});
