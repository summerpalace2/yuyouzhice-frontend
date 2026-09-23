/**
 * 旅行档案与长期记忆动作协调器。
 *
 * 长期记忆写入均以服务端结果为准；删除采用乐观更新并在失败时恢复原档案。
 * 普通记忆操作只刷新档案面板，不能重绘主行程或中断当前聊天流。
 */
import { saveGuestMemories } from '../../app-core/user-store.js';

export async function handleProfileAction({
  action,
  target,
  state,
  request,
  toast,
  loadProfile,
  refreshProfileInDOM,
  refreshProfileMemoryInDOM,
  refreshProfileSlotsInDOM,
  renderChatInDOM,
  renderView,
  invalidatePageCache,
  markPageDataFresh
} = {}) {
  const refreshMemoryPanel = () => {
    if (!refreshProfileMemoryInDOM()) refreshProfileInDOM();
  };
  const refreshSlotsPanel = () => {
    if (typeof refreshProfileSlotsInDOM === 'function') {
      if (!refreshProfileSlotsInDOM()) refreshProfileInDOM();
    } else {
      refreshProfileInDOM?.();
    }
  };

  const syncPrependPromptAfterMemoryChange = async () => {
    try {
      const res = await request('/api/preferences/prepend-prompt');
      if (res && res.ok && state.profile) {
        state.profile.profilePrependPrompt = res.prependPrompt || '';
        refreshSlotsPanel();
      }
    } catch (e) {
      console.warn('同步前置提示词失败', e);
    }
  };

  if (action === 'toggle-expand-memories') {
    state.memoriesExpanded = !state.memoriesExpanded;
    refreshMemoryPanel();
    return true;
  }
  if (action === 'save-prepend-prompt') {
    const editor = document.querySelector('#prepend-prompt-editor');
    const text = String(editor ? editor.value : '').trim();
    if (!text) {
      toast('提示词内容不能为空');
      return true;
    }
    try {
      const data = await request('/api/preferences/prepend-prompt', {
        method: 'POST',
        body: JSON.stringify({ action: 'save', prependPrompt: text })
      });
      if (state.profile) {
        state.profile.profilePrependPrompt = data.prependPrompt || text;
        state.profile.userCustomizedPrompt = data.prependPrompt || text;
      }
      state.useMemoriesInPlan = true;
      markPageDataFresh?.('profile');
      toast('AI 规划前置提示词已保存生效！');
    } catch (error) {
      toast(error?.message || '保存提示词失败');
    }
    return true;
  }
  if (action === 'resynthesize-prepend-prompt') {
    if (!window.confirm('重新提炼将基于全部近期记忆重新生成前置提示词，是否继续？')) {
      return true;
    }
    try {
      const data = await request('/api/preferences/prepend-prompt', {
        method: 'POST',
        body: JSON.stringify({ action: 'resynthesize' })
      });
      if (state.profile) {
        state.profile.profilePrependPrompt = data.prependPrompt || '';
      }
      const editor = document.querySelector('#prepend-prompt-editor');
      if (editor) {
        editor.value = data.prependPrompt || '';
      }
      const counter = document.querySelector('#prepend-prompt-count');
      if (counter) {
        counter.textContent = String((data.prependPrompt || '').length);
      }
      markPageDataFresh?.('profile');
      toast('已根据全部旅行记忆重新提炼前置提示词！');
    } catch (error) {
      toast(error?.message || '重新提炼失败');
    }
    return true;
  }

  if (action === 'refresh-profile') {
    await loadProfile(refreshProfileInDOM, { force: true });
    return true;
  }
  if (action === 'add-custom-preference') {
    const value = document.querySelector('#new-pref-input')?.value?.trim();
    if (value && state.user) {
      await request('/api/preferences', { method: 'POST', body: JSON.stringify({ value }) });
      state.useMemoriesInPlan = true;
      await loadProfile(refreshProfileInDOM, { force: true });
      toast(`已添加偏好“${value}”！`);
    }
    return true;
  }
  if (action === 'confirm-memory-candidate') {
    state.useMemoriesInPlan = true;
    const candidate = state.memoryCandidate;
    if (!candidate) return true;
    if (!state.user) {
      const guestMemory = {
        id: `guest-mem-${Date.now()}`,
        content: candidate.content,
        category: candidate.category || 'CUSTOM',
        sourceType: 'GUEST_LOCAL',
        createdAt: Date.now()
      };
      const current = state.profile?.memories || [];
      state.profile = { ...(state.profile || {}), memories: [...current, guestMemory] };
      saveGuestMemories(state.profile.memories);
      state.memoryCandidate = null;
      renderChatInDOM({ scrollToBottom: false }, renderView);
      toast('已在本地记住，登录后可同步至云端偏好。');
      return true;
    }
    try {
      if (candidate.id) {
        await request(`/api/memories/candidates/${encodeURIComponent(candidate.id)}/confirm`, { method: 'POST' });
      } else {
        await request('/api/memories', {
          method: 'POST',
          body: JSON.stringify({ content: candidate.content, category: candidate.category, sourceType: 'CHAT_CONFIRMED' })
        });
      }
      state.memoryCandidate = null;
      state.profile = null;
      invalidatePageCache?.('profile');
      renderChatInDOM({ scrollToBottom: false }, renderView);
      toast('已记住，未来规划会在不与本次需求冲突时参考。');
    } catch (error) {
      toast(error.message);
    }
    return true;
  }
  if (action === 'dismiss-memory-candidate') {
    const candidate = state.memoryCandidate;
    if (candidate?.id) {
      try {
        await request(`/api/memories/candidates/${encodeURIComponent(candidate.id)}/dismiss`, { method: 'POST' });
      } catch (error) {
        toast(error.message);
        return true;
      }
    }
    state.memoryCandidate = null;
    renderChatInDOM({ scrollToBottom: false }, renderView);
    return true;
  }
  if (action === 'add-travel-memory') {
    const content = String(document.querySelector('#new-memory-input')?.value || '').trim();
    if (!content) {
      toast('请输入要记住的旅行习惯。');
      return true;
    }
    try {
      const data = await request('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ content, category: 'CUSTOM', sourceType: 'USER_EDIT' })
      });
      state.profile = { ...(state.profile || {}), memories: [...(state.profile?.memories || []), data.memory].filter(Boolean) };
      markPageDataFresh?.('profile');
      refreshMemoryPanel();
      void syncPrependPromptAfterMemoryChange();
      toast('旅行记忆已添加。');
    } catch (error) {
      toast(error.message);
    }
    return true;
  }
  if (action === 'edit-travel-memory') {
    const content = window.prompt('编辑旅行记忆', target.dataset.content || '');
    if (content === null || !content.trim()) return true;
    try {
      const data = await request(`/api/memories/${encodeURIComponent(target.dataset.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: content.trim(), category: target.dataset.category || 'CUSTOM' })
      });
      state.profile = {
        ...(state.profile || {}),
        memories: (state.profile?.memories || []).map((memory) => memory.id === target.dataset.id
          ? (data.memory || { ...memory, content: content.trim() })
          : memory)
      };
      markPageDataFresh?.('profile');
      refreshMemoryPanel();
      void syncPrependPromptAfterMemoryChange();
      toast('旅行记忆已更新。');
    } catch (error) {
      toast(error.message);
    }
    return true;
  }
  if (action === 'delete-travel-memory') {
    const previousProfile = state.profile;
    state.profile = {
      ...(state.profile || {}),
      memories: (state.profile?.memories || []).filter((memory) => memory.id !== target.dataset.id)
    };
    markPageDataFresh?.('profile');
    refreshMemoryPanel();
    toast('已从当前档案移除，正在后台删除。');
    void request(`/api/memories/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' }).then(() => {
      void syncPrependPromptAfterMemoryChange();
      toast('旅行记忆已删除。');
    }).catch((error) => {
      state.profile = previousProfile;
      refreshMemoryPanel();
      toast(`删除失败，已恢复：${error.message}`);
    });
    return true;
  }
  if (action === 'confirm-profile-memory-candidate' || action === 'dismiss-profile-memory-candidate') {
    const id = target.dataset.id;
    if (!id) return true;
    try {
      const operation = action === 'confirm-profile-memory-candidate' ? 'confirm' : 'dismiss';
      const data = await request(`/api/memories/candidates/${encodeURIComponent(id)}/${operation}`, { method: 'POST' });
      state.profile = {
        ...(state.profile || {}),
        memoryCandidates: (state.profile?.memoryCandidates || []).filter((candidate) => candidate.id !== id),
        memories: operation === 'confirm' && data.memory
          ? [...(state.profile?.memories || []), data.memory]
          : (state.profile?.memories || [])
      };
      if (operation === 'confirm') {
        state.useMemoriesInPlan = true;
        void syncPrependPromptAfterMemoryChange();
      }
      markPageDataFresh?.('profile');
      refreshMemoryPanel();
      toast(operation === 'confirm' ? '旅行记忆已确认。' : '已忽略这条记忆建议。');
    } catch (error) {
      toast(error.message);
    }
    return true;
  }
  if (action === 'toggle-travel-memory' || action === 'enable-travel-memory') {
    const current = state.profile?.memoryEnabled === true;
    if (action === 'enable-travel-memory' && current) return true;
    try {
      const enabled = action === 'enable-travel-memory' ? true : !current;
      const data = await request('/api/memory-settings', { method: 'PUT', body: JSON.stringify({ enabled }) });
      state.profile = { ...(state.profile || {}), memoryEnabled: data.memoryEnabled === true };
      if (data.memoryEnabled === true) {
        state.useMemoriesInPlan = true;
      }
      markPageDataFresh?.('profile');
      refreshMemoryPanel();
      refreshSlotsPanel();
      toast(data.memoryEnabled ? '已启用长期旅行记忆。' : '已关闭长期旅行记忆；现有条目仍会保留。');
    } catch (error) {
      toast(error.message);
    }
    return true;
  }
  if (action === 'remove-preference') {
    state.loading = true;
    try {
      await request(`/api/preferences/${encodeURIComponent(target.dataset.value)}`, { method: 'DELETE' });
      await loadProfile(refreshProfileInDOM, { force: true });
      toast('已移除该偏好标签。');
    } catch (error) {
      toast(error.message);
    } finally {
      state.loading = false;
    }
    return true;
  }
  if (action === 'toggle-slot-tag') {
    const slot = target.dataset.slot;
    const tag = target.dataset.tag;
    if (!slot || !tag) return true;
    const key = slot === 'dining' ? 'diningSlots' : 'attractionSlots';
    const currentList = Array.isArray(state.profile?.[key]) ? state.profile[key] : [];
    const exists = currentList.includes(tag);
    const op = exists ? 'remove' : 'add';
    try {
      const data = await request('/api/preferences/slots', {
        method: 'POST',
        body: JSON.stringify({ slot, tag, action: op })
      });
      if (state.profile) {
        state.profile.diningSlots = data.diningSlots || [];
        state.profile.attractionSlots = data.attractionSlots || [];
      }
      state.useMemoriesInPlan = true;
      markPageDataFresh?.('profile');
      refreshSlotsPanel();
      toast(exists ? `已移除偏好“${tag}”` : `已点亮偏好“${tag}”`);
    } catch (error) {
      toast(error?.message || '操作失败，请重试');
    }
    return true;
  }
  if (action === 'remove-slot-tag') {
    const slot = target.dataset.slot;
    const tag = target.dataset.tag;
    if (!slot || !tag) return true;
    try {
      const data = await request('/api/preferences/slots', {
        method: 'POST',
        body: JSON.stringify({ slot, tag, action: 'remove' })
      });
      if (state.profile) {
        state.profile.diningSlots = data.diningSlots || [];
        state.profile.attractionSlots = data.attractionSlots || [];
      }
      markPageDataFresh?.('profile');
      refreshSlotsPanel();
      toast(`已移除偏好“${tag}”`);
    } catch (error) {
      toast(error?.message || '移除失败，请重试');
    }
    return true;
  }
  if (action === 'add-custom-slot-tag') {
    const slot = target.dataset.slot;
    if (!slot) return true;
    const input = document.getElementById(`new-${slot}-tag-input`);
    const tag = input?.value?.trim();
    if (!tag) {
      toast('请输入偏好标签内容');
      return true;
    }
    try {
      const data = await request('/api/preferences/slots', {
        method: 'POST',
        body: JSON.stringify({ slot, tag, action: 'add' })
      });
      if (input) input.value = '';
      if (state.profile) {
        state.profile.diningSlots = data.diningSlots || [];
        state.profile.attractionSlots = data.attractionSlots || [];
      }
      state.useMemoriesInPlan = true;
      markPageDataFresh?.('profile');
      refreshSlotsPanel();
      toast(`已添加偏好“${tag}”`);
    } catch (error) {
      toast(error?.message || '添加偏好失败，请重试');
    }
    return true;
  }
  return false;
}
