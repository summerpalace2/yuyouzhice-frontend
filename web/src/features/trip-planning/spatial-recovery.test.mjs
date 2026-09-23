import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSpatialContinuationOptions } from './spatial-recovery.js';

const trip = {
  constraints: {
    startPlace: '江津区',
    timeBudgetMinutes: 360,
    timeBudgetScope: 'CURRENT_TRIP',
    durationDays: 0,
    spatialScope: '附近',
    interests: ['人文']
  }
};

test('selected AMap candidate continues same prompt and budget with exact provider ID', () => {
  const result = buildSpatialContinuationOptions({
    trip,
    prompt: '我在江津，限时6小时',
    action: 'select-candidate',
    candidate: {
      name: '白沙古镇', district: '江津区', providerPlaceId: 'AMAP-POI-1'
    }
  });

  assert.equal(result.prompt, '我在江津，限时6小时');
  assert.equal(result.constraints.startPlace, '江津区 白沙古镇');
  assert.equal(result.constraints.confirmedStartPlaceProviderId, 'AMAP-POI-1');
  assert.equal(result.constraints.timeBudgetMinutes, 360);
  assert.equal(result.usePreferences, false);
  assert.equal(result.preferenceDecision, 'ignore');
});

test('administrative reference requires explicit confirmation and preserves trip budget', () => {
  const result = buildSpatialContinuationOptions({
    trip, prompt: '我在江津，限时6小时', action: 'confirm-reference',
    candidate: { name: '江津区', granularity: 'ADMINISTRATIVE_REGION' }
  });

  assert.equal(result.constraints.startPlace, '江津区');
  assert.equal(result.constraints.confirmAdministrativeReferencePoint, true);
  assert.equal(result.constraints.timeBudgetMinutes, 360);
});

test('stale or incomplete candidate cannot be submitted as an arbitrary place', () => {
  assert.throws(() => buildSpatialContinuationOptions({
    trip, action: 'select-candidate', candidate: { name: '某景点' }
  }), /缺少可重新核验的高德地点信息/);
});

test('refinement clears the unresolved start but preserves known time constraints', () => {
  const result = buildSpatialContinuationOptions({
    trip, prompt: '我在江津，限时6小时', action: 'refine'
  });

  assert.equal(result.constraints.startPlace, undefined);
  assert.equal(result.constraints.spatialScope, undefined);
  assert.equal(result.constraints.timeBudgetMinutes, 360);
});

test('retry retains the confirmed start identity for server-side revalidation', () => {
  const result = buildSpatialContinuationOptions({
    trip: { constraints: { ...trip.constraints, confirmedStartPlaceProviderId: 'AMAP-POI-2' } },
    prompt: '我在江津，限时6小时', action: 'retry'
  });

  assert.equal(result.constraints.startPlace, '江津区');
  assert.equal(result.constraints.confirmedStartPlaceProviderId, 'AMAP-POI-2');
  assert.equal(result.constraints.timeBudgetMinutes, 360);
});
