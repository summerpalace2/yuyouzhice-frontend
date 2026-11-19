import { state } from '../../app-core/state.js';
import { deviceId, request as apiRequest } from '../../shared/api/client.js';

/**
 * 读取统一智能体 SSE 流（POST /api/agent/stream）。
 *
 * 兼容后端 AgentController 输出的 JSON 信封（{ event, step, phase, toolName, message, data }），
 * 并在收到 done 事件前严格检测意外断流。
 */
export async function readAgentStream(payload = {}, onEvent, signal) {
  let response;
  try {
    response = await fetch('/api/agent/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'x-yuyouzhice-device': deviceId(),
        ...(state.csrfToken ? { 'x-yuyouzhice-csrf': state.csrfToken } : {})
      },
      body: JSON.stringify(payload),
      signal
    });
  } catch (netErr) {
    if (netErr?.name === 'AbortError') throw netErr;
    throw Object.assign(new Error('网络连接异常，无法连接智能体服务。'), { status: 0, cause: netErr });
  }

  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch {}
    throw Object.assign(new Error(data.message || '智能体服务暂不可用。'), { status: response.status, data });
  }
  if (!response.body) {
    throw new Error('Java Core Backend 未返回智能体事件流。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  let eventData = [];
  let doneSeen = false;

  const dispatch = () => {
    if (!eventData.length) { eventName = 'message'; return; }
    const dispatchedEvent = eventName || 'message';
    const raw = eventData.join('\n');
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { event: dispatchedEvent, message: raw, data: {} };
    }
    if (dispatchedEvent === 'done') doneSeen = true;
    if (typeof onEvent === 'function') {
      onEvent(dispatchedEvent, parsed, raw);
    }
    eventName = 'message';
    eventData = [];
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line === '') { dispatch(); if (doneSeen) break; }
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) eventData.push(line.slice(5).replace(/^ /, ''));
      }
      if (doneSeen) return;
      if (done) break;
    }

    if (buffer && buffer.startsWith('data:')) {
      eventData.push(buffer.slice(5).replace(/^ /, ''));
    }
    dispatch();
    if (!doneSeen) {
      throw new Error('智能体事件流提前结束，未收到完成事件。');
    }
  } finally {
    // 回调异常、取消以及正常完成都释放流，避免连接与 reader 锁残留。
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * 提交人机确认（HIL）决策：批准执行（approved=true）或取消（approved=false）。
 */
export async function confirmAgentAction(
  { confirmId = '', approved = false, sessionId = 'default', plannerSessionId = '' } = {},
  { request = apiRequest, signal } = {}
) {
  if (typeof approved !== 'boolean') throw new TypeError('approved 必须为布尔值。');
  return request('/api/agent/confirm', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      confirmId: String(confirmId || ''),
      approved: Boolean(approved),
      sessionId: String(sessionId || 'default'),
      plannerSessionId: String(plannerSessionId || '')
    })
  });
}
