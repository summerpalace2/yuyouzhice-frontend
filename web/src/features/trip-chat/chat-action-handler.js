import { resetConversationContext } from './chat-service.js';
import { executeAgentConfirmDecision } from './agent-service.js';
import { getGuestChatSessionId, getChatMemorySessionId } from '../../app-core/user-store.js';
import { acknowledgeChatModeGuide, announceChatMode } from './chat-mode-guide.js';
import { request as apiRequest } from '../../shared/api/client.js';
import { saveGuestMemories } from '../../app-core/user-store.js';
import { captureWorkspace } from '../../app-core/workspace-lifecycle.js';

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
  invalidatePageCache,
  request = apiRequest
} = {}) {
  if (action === 'acknowledge-chat-mode-guide' || action === 'show-chat-mode-guide') {
    state.chatModeGuideOpen = action === 'show-chat-mode-guide';
    if (!state.chatModeGuideOpen) acknowledgeChatModeGuide(state.user?.id);
    renderChatInDOM({ scrollToBottom: false }, renderView);
    return true;
  }
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
      toast(state.chatMode === 'agent'
        ? `已选中【${targetStopName || '当前站点'}】，可让智能体直接预演替换、算路或固定站点。`
        : (state.chatMode === 'planner'
          ? (isDiningStop ? `已选中【${targetStopName || '当前餐饮'}】，可在右侧选择换餐策略。` : `已选中【${targetStopName || '当前站点'}】，可在右侧选择局部调整策略。`)
          : (isDiningStop ? `已选中【${targetStopName || '当前餐饮'}】，可继续咨询招牌特色与排队建议。` : `已选中【${targetStopName || '当前站点'}】，聊天模式可继续咨询景点的详细信息。`)));
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
    const keepAgent = state.chatMode === 'agent';
    const switchedMode = !keepAgent && state.chatMode !== 'planner';
    if (!keepAgent) state.chatMode = 'planner';
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
    if (switchedMode) announceChatMode('planner', toast);
    else toast(`已选中【${stopName}】，正在查询同片区可替换候选……`);
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
  if (action === 'switch-chat-mode' || action === 'switch-adjustment-mode' || action === 'switch-agent-mode') {
    state.chatMode = 'agent';
    state.chatInput = String(target?.dataset?.prompt || state.chatInput || '');
    persistChatMode(state, saveUserPlan, persistTripWorkspace);
    renderChatInDOM({ scrollToBottom: false }, renderView);
    announceChatMode(state.chatMode, toast);
    return true;
  }
  if (action === 'agent-confirm-approve' || action === 'agent-confirm-cancel') {
    const confirmId = String(target?.dataset?.confirmId || '').trim();
    const messageIndex = Number.parseInt(target?.dataset?.messageIndex || '-1', 10);
    const guestOrTripChatKey = !state.user && state.view === 'guest-chat'
      ? getGuestChatSessionId()
      : (state.chatSessionId || getTripChatKey?.(state.savedTripId, state.sessionId) || 'default');
    const memorySessionId = getChatMemorySessionId(guestOrTripChatKey, state.user?.id);
    return executeAgentConfirmDecision({
      confirmId,
      approved: action === 'agent-confirm-approve',
      messageIndex,
      memorySessionId,
      renderView,
      scheduleTripMap,
      renderChatInDOM,
      saveUserChats,
      saveUserPlan,
      persistTripWorkspace,
      getTripChatKey,
      invalidatePageCache,
      toast,
      request
    });
  }
  if (action === 'request-other-proposals') {
    if (state.chatLoading) {
      toast('正在生成方案，请稍候。');
      return true;
    }
    const switchedMode = state.chatMode !== 'planner';
    state.chatMode = 'planner';
    if (switchedMode) announceChatMode('planner', toast);
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
    if (state.view === 'planning') {
      renderView?.();
    }
    renderFloatingBtn();
    if (state.chatDockOpen) window.setTimeout(() => document.querySelector('#chat-input')?.focus(), 0);
    return true;
  }
  if (action === 'dismiss-planner-proposal') {
    const workspaceOwner = captureWorkspace({ exact: true });
    const dismissedProposal = state.activeProposal;
    const closeOnly = target?.dataset?.closeOnly === 'true';
    if (!closeOnly) {
      try { await resetConversationContext(); }
      catch (error) {
        if (workspaceOwner.owns()) toast(error?.message || '取消本轮调整失败，请稍后重试。');
        return true;
      }
    }
    if (!workspaceOwner.owns() || (state.activeProposal && state.activeProposal !== dismissedProposal)) return true;
    state.activeProposal = null;
    state.plannerProposalDockOpen = false;
    state.selectedOptionId = 'option-1';
    state.suggestionDismissed = false;
    renderChatInDOM({ scrollToBottom: false }, renderView);
    saveUserPlan(state.user?.id, { trip: state.trip, sessionId: state.sessionId, savedTripId: state.savedTripId,
      prompt: state.prompt, view: 'planning', activeProposal: null, selectedOptionId: 'option-1' });
    toast(closeOnly ? '已关闭提示。' : '已取消本轮调整，当前行程未改变。');
    return true;
  }
  if (action === 'reset-chat') {
    const workspaceOwner = captureWorkspace({ exact: true });
    const resetOwner = {sessionId:state.sessionId,tripId:state.savedTripId,userId:state.user?.id,chatKey:state.chatSessionId};
    try { await resetConversationContext(); } catch { toast('后台对话上下文暂未清除，请稍后重试。'); return true; }
    if (!workspaceOwner.owns() || state.sessionId !== resetOwner.sessionId || state.savedTripId !== resetOwner.tripId || state.user?.id !== resetOwner.userId || state.chatSessionId !== resetOwner.chatKey) return true;
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
        announceChatMode('planner', toast);
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } else if (target.dataset.mode === 'agent' && state.chatMode !== 'agent') {
        state.chatMode = 'agent';
        announceChatMode('agent', toast);
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } else if (target.dataset.mode === 'chat' && state.chatMode !== 'chat') {
        state.chatMode = 'chat';
        announceChatMode('chat', toast);
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

    const chipAction = String(chipBtn.dataset.chipAction || '').trim();
    const chipPayload = String(chipBtn.dataset.chipPayload || '').trim();
    const chipLabel = String(chipBtn.dataset.chipLabel || '').trim();

    const matchingSuggestions = (state.chatMessages || []).flatMap(msg => msg.actionableSuggestions || [])
      .filter(sug => sug.action === chipAction && (sug.payload === chipPayload || sug.label === chipLabel));
    if (matchingSuggestions.some(sug => sug.sending)) return true;
    if (state.chatLoading) {
      // A different suggestion may replace an in-progress reply.
      cancelChatMessage();
      state.chatLoading = false;
    }

    if (chipAction === 'save_slot_preference' || chipAction === 'save_memory') {
      const workspaceOwner = captureWorkspace();
      const sourceMessages = state.chatMessages;
      const sourceChatKey = state.chatSessionId;
      const sourceSessionId = state.sessionId;
      const sourceTripId = state.savedTripId;
      const ownsMemoryReceipt = () => workspaceOwner.owns()
        && state.chatMessages === sourceMessages && state.chatSessionId === sourceChatKey
        && state.sessionId === sourceSessionId && state.savedTripId === sourceTripId;
      const originalHtml = chipBtn.innerHTML;
      let slot;
      let tag;
      if (chipAction === 'save_slot_preference') {
        slot = 'dining';
        tag = chipLabel;
        try {
          const parsed = JSON.parse(chipPayload);
          slot = parsed.slot;
          tag = String(parsed.tag || '').trim();
        } catch {
          // Historical chips used a bracketed label instead of JSON. Parse the
          // label's structure, without guessing its meaning from food/place words.
          tag = chipLabel.match(/【([^】]+)】/)?.[1]?.trim() || '';
          slot = /(?:景点|出行)偏好/.test(chipLabel) ? 'attraction' : 'dining';
        }
      }
      const memoryContent = chipAction === 'save_memory' ? (chipPayload || chipLabel) : `偏好${tag}`;
      const category = chipAction === 'save_memory' ? 'CUSTOM' : (slot === 'dining' ? 'DIET' : 'INTEREST');
      try {
        if (!memoryContent.trim() || (chipAction === 'save_slot_preference' && (!tag || !['dining', 'attraction'].includes(slot)))) {
          throw new Error('偏好内容无效，请重新确认。');
        }
        chipBtn.disabled = true;
        chipBtn.classList.add('is-active-loading');
        chipBtn.innerHTML = '<span class="chat-action-chip-icon">⏳</span><span class="chat-action-chip-label">正在保存偏好...</span>';

        let savedItem;
        if (!state.user) {
          savedItem = (state.profile?.memories || []).find(m => m.content === memoryContent && m.category === category)
            || { id: `guest-mem-${Date.now()}`, content: memoryContent, category, status: 'CONFIRMED', sourceType: 'GUEST_LOCAL', createdAt: Date.now() };
        } else {
          const response = await request('/api/memories', {
            method: 'POST',
            body: JSON.stringify({ content: memoryContent, category, sourceType: 'CHAT_CONFIRMED' })
          });
          savedItem = response?.memory || response?.data;
          if (response?.ok === false || !savedItem?.id || !savedItem?.content) {
            throw new Error('服务端未确认偏好保存，请重试。');
          }
        }

        if (!ownsMemoryReceipt()) return true;
        const current = state.profile?.memories || [];
        state.profile = { ...(state.profile || {}), memories: [savedItem, ...current.filter(m => m.id !== savedItem.id)] };
        if (!state.user) {
          saveGuestMemories(state.profile.memories);
          // Older guest drafts still read these tags. Cloud planning reads confirmed memories.
          if (slot) {
            const key = slot === 'dining' ? 'diningSlots' : 'attractionSlots';
            state.profile[key] = [...new Set([...(state.profile[key] || []), tag])];
          }
        }
        let refreshFailed = false;
        if (state.user) {
          try {
            const profile = await request('/api/profile');
            if (profile?.ok === false || !Array.isArray(profile?.memories)
                || !profile.memories.some(m => m.id === savedItem.id)) {
              throw new Error('档案读取尚未确认新记忆');
            }
            if (!ownsMemoryReceipt()) return true;
            state.profile = profile;
          } catch {
            refreshFailed = true;
          }
        }

        if (!ownsMemoryReceipt()) return true;
        matchingSuggestions.forEach(sug => { sug.applied = true; sug.savedMemoryId = savedItem.id; });
        const chatKey = state.chatSessionId || getTripChatKey?.(state.savedTripId, state.sessionId);
        if (chatKey) {
          state.tripChatHistories = { ...(state.tripChatHistories || {}), [chatKey]: state.chatMessages };
          saveUserChats?.(state.user?.id, state.tripChatHistories);
        }
        state.memoryCandidate = null;
        state.useMemoriesInPlan = true;
        invalidatePageCache?.('profile');
        chipBtn.classList.remove('is-active-loading');
        chipBtn.classList.add('is-applied');
        chipBtn.innerHTML = '<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已保存偏好</span>';
        toast(!state.user ? `已在本地记住【${memoryContent}】，登录后可同步。`
          : (refreshFailed ? '偏好已保存，档案刷新暂时失败，请稍后重新打开档案。' : `已将【${memoryContent}】保存至旅行档案并更新规划画像。`));
        renderChatInDOM({ scrollToBottom: false }, renderView);
      } catch (err) {
        if (!ownsMemoryReceipt()) return true;
        matchingSuggestions.forEach(sug => { sug.applied = false; delete sug.savedMemoryId; });
        chipBtn.disabled = false;
        chipBtn.classList.remove('is-active-loading');
        chipBtn.classList.remove('is-applied');
        chipBtn.innerHTML = originalHtml;
        toast(err?.status === 401 ? '登录已失效，请重新登录后保存偏好。' : (err?.message || '偏好保存失败，请稍后重试。'));
      }
      return true;
    }

    const modeChanged = state.view === 'planning' && state.trip && chipAction !== 'chat_info' && state.chatMode !== 'agent';
    const actionOwner = captureWorkspace();
    const originalHtml = chipBtn.innerHTML;
    matchingSuggestions.forEach(sug => {
      sug.applied = false;
      // This flag is only for the live UI; do not persist a disabled chip on refresh.
      Object.defineProperty(sug, 'sending', { value: true, writable: true, configurable: true, enumerable: false });
    });

    if (state.view === 'planning' && state.trip && chipAction !== 'chat_info') {
      if (state.chatMode !== 'agent') {
        state.chatMode = 'agent';
        persistChatMode(state, saveUserPlan, persistTripWorkspace);
        renderChatInDOM({ scrollToBottom: false }, renderView);
      }
    }
    const promptText = chipPayload || chipLabel;
    if (promptText) {
      chipBtn.disabled = true;
      chipBtn.classList.add('is-active-loading');
      chipBtn.innerHTML = '<span class="chat-action-chip-icon">⏳</span><span class="chat-action-chip-label">正在提交调整...</span>';
      if (modeChanged) announceChatMode('agent', toast);
      else toast(`正在为你执行：${chipLabel}...`);
      const sourceMessages = state.chatMessages;
      const previousMessageCount = sourceMessages.length;
      let sendError = null;
      try {
        await sendChatMessage({ inputOverride: promptText, preserveInput: true, renderView, scheduleTripMap });
      } catch (error) {
        sendError = error;
      } finally {
        matchingSuggestions.forEach(sug => { delete sug.sending; });
      }
      if (!actionOwner.owns() || state.chatMessages !== sourceMessages) return true;
      const response = sourceMessages.slice(previousMessageCount).find(message => message.role === 'assistant');
      const failed = Boolean(sendError) || !response || Boolean(response.error)
        || ['auth', 'temporary'].includes(response.failureKind)
        || /本次回复已停止/.test(response.content || '');
      chipBtn.classList.remove('is-active-loading');
      if (failed) {
        matchingSuggestions.forEach(sug => { sug.applied = false; });
        chipBtn.disabled = false;
        chipBtn.classList.remove('is-applied');
        chipBtn.innerHTML = originalHtml;
        if (sendError) toast(sendError?.message || '调整未能提交，请重试。');
        renderChatInDOM({ scrollToBottom: false }, renderView);
        return true;
      }
      matchingSuggestions.forEach(sug => { sug.applied = true; });
      chipBtn.classList.add('is-applied');
      chipBtn.innerHTML = '<span class="chat-action-chip-icon">✓</span><span class="chat-action-chip-label">已发起调整</span>';
      renderChatInDOM({ scrollToBottom: false }, renderView);
    }
    return true;
  }
  return false;
}
