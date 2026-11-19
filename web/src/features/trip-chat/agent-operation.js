/** 用户动作标识与重试快照；模型参数不能替代这一浏览器动作身份。 */
export function newAgentOperationId() {
  return globalThis.crypto?.randomUUID?.() || `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function agentWorkspaceIdentity(state) {
  return {
    userId: state.user?.id || '', sessionId: state.sessionId || '', savedTripId: state.savedTripId || '',
    version: Number(state.trip?.version || 0), chatSessionId: state.chatSessionId || ''
  };
}

/** 重试只允许留在原动作最后拥有的工作区；不将旧请求绑定到新行程。 */
export function canRetryAgentOperation(operation, state, input) {
  const current = agentWorkspaceIdentity(state);
  return operation?.payload?.message === input && operation?.operationId
    && Object.keys(current).every(key => current[key] === operation.workspace?.[key]);
}

export function rememberAgentWorkspace(operation, state) {
  if (operation) operation.workspace = agentWorkspaceIdentity(state);
}
