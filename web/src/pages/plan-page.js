import { state } from '../app-core/state.js';
import { slots } from '../features/trip-planning/slots-form.js';
import { stopCard, weatherBadge, sanitizePunctuation } from '../entities/trip/stop-card.js';
import { escapeHtml } from '../shared/lib/security.js';

function spatialStatusTitle(status, resolutionStatus) {
  if (resolutionStatus === 'UNAVAILABLE' || status === 'PROVIDER_UNAVAILABLE') return '高德地点服务暂时不可用';
  switch (status) {
    case 'START_PLACE_MISSING': return '还缺少可核验的出发地点';
    case 'START_PLACE_AMBIGUOUS': return '找到多个可能地点，请选定一个';
    case 'START_PLACE_NOT_FOUND': return '高德没有确认这个地点';
    case 'START_PLACE_CONFIRMATION_REQUIRED': return '这是行政区域参考点，需要你确认';
    case 'START_PLACE_COORDINATE_MISSING': return '地点已匹配，但没有可用于路线的坐标';
    case 'NO_NEARBY_CANDIDATES': return '起点已确认，但附近没有通过校验的景点';
    case 'NO_FEASIBLE_NEARBY_ROUTE': return '附近候选的路线未能通过核验或时间预算';
    case 'TIME_SCOPE_CONFLICT': return '时间条件存在冲突，需要重新确认';
    default: return '尚未生成可执行行程';
  }
}

function spatialRecoveryPanel(trip) {
  const spatial = trip.spatialPlan;
  if (!spatial || spatial.verified !== false) return '';
  const resolution = spatial.placeResolution || {};
  const candidates = Array.isArray(resolution.alternatives) ? resolution.alternatives : [];
  const status = String(spatial.status || '');
  const canRetry = ['PROVIDER_UNAVAILABLE', 'NO_FEASIBLE_NEARBY_ROUTE', 'NO_NEARBY_CANDIDATES'].includes(status);
  const candidateActions = candidates.map((candidate, index) => {
    const title = candidate.name || candidate.address || '地图候选';
    const details = [candidate.district, candidate.address].filter(Boolean).join(' · ');
    if (candidate.granularity === 'ADMINISTRATIVE_REGION' && status === 'START_PLACE_CONFIRMATION_REQUIRED') {
      return `<div class="spatial-candidate-row">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details || '高德行政区域参考点；不是精确 POI')}</span></div>
        <button class="secondary" type="button" data-action="confirm-region-reference" data-candidate-index="${index}">确认以区域参考点继续</button>
      </div>`;
    }
    if (candidate.providerPlaceId) {
      return `<div class="spatial-candidate-row">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details || '高德返回的地点候选')}</span></div>
        <button class="secondary" type="button" data-action="select-place-candidate" data-candidate-index="${index}">选择并重新核验</button>
      </div>`;
    }
    return `<div class="spatial-candidate-row is-informational"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details || '缺少精确地图地点 ID，请用下方输入补充')}</span></div></div>`;
  }).join('');

  return `
    <div class="spatial-recovery" role="alert" aria-live="polite">
      <div class="spatial-recovery-heading">
        <span class="spatial-recovery-icon" aria-hidden="true">!</span>
        <div><strong>${escapeHtml(spatialStatusTitle(status, resolution.status))}</strong>
          <p>${escapeHtml(spatial.message || trip.summary || '请补充或确认地点后继续。')}</p></div>
      </div>
      ${candidateActions ? `<div class="spatial-candidate-list" aria-label="高德地点候选">${candidateActions}</div>` : ''}
      ${canRetry ? `<button class="secondary" type="button" data-action="retry-spatial-plan">按原条件重新查询</button>` : ''}
      <form class="spatial-refine-form" data-action="spatial-refine-form">
        <label for="spatial-refine-prompt">补充或修正本次地点条件</label>
        <textarea id="spatial-refine-prompt" name="prompt" rows="3" maxlength="2000" required>${escapeHtml(state.prompt || '')}</textarea>
        <div class="spatial-refine-footer"><span>原始需求保留；本次时间预算等已识别条件会继续沿用。</span>
          <button class="primary" type="submit">按修改后的输入重新规划</button></div>
      </form>
    </div>
  `;
}


