import test from 'node:test';
import assert from 'node:assert/strict';
import { stopCard } from './stop-card.js';
import { state } from '../../app-core/state.js';

test('scenic stop card renders start time badge', () => {
  state.selectedStopId = null;
  state.pinnedStopIds = new Set();
  const scenicStop = {
    id: 'scenic-1',
    venueId: 'cq-hongyadong',
    name: '洪崖洞民俗风貌区',
    district: '渝中区',
    time: '19:30',
    duration: '约 90 分钟',
    type: 'SCENIC',
    icon: '景',
    summary: '重庆地标吊脚楼夜景',
    recommendationReason: '经典城市夜景打卡地'
  };

  const html = stopCard(scenicStop, 1, 1);
  assert.ok(html.includes('🕒 19:30'), 'Scenic stop card MUST render its start time');
  assert.ok(html.includes('🏛️ 文旅地标'), 'Scenic stop card MUST have scenic badge');
  assert.ok(html.includes('⏳ 建议游玩 约 90 分钟'), 'Scenic stop card MUST render duration');
});

test('dining stop card (lunch/dinner) omits start time badge to prevent awkward timestamps like 16:00', () => {
  state.selectedStopId = null;
  state.pinnedStopIds = new Set();
  const lunchStop = {
    id: 'dining-lunch-1',
    venueId: 'dining-cq-1',
    name: '【午餐推荐】十里香老菜馆',
    district: '沙坪坝区',
    time: '16:21', // Delay caused slot to push to 16:21
    duration: '约 60 分钟',
    type: 'DINING',
    icon: '餐',
    specialtyDish: '毛血旺、歌乐山辣子鸡',
    summary: '地道巴渝风味料理',
    recommendationReason: '就近步行即达'
  };

  const html = stopCard(lunchStop, 1, 2);
  assert.ok(!html.includes('🕒 16:21'), 'Dining stop card MUST NOT render rigid start time badge');
  assert.ok(!html.includes('🕒'), 'Dining stop card MUST NOT contain 🕒 clock icon');
  assert.ok(html.includes('【午餐推荐】十里香老菜馆'), 'Dining stop card MUST preserve lunch recommendation name');
  assert.ok(html.includes('🥢 餐饮赏味'), 'Dining stop card MUST render dining badge');
  assert.ok(html.includes('📍 沙坪坝区'), 'Dining stop card MUST display location/district');
  assert.ok(html.includes('⏳ 建议用餐 约 60 分钟'), 'Dining stop card MUST render dining duration');
  assert.ok(html.includes('🥢 必尝招牌：'), 'Dining stop card MUST render specialty dish');
  assert.ok(html.includes('毛血旺、歌乐山辣子鸡'), 'Dining stop card MUST display specialty dish name');
  assert.ok(html.includes('选中此餐'), 'Dining stop card MUST render dining-specific action button');
});
