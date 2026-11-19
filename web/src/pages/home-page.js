import { preferences, state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';

function inferCategory(m) {
  const c = String(m?.category || m?.type || '').toUpperCase();
  const text = String(m?.content || '');
  if (c.includes('FOOD') || c.includes('DINING') || /火锅|小吃|美食|饮食|麻辣|口味|微辣|江湖菜|少辣|清淡|面/.test(text)) {
    return { icon: '🍜', category: '饮食习惯' };
  }
  if (c.includes('PACE') || c.includes('WALK') || /步行|走路|爬坡|节奏|慢速|轻量|步数/.test(text)) {
    return { icon: '🚶', category: '体力节奏' };
  }
  if (c.includes('COMPANION') || /父母|长辈|孩子|亲子|朋友|情侣|家人|独自/.test(text)) {
    return { icon: '👥', category: '同行特点' };
  }
  if (c.includes('THEME') || /夜景|8D|魔幻|老街|江景|古镇|自然|拍照/.test(text)) {
    return { icon: '✨', category: '主题倾向' };
  }
  return { icon: '🎒', category: '旅行偏好' };
}

function cleanPrefLabel(label) {
  if (!label) return '';
  return label.replace(/^(饮食偏好|体力偏好|同行偏好|旅行偏好|口味偏好|偏好)[:：\s]*/, '');
}

function activeMemoryPreferenceItems() {
  const items = [];
  const diningSlots = Array.isArray(state.profile?.diningSlots) ? state.profile.diningSlots : [];
  for (const tag of diningSlots) {
    if (tag) items.push({ icon: '🍲', category: '美食偏好', label: tag });
  }
  const attractionSlots = Array.isArray(state.profile?.attractionSlots) ? state.profile.attractionSlots : [];
  for (const tag of attractionSlots) {
    if (tag) items.push({ icon: '🏙️', category: '景点偏好', label: tag });
  }
  const memories = Array.isArray(state.profile?.memories) ? state.profile.memories : [];
  for (const m of memories) {
    if (m && m.content) {
      const { icon, category } = inferCategory(m);
      if (!items.some((it) => it.label === m.content)) {
        items.push({ icon, category, label: m.content });
      }
    }
  }
  const prefs = Array.isArray(state.profile?.preferences) ? state.profile.preferences : [];
  for (const p of prefs) {
    const val = typeof p === 'string' ? p : (p?.value || p?.name || '');
    if (val && !items.some((it) => it.label === val)) {
      items.push({ icon: '⭐', category: '已设偏好', label: val });
    }
  }
  return items;
}

function getActivePrependPrompt() {
  const direct = String(state.profile?.profilePrependPrompt || '').trim();
  if (direct) return direct;

  const items = activeMemoryPreferenceItems();
  if (!items.length) return '';

  const diet = items.filter(it => it.category === '美食偏好' || it.category === '饮食习惯').map(it => cleanPrefLabel(it.label));
  const pace = items.filter(it => it.category === '体力节奏').map(it => cleanPrefLabel(it.label));
  const theme = items.filter(it => it.category === '景点偏好' || it.category === '主题倾向').map(it => cleanPrefLabel(it.label));
  const other = items.filter(it => !['美食偏好', '饮食习惯', '体力节奏', '景点偏好', '主题倾向'].includes(it.category)).map(it => cleanPrefLabel(it.label));

  const parts = [];
  if (diet.length) parts.push(`饮食偏好：${diet.join('、')}`);
  if (theme.length) parts.push(`场景偏好：${theme.join('、')}`);
  if (pace.length) parts.push(`体力节奏：${pace.join('、')}`);
  if (other.length) parts.push(`其他特点：${other.join('、')}`);

  return `【用户专属旅行偏好画像】${parts.join('；')}。`;
}

function homeMemoryPreferenceBannerHtml() {
  const promptText = getActivePrependPrompt();
  if (!promptText) return '';
  const useMemories = state.useMemoriesInPlan !== false;
  return `
    <section class="home-memory-dock ${useMemories ? 'is-enabled' : 'is-disabled'}" role="region" aria-label="专属旅行记忆与偏好">
      <div class="memory-dock-header">
        <div class="memory-dock-title">
          <span class="memory-dock-icon">🧠</span>
          <strong class="memory-dock-heading">专属旅行偏好已就绪</strong>
          <span class="memory-dock-badge ${useMemories ? 'badge-active' : 'badge-inactive'}">
            ${useMemories ? '本次参考' : '本次已暂停'}
          </span>
        </div>
        <div class="memory-dock-actions">
          <button type="button" class="memory-dock-switch ${useMemories ? 'is-active' : ''}" data-action="toggle-use-memories" role="switch" aria-checked="${useMemories}" title="点击切换参考已记住的偏好">
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label">参考已记住的偏好</span>
            <span class="switch-status-tag ${useMemories ? 'is-on' : 'is-off'}">${useMemories ? '已启用' : '已停用'}</span>
          </button>
          <a href="#" class="memory-dock-link" data-action="go" data-view="profile" title="管理或修改您的偏好与记忆">偏好管理 ↗</a>
        </div>
      </div>
      <button type="button" class="memory-dock-prompt-box ${useMemories ? '' : 'is-muted'}" title="${escapeHtml(promptText)}（点击前往档案编辑）" data-action="go" data-view="profile">
        <span class="prompt-sparkle-icon">✨</span>
        <div class="memory-dock-prompt-text">
          <strong class="memory-dock-prompt-label">偏好摘要：</strong>${escapeHtml(promptText)}
        </div>
      </button>
      <div class="memory-dock-hint">
        ${useMemories
          ? '<span>已参考你的旅行偏好；与本次要求冲突时，以本次输入为准。</span>'
          : '<span>本次已暂停参考历史偏好。</span>'
        }
      </div>
    </section>
  `;
}

export function homeView() {
  const planningBusy = state.planningRequestActive || state.loading;
  return `
    <main class="page shell home-page">
      <section class="planning-composer" aria-label="定制我的行程">
        <header class="composer-heading"><div><h1>规划重庆行程</h1><p>写下旅行想法，生成可继续调整的每日路线。</p></div></header>
        <div class="planner-compose-grid">

          <div class="planner-compose-main">
          <div class="prompt-box">
            <div class="prompt-box-head"><strong>这次想怎么游？</strong><span>时间、同行人、想去的地方，都可以告诉我</span></div>
            <textarea id="prompt-input" aria-label="旅行需求" placeholder="例如：周末带父母来重庆两天，想看江景、吃本地菜，尽量少爬坡。">${escapeHtml(state.prompt)}</textarea>
            <div class="prompt-footer">
              <span class="hint">先生成草案，再由你确认和调整</span>
              <button class="primary" data-action="plan" ${planningBusy ? 'disabled aria-busy="true"' : ''}>${planningBusy ? '正在准备规划…' : '生成我的行程 →'}</button>
            </div>
          </div>

          ${homeMemoryPreferenceBannerHtml()}
          <div class="smart-presets-wrap common-plan-library">
            <div class="library-head"><span class="presets-label">从常用场景开始</span></div>
            <div class="presets-row">
              <button class="preset-badge" data-action="apply-preset" data-preset="elderly"><b>长辈省心游</b><small>少爬坡 · 文博 · 夜景</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="magic8d"><b>8D魔幻打卡</b><small>单轨 · 天桥 · 老火锅</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="couple"><b>情侣浪漫江夜</b><small>江岸 · 老街 · 清幽</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="family"><b>亲子研学</b><small>科技馆 · 博物馆 · 轻松</small></button>
            </div>
          </div>

          </div>
          <div class="preference-capsules">
            <div class="preference-capsules-head"><strong>让行程更合心意</strong><span>可选 · 仅用于本次旅行</span></div>
            <div class="capsule-group">
              <span class="capsule-label">游玩天数</span>
              <div class="capsule-list">
                ${['1天速览', '2天经典', '3天深度', '4天全景'].map((item) => `
                  <button class="pref-chip ${preferences.duration === item ? 'active' : ''}" data-action="toggle-pref" data-category="duration" data-value="${item}">${item}</button>
                `).join('')}
              </div>
            </div>

            <div class="capsule-group">
              <span class="capsule-label">同行人员</span>
              <div class="capsule-list">
                ${['独自出发', '情侣双人', '带父母', '亲子家庭', '朋友结伴'].map((item) => `
                  <button class="pref-chip ${preferences.companions === item ? 'active' : ''}" data-action="toggle-pref" data-category="companions" data-value="${item}">${item === '带父母' ? '长辈同行' : item}</button>
                `).join('')}
              </div>
            </div>

            <div class="capsule-group">
              <span class="capsule-label">步行节奏</span>
              <div class="capsule-list">
                ${['少走路', '经典适中', '深度打卡'].map((item) => `
                  <button class="pref-chip ${preferences.pace === item ? 'active' : ''}" data-action="toggle-pref" data-category="pace" data-value="${item}">${item === '少走路' ? '轻松少走台阶' : item}</button>
                `).join('')}
              </div>
            </div>

            <div class="capsule-group">
              <span class="capsule-label">出行方式</span>
              <div class="capsule-list">
                ${['轻轨地铁优先', '公交优先', '打车为主'].map((item) => `
                  <button class="pref-chip ${preferences.transport === item ? 'active' : ''}" data-action="toggle-pref" data-category="transport" data-value="${item}">${item}</button>
                `).join('')}
              </div>
            </div>

            <div class="capsule-group">
              <span class="capsule-label">餐饮风味</span>
              <div class="capsule-list">
                ${['九宫格老火锅', '地道江湖菜', '街头小吃小面', '清淡不辣', '本地菜优先'].map((item) => `
                  <button class="pref-chip ${preferences.dining.has(item) ? 'active' : ''}" data-action="toggle-pref" data-category="dining" data-value="${item}">${item}</button>
                `).join('')}
              </div>
            </div>

            <div class="capsule-group">
              <span class="capsule-label">体验主题</span>
              <div class="capsule-list">
                ${['8D魔幻', '山城夜景', '人文历史', '市井烟火', '自然奇观', '天然温泉'].map((item) => `
                  <button class="pref-chip ${preferences.themes.has(item) ? 'active' : ''}" data-action="toggle-pref" data-category="themes" data-value="${item}">${item}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}
