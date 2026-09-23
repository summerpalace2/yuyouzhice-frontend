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
  const catBadgeStyle = isDining
    ? 'position: absolute; top: 10px; left: 10px; z-index: 2; background: linear-gradient(135deg, #ea580c, #f97316); color: #ffffff; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.35); font-weight: 700;'
    : 'position: absolute; top: 10px; left: 10px; z-index: 2;';

  let photoBadge = '';
  if (isDining) {
    photoBadge = `<span class="explore-photo-badge" style="position: absolute; bottom: 8px; right: 8px; font-size: 11px; background: rgba(234, 88, 12, 0.88); color: #f8fafc; padding: 3px 8px; border-radius: 6px; backdrop-filter: blur(4px); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🍜 地道风味 · ${escapeHtml(item.district || '重庆')}</span>`;
  } else if (isAmapPhoto) {
    photoBadge = `<span class="explore-photo-badge" style="position: absolute; bottom: 8px; right: 8px; font-size: 11px; background: rgba(15, 23, 42, 0.75); color: #f8fafc; padding: 3px 8px; border-radius: 6px; backdrop-filter: blur(4px); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">📷 高德实景 · ${escapeHtml(item.district)}</span>`;
  } else if (isAmapPoi) {
    photoBadge = `<span class="explore-photo-badge" style="position: absolute; bottom: 8px; right: 8px; font-size: 11px; background: rgba(37, 99, 235, 0.85); color: #f8fafc; padding: 3px 8px; border-radius: 6px; backdrop-filter: blur(4px); font-weight: 600;">🗺️ 高德全域POI</span>`;
  }

  const eyebrowIcon = isDining ? '🍜 特色餐饮' : '🏛️ 文旅地标';
  const addBtnLabel = isDining
    ? (alreadyInTrip ? '继续安排' : '安排就餐')
    : (alreadyInTrip ? '继续加入' : '加入行程');
  const addBtnStyle = isDining && !alreadyInTrip
    ? 'background: #ea580c; border-color: #ea580c;'
    : '';

  return `
    <article class="panel explore-card ${isDining ? 'explore-card-dining' : ''}" style="border-radius: 16px; overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; ${isDining ? 'border: 1.5px solid rgba(234, 88, 12, 0.25);' : ''}">
      <div class="explore-card-thumb" style="background-image:url('${escapeHtml(img)}'); background-size: cover; background-position: center; position: relative; height: 180px;">
        <span class="explore-cat-badge" style="${catBadgeStyle}">${catBadgeLabel}</span>
        ${photoBadge}
      </div>
      <div class="explore-card-body">
        <div class="eyebrow" style="${isDining ? 'color: #ea580c; font-weight: 600;' : ''}">${eyebrowIcon} · ${escapeHtml(item.district || '重庆')} · ${escapeHtml(item.ticket ? item.ticket.split('·')[0] : '现场公告')}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.summary || item.address || '')}</p>
        <div class="chip-row">
          ${(item.tags || []).map((tag) => `<span class="tag" style="${isDining ? 'background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa;' : ''}">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="notice explore-fit" style="${isDining ? 'background: #fff7ed; border-color: #ffedd5; color: #9a3412;' : ''}">${escapeHtml(item.fit || (isDining ? '适合品味地道风味、特色打卡' : '适合自由行探索、摄影打卡'))}</div>
        <div class="modal-actions explore-actions">
          <button class="ghost" data-action="detail" data-id="${escapeHtml(item.id)}" data-from="explore">查看详情</button>
          ${item.location ? `<button class="ghost" data-action="navigate-to" data-name="${escapeHtml(item.name)}" data-location="${escapeHtml(item.location)}" title="在高德地图中打开导航">高德导航</button>` : ''}
          ${state.trip ? `
            <div class="explore-add-wrap">
              <select class="explore-day-select" id="explore-day-${escapeHtml(item.id)}">
                ${Array.from({ length: totalDays }, (_, i) => `<option value="${i + 1}">第${i + 1}天</option>`).join('')}
              </select>
              <button class="primary ${alreadyInTrip ? 'button-secondary' : ''}" data-action="explore-add-custom" data-id="${escapeHtml(item.id)}" style="${addBtnStyle}">
                ${addBtnLabel}
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </article>
  `;
}
