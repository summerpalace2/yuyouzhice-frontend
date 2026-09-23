import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ChatMessage, ChatMeta, ChatProposal } from '@/shared/types/contracts';
import { deviceId, plannerIdempotencyKey, request } from '@/shared/api/client';
import { useTripStore } from './trip';
import { useUiStore } from './ui';

export const useChatStore = defineStore('chat', () => {
  const tripStore = useTripStore();
  const ui = useUiStore();

  const chatSessionId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const input = ref('');
  const mode = ref<'normal' | 'deep'>('normal');
  const loading = ref(false);
  const meta = ref<ChatMeta | null>(null);
  const activeProposal = ref<ChatProposal | null>(null);
  const chatProposal = ref<ChatProposal | null>(null);
  const selectedOptionId = ref('option-1');
  const suggestionDismissed = ref(false);

  function resetChat() {
    chatSessionId.value = `chat-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    messages.value = [];
    input.value = '';
    meta.value = null;
    activeProposal.value = null;
    chatProposal.value = null;
    selectedOptionId.value = 'option-1';
    loading.value = false;
    ui.showToast('已开启新对话。');
  }

  async function readChatStream(
    messageText: string,
    onEvent: (event: string, data: string) => void
  ) {
    const params = new URLSearchParams({
      message: messageText,
      sessionId: chatSessionId.value || 'default',
      mode: mode.value,
      plannerSessionId: String(tripStore.sessionId || ''),
      tripId: String(tripStore.savedTripId || ''),
      currentVersion: String(tripStore.trip?.version || '')
    });

    const response = await fetch(`/api/chat/stream?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'text/event-stream', 'x-yuyouzhice-device': deviceId() }
    });

    if (!response.ok || !response.body) {
      throw new Error('Java Core Backend 对话流连接失败。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let eventData: string[] = [];

    const dispatch = () => {
      if (!eventData.length) return;
      onEvent(eventName || 'message', eventData.join('\n'));
      eventName = 'message';
      eventData = [];
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line === '') dispatch();
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) eventData.push(line.slice(5).replace(/^ /, ''));
      }
      if (done) break;
    }
    if (buffer && buffer.startsWith('data:')) {
      eventData.push(buffer.slice(5).replace(/^ /, ''));
    }
    dispatch();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || loading.value) return;
    chatSessionId.value ||= `web-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

    messages.value.push({ role: 'user', content: text });
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', pending: true };
    messages.value.push(assistantMsg);
    input.value = '';
    meta.value = null;
    loading.value = true;

    // 规划微调通道
    if (tripStore.sessionId) {
      try {
        const convRes = await request<any>('/api/planner/conversation', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: tripStore.sessionId,
            planId: tripStore.sessionId,
            baseRevision: tripStore.trip ? Number(tripStore.trip.version || 1) : 1,
            message: text,
            context: {
              activeDay: Number(tripStore.activeDay || 1),
              selectedStopId: tripStore.selectedStopId || null,
              activeProposalId: activeProposal.value ? activeProposal.value.proposalId : null,
              pinnedStopIds: Array.from(tripStore.pinnedStopIds || [])
            },
            sessionAccessToken: tripStore.sessionAccessToken || '',
            idempotencyKey: plannerIdempotencyKey('planner-conversation')
          })
        });

        if (convRes.proposalId) {
          activeProposal.value = convRes;
          selectedOptionId.value = 'option-1';
          assistantMsg.content = convRes.message || (convRes.feasible ? '已为您生成调整方案预览，请在下方查看并确认。' : '当前调整方案存在冲突不可行，已提供替代建议。');
          assistantMsg.pending = false;
          loading.value = false;
          return;
        }

        if (convRes.applied && convRes.trip) {
          tripStore.trip = convRes.trip;
          activeProposal.value = null;
          tripStore.selectedStopId = null;
          assistantMsg.content = convRes.message || '调整方案已成功应用并生成新版本！';
          assistantMsg.pending = false;
          loading.value = false;
          ui.showToast(`行程调整已应用！当前为第 ${convRes.currentVersion || convRes.trip.version} 版`);
          return;
        }

        const isUnknownIntent = convRes.type === 'UNKNOWN' || convRes.operation === 'UNKNOWN';
        if (!isUnknownIntent && convRes.requiresClarification && convRes.clarificationQuestion) {
          assistantMsg.content = convRes.clarificationQuestion;
          assistantMsg.pending = false;
          loading.value = false;
          return;
        }

        const answer = String(convRes.answer || convRes.message || '').trim();
        const isGenericFallback = !answer
          || answer.includes('关于重庆旅游景点，您可以随时在行程中点击卡片提问')
          || answer.includes('暂时没有从高德核验到该景点的详情')
          || answer.includes('高德暂时没有找到');
        if (!isUnknownIntent && !isGenericFallback) {
          assistantMsg.content = answer;
          assistantMsg.pending = false;
          loading.value = false;
          return;
        }

      } catch (err: any) {
        if (err.status === 409) {
          ui.showToast('行程版本已在其他操作中更新，正在重新加载...');
          activeProposal.value = null;
        }
      }
    }

    // 兜底 SSE 通道
    try {
      await readChatStream(text, (eventName, raw) => {
        if (eventName === 'meta') {
          try {
            meta.value = JSON.parse(raw);
          } catch {
            meta.value = { retrieval: { reason: raw } };
          }
        } else if (eventName === 'proposal') {
          try {
            chatProposal.value = JSON.parse(raw);
          } catch {}
        } else if (eventName === 'message' || eventName === 'text') {
          let chunk = raw;
          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string') chunk = parsed;
          } catch {}
          assistantMsg.content += chunk;
        }
      });
    } catch (err: any) {
      assistantMsg.content = assistantMsg.content || '后端服务暂不可用，请稍后重试。';
      ui.showToast(err.message);
    } finally {
      assistantMsg.pending = false;
      loading.value = false;
    }
  }

  async function applyProposal(force = false) {
    if (!activeProposal.value || !tripStore.sessionId) return;
    const baseRevision = Number(activeProposal.value.baseRevision || tripStore.trip?.version || 1);
    loading.value = true;
    try {
      const res = await request<any>('/api/planner/adjust/apply', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: tripStore.sessionId,
          proposalId: activeProposal.value.proposalId,
          optionId: selectedOptionId.value || 'option-1',
          baseRevision,
          forceApply: Boolean(force),
          sessionAccessToken: tripStore.sessionAccessToken || '',
          idempotencyKey: plannerIdempotencyKey('planner-apply')
        })
      });
      if (res.trip) {
        tripStore.trip = res.trip;
        activeProposal.value = null;
        tripStore.selectedStopId = null;
        ui.showToast(`已成功应用调整！当前为第 ${res.currentVersion ?? res.trip.version} 版`);
      }
    } catch (err: any) {
      ui.showToast(err.message || '应用调整方案失败');
    } finally {
      loading.value = false;
    }
  }

  function dismissProposal() {
    activeProposal.value = null;
    selectedOptionId.value = 'option-1';
    ui.showToast('已取消本次调整预览，当前行程未改变。');
  }

  async function confirmChatProposal(confirm: boolean) {
    if (!tripStore.sessionId) return;
    loading.value = true;
    try {
      const data = await request<{ trip?: any; message?: string }>('/api/chat/proposal/confirm', {
        method: 'POST',
        body: JSON.stringify({ sessionId: tripStore.sessionId, confirm })
      });
      chatProposal.value = null;
      if (data.trip) {
        tripStore.trip = data.trip;
        if (data.trip.savedTripId) tripStore.savedTripId = data.trip.savedTripId;
      }
      ui.showToast(confirm ? (data.message || '已确认并更新行程方案！') : '已取消本次调整建议。');
    } catch (err: any) {
      ui.showToast(err.message);
    } finally {
      loading.value = false;
    }
  }

  return {
    chatSessionId,
    messages,
    input,
    mode,
    loading,
    meta,
    activeProposal,
    chatProposal,
    selectedOptionId,
    suggestionDismissed,
    resetChat,
    sendMessage,
    applyProposal,
    dismissProposal,
    confirmChatProposal
  };
});
