import { state } from '../../app-core/state.js';
import { request } from '../../shared/api/client.js';
import { toast } from '../../shared/ui/toast.js';
import { escapeHtml } from '../../shared/lib/security.js';
import { renderExploreCardHtml } from '../../entities/attraction/explore-card.js';
import { isPageDataFresh, markPageDataFresh } from '../../app-core/page-cache.js';

let amapSearchDebounceTimer = null;

export async function searchAmapPois(query) {
  const q = String(query || '').trim();
  if (!q) {
    state.exploreAmapResults = [];
    state.exploreAmapLoading = false;
    state.exploreAmapError = '';
    state.exploreAmapQuery = '';
    updateExploreGridInDOM();
    return;
  }
  state.exploreAmapLoading = true;
  state.exploreAmapError = '';
  state.exploreAmapQuery = q;
  updateExploreGridInDOM();

  try {
    const categoryParam = state.exploreCategory ? `&category=${encodeURIComponent(state.exploreCategory)}` : '';
    const data = await request(`/api/search/amap?q=${encodeURIComponent(q)}&city=${encodeURIComponent('重庆市')}${categoryParam}`);
    if (state.exploreQuery.trim() === q) {
      state.exploreAmapResults = Array.isArray(data.results) ? data.results : [];
    }
  } catch (error) {
    if (state.exploreQuery.trim() === q) {
      state.exploreAmapError = error?.message || '高德检索服务暂不可用';
      state.exploreAmapResults = [];
    }
  } finally {
    if (state.exploreQuery.trim() === q) {
      state.exploreAmapLoading = false;
      updateExploreGridInDOM();
    }
  }
}

export function triggerAmapExploreSearch(query) {
  if (amapSearchDebounceTimer) {
    clearTimeout(amapSearchDebounceTimer);
  }
  const q = String(query || '').trim();
  if (!q) {
    state.exploreAmapResults = [];
    state.exploreAmapLoading = false;
    state.exploreAmapQuery = '';
    updateExploreGridInDOM();
    return;
  }
  amapSearchDebounceTimer = setTimeout(() => {
    void searchAmapPois(q);
  }, 350);
}

export function renderSearchBannerHtml() {
  if (!state.exploreQuery) return '';
  const amapCount = Array.isArray(state.exploreAmapResults) ? state.exploreAmapResults.length : 0;
  const amapLoading = Boolean(state.exploreAmapLoading);
  return `
    <section class="amap-search-banner" style="margin-bottom: 16px; background: linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%); border: 1.5px solid #86efac; border-radius: 14px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.08);">
      <div>
        <div style="font-size: 14.5px; font-weight: 700; color: #166534; display: flex; align-items: center; gap: 6px;">
          <span>🗺️ 高德搜索引擎 · 重庆全城实时检索已接入</span>
          <span style="font-size: 11px; background: #22c55e; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 600;">已联网</span>
        </div>
        <div style="font-size: 13px; color: #475569; margin-top: 2px;">
          正在检索“<b>${escapeHtml(state.exploreQuery)}</b>”${state.exploreCategory ? `（分类：<b>${escapeHtml(state.exploreCategory)}</b>）` : ''}${amapLoading ? '（高德检索中…）' : `（已从高德获取 ${amapCount} 个实时地点）`}。支持任意景点或餐饮直接加入行程、查看详情或高德导航。
        </div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="chip" data-action="quick-search-amap" style="background: #16a34a; color: #ffffff; font-weight: 700; padding: 8px 16px; border-radius: 8px; border: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.25);">
          <span>🔍 刷新高德结果</span>
        </button>
        <a href="https://www.baidu.com/s?wd=${encodeURIComponent('重庆 ' + state.exploreQuery)}" target="_blank" rel="noopener noreferrer" class="chip" style="text-decoration: none; background: #ffffff; color: #2563eb; border: 1px solid #93c5fd; font-weight: 600; padding: 8px 14px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
          <span>🌐 百度文旅直达</span> <span>→</span>
        </a>
        <button class="chip" data-action="quick-ai-action" data-mode="chat" data-prompt="请问重庆有什么关于【${escapeHtml(state.exploreQuery)}】的知名景区、特色美食或游玩攻略推荐？" style="background: #ffffff; color: #1e40af; border: 1px solid #93c5fd; font-weight: 600; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
          🤖 咨询悠悠 AI
        </button>
      </div>
    </section>
  `;
}

