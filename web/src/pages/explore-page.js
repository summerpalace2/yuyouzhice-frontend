import { state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';
import { renderSearchBannerHtml, renderExploreGridContent } from '../features/explore-search/explore-service.js';

export function exploreView() {
  const categories = ['全部', ...state.exploreCategories];

  return `
    <main class="page shell">
      <div class="section-title">
        <div>
          <div class="eyebrow">Explore Chongqing Landmarks & Full City POIs</div>
          <h2>探索重庆精选地标与全城高德文旅</h2>
          <p>高德实景影像 · 涵盖核心地标、夜景、古镇小吃与全城各区县 POI 实时检索；可一键加入当前行程规划或直接导航。</p>
        </div>
        <button class="secondary" data-action="refresh-explore" ${state.exploreLoading ? 'disabled' : ''}>${state.exploreLoading ? '读取中…' : '刷新目录'}</button>
      </div>

      <section class="panel panel-pad explore-toolbar">
        <input id="explore-query" value="${escapeHtml(state.exploreQuery)}" placeholder="输入景点、区县（江津区/渝中区）、特色（四面山/大足石刻/老火锅/室内）直通高德全城检索…" />
        <div class="chip-row">
          ${categories.map((category) => `
            <button class="chip ${state.exploreCategory === category || (!state.exploreCategory && category === '全部') ? 'selected' : ''}" data-action="explore-category" data-category="${escapeHtml(category === '全部' ? '' : category)}">${escapeHtml(category)}</button>
          `).join('')}
        </div>
      </section>

      <div id="explore-search-banner-mount">
        ${renderSearchBannerHtml()}
      </div>

      <section class="explore-grid" id="explore-grid-container">
        ${renderExploreGridContent()}
      </section>
    </main>
  `;
}
