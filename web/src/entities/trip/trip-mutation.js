import { state } from '../../app-core/state.js';

// Serialize local writes and reject receipts belonging to an older workspace/version.
export function beginTripMutation(kind = 'direct') {
  const current = state.tripMutationTicket;
  if (current?.owns() || (!current && (state.loading || state.applyPending))) return null;
  const sessionId = state.sessionId, tripId = state.savedTripId, userId = state.user?.id;
  const ticket = {
    sessionId,
    version: Number(state.trip?.version || 1),
    kind,
    owns: () => state.tripMutationTicket === ticket && state.sessionId === sessionId
      && state.savedTripId === tripId && state.user?.id === userId
  };
  state.tripMutationTicket = ticket;
  return ticket;
}

export function acceptTripReceipt(ticket, trip) {
  const version = Number(trip?.version);
  if (!ticket.owns() || !Number.isFinite(version) || version < ticket.version
    || version < Number(state.trip?.version || 1)) return false;
  state.trip = trip;
  return true;
}

export function finishTripMutation(ticket) {
  const owns = ticket.owns();
  if (state.tripMutationTicket === ticket) {
    state.tripMutationTicket = null;
    // The lock still belongs to this operation, even after switching workspaces.
    // A newer local write replaces the ticket and cannot be cleared by this receipt.
    if (ticket.kind === 'apply') state.applyPending = false;
    else state.loading = false;
  }
  return owns;
}
