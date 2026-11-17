import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { captureAuthentication } from '../../app-core/workspace-lifecycle.js';
import { getTripChatKey, loadChatWorkspaceMeta, saveChatWorkspaceMeta } from '../../app-core/user-store.js';
import { toast } from '../../shared/ui/toast.js';

const timers = new Map();
const writes = new Map();
const committed = new Map();
const pendingPayloads = new Map();
const keyFor = (owner) => `${owner.userId}:${owner.savedTripId}`;

export function adoptTripWorkspace(workspace, owner = {}, { blocked = false, acknowledgement = null, updateState = true } = {}) {
  if (!workspace?.chatEpoch || !Number.isSafeInteger(Number(workspace.workspaceRevision))) return null;
  const userId = owner.userId ?? state.user?.id, savedTripId = owner.savedTripId ?? state.savedTripId;
  if (!userId || !savedTripId) return null;
  const key = keyFor({ userId, savedTripId }), previous = committed.get(key);
  if (acknowledgement && (previous?.generation ?? 0) !== acknowledgement.authorityGeneration) return null;
  const metadata = { chatEpoch: workspace.chatEpoch, workspaceRevision: Number(workspace.workspaceRevision), dirty: false, blocked };
  if (previous && (metadata.workspaceRevision < previous.workspaceRevision
      || (metadata.chatEpoch !== previous.chatEpoch && metadata.workspaceRevision <= previous.workspaceRevision))) return null;
  saveChatWorkspaceMeta(userId, getTripChatKey(savedTripId), metadata);
  committed.set(key, { ...metadata, generation: acknowledgement ? (previous?.generation ?? 0) : (previous?.generation ?? 0) + 1 });
  if (updateState && state.user?.id === userId && state.savedTripId === savedTripId) state.chatWorkspace = metadata;
  return metadata;
}

function currentPayload(overrides = {}) {
  const userId = overrides.userId ?? state.user?.id;
  const savedTripId = String(overrides.savedTripId ?? state.savedTripId ?? '').trim();
  const sessionId = String(overrides.sessionId ?? state.sessionId ?? '').trim();
  if (!userId || state.user?.id !== userId || !savedTripId || !sessionId) return null;
  const metadata = loadChatWorkspaceMeta(userId, getTripChatKey(savedTripId));
  if (metadata?.blocked) return null;
  if (metadata && ((overrides.chatEpoch !== undefined && overrides.chatEpoch !== metadata.chatEpoch)
      || (overrides.expectedRevision !== undefined && Number(overrides.expectedRevision) !== Number(metadata.workspaceRevision)))) return null;
  const payload = {
    userId, savedTripId, sessionId, authentication: captureAuthentication(),
    authorityGeneration: committed.get(keyFor({ userId, savedTripId }))?.generation ?? 0,
    chatEpoch: overrides.chatEpoch ?? metadata?.chatEpoch ?? null,
    expectedRevision: overrides.expectedRevision ?? metadata?.workspaceRevision ?? null,
    chatMode: overrides.chatMode ?? state.chatMode,
    chatMessages: structuredClone(Array.isArray(overrides.chatMessages) ? overrides.chatMessages : state.chatMessages),
    suppressUiState: overrides.suppressUiState === true
  };
  if (payload.chatEpoch) saveChatWorkspaceMeta(userId, getTripChatKey(savedTripId), {
    chatEpoch: payload.chatEpoch, workspaceRevision: payload.expectedRevision, dirty: true
  });
  return payload;
}

