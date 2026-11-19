import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';

export function sanitizePunctuation(text) {
  if (!text) return '';
  return String(text)
    .replace(/[。；;]+[）)]/g, '）')
    .replace(/[）)][。；;]+/g, '）。')
    .replace(/[。]{2,}/g, '。')
    .trim();
}

export function stopCard(stop, dayNumber, stopIndex = null) {
  const isDining = stop.type === 'DINING' || stop.icon === '餐';
  const isFreeTime = stop.type === 'FREE_TIME' || stop.icon === '休';
  const route = stop.routeFromPrevious;
  const routeChip = route?.selected?.summary
    ? `${route.selectedMode || '路线'} ${route.selected.summary}`
    : (stop.walk ? `路线 ${stop.walk}` : (isDining ? '步行即达' : (isFreeTime ? '片区自由活动' : '路线待计算')));

  const ticketLabel = stop.ticket || (isDining ? '人均约 40-70 元' : (isFreeTime ? '自由安排' : '开放情况见景区公告'));
  const durationLabel = stop.duration || (isDining ? '约 60 分钟' : '约 90 分钟');
  const isSelected = Boolean(state.selectedStopId && state.selectedStopId === stop.id);
  const isPinned = Boolean(state.pinnedStopIds && state.pinnedStopIds.has(stop.id));

  const verifiedBadge = stop.verifiedSource === 'AMAP_POI'
    ? '<span class="chip chip-verified-amap">✓ 高德实景</span>'
    : (stop.verifiedSource === 'LOCAL_CATALOG' || stop.verifiedSource === 'LOCAL_DINING'
      ? '<span class="chip chip-verified-catalog">✓ 目录核验</span>'
      : '');
  const orderNum = stopIndex !== null && stopIndex !== undefined ? String(stopIndex).padStart(2, '0') : '';
  const cleanSummary = sanitizePunctuation(stop.summary);
  const cleanReason = sanitizePunctuation(stop.recommendationReason);

  // 智能计算高德导航起点：首站继承行程出发地，后续各站自动继承上一站
  const tripStartPlace = state.trip?.constraints?.startPlace
    || state.trip?.startPlace
    || '当前位置';
  let navFromName = tripStartPlace;
  let navFromLocation = '';
  if (stopIndex && stopIndex > 1) {
    const dayObj = state.trip?.days?.find((d) => Number(d.day) === Number(dayNumber));
    const prevStop = dayObj?.stops?.[stopIndex - 2];
    if (prevStop) {
      navFromName = prevStop.name || tripStartPlace;
      navFromLocation = prevStop.location || '';
    }
  }

  return `
    <article
      class="stop stop-card itinerary-stop-card ${isDining ? 'dining-stop-card' : (isFreeTime ? 'free-time-stop-card' : 'scenic-stop-card')} ${isSelected ? 'selected-stop-card' : ''} ${isPinned ? 'pinned-stop-card' : ''}"
      data-stop-id="${escapeHtml(stop.id)}"
    >
      <div class="stop-card-main">
        ${stop.departureLabel ? `
          <div class="stop-departure-badge">
            <span>🚩</span><span>${escapeHtml(stop.departureLabel)}</span>
          </div>
        ` : ''}
        <div class="stop-card-header">
          <div class="stop-badge-name-group">
            ${orderNum ? `<span class="stop-step-badge">${escapeHtml(orderNum)}</span>` : ''}
            ${stop.icon ? `<span class="stop-icon-chip tone-${escapeHtml(stop.tone || (isDining ? 'gold' : 'default'))}">${escapeHtml(stop.icon)}</span>` : ''}
            <h3 class="stop-name">${escapeHtml(stop.name)}</h3>
          </div>
          <div class="stop-header-status">
            ${isDining ? '<span class="chip">🥢 餐饮赏味</span>' : (isFreeTime ? '<span class="chip">🧘 弹性休闲</span>' : '<span class="chip">🏛️ 文旅地标</span>')}
            ${verifiedBadge}
            ${isSelected ? '<span class="chip chip-selected">✓ 已选中</span>' : ''}
            ${isPinned ? '<span class="chip chip-pinned">📌 已固定</span>' : ''}
          </div>
        </div>

        <div class="stop-meta-line">
          ${!isDining ? `
            <span class="stop-meta-item">🕒 ${escapeHtml(stop.time || '待安排')}</span>
            <span class="stop-meta-divider">·</span>
          ` : ''}
          <span class="stop-meta-item">📍 ${escapeHtml(stop.district || '重庆')}</span>
          <span class="stop-meta-divider">·</span>
          <span class="stop-meta-item">⏳ ${isDining ? '建议用餐' : (isFreeTime ? '建议预留' : '建议游玩')} ${escapeHtml(durationLabel)}</span>
          ${stop.openingHours ? `<span class="stop-meta-divider">·</span><span class="stop-meta-item">🚪 ${escapeHtml(stop.openingHours)}</span>` : ''}
        </div>
        ${stop.bookingPolicy ? `<div class="stop-booking-note">📋 ${escapeHtml(stop.bookingPolicy)}</div>` : ''}

        ${cleanSummary ? `<p class="stop-summary">${escapeHtml(cleanSummary)}</p>` : ''}

        ${stop.specialtyDish ? `
          <div class="dining-specialty-box">
            <span>🥢 必尝招牌：</span>
            <span>${escapeHtml(stop.specialtyDish)}</span>
          </div>
        ` : ''}

        ${cleanReason ? `
          <div class="recommendation-box notice recommendation-reason">
            <div class="recommendation-header">
              <span class="recommendation-icon">${isDining ? '💡 赏味依据' : '💡 游玩依据'}</span>
            </div>
            <div class="recommendation-content">${escapeHtml(cleanReason)}</div>
          </div>
        ` : ''}

        <div class="chip-row stop-chip-row">
          ${isDining ? `
            <span class="chip chip-ticket">💰 人均 ${escapeHtml(ticketLabel.replace(/人均约\s*/, ''))}</span>
            <span class="chip chip-time">⏱️ 用餐 ${escapeHtml(durationLabel)}</span>
            <span class="chip chip-transit">🧭 ${escapeHtml(routeChip)}</span>
          ` : `
            <span class="chip chip-ticket">🎫 门票 ${escapeHtml(ticketLabel.split('·')[0].trim())}</span>
            <span class="chip chip-time">⏱️ 游玩 ${escapeHtml(durationLabel)}</span>
            <span class="chip chip-transit">🧭 ${escapeHtml(routeChip)}</span>
          `}
        </div>
      </div>

      <div class="stop-actions stop-actions-bar">
        <button class="secondary mini-btn ${isSelected ? 'active-btn' : ''}" data-action="select-stop" data-id="${escapeHtml(stop.id)}" data-name="${escapeHtml(stop.name)}" data-day="${dayNumber}">
          ${isSelected ? '取消选中' : (isDining ? '让悠悠调整此餐' : '让悠悠调整')}
        </button>
        ${isDining ? `
          <button class="ghost mini-btn" data-action="dining-detail" data-id="${escapeHtml(stop.id)}" data-name="${escapeHtml(stop.name)}" data-day="${dayNumber}">
            🥢 美食详情
          </button>
          <button class="ghost mini-btn" data-action="navigate-to" data-name="${escapeHtml(stop.name)}" data-location="${escapeHtml(stop.location || '')}" data-from-name="${escapeHtml(navFromName)}" data-from-location="${escapeHtml(navFromLocation)}">
            📍 导航就餐
          </button>
        ` : `
          <button class="ghost mini-btn ${isPinned ? 'active-btn' : ''}" data-action="toggle-pin-stop" data-id="${escapeHtml(stop.id)}" data-name="${escapeHtml(stop.name)}">
            ${isPinned ? '取消固定' : '📌 固定'}
          </button>
          <button class="ghost mini-btn" data-action="detail" data-id="${escapeHtml(stop.venueId)}" data-stop-id="${escapeHtml(stop.id)}" data-day="${dayNumber}" data-from="planning">
            ℹ️ 景点详情
          </button>
          <button class="ghost mini-btn" data-action="navigate-to" data-name="${escapeHtml(stop.name)}" data-location="${escapeHtml(stop.location || '')}" data-from-name="${escapeHtml(navFromName)}" data-from-location="${escapeHtml(navFromLocation)}">
            📍 到这去
          </button>
        `}
        <button class="danger-mini" data-action="remove-stop" data-id="${escapeHtml(stop.id)}" ${(state.loading || state.applyPending) ? 'disabled aria-disabled="true"' : ''}>
          ✕ 移除
        </button>
      </div>
    </article>
  `;
}

export function weatherBadge(day) {
  const weather = day && day.weather && typeof day.weather === 'object' ? day.weather : null;
  const status = String(weather?.status || '未知');
  const value = String(weather?.value || '不可用·待确认');
  const note = String(weather?.note || 'Java 尚未返回可核验的天气结果。');
  const dynamic = status === '动态';
  return `<span class="weather-badge ${dynamic ? 'weather-live' : 'weather-unavailable'}" title="${escapeHtml(note)}">🌤️ ${escapeHtml(value)}${dynamic ? ' · 高德' : ''}</span>`;
}
