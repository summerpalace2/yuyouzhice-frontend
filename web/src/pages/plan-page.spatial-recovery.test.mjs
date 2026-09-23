import assert from 'node:assert/strict';
import test from 'node:test';
import { planView } from './plan-page.js';
import { state } from '../app-core/state.js';

test('pending spatial results show the right next action and never masquerade as a trip', () => {
  const scenarios = [
    {
      status: 'START_PLACE_AMBIGUOUS',
      title: '找到多个可能地点，请选定一个',
      resolutionStatus: 'AMBIGUOUS',
      alternatives: [{ name: '地点候选', district: '某区', providerPlaceId: 'poi-1', granularity: 'POI' }],
      expectedAction: 'data-action="select-place-candidate"'
    },
    {
      status: 'START_PLACE_CONFIRMATION_REQUIRED',
      title: '这是行政区域参考点，需要你确认',
      resolutionStatus: 'RESOLVED',
      alternatives: [{ name: '某区', granularity: 'ADMINISTRATIVE_REGION' }],
      expectedAction: 'data-action="confirm-region-reference"'
    },
    {
      status: 'PROVIDER_UNAVAILABLE',
      title: '高德地点服务暂时不可用',
      resolutionStatus: 'UNAVAILABLE',
      alternatives: [],
      expectedAction: 'data-action="retry-spatial-plan"'
    },
    {
      status: 'NO_NEARBY_CANDIDATES',
      title: '起点已确认，但附近没有通过校验的景点',
      resolutionStatus: 'RESOLVED',
      alternatives: [],
      expectedAction: 'data-action="retry-spatial-plan"'
    },
    {
      status: 'NO_FEASIBLE_NEARBY_ROUTE',
      title: '附近候选的路线未能通过核验或时间预算',
      resolutionStatus: 'RESOLVED',
      alternatives: [],
      expectedAction: 'data-action="retry-spatial-plan"'
    }
  ];

  try {
    for (const scenario of scenarios) {
      state.prompt = '我在某区域，限时6小时';
      state.trip = {
        id: 'pending-test', title: '附近规划待确认', subtitle: '需要核验地点', version: 1,
        constraints: { startPlace: '某区域', timeBudgetMinutes: 360 }, days: [],
        spatialPlan: {
          status: scenario.status, verified: false, message: '核验尚未完成。',
          placeResolution: { status: scenario.resolutionStatus, alternatives: scenario.alternatives }
        }
      };

      const html = planView();
      assert.ok(html.includes(scenario.title), scenario.status);
      assert.ok(html.includes(scenario.expectedAction), scenario.status);
      assert.match(html, /data-action="spatial-refine-form"/);
      assert.match(html, /当前未生成可执行行程/);
      assert.doesNotMatch(html, /共 0 天行程/);
      assert.doesNotMatch(html, /weather-query-note/);
    }
  } finally {
    state.trip = null;
    state.prompt = '';
  }
});