function userLocationRowHtml() {
  if (!state.userLocation) return '';
  return `
    <div class="intel-row user-location-row" data-user-location-row>
      <strong>我的相对位置</strong>
      <p>当前设备坐标：${state.userLocation.coordinates[0].toFixed(4)}, ${state.userLocation.coordinates[1].toFixed(4)}（${escapeHtml(state.userLocation.distanceText || '已标出相对位置')}）</p>
    </div>
  `;
}

/**
 * 天气和定位只影响行程页中的少数节点。避免后台实时刷新重新挂载整个规划页、地图和聊天面板。
 */
export function refreshPlanningDynamicInDOM() {
  if (state.view !== 'planning' || !state.trip) return false;
  const refreshButton = document.querySelector('[data-dynamic-refresh-button]');
  if (refreshButton) {
    refreshButton.disabled = Boolean(state.dynamicRefreshing);
    refreshButton.textContent = state.dynamicRefreshing ? '刷新实时信息中…' : '刷新天气';
  }
  state.trip.days.forEach((day) => {
    const badge = document.querySelector(`[data-weather-day="${day.day}"]`);
    if (badge) badge.innerHTML = weatherBadge(day);
  });
  return true;
}

export function refreshPlanningLocationInDOM() {
  if (state.view !== 'planning' || !state.trip) return false;
  const button = document.querySelector('[data-location-button]');
  if (button) {
    button.textContent = state.locating ? '定位中...' : (state.userLocation ? '已定位' : '我的定位');
    button.classList.toggle('active', Boolean(state.userLocation));
    button.disabled = Boolean(state.locating);
  }
  document.querySelector('[data-user-location-row]')?.remove();
  if (state.userLocation) {
    document.querySelector('.map-intel-card .intel-header')?.insertAdjacentHTML('afterend', userLocationRowHtml());
  }
  return true;
}

export function refreshPlanningConstraintsInDOM() {
  if (state.view !== 'planning' || !state.trip) return false;
  const mount = document.getElementById('constraint-slot-mount');
  if (!mount) return false;
  mount.innerHTML = slots(state.trip.constraints, state.constraintEditing);
  return true;
}

