import { state } from './state.js';

let authGeneration = 0;
let workspaceGeneration = 0;

export function invalidateWorkspace() {
  workspaceGeneration++;
  state.openingTripId = null;
  state.savingTrip = false;
  state.chatWorkspace = null;
}

export function invalidateAuthentication() {
  authGeneration++;
  invalidateWorkspace();
}

export function captureAuthentication() {
  const generation = authGeneration, userId = state.user?.id;
  return { userId, current: () => generation === authGeneration, owns: () => generation === authGeneration && state.user?.id === userId };
}

export function captureWorkspace({ exact = false } = {}) {
  const authentication = captureAuthentication(), generation = workspaceGeneration;
  const sessionId = state.sessionId, savedTripId = state.savedTripId, trip = state.trip;
  return {
    userId: authentication.userId, sessionId, savedTripId,
    owns: () => authentication.owns() && generation === workspaceGeneration
      && (!exact || (state.sessionId === sessionId && state.savedTripId === savedTripId && state.trip === trip)),
    authenticated: authentication.owns
  };
}
