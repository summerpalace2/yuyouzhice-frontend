/**
 * Record real main-view transitions so late async work can detect navigation
 * away-and-back cycles. Same-view UI changes do not invalidate operations.
 */
export function transitionMainView(state, view) {
  if (!state || state.view === view) return false;
  state.navigationGeneration = (Number(state.navigationGeneration) || 0) + 1;
  state.view = view;
  if (view === 'planning') state.chatDockOpen = true;
  state.planningPane = 'itinerary';
  state.planningExpanded = false;
  state.itineraryScroll = 0;
  if (state.openOperation) {
    state.openOperation = null;
    state.openingTripId = null;
    if (!state.planOperation?.owns?.()) state.loading = false;
  }
  return true;
}
