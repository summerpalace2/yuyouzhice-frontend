import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../../app-core/state.js';
import { handleProfileAction } from './profile-action-handler.js';
import { profileView } from '../../pages/profile-page.js';

test('profileView renders AI Prepend Planning Prompt editor and 7-day memory stream', () => {
  state.user = { id: 'user-1', name: '测试用户' };
  state.profile = {
    user: state.user,
    profilePrependPrompt: '【旅行偏好画像】偏好地道老火锅与老茶馆；节奏从容。',
    userCustomizedPrompt: '偏好老火锅与老茶馆',
    memoryEnabled: true,
    trips: [],
    preferenceHistory: [],
    memories: [
      { id: 'm-1', content: '偏好老火锅', category: 'DIET', updatedAt: Date.now() },
      { id: 'm-2', content: '喜欢老茶馆', category: 'DIET', updatedAt: Date.now() },
      { id: 'm-3', content: '少爬坡少走台阶', category: 'PACE', updatedAt: Date.now() },
      { id: 'm-4', content: '偏爱山城夜景', category: 'INTEREST', updatedAt: Date.now() },
      { id: 'm-5', content: '公共交通优先', category: 'TRANSPORT', updatedAt: Date.now() }
    ]
  };
  state.memoriesExpanded = false;

  const html = profileView();

  // 1. 左侧包含 AI 规划前置提示词面板及编辑器
  assert.ok(html.includes('我的旅行偏好摘要'), 'Should include AI planning prepend prompt title');
  assert.ok(html.includes('id="prepend-prompt-editor"'), 'Should include textarea editor');
  assert.ok(html.includes('偏好地道老火锅与老茶馆'), 'Should render current prompt content');
  assert.ok(html.includes('data-action="save-prepend-prompt"'), 'Should have save button');
  assert.ok(html.includes('data-action="resynthesize-prepend-prompt"'), 'Should have resynthesize button');

  // 2. 右侧为 7 天滚动流，彻底废除 12 小时限制文案
  assert.ok(html.includes('最近 7 天'), 'Should mention 7-day rolling stream');
  assert.ok(!html.includes('同一账号至少间隔 12 小时'), 'Should NOT have the obsolete 12-hour limitation text');

  // 3. 折叠按类别而非来源计数；同一饮食类别的两条来源一起显示。
  assert.ok(html.includes('展开其余 1 类偏好'), 'Should show expand toggle button when collapsed');
  assert.ok(html.includes('喜欢老茶馆'), 'Same-category sources must not be hidden by the category fold');

  // 4. 展开模式下展示收起按钮
  state.memoriesExpanded = true;
  const expandedHtml = profileView();
  assert.ok(expandedHtml.includes('收起部分记忆'), 'Should show collapse button when expanded');
});

test('handleProfileAction save-prepend-prompt saves prompt to backend and updates profile state', async () => {
  state.user = { id: 'user-1' };
  state.profile = { profilePrependPrompt: '旧提示词' };

  let requestedUrl = '';
  let requestBody = null;
  let toastMsg = '';

  // 创建 mock DOM textarea
  const fakeEditor = { value: '酒店希望安静' };
  globalThis.document = {
    querySelector: (sel) => (sel === '#prepend-prompt-editor' ? fakeEditor : null),
    querySelectorAll: () => []
  };

  const handled = await handleProfileAction({
    action: 'save-prepend-prompt',
    target: {},
    state,
    request: async (url, opts) => {
      requestedUrl = url;
      requestBody = JSON.parse(opts.body);
      return { ok: true, prependPrompt: '自动偏好：清淡；手动备注：酒店希望安静', userCustomizedPrompt: requestBody.prependPrompt };
    },
    toast: (msg) => { toastMsg = msg; },
    refreshProfileInDOM: () => {},
    refreshProfileMemoryInDOM: () => false,
    refreshProfileSlotsInDOM: () => false
  });

  assert.equal(handled, true);
  assert.equal(requestedUrl, '/api/preferences/prepend-prompt');
  assert.equal(requestBody.action, 'save');
  assert.equal(requestBody.prependPrompt, '酒店希望安静');
  assert.equal(state.profile.profilePrependPrompt, '自动偏好：清淡；手动备注：酒店希望安静');
  assert.equal(state.profile.userCustomizedPrompt, '酒店希望安静');
  assert.ok(toastMsg.includes('手动备注已保存'));
});

test('handleProfileAction toggle-expand-memories toggles memoriesExpanded state', async () => {
  state.memoriesExpanded = false;
  let refreshed = false;

  const handled = await handleProfileAction({
    action: 'toggle-expand-memories',
    target: {},
    state,
    request: async () => ({}),
    toast: () => {},
    refreshProfileInDOM: () => { refreshed = true; },
    refreshProfileMemoryInDOM: () => false,
    refreshProfileSlotsInDOM: () => false
  });

  assert.equal(handled, true);
  assert.equal(state.memoriesExpanded, true);
  assert.equal(refreshed, true);
});

test('homeView exposes the complete preference summary and an accessible opt-out switch', async () => {
  const { homeView } = await import('../../pages/home-page.js');
  state.useMemoriesInPlan = true;
  state.profile = {
    profilePrependPrompt: '【用户专属旅行偏好画像】饮食偏好：老茶馆、地道重庆火锅；出行场景：偏爱山城夜景与室内场馆；节奏从容，少爬坡少走台阶。'
  };

  const html = homeView();

  // 1. 横幅标题与徽标
  assert.ok(html.includes('专属旅行偏好已就绪'), 'Should contain banner title');
  assert.ok(html.includes('本次参考'), 'Should indicate preferences are used for this trip');

  // 2. 核心内容为前置提示词展示框
  assert.ok(html.includes('class="memory-dock-prompt-box'), 'Should contain prompt box instead of chip cloud');
  assert.ok(html.includes('偏好摘要：'), 'Should contain label');
  assert.ok(html.includes('老茶馆、地道重庆火锅'), 'Should render the prompt text');

  // The redesigned banner shows full content and preserves the user's opt-out.
  assert.ok(html.includes(state.profile.profilePrependPrompt));
  assert.match(html, /role="switch" aria-checked="true"/);
  state.useMemoriesInPlan = false;
  assert.match(homeView(), /role="switch" aria-checked="false"/);
  state.useMemoriesInPlan = true;
});