export function renderExploreGridContent() {
  if (!state.exploreLoaded && state.exploreLoading) {
    return `
      <div class="panel trip-empty" style="grid-column:1/-1;"><div><div class="empty-symbol">查</div><h2>正在读取景点目录</h2><p class="muted">正在准备精选景点，请稍候；页面不会被锁定。</p></div></div>
    `;
  }
  if (!state.exploreLoaded && state.exploreLoadError) {
    return `
      <div class="panel trip-empty" style="grid-column:1/-1;"><div><div class="empty-symbol">!</div><h2>景点目录暂时无法读取</h2><p class="muted">${escapeHtml(state.exploreLoadError)}</p><button class="primary" data-action="refresh-explore">重新读取目录</button></div></div>
    `;
  }

  const allItems = Array.isArray(state.exploreItems) ? state.exploreItems : [];
  const filtered = allItems.filter((item) => {
    if (state.exploreCategory && item.category !== state.exploreCategory) return false;
    if (state.exploreQuery) {
      const q = state.exploreQuery.toLowerCase();
      const haystack = [item.name, item.district, item.category, ...(item.tags || []), item.summary].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const query = state.exploreQuery ? state.exploreQuery.trim() : '';
  const amapResults = Array.isArray(state.exploreAmapResults) ? state.exploreAmapResults : [];
  const amapLoading = Boolean(state.exploreAmapLoading);

  if (!query) {
    return filtered.length ? filtered.map(renderExploreCardHtml).join('') : `
      <div class="panel trip-empty" style="grid-column:1/-1;">
        <div>
          <div class="empty-symbol">查</div>
          <h2>没有匹配的景点</h2>
          <p class="muted">请尝试更换关键词或清除分类筛选。</p>
        </div>
      </div>
    `;
  }

  const parts = [];

  if (filtered.length > 0) {
    parts.push(`
      <div class="explore-section-header" style="grid-column: 1 / -1; margin-top: 6px; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
        <h3 style="font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
          <span>🏛️ 24 核心精选地标匹配</span>
          <span style="font-size: 12px; font-weight: 600; color: #2563eb; background: #dbeafe; padding: 2px 8px; border-radius: 999px;">${filtered.length} 个</span>
        </h3>
      </div>
    `);
    parts.push(filtered.map(renderExploreCardHtml).join(''));
  }

  parts.push(`
    <div class="explore-section-header" style="grid-column: 1 / -1; margin-top: 20px; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; border-top: 1.5px dashed #cbd5e1; padding-top: 18px;">
      <h3 style="font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
        <span>🗺️ 高德搜索引擎 · 重庆全城实时检索${state.exploreCategory ? ` · 【${escapeHtml(state.exploreCategory)}】` : ''}</span>
        <span style="font-size: 12px; font-weight: 600; color: #15803d; background: #dcfce7; padding: 2px 8px; border-radius: 999px;">${amapLoading ? '检索中…' : `${amapResults.length} 个实时地点`}</span>
      </h3>
      <span style="font-size: 12px; color: #64748b;">支持任意重庆景点、古镇与地道餐饮一键加入行程</span>
    </div>
  `);

  if (amapLoading) {
    parts.push(`
      <div class="panel trip-empty" style="grid-column: 1 / -1; padding: 28px; text-align: center;">
        <div class="empty-symbol" style="font-size: 28px;">🔍</div>
        <h3 style="margin-top: 8px; font-size: 15px; color: #1e40af;">正在通过高德地图 POI 搜索引擎检索“${escapeHtml(query)}”…</h3>
        <p class="muted" style="font-size: 12.5px; margin-top: 4px;">覆盖全重庆各区县景区、自然公园、非遗风味与小吃</p>
      </div>
    `);
  } else if (amapResults.length > 0) {
    parts.push(amapResults.map(renderExploreCardHtml).join(''));
  } else if (!filtered.length) {
    parts.push(`
      <div class="panel trip-empty" style="grid-column:1/-1;">
        <div>
          <div class="empty-symbol">查</div>
          <h2>全城与核心地标中暂未检索到“${escapeHtml(query)}”</h2>
          <p class="muted">请检查关键词是否有错别字，或点击下方前往百度搜索引擎查看全网攻略。</p>
          <div style="margin-top: 14px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <a href="https://www.baidu.com/s?wd=${encodeURIComponent('重庆 ' + query)}" target="_blank" rel="noopener noreferrer" class="primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
              <span>前往百度搜索“${escapeHtml(query)}”</span> <span>→</span>
            </a>
          </div>
        </div>
      </div>
    `);
  }

  return parts.join('');
}

export function updateExploreGridInDOM() {
  const container = document.getElementById('explore-grid-container');
  if (!container) return;

  container.innerHTML = renderExploreGridContent();

  const chips = document.querySelectorAll('.explore-toolbar .chip');
  chips.forEach((c) => {
    const cat = c.dataset.category;
    c.classList.toggle('selected', state.exploreCategory === cat || (!state.exploreCategory && !cat));
  });

  const bannerMount = document.getElementById('explore-search-banner-mount');
  if (bannerMount) {
    bannerMount.innerHTML = renderSearchBannerHtml();
  }
}

export async function loadExplore({ force = false } = {}) {
  if (!force && isPageDataFresh('explore')) return state.exploreItems;
  if (state.exploreLoading) return state.exploreItems;
  state.exploreLoading = true;
  state.exploreLoadError = '';
  if (state.view === 'explore') updateExploreGridInDOM();
  try {
    const params = new URLSearchParams({ q: '', category: '' });
    const data = await request(`/api/explore?${params}`, { timeoutMs: 15000 });
    state.exploreItems = Array.isArray(data.items) ? data.items : [];
    state.exploreCategories = data.categories || ['夜景', '城市', '人文', '美食', '文创', '自然', '休闲'];
    state.exploreLoaded = true;
    markPageDataFresh('explore');
    if (state.view === 'explore') updateExploreGridInDOM();
    return state.exploreItems;
  } catch (error) {
    state.exploreLoadError = error?.message || '无法读取景点目录，请稍后重试。';
    toast(error.message);
    if (state.view === 'explore') updateExploreGridInDOM();
  } finally {
    state.exploreLoading = false;
    if (state.view === 'explore') updateExploreGridInDOM();
  }
}

export async function addExploreAttraction(id, day = 1, { render, scheduleTripMap } = {}) {
  if (!state.trip || !state.sessionId) {
    return toast('请先从首页生成一份行程，再添加探索景点。');
  }
  try {
    const data = await request('/api/trip/stops', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        attractionId: id,
        day: Number(day || 1),
        operation: 'add'
      })
    });
    state.trip = data.trip;
    state.view = 'planning';
    toast(`已成功加入第 ${day} 天行程！`);
    if (render) render();
    if (scheduleTripMap) scheduleTripMap();
  } catch (error) {
    toast(error.message);
  }
}