async function writeWorkspace(payload) {
  if (!payload.authentication.owns()) return null;
  if ((committed.get(keyFor(payload))?.generation ?? 0) !== payload.authorityGeneration) return null;
  try {
    // Legacy copies without a reset epoch cannot prove they postdate a server clear.
    if (!payload.chatEpoch || !Number.isSafeInteger(Number(payload.expectedRevision))) {
      const result = await request(`/api/trips/${encodeURIComponent(payload.savedTripId)}/workspace?sessionId=${encodeURIComponent(payload.sessionId)}`);
      if (payload.authentication.owns() && (committed.get(keyFor(payload))?.generation ?? 0) === payload.authorityGeneration) {
        adoptTripWorkspace(result.workspace, payload, { blocked: true, updateState: !payload.suppressUiState });
      }
      return result.workspace || null;
    }
    const previous = committed.get(keyFor(payload));
    if (previous?.blocked) return null;
    if ((previous?.generation ?? 0) !== payload.authorityGeneration) return null;
    if (previous && previous.chatEpoch !== payload.chatEpoch) return null;
    const revision = previous?.chatEpoch === payload.chatEpoch
      ? Math.max(Number(payload.expectedRevision), previous.workspaceRevision) : Number(payload.expectedRevision);
    const result = await request(`/api/trips/${encodeURIComponent(payload.savedTripId)}/workspace`, {
      method: 'PUT',
      body: JSON.stringify({
        sessionId: payload.sessionId,
        chatEpoch: payload.chatEpoch, expectedRevision: revision,
        chatMode: (payload.chatMode === 'agent' ? 'agent' : (payload.chatMode === 'planner' ? 'planner' : (payload.chatMode === 'chat' ? 'chat' : 'agent'))),
        chatMessages: payload.chatMessages
      })
    });
    const latest = committed.get(keyFor(payload));
    if (payload.authentication.owns() && (!latest || latest.chatEpoch === payload.chatEpoch)) {
      const metadata = adoptTripWorkspace(result.workspace, payload, {
        acknowledgement: payload,
        updateState: !payload.suppressUiState
      });
      const queued = pendingPayloads.get(keyFor(payload));
      if (metadata && queued && queued !== payload && queued.authorityGeneration === payload.authorityGeneration) {
        saveChatWorkspaceMeta(payload.userId, getTripChatKey(payload.savedTripId), { ...metadata, dirty: true });
      }
    }
    return result.workspace || null;
  } catch (error) {
    if (payload.authentication.owns() && error?.status === 409) {
      const latest = committed.get(keyFor(payload));
      if (latest && (latest.chatEpoch !== payload.chatEpoch || latest.generation !== payload.authorityGeneration)) return null;
      adoptTripWorkspace(error.data?.workspace, payload, { blocked: true, updateState: !payload.suppressUiState });
      toast('对话记录已在别处更新，请重新打开行程；本地回复仍保留。');
    }
    console.warn('[TripWorkspace] 保存行程对话工作区失败:', error?.message || error);
    return null;
  }
}

function enqueue(payload) {
  const key = keyFor(payload), previous = writes.get(key) || Promise.resolve();
  const next = previous.catch(() => null).then(() => writeWorkspace(payload));
  next.workspacePayload = payload;
  writes.set(key, next);
  void next.finally(() => {
    if (writes.get(key) === next) writes.delete(key);
    if (pendingPayloads.get(key) === payload) pendingPayloads.delete(key);
  });
  return next;
}

/**
 * Persist only saved-trip continuity state. Draft plans remain session-scoped
 * until Java assigns their formal Trip ID during save.
 */
export function persistTripWorkspace(overrides = {}, { immediate = false } = {}) {
  const payload = currentPayload(overrides);
  if (!payload) return Promise.resolve(null);
  const key = keyFor(payload);
  pendingPayloads.set(key, payload);
  if (timers.has(key)) window.clearTimeout(timers.get(key));
  timers.delete(key);
  if (immediate) return enqueue(payload);
  timers.set(key, window.setTimeout(() => { timers.delete(key); void enqueue(payload); }, 280));
  return Promise.resolve(null);
}

/**
 * Synchronize local messages recovered from an Open snapshot without changing
 * the active planner state or optimistic workspace cache before the write is
 * acknowledged. The Open snapshot's revision remains the CAS authority.
 */
