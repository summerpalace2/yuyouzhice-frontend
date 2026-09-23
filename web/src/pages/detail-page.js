import { state } from '../app-core/state.js';
import { escapeHtml } from '../shared/lib/security.js';
import { request } from '../shared/api/client.js';
import { toast } from '../shared/ui/toast.js';

export function detailView() {
  const detail = state.detail;
  const context = state.detailContext || {};
  const attractionName = context.name || '景点';
  const fromView = state.detailFromView || context.fromView || 'explore';
  const returnViewLabel = fromView === 'explore' ? '← 返回探索地标' : '← 返回定制方案';

  if (!detail) {
    return `
      <main class="page shell">
        <div class="detail-header-nav">
          <button class="back-to-plan-btn" data-action="go" data-view="${fromView}">
            ${returnViewLabel}
          </button>
          <div class="detail-district-badge">景点深度核验中</div>
        </div>

        <div class="detail-loading-box" role="status" aria-live="polite">
          <div class="detail-progress-track">
            <div class="detail-progress-bar"></div>
          </div>
          <div class="detail-loading-message">
            <span class="detail-loading-spinner" aria-hidden="true"></span>
            <div>
              <strong>正在向高德实时核验【${escapeHtml(attractionName)}】详情与 AI 智囊导览…</strong>
              <p>获取高德 POI 权威数据、地理坐标及文旅历史深度解析</p>
            </div>
          </div>
        </div>

        <div class="detail-layout detail-skeleton">
          <div class="detail-hero detail-skeleton-hero shimmer">
            <div class="vertical">山城渝景</div>
          </div>
          <section class="detail-copy">
            <div class="skeleton-line shimmer" style="width: 25%; height: 16px; margin-bottom: 12px; border-radius: 4px;"></div>
            <div class="skeleton-line shimmer" style="width: 60%; height: 32px; margin-bottom: 16px; border-radius: 6px;"></div>
            <div class="skeleton-line shimmer" style="width: 100%; height: 18px; margin-bottom: 8px; border-radius: 4px;"></div>
            <div class="skeleton-line shimmer" style="width: 80%; height: 18px; margin-bottom: 20px; border-radius: 4px;"></div>
            <div class="skeleton-card shimmer" style="height: 120px; border-radius: 14px; margin-bottom: 24px;"></div>
            <div class="detail-facts">
              <div class="detail-fact shimmer" style="height: 70px; border-radius: 10px;"></div>
              <div class="detail-fact shimmer" style="height: 70px; border-radius: 10px;"></div>
              <div class="detail-fact shimmer" style="height: 70px; border-radius: 10px;"></div>
              <div class="detail-fact shimmer" style="height: 70px; border-radius: 10px;"></div>
            </div>
          </section>
        </div>
      </main>
    `;
  }

  const canAdd = Boolean(state.sessionId && state.trip);
  const totalDays = state.trip?.days?.length || 2;
  const imageSrc = String(detail.image || '').trim();
  const dynamicFacts = detail.dataStatus === 'PARTIAL_DYNAMIC' && Array.isArray(detail.facts)
    ? detail.facts
    : [];
  const imageHero = imageSrc
    ? `<div class="detail-hero" style="background-image:url('${escapeHtml(imageSrc)}')">
         <div class="vertical">山城渝景</div>
         <span class="image-credit">${escapeHtml(detail.imageSource || '高德 Web Service API')} · ${escapeHtml(detail.district)}</span>
       </div>`
    : `<div class="detail-hero detail-hero-unavailable">
         <div class="vertical">山城渝景</div>
         <div class="image-unavailable">高德图片未返回</div>
         <span class="image-credit">${escapeHtml(detail.imageStatus || '未返回')} · ${escapeHtml(detail.imageReason || '本次没有可用景区图片。')}</span>
       </div>`;

  const isRuntime = Boolean(detail.id?.startsWith('amap-') || detail.id?.startsWith('amap:') || detail.sourceMode === 'AMAP_RUNTIME');
  let aiGuideText = detail.aiGuide || '';
  if (!aiGuideText && !isRuntime && (detail.intro || detail.summary)) {
    const introText = detail.intro || detail.summary || '';
    const fitText = detail.fit ? `\n【适宜人群与出行建议】${detail.fit}` : '';
    aiGuideText = `【文旅特色与历史风貌】${introText}${fitText}`;
  }
  const sections = [];
  const regex = /【(.*?)】([\s\S]*?)(?=(?:【|$))/g;
  let match;
  while ((match = regex.exec(aiGuideText)) !== null) {
    const title = match[1].trim();
    const content = match[2].trim();
    if (title && content) {
      sections.push({ title, content });
    }
  }
  if (!sections.length && String(aiGuideText || '').trim()) {
    sections.push({ title: '核心文旅亮点', content: String(aiGuideText).trim() });
  }

  function getSectionIcon(title) {
    if (/生态|自然|休闲|森林|山林|公园/i.test(title)) return '🌲';
    if (/游玩|体验|玩法|路线|徒步|摄影|打卡/i.test(title)) return '🚶';
    if (/出行|核验|提醒|注意|贴士|须知/i.test(title)) return '💡';
    if (/历史|文化|风貌|人文|旧址|古迹/i.test(title)) return '🏛️';
    if (/美食|风味|餐饮|小吃/i.test(title)) return '🍜';
    if (/交通|到达|轻轨|公交/i.test(title)) return '🚇';
    if (/门票|预约|开放|时间/i.test(title)) return '🎫';
    return '✦';
  }

  const aiGuideCard = sections.length ? `
    <div class="detail-ai-guide-card" style="margin: 22px 0; padding: 22px; border-radius: 18px; background: linear-gradient(135deg, #ffffff 0%, #fffbf5 100%); border: 1.5px solid rgba(217, 119, 6, 0.28); box-shadow: 0 8px 30px rgba(180, 83, 9, 0.08), 0 2px 6px rgba(0,0,0,0.03);">
      <div class="ai-guide-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(217, 119, 6, 0.16);">
        <div class="ai-guide-title-wrap" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="ai-guide-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border-radius: 999px; background: linear-gradient(135deg, #c8523d 0%, #ea580c 100%); color: #fff; font-size: 13.5px; font-weight: 800; box-shadow: 0 2px 10px rgba(200, 82, 61, 0.3);">🤖 渝悠悠 AI 智囊导览</span>
          <span class="ai-guide-tag" style="padding: 4px 10px; border-radius: 999px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 11.5px; font-weight: 700;">${isRuntime ? '高德实时文旅解析' : '深度地标解析'}</span>
        </div>
        <span class="ai-guide-verified" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-size: 11.5px; font-weight: 700;">✓ 已核验权威语料</span>
      </div>
      <div class="ai-guide-body" style="display: flex; flex-direction: column; gap: 12px;">
        ${sections.map((sec) => `
          <div class="ai-guide-section ai-guide-subcard" style="padding: 14px 18px; background: #ffffff; border-radius: 12px; border: 1px solid rgba(217, 119, 6, 0.16); border-left: 4px solid #ea580c; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
            <div class="ai-guide-section-title" style="display: flex; align-items: center; gap: 7px; margin-bottom: 6px; color: #9a3412; font-size: 14px; font-weight: 800;">
              <span class="ai-guide-section-icon" aria-hidden="true" style="font-size: 15px;">${getSectionIcon(sec.title)}</span>
              <strong>${escapeHtml(sec.title)}</strong>
            </div>
            <p class="ai-guide-section-content" style="margin: 0; font-size: 13.5px; line-height: 1.7; color: #374151;">${escapeHtml(sec.content)}</p>
          </div>
        `).join('')}
      </div>
      <div class="ai-guide-footer" style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed rgba(217, 119, 6, 0.15); display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 11.5px;">
        <span>🔍 数据核验依据：高德实时位置地图服务与重庆智慧文旅智囊知识库</span>
        <span style="color: var(--green); font-weight: 600;">权威收录 · 随行参考</span>
      </div>
    </div>
  ` : '';

  return `
    <main class="page shell">
      <div class="detail-header-nav">
        <button class="back-to-plan-btn" data-action="go" data-view="${fromView}">
          ${returnViewLabel}
        </button>
        <div class="detail-district-badge">景点深度介绍 · ${escapeHtml(detail.district)}</div>
      </div>

      <div class="detail-layout">
        ${imageHero}

        <section class="detail-copy">
          <div class="eyebrow">${isRuntime ? '高德实时探索点' : 'Attraction Guide'} · ${escapeHtml(detail.district)}</div>
          <h1>${escapeHtml(detail.name)}</h1>
          ${detail.address ? `
            <div class="detail-address-info" style="margin: 4px 0 10px; font-size: 13px; color: var(--muted);">
              <span>📍 地理位置：${escapeHtml(detail.address)}</span>
              ${detail.type ? `<span>（${escapeHtml(detail.type)}）</span>` : ''}
            </div>
          ` : ''}
          <p class="intro">${escapeHtml(detail.intro || detail.summary)}</p>

          <div class="tag-row">
            ${(detail.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>

          ${aiGuideCard}

          <div class="detail-facts">
            <div class="detail-fact">
              <strong>建议时长</strong>
              <div><b>${escapeHtml(detail.duration || '约 90 分钟')}</b><small>游玩深度推荐</small></div>
            </div>
            <div class="detail-fact">
              <strong>门票建议</strong>
              <div><b>${escapeHtml(detail.ticket || '免费开放')}</b><small>以现场及官方公告为准</small></div>
            </div>
            <div class="detail-fact">
              <strong>${detail.openingHours ? '开放时间' : '推荐时段'}</strong>
              <div><b>${escapeHtml(detail.openingHours || detail.bestTime || '待核验')}</b><small>${detail.openingHours ? '来自本次高德 POI 详情' : '景观或光线最佳游览时段'}</small></div>
            </div>
            <div class="detail-fact">
              <strong>交通到达</strong>
              <div><b>${escapeHtml(detail.walk || '轻轨/公交直达')}</b><small>高德路线核验</small></div>
            </div>
            <div class="detail-fact">
              <strong>适合人群</strong>
              <div><b>${escapeHtml(detail.fit || '适合各类旅行者')}</b></div>
            </div>
          </div>

          ${dynamicFacts.length ? `
            <section class="detail-provider-section">
              <div class="detail-provider-heading">
                <div>
                  <span class="eyebrow">LIVE POI DATA</span>
                  <h2>高德实时详情</h2>
                </div>
                <span class="detail-data-status">${escapeHtml(detail.dataStatusLabel || '动态核验')}</span>
              </div>
              <p class="detail-provider-note">以下内容来自打开详情时的高德 POI 查询；未返回的字段不会由系统猜测，出发前仍请以景点官方公告为准。</p>
              <div class="detail-provider-facts">
                ${dynamicFacts.map((fact) => `
                  <div class="detail-provider-fact">
                    <div><strong>${escapeHtml(fact.label || '信息')}</strong><span class="detail-fact-status">${escapeHtml(fact.status || '动态')}</span></div>
                    <b>${escapeHtml(fact.value || '待核验')}</b>
                    ${fact.note ? `<small>${escapeHtml(fact.note)}</small>` : ''}
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}

          <div class="detail-actions-bar" style="margin-top:12px;margin-bottom:12px;">
            <button class="secondary mini-btn" data-action="navigate-to" data-name="${escapeHtml(detail.name)}" data-location="${escapeHtml(detail.location || '')}">高德导航 · 到这去</button>
          </div>

          ${canAdd ? `
            <div class="add-to-trip-panel">
              <div class="add-select-row">
                <label>选择加入到：</label>
                <select id="detail-day-select">
                  ${Array.from({ length: totalDays }, (_, i) => `
                    <option value="${i + 1}" ${context.day === i + 1 ? 'selected' : ''}>第 ${i + 1} 天行程</option>
                  `).join('')}
                </select>
              </div>
              <div class="modal-actions detail-actions">
                <button class="primary" data-action="add-attraction-custom" data-id="${escapeHtml(detail.id || detail.attractionId)}">加入选定天数</button>
                ${context.stopId ? `
                  <button class="secondary" data-action="replace-attraction" data-id="${escapeHtml(detail.id || detail.attractionId)}" data-day="${context.day || 1}" data-stop-id="${escapeHtml(context.stopId)}">替换当前站点</button>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </section>
      </div>
    </main>
  `;
}

export async function openDetail(id, context = {}, { renderHeader, renderView } = {}) {
  state.loading = true;
  state.detail = null;
  state.detailFromView = context.fromView || (state.view === 'detail' ? (state.detailFromView || 'explore') : state.view) || 'explore';
  state.view = 'detail';
  state.detailContext = context;
  if (renderHeader) renderHeader();
  if (renderView) renderView();
  try {
    state.detail = (await request(`/api/attractions/${id}`)).detail;
  } catch (error) {
    toast(error.message);
  } finally {
    state.loading = false;
    if (renderView) renderView();
  }
}

export async function updateTripWithAttraction(operation, target, { renderLoader, render, scheduleTripMap } = {}) {
  state.loading = true;
  if (renderLoader) renderLoader();
  try {
    const dayVal = Number(target.dataset.day || document.querySelector('#detail-day-select')?.value || 1);
    const data = await request('/api/trip/stops', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        attractionId: target.dataset.id,
        day: dayVal,
        operation,
        targetStopId: target.dataset.stopId
      })
    });
    state.trip = data.trip;
    state.view = 'planning';
    toast(operation === 'replace' ? '已成功替换当前站点，路线已重新优化。' : `已加入第 ${dayVal} 天行程！`);
  } catch (error) {
    toast(error.message);
  } finally {
    state.loading = false;
    if (render) render();
    if (scheduleTripMap) scheduleTripMap();
  }
}
