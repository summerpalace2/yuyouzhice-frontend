import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';

export function renderExploreCardHtml(item) {
  const photoUrl = item.image || item.photoUrl;
  const isAmapPhoto = Boolean(photoUrl && photoUrl.startsWith('http'));
  const fallbackImg = '/images/attraction-hero.svg';
  const img = isAmapPhoto ? photoUrl : (item.id && item.id.startsWith('amap-') ? fallbackImg : `/images/attractions/${item.id}.svg`);
  const alreadyInTrip = state.trip?.days?.some((d) => d.stops.some((s) => s.venueId === item.id));
  const totalDays = state.trip?.days?.length || 2;
  const isAmapPoi = item.source === 'AMAP_WEB_SERVICE' || (item.id && item.id.startsWith('amap-'));
  const isDining = item.isDining || item.category === '美食' || /(?:餐饮|美食|中餐厅|餐馆|火锅|江湖菜|小吃|烧烤|串串|酒楼|茶馆|老字号)/.test(item.type || '');

  const catBadgeLabel = isDining ? '🍜 特色美食' : escapeHtml(item.category || '推荐');

  let photoBadge = '';
  if (isDining) {
    photoBadge = `<span class="explore-photo-badge">🍜 地道风味 · ${escapeHtml(item.district || '重庆')}</span>`;
  } else if (isAmapPhoto) {
    photoBadge = `<span class="explore-photo-badge">📷 高德实景 · ${escapeHtml(item.district)}</span>`;
  } else if (isAmapPoi) {
    photoBadge = `<span class="explore-photo-badge">🗺️ 高德全域POI</span>`;
  }

  const addBtnLabel = isDining
    ? (alreadyInTrip ? '继续安排' : '安排就餐')
    : (alreadyInTrip ? '继续加入' : '加入行程');

  return `
    <article class="panel explore-card ${isDining ? 'explore-card-dining' : ''}">
      <div class="explore-card-thumb" style="background-image:url('${escapeHtml(img)}')">
        <span class="explore-cat-badge">${catBadgeLabel}</span>
        ${photoBadge}
      </div>
      <div class="explore-card-body">
        <div class="eyebrow">${escapeHtml(item.district || '重庆')} · ${escapeHtml(item.ticket ? item.ticket.split('·')[0] : '现场公告')}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.summary || item.address || '')}</p>
        <div class="chip-row">
          ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        ${item.fit ? `<p class="explore-fit">${escapeHtml(item.fit)}</p>` : ''}
        <div class="modal-actions explore-actions">
          <button class="ghost" data-action="detail" data-id="${escapeHtml(item.id)}" data-from="explore">查看详情</button>
          ${item.location ? `<button class="ghost" data-action="navigate-to" data-name="${escapeHtml(item.name)}" data-location="${escapeHtml(item.location)}" title="在高德地图中打开导航">高德导航</button>` : ''}
          ${state.trip ? `
            <div class="explore-add-wrap">
              <select aria-label="加入第几天" class="explore-day-select" id="explore-day-${escapeHtml(item.id)}">
                ${Array.from({ length: totalDays }, (_, i) => `<option value="${i + 1}">第${i + 1}天</option>`).join('')}
              </select>
              <button class="primary ${alreadyInTrip ? 'button-secondary' : ''}" data-action="explore-add-custom" data-id="${escapeHtml(item.id)}">
                ${addBtnLabel}
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </article>
  `;
}
