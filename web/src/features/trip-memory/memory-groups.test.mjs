import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../../app-core/state.js';
import { profileView } from '../../pages/profile-page.js';

test('甜食同义项汇总一次，甜口辣口放同一饮食类别，保留所有来源及独立编辑删除', () => {
  state.user = { id: 'test-user' };
  state.memoriesExpanded = true;
  state.profile = { memoryEnabled: true, memories: [
    { id: 'sweet-new', category: 'DIET', content: '偏好甜品糖水', preferenceKey: 'SWEET', preferenceSummary: '喜欢甜口、甜品与糖水', sourceRef: '我想吃点甜食的' },
    { id: 'culture', category: 'INTEREST', content: '偏好人文历史' },
    { id: 'sweet-old', category: 'DIET', content: '偏好甜品糖水与特色甜点', preferenceKey: 'SWEET', preferenceSummary: '喜欢甜口、甜品与糖水', sourceRef: '我想吃点甜食' },
    { id: 'spicy', category: 'DIET', content: '饮食偏好辣味，喜欢吃辣', preferenceKey: 'SPICY', preferenceSummary: '喜欢辣口', sourceRef: '我想吃点辣' },
    { id: 'allergy', category: 'DIET', content: '喜欢甜品，但对花生过敏' }
  ] };
  const html = profileView();
  assert.equal((html.match(/class="travel-memory-category">饮食习惯</g) || []).length, 1);
  assert.equal((html.match(/class="travel-memory-content">喜欢甜口、甜品与糖水</g) || []).length, 1);
  assert.ok(html.includes('喜欢辣口'));
  assert.ok(html.includes('喜欢甜品，但对花生过敏'));
  assert.ok(html.includes('偏好人文历史'));
  for (const id of ['sweet-new', 'sweet-old', 'spicy', 'allergy']) {
    assert.match(html, new RegExp(`data-action="edit-travel-memory" data-id="${id}"`));
    assert.match(html, new RegExp(`data-action="delete-travel-memory" data-id="${id}"`));
  }
  assert.ok(html.includes('我想吃点甜食的'));
  assert.ok(html.includes('我想吃点甜食'));
});

test('缺少语义投影时保持原文，不把不同忌口或未知食品直接合并', () => {
  state.user = { id: 'test-user' };
  state.memoriesExpanded = true;
  state.profile = { memories: [
    { id: 'a', category: 'DIET', content: '不喜欢甜食' },
    { id: 'b', category: 'DIET', content: '只吃无糖甜品' },
    { id: 'c', category: 'DIET', content: '喜欢驴肉火烧' }
  ] };
  const html = profileView();
  assert.equal((html.match(/class="travel-memory-category">饮食习惯</g) || []).length, 1);
  for (const text of ['不喜欢甜食', '只吃无糖甜品', '喜欢驴肉火烧']) assert.ok(html.includes(text));
});