export function persistOpenedTripWorkspace(snapshot = {}) {
  const userId = snapshot.userId ?? state.user?.id;
  const savedTripId = String(snapshot.savedTripId || '').trim();
  const sessionId = String(snapshot.sessionId || '').trim();
  const chatEpoch = String(snapshot.chatEpoch || '').trim();
  const expectedRevision = Number(snapshot.expectedRevision);
  if (!userId || state.user?.id !== userId || !savedTripId || !sessionId || !chatEpoch
      || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return Promise.resolve(null);

  const payload = {
    userId, savedTripId, sessionId, chatEpoch, expectedRevision,
    chatMode: (snapshot.chatMode === 'agent' ? 'agent' : (snapshot.chatMode === 'planner' ? 'planner' : (snapshot.chatMode === 'chat' ? 'chat' : 'agent'))),
    chatMessages: structuredClone(Array.isArray(snapshot.chatMessages) ? snapshot.chatMessages : []),
    authentication: captureAuthentication(),
    shouldCommitLocalState: typeof snapshot.shouldCommitLocalState === 'function'
      ? snapshot.shouldCommitLocalState : () => true
  };
  const key = keyFor(payload), previousWrite = writes.get(key) || Promise.resolve();
  pendingPayloads.set(key, payload);
  const next = previousWrite.catch(() => null).then(async (previousResult) => {
    if (!payload.authentication.owns() || !payload.shouldCommitLocalState()) return null;
    const local = loadChatWorkspaceMeta(userId, getTripChatKey(savedTripId));
    const priorAck = previousResult?.workspace
      || (previousResult?.chatEpoch ? previousResult : null);
    const candidates = [committed.get(key), local, priorAck]
      .filter((item) => item && Number.isSafeInteger(Number(item.workspaceRevision)));
    const newestRevision = candidates.length
      ? Math.max(...candidates.map((item) => Number(item.workspaceRevision))) : null;
    const newest = candidates.filter((item) => Number(item.workspaceRevision) === newestRevision);
    const hasEpochConflict = newest.some((item) => item.chatEpoch !== chatEpoch)
      || newest.some((item) => item.blocked);
    if (hasEpochConflict) {
      return { workspace: null, status: 'conflict' };
    }
    const revision = newestRevision === null ? expectedRevision
      : Math.max(expectedRevision, newestRevision);
    try {
      const result = await request(`/api/trips/${encodeURIComponent(savedTripId)}/workspace`, {
        method: 'PUT',
        body: JSON.stringify({
          sessionId, chatEpoch, expectedRevision: revision, chatMode: payload.chatMode,
          chatMessages: payload.chatMessages
        })
      });
      if (payload.authentication.owns() && payload.shouldCommitLocalState()) {
        const metadata = adoptTripWorkspace(result.workspace, payload, { updateState: false });
        const queued = pendingPayloads.get(key);
        if (metadata && queued && queued !== payload) {
          saveChatWorkspaceMeta(userId, getTripChatKey(savedTripId), { ...metadata, dirty: true });
        }
      }
      return { workspace: result.workspace || null, status: 'saved' };
    } catch (error) {
      if (!payload.authentication.owns() || !payload.shouldCommitLocalState()) {
        return { workspace: null, status: 'stale' };
      }
      if (payload.authentication.owns() && payload.shouldCommitLocalState() && error?.status === 409) {
        adoptTripWorkspace(error.data?.workspace, payload, { blocked: true, updateState: false });
        return { workspace: error.data?.workspace || null, status: 'conflict' };
      }
      console.warn('[TripWorkspace] 保存已恢复的行程对话失败:', error?.message || error);
      return { workspace: null, status: 'failed' };
    }
  });
  next.workspacePayload = payload;
  writes.set(key, next);
  void next.finally(() => {
    if (writes.get(key) === next) writes.delete(key);
    if (pendingPayloads.get(key) === payload) pendingPayloads.delete(key);
  });
  return next;
}
