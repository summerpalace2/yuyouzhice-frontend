import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';

export function fullscreenMapOverlay() {
  if (!state.mapFullscreen || !state.trip) return '';
  const trip = state.trip;
  const mapStops = trip.days.flatMap((day) => day.stops).filter((stop) => stop.location);

  return `
    <div class="fullscreen-map-overlay" id="fullscreen-map-modal" role="dialog" aria-modal="true" aria-label="全屏路线地图">
      <div class="fullscreen-map-header">
        <div class="fullscreen-map-title-row">
          <div class="fullscreen-header-left">
            <span class="fullscreen-map-title">${escapeHtml(trip.title)} · 全屏路线导航</span>
            <span class="intel-badge">已定位 ${mapStops.length} 处机位</span>
          </div>
          <button class="fullscreen-map-close" data-action="close-fullscreen-map" aria-label="退出全屏地图" title="退出全屏地图">
            <span aria-hidden="true">×</span><b>退出</b>
          </button>
        </div>
        <div class="fullscreen-map-tabs-rail" aria-label="选择行程日期">
          <div class="map-day-tabs" style="margin:0;">
            <button class="map-tab ${state.selectedMapDay === 0 ? 'active' : ''}" data-action="map-day" data-day="0">全景路线</button>
            ${trip.days.map((d) => `
              <button class="map-tab ${state.selectedMapDay === d.day ? 'active' : ''}" data-action="map-day" data-day="${d.day}">第${d.day}天</button>
            `).join('')}
          </div>
        </div>
      </div>
      <div id="fullscreen-trip-map" class="fullscreen-map-canvas"></div>
    </div>
  `;
}
