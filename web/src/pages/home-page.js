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
    <style id="home-memory-dock-scoped-style">
      .home-memory-dock {
        margin: 0 0 18px 0;
        padding: 16px 20px;
        background: linear-gradient(135deg, #ffffff 0%, #fffdfa 55%, #fff7ed 100%);
        border: 1.5px solid rgba(234, 88, 12, 0.24);
        border-left: 5px solid #ea580c;
        border-radius: 16px;
        box-shadow: 0 6px 24px -4px rgba(194, 65, 12, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }
      .home-memory-dock.is-disabled {
        border-color: #e2e8f0;
        border-left-color: #94a3b8;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
      }
      .memory-dock-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      .memory-dock-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .memory-dock-icon {
        font-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%);
        box-shadow: 0 2px 6px rgba(234, 88, 12, 0.16);
        line-height: 1;
        flex-shrink: 0;
      }
      .is-disabled .memory-dock-icon {
        background: #e2e8f0;
        box-shadow: none;
        filter: grayscale(1);
      }
      .memory-dock-heading {
        font-size: 14.5px;
        font-weight: 800;
        color: #7c2d12;
        letter-spacing: -0.01em;
      }
      .is-disabled .memory-dock-heading {
        color: #64748b;
      }
      .memory-dock-badge {
        font-size: 11px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        line-height: 1.3;
      }
      .memory-dock-badge.badge-active {
        background: #ffedd5;
        color: #c2410c;
        border: 1px solid rgba(234, 88, 12, 0.28);
      }
      .memory-dock-badge.badge-inactive {
        background: #e2e8f0;
        color: #64748b;
        border: 1px solid #cbd5e1;
      }
      .memory-dock-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .memory-dock-switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px 4px 6px;
        background: #ffffff;
        border: 1.5px solid rgba(234, 88, 12, 0.32);
        border-radius: 999px;
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
        font-family: inherit;
        transition: all 0.2s ease;
        user-select: none;
      }
      .memory-dock-switch:hover {
        border-color: #ea580c;
        background: #fff7ed;
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(234, 88, 12, 0.15);
      }
      .memory-dock-switch:active {
        transform: scale(0.97);
      }
      .memory-dock-switch .switch-track {
        width: 32px;
        height: 18px;
        border-radius: 999px;
        background: #cbd5e1;
        position: relative;
        display: inline-block;
        transition: background-color 0.22s ease;
        flex-shrink: 0;
      }
      .memory-dock-switch.is-active .switch-track {
        background: linear-gradient(135deg, #ea580c, #c2410c);
      }
      .memory-dock-switch .switch-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        position: absolute;
        top: 2px;
        left: 2px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .memory-dock-switch.is-active .switch-thumb {
        transform: translateX(14px);
      }
      .memory-dock-switch .switch-label {
        font-size: 12.5px;
        font-weight: 700;
        color: #7c2d12;
      }
      .memory-dock-switch:not(.is-active) .switch-label {
        color: #64748b;
      }
      .memory-dock-switch .switch-status-tag {
        font-size: 11px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 999px;
        line-height: 1.3;
      }
      .memory-dock-switch .switch-status-tag.is-on {
        background: #ffedd5;
        color: #c2410c;
      }
      .memory-dock-switch .switch-status-tag.is-off {
        background: #e2e8f0;
        color: #64748b;
      }
      .memory-dock-link {
        font-size: 12px;
        font-weight: 700;
        color: #c2410c;
        text-decoration: none;
        padding: 5px 9px;
        border-radius: 8px;
        transition: all 0.18s ease;
        background: rgba(234, 88, 12, 0.05);
        border: 1px solid rgba(234, 88, 12, 0.15);
      }
      .memory-dock-link:hover {
        color: #ffffff;
        background: #ea580c;
        border-color: #ea580c;
        text-decoration: none;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(234, 88, 12, 0.25);
      }
      .memory-dock-prompt-box {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: #ffffff;
        border: 1px solid rgba(234, 88, 12, 0.22);
        border-radius: 12px;
        padding: 10px 14px;
        box-shadow: 0 1px 4px rgba(180, 83, 9, 0.04);
        transition: all 0.2s ease;
        cursor: pointer;
      }
      .memory-dock-prompt-box:hover {
        border-color: rgba(234, 88, 12, 0.45);
        background: #fffdfb;
        box-shadow: 0 3px 12px rgba(234, 88, 12, 0.08);
      }
      .memory-dock-prompt-box.is-muted {
        background: #f8fafc;
        border-color: #cbd5e1;
        opacity: 0.65;
        cursor: default;
      }
      .prompt-sparkle-icon {
        font-size: 16px;
        line-height: 1.55;
        flex-shrink: 0;
      }
      .memory-dock-prompt-text {
        font-size: 13.5px;
        line-height: 1.55;
        color: #292524;
        font-weight: 500;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: break-word;
      }
      .memory-dock-prompt-label {
        font-weight: 700;
        color: #9a3412;
        margin-right: 4px;
      }
      .memory-dock-prompt-box.is-muted .memory-dock-prompt-text {
        color: #64748b;
        text-decoration: line-through;
      }
      .memory-dock-prompt-box.is-muted .memory-dock-prompt-label {
        color: #94a3b8;
      }
      .memory-dock-hint {
        font-size: 12px;
        line-height: 1.5;
        color: #9a3412;
        background: rgba(254, 243, 199, 0.55);
        border: 1px solid rgba(245, 158, 11, 0.25);
        border-radius: 10px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .is-disabled .memory-dock-hint {
        background: #f1f5f9;
        border-color: #cbd5e1;
        color: #64748b;
      }
    </style>
    <section class="home-memory-dock ${useMemories ? 'is-enabled' : 'is-disabled'}" role="region" aria-label="专属旅行记忆与偏好">
      <div class="memory-dock-header">
        <div class="memory-dock-title">
          <span class="memory-dock-icon">🧠</span>
          <strong class="memory-dock-heading">专属旅行偏好已就绪</strong>
          <span class="memory-dock-badge ${useMemories ? 'badge-active' : 'badge-inactive'}">
            ${useMemories ? 'AI 前置提示词' : '本次已暂停'}
          </span>
        </div>
        <div class="memory-dock-actions">
          <button type="button" class="memory-dock-switch ${useMemories ? 'is-active' : ''}" data-action="toggle-use-memories" role="switch" aria-checked="${useMemories}" title="点击切换是否启用偏好">
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-label">是否启用偏好</span>
            <span class="switch-status-tag ${useMemories ? 'is-on' : 'is-off'}">${useMemories ? '已启用' : '已停用'}</span>
          </button>
          <a href="#" class="memory-dock-link" data-action="go" data-view="profile" title="管理或修改您的偏好与记忆">偏好管理 ↗</a>
        </div>
      </div>
      <div class="memory-dock-prompt-box ${useMemories ? '' : 'is-muted'}" title="${escapeHtml(promptText)}（点击前往档案编辑）" data-action="go" data-view="profile" role="button" tabindex="0">
        <span class="prompt-sparkle-icon">✨</span>
        <div class="memory-dock-prompt-text">
          <strong class="memory-dock-prompt-label">AI 规划前置提示词：</strong>${escapeHtml(promptText)}
        </div>
      </div>
      <div class="memory-dock-hint">
        ${useMemories
          ? '<span>💡 <strong>智能协同生效中</strong>：AI 将自动融入上述前置提示词推荐地道体验；若在下方输入了具体要求，以当次输入为最高优先级。</span>'
          : '<span>⏸️ <strong>已暂停参考前置偏好</strong>：本次将仅严格根据下方输入框要求为您规划，不附加任何历史偏好。</span>'
        }
      </div>
    </section>
  `;
}

export function homeView() {
  const planningBusy = state.planningRequestActive || state.loading;
  return `
    <main class="page shell">
      <section class="hero planner-home-hero">
        <div class="hero-content">
          <div class="eyebrow">AI ITINERARY STUDIO · 重庆</div>
          <h1>把山城的复杂，<br /><em>交给一份懂你的行程</em></h1>
          <p class="lede">说清这次出行的时间、同行人和节奏，悠悠会生成可执行草案；每一站都由你确认，也始终可以局部微调。</p>

          <div class="planner-trust-row"><span>36+ 精选景点资产</span><span>当前输入优先</span><span>确认后才修改行程</span></div>

          <div class="planner-flow" aria-label="AI 规划流程">
            <span><b>01</b>说说这次出行</span><i>→</i><span><b>02</b>生成路线草案</span><i>→</i><span><b>03</b>自由确认与微调</span>
          </div>

          <!-- 独立于输入框之外的专属偏好读取展台 -->
          ${homeMemoryPreferenceBannerHtml()}

          <div class="prompt-box">
            <div class="prompt-box-head"><strong>这次想怎么游？</strong><span>自然语言或快捷条件都可以</span></div>
            <textarea id="prompt-input" aria-label="旅行需求" placeholder="输入你想游玩的时间、同行人、体力偏好或具体需求（如：我在重邮，为我规划5小时旅游路线）...">${escapeHtml(state.prompt)}</textarea>
            <div class="prompt-footer">
              <span class="hint"><span class="hint-badge">优先原则</span> 本次输入始终最高优先 · 生成后每一站皆可自由微调</span>
              <button class="primary" data-action="plan" ${planningBusy ? 'disabled aria-busy="true"' : ''}>${planningBusy ? '正在准备规划…' : '开始 AI 智能规划'}</button>
            </div>
          </div>

          <!-- 懂你的 AI 智能画像快捷模版 -->
          <div class="smart-presets-wrap common-plan-library">
            <div class="library-head"><span class="presets-label">常用规划，从一个场景开始</span><span>可继续修改条件</span></div>
            <div class="presets-row">
              <button class="preset-badge" data-action="apply-preset" data-preset="elderly"><b>长辈省心游</b><small>少爬坡 · 文博 · 夜景</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="magic8d"><b>8D魔幻打卡</b><small>单轨 · 天桥 · 老火锅</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="couple"><b>情侣浪漫江夜</b><small>江岸 · 老街 · 清幽</small></button>
              <button class="preset-badge" data-action="apply-preset" data-preset="family"><b>亲子研学</b><small>科技馆 · 博物馆 · 轻松</small></button>
            </div>
          </div>

          <!-- 偏好状态机胶囊组：单选替换、多选切换，杜绝文字重复 -->
          <div class="preference-capsules">
            <div class="preference-capsules-head"><strong>补充这次出行条件</strong><span>仅用于当前方案；长期偏好可在「偏好与记忆」中管理</span></div>
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

        <div class="hero-visual">
          <div class="visual-tag">36+ 个重庆旅行资产</div>
          <div class="visual-route-board" aria-hidden="true">
            <span class="visual-route-line visual-route-line-a"></span>
            <span class="visual-route-line visual-route-line-b"></span>
            <span class="visual-route-point visual-route-point-a">渝中</span>
            <span class="visual-route-point visual-route-point-b">江北嘴</span>
            <span class="visual-route-point visual-route-point-c">南滨路</span>
            <span class="visual-route-label">AI 路线草案</span>
          </div>
          <div class="visual-caption">
            <strong>一张路线，装下山城的层次</strong>
            <span>景点、步行、天气与偏好，先生成草案，再由你确认。</span>
          </div>
        </div>
      </section>

      <section class="feature-strip">
        <div class="feature">
          <div class="feature-marker">01</div>
          <div>
            <strong>智能去重与多天规划</strong>
            <span>支持 1-4 天个性化组合，景点绝不重复，自动编排最佳游览次序。</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-marker">02</div>
          <div>
            <strong>高德多天轨迹交互</strong>
            <span>按天切换分色路线，站点时长与交通换乘一目了然，支持全屏沉浸地图。</span>
          </div>
        </div>
        <div class="feature">
          <div class="feature-marker">03</div>
          <div>
            <strong>自由增删与局部微调</strong>
            <span>随时添加/移除站点、灵活替换景区，行程随心而变。</span>
          </div>
        </div>
      </section>
    </main>
  `;
}
