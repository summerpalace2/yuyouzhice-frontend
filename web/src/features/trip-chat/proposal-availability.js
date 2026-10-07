// A missing target cannot be applied; route quality warnings remain a user choice.
const missingTargetReasons = new Set(['DINING_CANDIDATES_UNAVAILABLE', 'DINING_POI_UNRESOLVED', 'MEAL_WINDOW_UNAVAILABLE', 'NO_FEASIBLE_MEAL_GAP', 'NO_ACTUAL_CHANGE']);
export function proposalUnavailable(proposal, optionId = null) {
  const selected = optionId && proposal?.optionStatus?.[optionId];
  if (selected) return selected.canApply === false;
  return proposal?.canApply === false || (proposal?.reasonCodes || []).some(code => missingTargetReasons.has(code));
}
