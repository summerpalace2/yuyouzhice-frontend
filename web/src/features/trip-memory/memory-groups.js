import { escapeHtml } from '../../shared/lib/security.js';

// Semantic keys come from Java's taxonomy projection. The browser groups facts;
// it does not infer synonyms or discard the user's original source statements.
export function groupTravelMemories(memories = []) {
  const groups = new Map();
  const seenIds = new Set();
  for (const memory of memories) {
    if (!memory?.content || (memory.id && seenIds.has(memory.id))) continue;
    if (memory.id) seenIds.add(memory.id);
    const category = String(memory.category || 'CUSTOM').toUpperCase();
    if (!groups.has(category)) groups.set(category, { category, facets: [], sourceCount: 0 });
    const group = groups.get(category);
    const key = memory.preferenceKey || `TEXT:${memory.content}`;
    let facet = group.facets.find(item => item.key === key);
    if (!facet) {
      facet = { key, content: memory.preferenceSummary || memory.content, sources: [] };
      group.facets.push(facet);
    }
    facet.sources.push(memory);
    group.sourceCount++;
  }
  return [...groups.values()];
}

function sourceHtml(memory) {
  const manual = memory.sourceType === 'USER_EDIT';
  const origin = memory.sourceRef ? `源自对话表达“${escapeHtml(memory.sourceRef)}”`
    : (manual ? '由你手动录入' : '已确认记录，未附原始对话');
  const date = new Date(memory.updatedAt || memory.updated_at || memory.createdAt || memory.created_at || Date.now()).toLocaleDateString('zh-CN');
  return `<div class="travel-memory-origin-box" data-travel-memory-id="${escapeHtml(memory.id)}">
    <div><strong>${escapeHtml(memory.content)}</strong><p class="origin-text">${origin} · 更新于 ${date}</p>
      <div class="travel-memory-actions">
        <button class="ghost mini-btn" data-action="edit-travel-memory" data-id="${escapeHtml(memory.id)}" data-content="${escapeHtml(memory.content)}" data-category="${escapeHtml(memory.category || 'CUSTOM')}">编辑此来源</button>
        <button class="ghost mini-btn" data-action="delete-travel-memory" data-id="${escapeHtml(memory.id)}">删除此来源</button>
      </div>
    </div>
  </div>`;
}

export function memoryGroupHtml(group, label) {
  return `<article class="travel-memory-item" data-memory-group="${escapeHtml(group.category)}">
    <div class="travel-memory-body">
      <div class="travel-memory-header-row">
        <span class="travel-memory-category">${escapeHtml(label)}</span>
        <span class="travel-memory-source-badge badge-chat">已整合 · ${group.facets.length} 项偏好</span>
        <span class="travel-memory-ttl-badge">${group.sourceCount} 条确认来源</span>
      </div>
      ${group.facets.map(facet => `<section class="memory-facet">
        <strong class="travel-memory-content">${escapeHtml(facet.content)}</strong>
        <details class="memory-facet-sources">
          <summary>${facet.sources.length} 条来源 · 查看原文、编辑或删除</summary>
          ${facet.sources.map(sourceHtml).join('')}
        </details>
      </section>`).join('')}
    </div>
  </article>`;
}
