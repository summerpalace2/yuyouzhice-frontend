import { state } from '../../app-core/state.js';
import { escapeHtml } from '../../shared/lib/security.js';

export function diningModal() {
  if (!state.activeDiningStop) return '';
  const stop = state.activeDiningStop;
  const isDinner = (stop.name || '').includes('晚餐') || (stop.time || '').includes('18:') || (stop.time || '').includes('19:');
  const mealType = isDinner ? '晚餐' : '午餐';
  const price = stop.ticket || '人均约 45-75 元';
  const duration = stop.duration || '约 60 分钟';
  const walk = stop.walk ? `路线 ${stop.walk}` : '邻近景区步行即达';
  const specialty = stop.specialtyDish || '地道巴渝风味料理、招牌时蔬热炒与特色汤羹';
  const reason = stop.recommendationReason || stop.summary || '契合当前游览节点作息，就近步行可达，口味地道。';
  const baiduQuery = encodeURIComponent('重庆 ' + stop.name);
  const baiduSearchUrl = `https://www.baidu.com/s?wd=${baiduQuery}`;

  return `
    <div class="modal-wrap dining-detail-modal-wrap" role="dialog" aria-modal="true" aria-label="美食详情">
      <div class="modal dining-detail-modal" style="max-width: 580px; padding: 26px; border-radius: 20px; background: linear-gradient(135deg, #ffffff 0%, #fffbf6 100%); border: 1.5px solid rgba(234, 88, 12, 0.25); box-shadow: 0 16px 48px rgba(234, 88, 12, 0.14);">
        <div class="modal-head" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(234, 88, 12, 0.15);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 999px; background: #ffedd5; color: #c2410c; font-size: 13px; font-weight: 700;">🥢 ${mealType}精选推荐</span>
            <span style="font-size: 13px; color: var(--muted);">📍 ${escapeHtml(stop.district || '重庆')} · ⏳ 建议用餐 ${escapeHtml(duration)}</span>
          </div>
          <button class="modal-close" data-action="close-dining-modal" aria-label="关闭" style="font-size: 20px; color: var(--muted); cursor: pointer; background: none; border: none;">×</button>
        </div>

        <h2 style="margin: 0 0 10px; font-size: 22px; font-weight: 800; color: #9a3412; line-height: 1.3;">${escapeHtml(stop.name)}</h2>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: var(--ink-secondary);">${escapeHtml(stop.summary || '精选邻近景区高口碑正餐餐厅，体验地道巴渝饮食文化与市井烟火。')}</p>

        <div style="background: #fff7ed; border: 1.5px dashed #ea580c; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 800; color: #c2410c; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>🔥</span><span>店内推荐招牌名菜</span>
          </div>
          <div style="font-size: 15px; font-weight: 700; color: #9a3412; line-height: 1.5;">${escapeHtml(specialty)}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 12px; text-align: center;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 3px;">参考人均预算</div>
            <div style="font-size: 14px; font-weight: 700; color: #b91c1c;">${escapeHtml(price.replace(/人均约\s*/, ''))}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 12px; text-align: center;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 3px;">建议用餐时长</div>
            <div style="font-size: 14px; font-weight: 700; color: #92400e;">${escapeHtml(duration)}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 10px; padding: 10px 12px; text-align: center;">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 3px;">就近交通接驳</div>
            <div style="font-size: 13px; font-weight: 700; color: #c2410c; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(walk)}</div>
          </div>
        </div>

        <div style="background: #ffffff; border-left: 4px solid #ea580c; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #78350f; line-height: 1.6; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <strong style="color: #b45309;">💡 推荐依据：</strong>${escapeHtml(reason)}
        </div>

        <div class="modal-actions" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 14px; border-top: 1px solid rgba(234, 88, 12, 0.15);">
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <a href="${baiduSearchUrl}" target="_blank" rel="noopener noreferrer" class="chip" style="text-decoration: none; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 600; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
              <span>🌐 百度搜索全网评价</span>
            </a>
            <button class="chip" data-action="navigate-to" data-name="${escapeHtml(stop.name)}" data-location="${escapeHtml(stop.location || '')}" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; font-weight: 600; padding: 6px 12px; border-radius: 8px;">
              📍 高德到这去
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="primary" data-action="close-dining-modal" style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); border: none;">确定</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
