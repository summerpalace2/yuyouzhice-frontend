import { escapeHtml } from '../../shared/lib/security.js';

export function slots(constraints = {}, editing = false) {
  const origins = constraints.originByField || {};
  const hasMemories = Object.values(origins).some((v) => v === 'PREFERENCE');

  const memoryTag = (field) => origins[field] === 'PREFERENCE'
    ? ' <span style="font-size: 10.5px; background: #e0e7ff; color: #3730a3; padding: 1px 6px; border-radius: 4px; margin-left: 6px; font-weight: 600;">🧠 长期记忆</span>'
    : '';

  const rows = [];
  if (constraints.startPlace) {
    rows.push(['起', constraints.startPlace, '出发起点 / 附近动态范围', '']);
  }
  rows.push(
    ['人', constraints.companions || '未提供', '同行人与出行特点', memoryTag('companions')],
    ['时', `${constraints.arrivalAt || '未提供'} → ${constraints.departureAt || '未提供'}`, `${constraints.durationDays || 1} 天节奏 · ${constraints.timeBudgetMinutes ? `${constraints.timeBudgetMinutes}分钟短途` : '弹性可调'}`, ''],
    ['趣', (constraints.interests && constraints.interests.length ? constraints.interests : ['城市', '人文', '夜景']).join(' + '), '兴趣偏好', memoryTag('interests')],
    ['步', constraints.walkingTolerance === '低' ? '少走路优先' : '正常步行', `${constraints.transportPreference || '路线待计算'}`, memoryTag('walkingTolerance') || memoryTag('transportPreference')],
    ['住', constraints.stayArea || '未提供', '住宿区域影响出发衔接', memoryTag('stayArea')],
    ['食', constraints.dietPreference || '未提供', '餐饮策略', memoryTag('dietPreference')],
    ['钱', constraints.budget || '未提供', '预算策略', memoryTag('budget')]
  );

  if (!editing) {
    return `
      <aside class="panel constraint-slot-panel">
        <div class="panel-pad">
          <div class="panel-title-row">
            <div class="panel-title">已识别的旅行条件</div>
            <button class="ghost" data-action="edit-constraints">修改条件</button>
          </div>
          ${hasMemories ? `
            <div class="memory-applied-banner" style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: #3730a3;">
              <span style="font-weight: 600; display: flex; align-items: center; gap: 6px;">🧠 已融合个性化长期记忆</span>
              <a href="#" data-action="go" data-view="profile" style="color: #4f46e5; text-decoration: none; font-size: 11.5px; font-weight: 600;">管理记忆 →</a>
            </div>
          ` : ''}
          ${rows.map(([mark, title, note, tag]) => `
            <div class="slot">
              <div class="slot-mark">${escapeHtml(mark)}</div>
              <div>
                <strong>${escapeHtml(title)}${tag || ''}</strong>
                <span>${escapeHtml(note)}</span>
              </div>
            </div>
          `).join('')}
          <div class="constraint-source">点击修改条件可直接重新生成定制行程。</div>
        </div>
      </aside>
    `;
  }

  const interestValue = (constraints.interests || []).join('、');
  const duration = Number(constraints.durationDays) || 1;
  const timeBudget = Number(constraints.timeBudgetMinutes) || 0;

  return `
    <aside class="panel constraint-slot-panel">
      <form class="panel-pad constraint-form" id="constraint-form" data-action="constraints-form">
        <div class="panel-title-row">
          <div class="panel-title">修改旅行条件</div>
          <button type="button" class="ghost" data-action="cancel-constraints">取消</button>
        </div>
        <label>出发起点（留空则为全市规划）
          <input name="startPlace" value="${escapeHtml(constraints.startPlace || '')}" placeholder="如：重庆交通大学、解放碑、重庆北站" />
        </label>
        <label>行程天数
          <select name="durationDays">
            <option value="1" ${duration === 1 ? 'selected' : ''}>1天速览</option>
            <option value="2" ${duration === 2 ? 'selected' : ''}>2天经典</option>
            <option value="3" ${duration === 3 ? 'selected' : ''}>3天深度</option>
            <option value="4" ${duration === 4 ? 'selected' : ''}>4天全景</option>
            <option value="5" ${duration === 5 ? 'selected' : ''}>5天全景</option>
          </select>
        </label>
        <label>短途可用时间（周边游推荐）
          <select name="timeBudgetMinutes">
            <option value="0" ${timeBudget === 0 ? 'selected' : ''}>全天 / 默认天数节奏</option>
            <option value="120" ${timeBudget === 120 ? 'selected' : ''}>约 2 小时短途</option>
            <option value="180" ${timeBudget === 180 ? 'selected' : ''}>约 3 小时短途</option>
            <option value="240" ${timeBudget === 240 ? 'selected' : ''}>约 4 小时半日游</option>
            <option value="360" ${timeBudget === 360 ? 'selected' : ''}>约 6 小时大半天</option>
          </select>
        </label>
        <label>同行人
          <select name="companions">
            <option value="独自出发" ${constraints.companions === '独自出发' ? 'selected' : ''}>独自出发</option>
            <option value="情侣双人" ${constraints.companions === '情侣双人' ? 'selected' : ''}>情侣双人</option>
            <option value="带父母" ${constraints.companions === '带父母' ? 'selected' : ''}>带父母长辈</option>
            <option value="亲子家庭" ${constraints.companions === '亲子家庭' ? 'selected' : ''}>亲子家庭</option>
            <option value="朋友结伴" ${constraints.companions === '朋友结伴' ? 'selected' : ''}>朋友结伴</option>
          </select>
        </label>
        <label>步行强度
          <select name="walkingTolerance">
            <option value="低" ${constraints.walkingTolerance === '低' ? 'selected' : ''}>低 · 少走路</option>
            <option value="正常" ${constraints.walkingTolerance !== '低' ? 'selected' : ''}>正常</option>
          </select>
        </label>
        <label>体验主题与兴趣（顿号或逗号分隔）
          <input name="interests" value="${escapeHtml(interestValue)}" placeholder="如：自然奇观、人文历史、山城夜景、8D魔幻" />
        </label>
        <label>出行方式
          <select name="transportPreference">
            <option value="未提供" ${!constraints.transportPreference || constraints.transportPreference === '未提供' ? 'selected' : ''}>未指定</option>
            <option value="轻轨优先" ${constraints.transportPreference === '轻轨优先' || constraints.transportPreference === '地铁优先' ? 'selected' : ''}>轻轨/地铁优先</option>
            <option value="公交优先" ${constraints.transportPreference === '公交优先' ? 'selected' : ''}>公交优先</option>
            <option value="打车优先" ${constraints.transportPreference === '打车优先' ? 'selected' : ''}>打车为主</option>
            <option value="步行优先" ${constraints.transportPreference === '步行优先' ? 'selected' : ''}>步行漫游</option>
          </select>
        </label>
        <label>饮食偏好
          <select name="dietPreference">
            <option value="未提供" ${!constraints.dietPreference || constraints.dietPreference === '未提供' ? 'selected' : ''}>未指定</option>
            <option value="重庆火锅" ${constraints.dietPreference === '重庆火锅' ? 'selected' : ''}>九宫格老火锅</option>
            <option value="地道江湖菜" ${constraints.dietPreference === '地道江湖菜' ? 'selected' : ''}>地道江湖菜</option>
            <option value="街头小吃" ${constraints.dietPreference === '街头小吃' ? 'selected' : ''}>街头小吃小面</option>
            <option value="本地菜优先" ${constraints.dietPreference === '本地菜优先' ? 'selected' : ''}>本地菜优先</option>
            <option value="清淡" ${constraints.dietPreference === '清淡' ? 'selected' : ''}>清淡</option>
          </select>
        </label>
        <label>住宿区域<input name="stayArea" value="${escapeHtml(constraints.stayArea || '')}" placeholder="如：解放碑、观音桥、南滨路" /></label>
        <label>到达时间<input name="arrivalAt" value="${escapeHtml(constraints.arrivalAt || '')}" placeholder="如：周六下午" /></label>
        <label>离开时间<input name="departureAt" value="${escapeHtml(constraints.departureAt || '')}" placeholder="如：周日晚上" /></label>
        <label>预算<input name="budget" value="${escapeHtml(constraints.budget || '')}" placeholder="如：有限、舒适" /></label>
        <button class="primary constraint-submit" type="submit">按新条件重新规划</button>
      </form>
    </aside>
  `;
}

export function constraintValues(form) {
  const data = new FormData(form);
  const durationDays = parseInt(data.get('durationDays'), 10) || 1;
  const timeBudgetMinutes = parseInt(data.get('timeBudgetMinutes'), 10) || 0;
  const startPlace = String(data.get('startPlace') || '').trim();

  return {
    startPlace,
    durationDays,
    timeBudgetMinutes: timeBudgetMinutes > 0 ? timeBudgetMinutes : 0,
    arrivalAt: String(data.get('arrivalAt') || '').trim(),
    departureAt: String(data.get('departureAt') || '').trim(),
    companions: String(data.get('companions') || '').trim(),
    walkingTolerance: String(data.get('walkingTolerance') || '正常').trim(),
    budget: String(data.get('budget') || '').trim(),
    stayArea: String(data.get('stayArea') || '').trim(),
    transportPreference: String(data.get('transportPreference') || '').trim(),
    dietPreference: String(data.get('dietPreference') || '').trim(),
    interests: String(data.get('interests') || '')
      .split(/[、,， ]/)
      .map((item) => item.trim())
      .filter(Boolean)
  };
}
