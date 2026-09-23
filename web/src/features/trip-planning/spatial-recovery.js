const CONTINUATION_FIELDS = [
  'destination', 'arrivalAt', 'departureAt', 'durationDays', 'timeBudgetMinutes',
  'timeBudgetScope', 'spatialScope', 'companions', 'walkingTolerance', 'budget',
  'interests', 'stayArea', 'transportPreference', 'dietPreference', 'mustVisit', 'avoid'
];

function isUsefulConstraint(value) {
  if (value == null || value === '' || value === '未提供' || value === 'UNSPECIFIED') return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function continuationConstraints(trip, { keepStartPlace = false } = {}) {
  const source = trip?.constraints && typeof trip.constraints === 'object' ? trip.constraints : {};
  const result = {};
  for (const field of CONTINUATION_FIELDS) {
    if (field === 'spatialScope' && !keepStartPlace) continue;
    if (isUsefulConstraint(source[field])) result[field] = source[field];
  }
  if (keepStartPlace && isUsefulConstraint(source.startPlace)) result.startPlace = source.startPlace;
  if (keepStartPlace && isUsefulConstraint(source.confirmedStartPlaceProviderId)) {
    result.confirmedStartPlaceProviderId = source.confirmedStartPlaceProviderId;
  }
  if (keepStartPlace && source.confirmAdministrativeReferencePoint === true) {
    result.confirmAdministrativeReferencePoint = true;
  }
  return result;
}

function selectedPlaceQuery(candidate) {
  const district = String(candidate?.district || '').trim();
  const name = String(candidate?.name || '').trim();
  return [district, name].filter(Boolean).join(' ');
}

/**
 * Prepare a retry through the single planner endpoint. Selected AMap IDs are
 * only hints: Java resolves them again and refuses to route if they disappear.
 */
export function buildSpatialContinuationOptions({ trip, prompt, action, candidate } = {}) {
  const constraints = continuationConstraints(trip, { keepStartPlace: action === 'retry' });
  if (action === 'select-candidate') {
    const providerPlaceId = String(candidate?.providerPlaceId || '').trim();
    const startPlace = selectedPlaceQuery(candidate);
    if (!providerPlaceId || !startPlace) throw new Error('此候选缺少可重新核验的高德地点信息，请补充更具体的地点。');
    constraints.startPlace = startPlace;
    constraints.confirmedStartPlaceProviderId = providerPlaceId;
    constraints.confirmAdministrativeReferencePoint = false;
  } else if (action === 'confirm-reference') {
    const name = String(candidate?.name || '').trim();
    if (!name || candidate?.granularity !== 'ADMINISTRATIVE_REGION') {
      throw new Error('只能确认高德返回的行政区域参考点。');
    }
    constraints.startPlace = name;
    constraints.confirmAdministrativeReferencePoint = true;
    delete constraints.confirmedStartPlaceProviderId;
  } else if (action === 'refine') {
    delete constraints.startPlace;
    delete constraints.confirmedStartPlaceProviderId;
    delete constraints.confirmAdministrativeReferencePoint;
  } else if (action !== 'retry') {
    throw new Error('不支持的地点恢复操作。');
  }

  return {
    prompt: typeof prompt === 'string' ? prompt : '',
    constraints,
    usePreferences: false,
    preferenceDecision: 'ignore'
  };
}