export function planView() {
  if (!state.trip) {
    return `
      <main class="page shell">
        <div class="panel trip-empty">
          <div>
            <div class="empty-symbol">行</div>
            <h2>还没有行程草稿</h2>
            <p class="muted">先从首页输入你的重庆旅行需求并开始规划。</p>
            <button class="primary" data-action="go" data-view="home">返回首页开始规划</button>
          </div>
        </div>
      </main>
    `;
  }

  const trip = state.trip;
  const tripDays = Array.isArray(trip.days) ? trip.days : [];
  const mapStops = tripDays.flatMap((day) => Array.isArray(day.stops) ? day.stops : []).filter((stop) => stop.location);
  const totalDays = tripDays.length;
  const currentRouteStatus = state.routeDataStatus || trip.routeDataStatus || 'ESTIMATED';

  return `
    <main class="page shell">
      <div class="section-title">
        <div>
          <div class="eyebrow">专属定制方案 · 可自由微调</div>
          <h2>${escapeHtml(trip.title)}</h2>
          <p>
            ${escapeHtml(sanitizePunctuation(trip.subtitle))} · 第 ${trip.version} 版
            ${currentRouteStatus === 'ESTIMATED' ? '<span class="planner-version-pill" style="margin-left:8px;">部分通行时间建议出发前确认</span>' : ''}
          </p>
        </div>
        <div class="section-actions">
          <button class="secondary" data-action="refresh-dynamic" data-dynamic-refresh-button ${state.dynamicRefreshing ? 'disabled' : ''} title="仅支持高德可返回预报日期；日期必须是有效的行程日期，景点级天气仍以当地实况为准">${state.dynamicRefreshing ? '刷新实时信息中…' : '刷新天气'}</button>
          <button class="secondary" data-action="feedback-open">写封反馈</button>
          <button class="primary" data-action="save" ${state.savingTrip ? 'disabled aria-busy="true"' : ''}>${state.savingTrip ? '保存中…' : '保存行程'}</button>
        </div>
      </div>

      ${state.planRequestError ? `
        <div class="spatial-plan-notice is-blocked" role="alert">
          <strong>这次没有生成新方案，当前仍是上一次的行程草稿</strong>
          <span>${escapeHtml(state.planRequestError.message || '请求暂时未完成。')} 请返回首页重试；旧草稿没有被覆盖。</span>
        </div>
      ` : ''}

      <div class="workspace-grid">
        <div id="constraint-slot-mount">${slots(trip.constraints, state.constraintEditing)}</div>

        <section class="panel">
          <div class="plan-header">
            <div>
              <h2>行程安排详情</h2>
              <p>${totalDays > 0 ? `共 ${totalDays} 天行程 · 已自动去重与路线优化` : '当前未生成可执行行程；请先完成地点或路线核验。'}</p>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              ${totalDays === 0 ? '<span class="planner-version-pill">等待地点 / 路线确认</span>' : `<span class="status-pill">${currentRouteStatus === 'ESTIMATED' ? '出行前确认路线' : '路线信息已更新'}</span>`}
              ${totalDays > 0 && currentRouteStatus === 'ESTIMATED' ? '<span class="planner-version-pill">路线待确认</span>' : ''}
            </div>
          </div>

          ${trip.spatialPlan?.verified === false ? spatialRecoveryPanel(trip) : trip.spatialPlan?.fillStatus === 'UNDERFILLED' ? `
            <div class="spatial-plan-notice is-partial" role="status">
              <strong>附近行程未排满</strong>
              <span>${escapeHtml(trip.summary || '附近可核验候选不足；可扩大范围、调整交通方式，或保留自由时间。')}</span>
            </div>
          ` : ''}
          ${totalDays > 0 ? '<div class="weather-query-note"><strong>天气说明</strong><span>有明确日期时匹配对应的重庆市级高德预报；未指定日期时展示今日天气参考（不代表实际出行日），超出接口预报范围或接口暂未返回时会显示“待确认”，可在确定日期后再次刷新。</span></div>' : ''}

          ${tripDays.map((day) => `
            <div class="day-block" data-trip-day="${day.day}">
              <div class="day-head">
                <div class="day-head-title-group">
                  <strong>${escapeHtml(day.dateLabel)}</strong>
                  <span data-weather-day="${day.day}">${weatherBadge(day)}</span>
                </div>
              </div>
              ${day.departureContext ? `<div class="day-context"><span class="context-icon" style="font-size:14px;flex-shrink:0;">🚩</span><span><strong>出发点参考：</strong>${escapeHtml(day.departureContext)}</span></div>` : ''}
              ${day.stops.map((stop, idx) => stopCard(stop, day.day, idx + 1)).join('')}
            </div>
          `).join('')}
        </section>

        <aside class="panel evidence-card">
          <div class="map-card-head">
            <div class="panel-title" style="margin-bottom:0;">高德全景路线图</div>
            <div class="map-head-actions">
              <button class="map-action-btn ${state.userLocation ? 'active' : ''}" data-action="locate-user" data-location-button ${state.locating ? 'disabled' : ''} title="点击向浏览器申请定位权限并在地图上展示您的相对位置">
                ${state.locating ? '定位中...' : (state.userLocation ? '已定位' : '我的定位')}
              </button>
              <button class="map-action-btn" data-action="reload-map" title="重新初始化高德地图">刷新地图</button>
              <button class="fullscreen-map-btn" data-action="open-fullscreen-map">全屏查看</button>
            </div>
          </div>

          <div class="map-day-tabs" style="margin-top:10px;">
            <button class="map-tab ${state.selectedMapDay === 0 ? 'active' : ''}" data-action="map-day" data-day="0">全景路线</button>
            ${tripDays.map((d) => `
              <button class="map-tab ${state.selectedMapDay === d.day ? 'active' : ''}" data-action="map-day" data-day="${d.day}">第${d.day}天</button>
            `).join('')}
          </div>

          <div id="trip-map" class="trip-map" data-map-stop-count="${mapStops.length}">
            <div class="map-fallback">
              <strong>正在准备地图</strong>
              <span>读取高德坐标与路线数据……</span>
            </div>
          </div>

          <div class="map-intel-card">
            <div class="intel-header">
              <span class="intel-badge">高德路网核验就绪</span>
              <span class="intel-poi-count">已定位 ${mapStops.length} 处机位</span>
            </div>
            ${userLocationRowHtml()}
            <div class="intel-row">
              <strong>出行建议</strong>
              <p>重庆依山而建，轻轨与户外自动扶梯是长辈出行的极佳选择，沿线商圈多为平街直连。</p>
            </div>
            <div class="intel-row">
              <strong>路线依据</strong>
              <p>路线会结合地图信息与当天实际出行情况安排，出发前可再次确认通行时间。</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  `;
}
