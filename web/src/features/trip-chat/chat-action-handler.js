import { request } from '../../shared/api/client.js';
import { saveGuestMemories } from '../../app-core/user-store.js';

/**
 * 聊天工作区动作协调器。
 *
 * 只处理用户交互和当前行程聊天上下文；流式网络协议仍由 chat-service 管理。
 * 选中景点、模式切换和提案预览都只刷新聊天/浮窗区域，避免重建行程地图。
 */
function persistChatMode(state, saveUserPlan, persistTripWorkspace) {
  saveUserPlan(state.user?.id, {
    trip: state.trip,
    sessionId: state.sessionId,
    savedTripId: state.savedTripId,
    prompt: state.prompt,
    view: state.view,
    chatMode: state.chatMode
  });
  void persistTripWorkspace();
}

export async function handleChatAction({
  action,
  target,
  state,
  toast,
  renderView,
  renderFloatingBtn,
  renderChatInDOM,
  renderPlannerProposalDockInDOM,
  saveUserPlan,
  saveUserChats,
  persistTripWorkspace,
  getTripChatKey,
  sendChatMessage,
  cancelChatMessage,
  applyPlannerProposal,
  planFromCurrent,
  scheduleTripMap,
  invalidatePageCache
} = {}) {
  if (action === 'select-stop') {
    const stopId = String(target.dataset.id || '').trim();
    if (!stopId) return true;
    if (!(state.selectedStopIds instanceof Set)) state.selectedStopIds = new Set();

    // 单选逻辑：只能选中一个景点；若点击已选中的景点则取消；若点击其他景点则取消上一个并只选中新景点
    const isCurrentlySelected = state.selectedStopId === stopId || state.selectedStopIds.has(stopId);
    state.selectedStopIds.clear();

    let targetStopName = String(target.dataset.name || '').trim();
    let isDiningStop = false;

    if (isCurrentlySelected) {
      state.selectedStopId = null;
    } else {
      state.selectedStopId = stopId;
      state.selectedStopIds.add(stopId);
      state.activeDay = Number(target.dataset.day || 1);
      const foundStop = state.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === stopId);
      if (foundStop) {
        targetStopName = foundStop.name || targetStopName;
        isDiningStop = foundStop.type === 'DINING' || foundStop.icon === '餐';
      }
    }
    state.suggestionDismissed = false;

    if (typeof document !== 'undefined') {
      document.querySelectorAll('.stop').forEach((element) => {
        const isSelected = Boolean(state.selectedStopId && element.dataset.stopId === state.selectedStopId);
        element.classList.toggle('selected-stop-card', isSelected);
        const button = element.querySelector('[data-action="select-stop"]');
        if (button) {
          button.classList.toggle('active-btn', isSelected);
          const isDining = element.classList.contains('dining-stop-card') || button.dataset.isDining === 'true';
          button.textContent = isSelected ? '取消选中' : (isDining ? '选中此餐' : '选中此站');
        }
        const statusContainer = element.querySelector('.stop-header-status');
        if (statusContainer) {
          let chip = statusContainer.querySelector('.chip-selected');
          if (isSelected) {
            if (!chip) {
              chip = document.createElement('span');
              chip.className = 'chip chip-selected';
              chip.textContent = '✓ 已选中';
              statusContainer.appendChild(chip);
            }
          } else if (chip) {
            chip.remove();
          }
        }
      });
    }

    renderChatInDOM({ scrollToBottom: false }, renderView);

    if (state.selectedStopId) {
      toast(state.chatMode === 'planner'
        ? (isDiningStop ? `已选中【${targetStopName || '当前餐饮'}】，可在右侧选择换餐策略。` : `已选中【${targetStopName || '当前站点'}】，可在右侧选择局部调整策略。`)
        : (isDiningStop ? `已选中【${targetStopName || '当前餐饮'}】，可继续咨询招牌特色与排队建议。` : `已选中【${targetStopName || '当前站点'}】，聊天模式可继续咨询景点的详细信息。`));
    } else {
      toast(`已取消选择${targetStopName ? `【${targetStopName}】` : ''}。`);
    }
    return true;
  }
  if (action === 'quick-same-district-replace') {
    const stopId = String(target.dataset.id || '').trim();
    const stopName = String(target.dataset.name || '').trim();
    if (!stopId) return true;
    if (!(state.selectedStopIds instanceof Set)) state.selectedStopIds = new Set();
    state.selectedStopIds.clear();
    state.selectedStopIds.add(stopId);
    state.selectedStopId = stopId;
    state.activeDay = Number(target.dataset.day || 1);
    state.suggestionDismissed = false;
    state.chatMode = 'planner';
    state.chatDockOpen = true;
    persistChatMode(state, saveUserPlan, persistTripWorkspace);
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.stop').forEach((element) => {
        const selected = element.dataset.stopId === stopId;
        element.classList.toggle('selected-stop-card', selected);
        const button = element.querySelector('[data-action="select-stop"]');
        if (button) {
          button.classList.toggle('active-btn', selected);
          const isDining = element.classList.contains('dining-stop-card');
          button.textContent = selected ? '取消选中' : (isDining ? '选中此餐' : '选中此站');
        }
        const statusContainer = element.querySelector('.stop-header-status');
        if (statusContainer) {
          let chip = statusContainer.querySelector('.chip-selected');
          if (selected) {
            if (!chip) {
              chip = document.createElement('span');
              chip.className = 'chip chip-selected';
              chip.textContent = '✓ 已选中';
              statusContainer.appendChild(chip);
            }
          } else if (chip) {
            chip.remove();
          }
        }
      });
    }
    renderFloatingBtn();
    renderChatInDOM({ scrollToBottom: true }, renderView);
    toast(`已选中【${stopName}】，正在查询同片区可替换候选……`);
    await sendChatMessage({ inputOverride: `请推荐【${stopName}】的同片区可替换景点`, preserveInput: true, renderView, scheduleTripMap });
    return true;
  }
  if (['cancel-select-stop', 'clear-selected-stop', 'clear-stop-selection'].includes(action)) {
    state.selectedStopId = null;
    if (!(state.selectedStopIds instanceof Set)) state.selectedStopIds = new Set();
    state.selectedStopIds.clear();
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.stop').forEach((element) => {
        element.classList.remove('selected-stop-card');
        const button = element.querySelector('[data-action="select-stop"], [data-action="clear-selected-stop"]');
        if (button) {
          button.classList.remove('active-btn');
          button.dataset.action = 'select-stop';
          const isDining = element.classList.contains('dining-stop-card');
          button.textContent = isDining ? '选中此餐' : '选中此站';
        }
        element.querySelector('.chip-selected')?.remove();
      });
    }
    renderChatInDOM({ scrollToBottom: false }, renderView);
    toast('已清除景点选择。');
    return true;
  }
  if (action === 'toggle-pin-stop') {
    const stopId = String(target.dataset.id || '');
    if (stopId) {
      const pinned = state.pinnedStopIds.has(stopId);
      if (pinned) state.pinnedStopIds.delete(stopId);
      else state.pinnedStopIds.add(stopId);
      const stopElement = document.querySelector(`.stop[data-stop-id="${stopId}"]`);
      if (stopElement) {
        stopElement.classList.toggle('pinned-stop-card', !pinned);
        const button = stopElement.querySelector('[data-action="toggle-pin-stop"]');
        if (button) {
          button.classList.toggle('active-btn', !pinned);
          button.textContent = !pinned ? '取消固定' : '📌 固定';
        }
      }
    }
    return true;
  }
  if (action === 'select-option') {
    const optionId = String(target.dataset.optionId || '').trim();
    if (optionId && state.activeProposal) {
      state.selectedOptionId = optionId;
      document.querySelectorAll('.candidate-option-card').forEach((element) => {
        const selected = element.dataset.optionId === optionId;
        element.classList.toggle('selected', selected);
        const radio = element.querySelector('input[type="radio"]');
        if (radio) radio.checked = selected;
      });
      renderChatInDOM({ scrollToBottom: false }, renderView);
    }
    return true;
  }
  if (action === 'dismiss-suggestion' || action === 'reopen-suggestion') {
    state.suggestionDismissed = action === 'dismiss-suggestion';
    renderChatInDOM({ scrollToBottom: false }, renderView);
    return true;
  }
  if (action === 'replan-v1') {
    await planFromCurrent({ usePreferences: true });
    return true;
  }
  if (action === 'confirm-planner-proposal' || action === 'force-apply-planner-proposal') {
    await applyPlannerProposal({ renderView, scheduleTripMap, renderChatInDOM });
    return true;
  }
  if (action === 'open-planner-proposal' || action === 'close-planner-proposal') {
    state.plannerProposalDockOpen = action === 'open-planner-proposal';
    renderPlannerProposalDockInDOM();
    return true;
  }
  if (action === 'switch-chat-mode' || action === 'switch-adjustment-mode') {
    state.chatMode = action === 'switch-chat-mode' ? 'chat' : 'planner';
    state.chatInput = action === 'switch-chat-mode' ? '' : String(target.dataset.prompt || '');
    persistChatMode(state, saveUserPlan, persistTripWorkspace);
    renderChatInDOM({ scrollToBottom: false }, renderView);
    toast(action === 'switch-chat-mode'
      ? '已切换到聊天，可以继续咨询景点、天气和出行建议。'
      : '已切换到局部调整；原问题已放回输入框，请确认后发送。');
    return true;
  }
  if (action === 'request-other-proposals') {
    if (state.chatLoading) {
      toast('正在生成方案，请稍候。');
      return true;
    }
    state.chatMode = 'planner';
    state.plannerProposalDockOpen = false;
    state.chatDockOpen = true;
    renderFloatingBtn();
    const isDining = state.activeProposal?.diagnostics?.replacementMode === 'DINING'
      || state.activeProposal?.isDining
      || state.activeProposal?.candidateReplacements?.some(c => c.isDining || c.type === 'DINING');
    const defaultPrompt = isDining ? '换同片区其他美食餐厅' : '换同片区其他景点';
    const prompt = String(target.dataset.prompt || defaultPrompt);
    await sendChatMessage({ inputOverride: prompt, preserveInput: true, renderView, scheduleTripMap });
    return true;
  }
  if (action === 'open-chat-dock' || action === 'close-chat-dock') {
    state.chatDockOpen = action === 'open-chat-dock';
    renderFloatingBtn();
    if (state.chatDockOpen) window.setTimeout(() => document.querySelector('#chat-input')?.focus(), 0);
    return true;
  }
  if (action === 'dismiss-planner-proposal') {
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedOptionId = 'option-1';
    state.suggestionDismissed = false;
    renderChatInDOM({ scrollToBottom: false }, renderView);
    toast('已取消本次调整预览，当前行程未改变。');
    return true;
  }
  if (action === 'reset-chat') {
    // A formal Trip owns exactly one chat stream; clearing it must preserve its stable key.
    const chatKey = state.chatSessionId || getTripChatKey(state.savedTripId, state.sessionId);
    state.chatSessionId = chatKey;
    state.chatMessages = [];
    state.chatMeta = null;
    state.chatProposal = null;
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.tripChatHistories = state.tripChatHistories || {};
    state.tripChatHistories[chatKey] = state.chatMessages;
    saveUserChats(state.user?.id, state.tripChatHistories);
    void persistTripWorkspace();
    renderChatInDOM({ scrollToBottom: true }, renderView);
    toast('已清空当前行程的对话记录。');
    return true;
  }
  if (action === 'unpin-and-retry') {
    state.pinnedStopIds.clear();
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedOptionId = 'option-1';
    state.suggestionDismissed = false;
    renderChatInDOM({ scrollToBottom: false }, renderView);
    toast('已取消固定站点，请重新描述希望怎样调整行程。');
    return true;
  }
  if (action === 'cancel-chat') {
    cancelChatMessage();
    return true;
  }
  if (action === 'retry-chat' || action === 'quick-ai-action') {
    if (state.chatLoading) {
      toast(action === 'retry-chat' ? '正在生成回复，请先停止当前回复后再重试。' : '正在生成回复，请先停止当前回复后再发送新的问题。');
      return true;
    }
    target.classList.add('is-active-loading');
    if (action === 'quick-ai-action') {
      if (target.dataset.mode === 'planner' && state.chatMode !== 'planner') {
        state.chatMode = 'planner';
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } else if (target.dataset.mode === 'chat' && state.chatMode !== 'chat') {
        state.chatMode = 'chat';
        renderChatInDOM({ scrollToBottom: false }, renderView);
      }
    }
    const prompt = String(target.dataset.prompt || '');
    if (action === 'retry-chat') state.chatInput = prompt;
    try {
      await sendChatMessage({ inputOverride: prompt, preserveInput: action === 'quick-ai-action', renderView, scheduleTripMap });
    } finally {
      target.classList.remove('is-active-loading');
    }
    return true;
  }
  if (action === 'execute-action-chip') {
    const chipBtn = target.closest('[data-action="execute-action-chip"]') || target;
    if (chipBtn.disabled || chipBtn.classList.contains('is-applied') || chipBtn.classList.contains('is-active-loading')) {
      return true;
    }

    if (state.chatLoading) {
      // 方案 C：若用户在生成中点击，立即自动打断当前回复，并直接执行所选卡片！
      cancelChatMessage();
      state.chatLoading = false;
    }

    const chipAction = String(chipBtn.dataset.chipAction || '').trim();
    const chipPayload = String(chipBtn.dataset.chipPayload || '').trim();
    const chipLabel = String(chipBtn.dataset.chipLabel || '').trim();

    // 标记在 message 数据模型中，确保后续 renderChatInDOM 重绘时依旧保持已点击/已应用态
    for (const msg of (state.chatMessages || [])) {
      if (Array.isArray(msg.actionableSuggestions)) {
        for (const sug of msg.actionableSuggestions) {
          if (sug.action === chipAction && (sug.payload === chipPayload || sug.label === chipLabel)) {
            sug.applied = true;
          }
        }
      }
    }

    if (chipAction === 'save_slot_preference') {
      let slot = 'dining';
      let tag = chipLabel;
      try {
        const parsed = JSON.parse(chipPayload);
        if (parsed.slot) slot = parsed.slot;
        if (parsed.tag) tag = parsed.tag;
      } catch (e) {
        if (chipLabel.includes('烧烤')) tag = '烧烤';
        else if (chipLabel.includes('甜品') || chipLabel.includes('甜食')) tag = '甜品糖水';
        else if (chipLabel.includes('火锅')) tag = '老火锅';
        else if (chipLabel.includes('老茶馆') || chipLabel.includes('喝茶')) tag = '老茶馆';
        else if (chipLabel.includes('咖啡')) tag = '特色咖啡';
        else if (chipLabel.includes('小吃')) tag = '特色小吃';
        else if (chipLabel.includes('夜景')) tag = '山城夜景';
        else if (chipLabel.includes('室内')) tag = '室内场馆';
      }

      try {
        chipBtn.disabled = true;
        chipBtn.classList.add('is-active-loading');
        chipBtn.innerHTML = '<span class="chat-action-chip-icon">⏳</span><span class="chat-action-chip-label">正在保存偏好...</span>';

        if (!state.user) {
          const key = slot === 'dining' ? 'diningSlots' : 'attractionSlots';
          const currentList = Array.isArray(state.profile?.[key]) ? state.profile[key] : [];
          if (!currentList.includes(tag)) {
            state.profile = {
              ...(state.profile || {}),
              [key]: [...currentList, tag]
            };
          }
          state.useMemoriesInPlan = true;
          invalidatePageCache?.('profile');
          toast(`已将【${tag}】加入${slot === 'dining' ? '美食' : '出行'}偏好！`);
          chipBtn.classList.remove('is-active-loading');
          chipBtn.classList.add('is-applied');
          chipBtn.innerHTML = `<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已加入${slot === 'dining' ? '美食' : '出行'}偏好</span>`;
          renderChatInDOM({ scrollToBottom: false }, renderView);
          if (typeof window !== 'undefined') {
            void request('/api/preferences/slots', {
              method: 'POST',
              body: JSON.stringify({ slot, tag, action: 'add' })
            }).catch(() => {});
          }
          return true;
        }

        const res = await request('/api/preferences/slots', {
          method: 'POST',
          body: JSON.stringify({ slot, tag, action: 'add' })
        });

        if (state.profile) {
          state.profile.diningSlots = res?.diningSlots || [];
          state.profile.attractionSlots = res?.attractionSlots || [];
        }
        state.useMemoriesInPlan = true;
        invalidatePageCache?.('profile');
        toast(`已将【${tag}】加入${slot === 'dining' ? '美食' : '出行'}偏好！`);
        chipBtn.classList.remove('is-active-loading');
        chipBtn.classList.add('is-applied');
        chipBtn.innerHTML = `<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已加入${slot === 'dining' ? '美食' : '出行'}偏好</span>`;
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } catch (err) {
        chipBtn.disabled = false;
        chipBtn.classList.remove('is-active-loading');
        toast(err?.message || '偏好保存失败，请稍后重试。');
      }
      return true;
    }

    if (chipAction === 'save_memory') {
      const memoryContent = chipPayload || chipLabel;
      try {
        chipBtn.disabled = true;
        chipBtn.classList.add('is-active-loading');
        chipBtn.innerHTML = `<span class="chat-action-chip-icon">⏳</span><span class="chat-action-chip-label">正在沉淀...</span>`;

        if (!state.user) {
          const guestMemory = {
            id: `guest-mem-${Date.now()}`,
            content: memoryContent,
            category: 'CUSTOM',
            sourceType: 'GUEST_LOCAL',
            createdAt: Date.now()
          };
          const current = state.profile?.memories || [];
          state.profile = { ...(state.profile || {}), memories: [guestMemory, ...current] };
          saveGuestMemories(state.profile.memories);
          state.memoryCandidate = null;
          toast(`已在本地记住【${memoryContent}】，登录后可同步至云端偏好。`);
          chipBtn.classList.remove('is-active-loading');
          chipBtn.classList.add('is-applied');
          chipBtn.innerHTML = `<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已沉淀至档案</span>`;
          renderChatInDOM({ scrollToBottom: false }, renderView);
          return true;
        }

        const res = await request('/api/memories', {
          method: 'POST',
          body: JSON.stringify({
            content: memoryContent,
            category: 'CUSTOM',
            sourceType: 'CHAT_CONFIRMED'
          })
        });
        const savedItem = res?.data || res?.memory || {
          id: `mem-${Date.now()}`,
          content: memoryContent,
          category: 'CUSTOM',
          sourceType: 'CHAT_CONFIRMED',
          createdAt: Date.now()
        };
        const current = state.profile?.memories || [];
        if (!current.some((m) => m.content === memoryContent)) {
          state.profile = { ...(state.profile || {}), memories: [savedItem, ...current] };
        }
        if (state.memoryCandidate) {
          state.memoryCandidate = null;
        }
        invalidatePageCache?.('profile');
        toast(`已将【${memoryContent}】沉淀至旅行档案！`);
        chipBtn.classList.remove('is-active-loading');
        chipBtn.classList.add('is-applied');
        chipBtn.innerHTML = `<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已沉淀至档案</span>`;
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } catch (err) {
        chipBtn.disabled = false;
        chipBtn.classList.remove('is-active-loading');
        if (err?.status === 401) {
          toast('登录后即可永久将个人偏好沉淀至旅行档案。');
        } else {
          toast(err?.message || '沉淀档案失败，请稍后重试。');
        }
      }
      return true;
    }

    if (state.view === 'planning' && state.trip && chipAction !== 'chat_info') {
      if (state.chatMode !== 'planner') {
        state.chatMode = 'planner';
        persistChatMode(state, saveUserPlan, persistTripWorkspace);
      }
    }
    const promptText = chipPayload || chipLabel;
    if (promptText) {
      chipBtn.disabled = true;
      chipBtn.classList.add('is-applied');
      chipBtn.innerHTML = `<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已发起调整...</span>`;
      toast(`正在为你执行：${chipLabel}...`);
      await sendChatMessage({ inputOverride: promptText, preserveInput: true, renderView, scheduleTripMap });
    }
    return true;
  }
  return false;
}
