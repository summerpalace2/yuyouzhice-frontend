import { state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';
import { renderSearchBannerHtml, renderExploreGridContent } from '../features/explore-search/explore-service.js';

export function exploreView() {
  const categories = ['全部', ...state.exploreCategories];

  return `
    <main class="page shell explore-page">
      <div class="section-title">
        <div>
          <h1>探索重庆</h1>
          <p>按名称、片区或类别找地点。</p>
        </div>
        <button class="secondary" data-action="refresh-explore" ${state.exploreLoading ? 'disabled' : ''}>${state.exploreLoading ? '读取中…' : '刷新目录'}</button>
      </div>

      <div class="explore-catalog">
      <aside class="panel panel-pad explore-toolbar">
        <label class="search-field-label" for="explore-query">搜索地点</label>
        <input type="search" id="explore-query" value="${escapeHtml(state.exploreQuery)}" placeholder="景点、街区或美食" />
        <div class="chip-row">
          ${categories.map((category) => `
            <button class="chip ${state.exploreCategory === category || (!state.exploreCategory && category === '全部') ? 'selected' : ''}" data-action="explore-category" data-category="${escapeHtml(category === '全部' ? '' : category)}">${escapeHtml(category)}</button>
          `).join('')}
        </div>
      </aside>
      <div class="catalog-results">
      <div id="explore-search-banner-mount">
        ${renderSearchBannerHtml()}
      </div>

      <section class="explore-grid" id="explore-grid-container">
        ${renderExploreGridContent()}
      </section>
      </div>
      </div>
    </main>
  `;
}
