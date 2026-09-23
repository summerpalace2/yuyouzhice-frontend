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
  const route = stop.routeFromPrevious;
  const routeChip = route?.selected?.summary
    ? `${route.selectedMode || '路线'} ${route.selected.summary}`
    : (stop.walk ? `路线 ${stop.walk}` : (isDining ? '步行即达' : '路线待计算'));

  const ticketLabel = stop.ticket || (isDining ? '人均约 40-70 元' : '免费开放 · 无需预约');
  const durationLabel = stop.duration || (isDining ? '约 60 分钟' : '约 90 分钟');
  const isSelected = Boolean(state.selectedStopId && state.selectedStopId === stop.id);
  const isPinned = Boolean(state.pinnedStopIds && state.pinnedStopIds.has(stop.id));

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
      class="stop stop-card itinerary-stop-card ${isDining ? 'dining-stop-card' : 'scenic-stop-card'} ${isSelected ? 'selected-stop-card' : ''} ${isPinned ? 'pinned-stop-card' : ''}"
      data-stop-id="${escapeHtml(stop.id)}"
      style="display: flex !important; flex-direction: column !important; width: 100% !important; box-sizing: border-box !important; border-radius: 14px !important; transition: all 0.2s ease !important; ${isDining ? 'border-left: 5px solid #ea580c !important; background: linear-gradient(135deg, #fffcf9 0%, #fff7ed 100%) !important; box-shadow: 0 4px 16px rgba(234, 88, 12, 0.08) !important; border-top: 1px solid #ffedd5 !important; border-right: 1px solid #ffedd5 !important; border-bottom: 1px solid #fed7aa !important;' : 'border-left: 5px solid #2563eb !important; background: #ffffff !important; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.06) !important; border-top: 1px solid #eff6ff !important; border-right: 1px solid #eff6ff !important; border-bottom: 1px solid #dbeafe !important;'}"
    >
      <div class="stop-card-main" style="width: 100% !important; min-width: 0 !important; display: flex !important; flex-direction: column !important; gap: 8px !important; box-sizing: border-box !important;">
        ${stop.departureLabel ? `
          <div class="stop-departure-badge" style="margin-bottom: 2px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; width: fit-content;">
            <span>🚩</span><span>${escapeHtml(stop.departureLabel)}</span>
          </div>
        ` : ''}
        <div class="stop-card-header" style="width: 100% !important; display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; flex-wrap: wrap !important;">
          <div class="stop-badge-name-group" style="display: flex !important; align-items: center !important; gap: 9px !important; min-width: 0 !important; flex-wrap: wrap !important;">
            ${orderNum ? `<span class="stop-step-badge" style="${isDining ? 'background: #fed7aa; color: #9a3412;' : ''}">${escapeHtml(orderNum)}</span>` : ''}
            ${stop.icon ? `<span class="stop-icon-chip tone-${escapeHtml(stop.tone || (isDining ? 'gold' : 'default'))}" style="${isDining ? 'background: #ea580c !important; color: #fff !important;' : ''}">${escapeHtml(stop.icon)}</span>` : ''}
            <h3 class="stop-name" style="margin: 0; font-size: 16.5px; font-weight: 700; color: ${isDining ? '#9a3412' : 'var(--ink)'}; line-height: 1.35; word-break: break-word;">${escapeHtml(stop.name)}</h3>
          </div>
          <div class="stop-header-status" style="display: flex !important; align-items: center !important; gap: 6px !important; flex-shrink: 0 !important;">
            ${isDining ? '<span class="chip" style="background:#ffedd5;color:#c2410c;border:1.5px solid #fdba74;font-weight:700;">🥢 餐饮赏味</span>' : '<span class="chip" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:600;">🏛️ 文旅地标</span>'}
            ${isSelected ? '<span class="chip chip-selected">✓ 已选中</span>' : ''}
            ${isPinned ? '<span class="chip chip-pinned">📌 已固定</span>' : ''}
          </div>
        </div>

        <div class="stop-meta-line" style="display: flex !important; align-items: center !important; gap: 6px !important; flex-wrap: wrap !important; font-size: 12px !important; color: var(--muted) !important;">
          ${!isDining ? `
            <span class="stop-meta-item">🕒 ${escapeHtml(stop.time || '待安排')}</span>
            <span class="stop-meta-divider">·</span>
          ` : ''}
          <span class="stop-meta-item">📍 ${escapeHtml(stop.district || '重庆')}</span>
          <span class="stop-meta-divider">·</span>
          <span class="stop-meta-item">⏳ ${isDining ? '建议用餐' : '建议游玩'} ${escapeHtml(durationLabel)}</span>
        </div>

        ${cleanSummary ? `<p class="stop-summary" style="margin: 2px 0 0; color: var(--ink-secondary); font-size: 13.5px; line-height: 1.6; word-break: break-word;">${escapeHtml(cleanSummary)}</p>` : ''}

        ${stop.specialtyDish ? `
          <div class="dining-specialty-box" style="margin-top: 3px; background: #fff7ed; border: 1.5px dashed #ea580c; padding: 8px 13px; border-radius: 9px; font-size: 13px; color: #9a3412; display: flex; align-items: flex-start; gap: 7px; box-sizing: border-box !important;">
            <span style="font-weight: 800; color: #c2410c; flex-shrink: 0;">🥢 必尝招牌：</span>
            <span style="line-height: 1.55; word-break: break-word; font-weight: 500;">${escapeHtml(stop.specialtyDish)}</span>
          </div>
        ` : ''}

        ${cleanReason ? `
          <div class="recommendation-box notice recommendation-reason" style="margin-top: 4px; border-left: 3.5px solid ${isDining ? '#ea580c' : '#2563eb'}; background: ${isDining ? '#fffbeb' : '#f8fafc'}; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; color: ${isDining ? '#92400e' : '#334155'}; box-sizing: border-box !important;">
            <div class="recommendation-header" style="display: flex; align-items: center; gap: 5px; font-weight: 700; font-size: 12px; color: ${isDining ? '#b45309' : '#1d4ed8'}; margin-bottom: 2px;">
              <span class="recommendation-icon">${isDining ? '💡 赏味依据' : '💡 游玩依据'}</span>
            </div>
            <div class="recommendation-content" style="color: ${isDining ? '#92400e' : '#475569'}; word-break: break-word;">${escapeHtml(cleanReason)}</div>
          </div>
        ` : ''}

        <div class="chip-row stop-chip-row" style="display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important; margin-top: 4px !important;">
          ${isDining ? `
            <span class="chip chip-ticket" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;font-weight:600;">💰 人均 ${escapeHtml(ticketLabel.replace(/人均约\s*/, ''))}</span>
            <span class="chip chip-time" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;">⏱️ 用餐 ${escapeHtml(durationLabel)}</span>
            <span class="chip chip-transit" style="background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;">🧭 ${escapeHtml(routeChip)}</span>
          ` : `
            <span class="chip chip-ticket" style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;">🎫 门票 ${escapeHtml(ticketLabel.split('·')[0].trim())}</span>
            <span class="chip chip-time" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;">⏱️ 游玩 ${escapeHtml(durationLabel)}</span>
            <span class="chip chip-transit" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;">🧭 ${escapeHtml(routeChip)}</span>
          `}
        </div>
      </div>

      <div class="stop-actions stop-actions-bar" style="width: 100% !important; display: flex !important; align-items: center !important; flex-wrap: wrap !important; gap: 8px !important; padding-top: 10px !important; border-top: 1px dashed ${isDining ? 'rgba(234, 88, 12, 0.2)' : 'rgba(0, 0, 0, 0.08)'} !important; margin-top: 6px !important; box-sizing: border-box !important;">
        <button class="secondary mini-btn ${isSelected ? 'active-btn' : ''}" data-action="select-stop" data-id="${escapeHtml(stop.id)}" data-name="${escapeHtml(stop.name)}" data-day="${dayNumber}" style="${isDining ? 'border-color: #f97316;' : ''}">
          ${isSelected ? '取消选中' : (isDining ? '选中此餐' : '选中此站')}
        </button>
        ${isDining ? `
          <button class="ghost mini-btn" data-action="dining-detail" data-id="${escapeHtml(stop.id)}" data-name="${escapeHtml(stop.name)}" data-day="${dayNumber}" style="color: #c2410c; border-color: #fdba74;">
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
        <button class="danger-mini" data-action="remove-stop" data-id="${escapeHtml(stop.id)}">
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
