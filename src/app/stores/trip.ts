import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import type {
  TripPlan,
  TripConstraints,
  SavedTripRecord,
  HistorySessionRecord,
  ExploreItem
} from '@/shared/types/contracts';
import { request } from '@/shared/api/client';
import { useUiStore } from './ui';

export const GOLDEN_PROMPT = '周六下午到重庆，周日晚上离开，带父母，希望少走路，预算有限，喜欢城市、人文和夜景。';

export const useTripStore = defineStore('trip', () => {
  const ui = useUiStore();

  const prompt = ref(GOLDEN_PROMPT);
  const trip = ref<TripPlan | null>(null);
  const sessionId = ref<string | null>(null);
  const sessionAccessToken = ref<string | null>(null);
  const savedTripId = ref<string | null>(null);

  const loading = ref(false);
  const loadingPhase = ref('');
  const constraintEditing = ref(false);

  const selectedMapDay = ref(0);
  const selectedStopId = ref<string | null>(null);
  const activeDay = ref(1);
  const pinnedStopIds = ref<Set<string>>(new Set());

  // Preferences
  const preferences = reactive({
    duration: '2天经典',
    companions: '带父母',
    pace: '少走路',
    transport: '',
    dining: new Set<string>(['本地菜优先']),
    themes: new Set<string>(['8D魔幻', '山城夜景', '人文历史'])
  });

  // User location
  const userLocation = ref<{
    coordinates: [number, number];
    accuracy: number;
    nearestStop?: string | null;
    distanceText?: string;
  } | null>(null);
  const locating = ref(false);

  // Collections
  const savedTrips = ref<SavedTripRecord[] | null>(null);
  const historySessions = ref<HistorySessionRecord[] | null>(null);
  const historySync = ref<{ latestUpdatedAt?: string } | null>(null);
  const profile = ref<any | null>(null);
  const exploreItems = ref<ExploreItem[]>([]);
  const exploreCategories = ref<string[]>(['夜景', '城市', '人文', '美食', '文创', '自然', '休闲']);
  const exploreQuery = ref('');
  const exploreCategory = ref('');

  // Attraction Detail
  const detail = ref<any | null>(null);
  const detailContext = ref<any>({});
  const detailFromView = ref('explore');

  function buildPromptFromPreferences(): string {
    const parts: string[] = [];
    if (preferences.duration === '1天速览') parts.push('周六全天在重庆游玩（1天速览）');
    else if (preferences.duration === '3天深度') parts.push('周五下午到重庆，周日晚上离开（3天深度）');
    else if (preferences.duration === '4天全景') parts.push('计划在重庆深度游玩4天（4天全景）');
    else parts.push('周六下午到重庆，周日晚上离开（2天经典）');

    if (preferences.companions === '独自出发') parts.push('一个人自由行');
    else if (preferences.companions === '情侣双人') parts.push('情侣双人出游');
    else if (preferences.companions === '亲子家庭') parts.push('带小孩亲子家庭出游');
    else if (preferences.companions === '朋友结伴') parts.push('朋友结伴聚会');
    else parts.push('带父母长辈同行');

    if (preferences.pace === '深度打卡') parts.push('不怕多走路深度打卡');
    else if (preferences.pace === '经典适中') parts.push('正常步行节奏');
    else parts.push('希望轻松少走台阶少爬坡');

    if (preferences.transport === '轻轨地铁优先') parts.push('轻轨地铁优先');
    else if (preferences.transport === '公交优先') parts.push('公交优先');
    else if (preferences.transport === '打车为主') parts.push('以打车为主');

    if (preferences.dining.size > 0) {
      parts.push(`想体验${Array.from(preferences.dining).join('和')}`);
    }
    if (preferences.themes.size > 0) {
      parts.push(`喜欢${Array.from(preferences.themes).join('、')}`);
    }
    parts.push('预算有限');
    return parts.join('，') + '。';
  }

  function applyPreset(presetKey: string) {
    if (presetKey === 'elderly') {
      preferences.duration = '2天经典';
      preferences.companions = '带父母';
      preferences.pace = '少走路';
      preferences.transport = '公交优先';
      preferences.dining = new Set(['地道江湖菜', '清淡不辣']);
      preferences.themes = new Set(['人文历史', '山城夜景']);
    } else if (presetKey === 'magic8d') {
      preferences.duration = '2天经典';
      preferences.companions = '朋友结伴';
      preferences.pace = '经典适中';
      preferences.transport = '轻轨地铁优先';
      preferences.dining = new Set(['九宫格老火锅', '街头小吃小面']);
      preferences.themes = new Set(['8D魔幻', '山城夜景']);
    } else if (presetKey === 'couple') {
      preferences.duration = '2天经典';
      preferences.companions = '情侣双人';
      preferences.pace = '少走路';
      preferences.transport = '打车为主';
      preferences.dining = new Set(['九宫格老火锅']);
      preferences.themes = new Set(['山城夜景', '天然温泉']);
    } else if (presetKey === 'family') {
      preferences.duration = '3天深度';
      preferences.companions = '亲子家庭';
      preferences.pace = '少走路';
      preferences.transport = '轻轨地铁优先';
      preferences.dining = new Set(['清淡不辣']);
      preferences.themes = new Set(['人文历史', '自然奇观']);
    }
    prompt.value = buildPromptFromPreferences();
    ui.showToast('已为您一键套用专属旅行偏好模版！');
  }

  async function planTrip(opts: {
    constraints?: TripConstraints;
    usePreferences?: boolean;
    preferenceDecision?: string;
    preserveSavedTripId?: boolean;
  } = {}) {
    if (!opts.preserveSavedTripId) savedTripId.value = null;
    loading.value = true;
    loadingPhase.value = '理解旅行条件';

    const phases = ['理解旅行条件', '检索可信信息', '组合路线', '生成方案'];
    const phaseTimer = window.setInterval(() => {
      const idx = phases.indexOf(loadingPhase.value);
      if (idx >= 0 && idx < phases.length - 1) {
        loadingPhase.value = phases[idx + 1];
      }
    }, 600);

    try {
      const data = await request<{
        sessionId: string;
        sessionAccessToken?: string;
        trip: TripPlan;
        preferenceProposal?: { copy: string };
      }>('/api/plan', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt.value,
          freeText: prompt.value,
          constraints: opts.constraints || {},
          usePreferences: opts.usePreferences || false,
          preferenceDecision: opts.preferenceDecision || ''
        })
      });
      sessionId.value = data.sessionId;
      sessionAccessToken.value = data.sessionAccessToken || null;
      trip.value = data.trip;
      selectedStopId.value = null;
      pinnedStopIds.value.clear();
      ui.preferenceProposal = data.preferenceProposal || null;
      ui.showToast(opts.usePreferences ? '已沿用长期偏好生成定制行程。' : '专属行程已生成！支持地图分天切换与自由微调。');
    } catch (err: any) {
      ui.showToast(err.message || '规划失败');
      throw err;
    } finally {
      window.clearInterval(phaseTimer);
      loading.value = false;
      loadingPhase.value = '';
    }
  }

  async function removeStop(stopId: string) {
    if (!sessionId.value) return;
    loading.value = true;
    try {
      const data = await request<{ trip: TripPlan }>('/api/trip/stops', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionId.value,
          operation: 'delete',
          stopId
        })
      });
      trip.value = data.trip;
      ui.showToast('已移除该站点，当天路线与耗时已自动重新计算。');
    } catch (err: any) {
      ui.showToast(err.message || '移除站点失败');
    } finally {
      loading.value = false;
    }
  }

  async function confirmReplan(reason: string) {
    if (!sessionId.value || !ui.replanTargetStopId) return;
    loading.value = true;
    const targetStopId = ui.replanTargetStopId;
    ui.closeReplan();
    try {
      const data = await request<{ trip: TripPlan; memoryProposal?: { copy: string }; message?: string }>('/api/replan', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionId.value, targetStopId, reason })
      });
      trip.value = data.trip;
      ui.memoryProposal = data.memoryProposal || null;
      const replacement = data.trip?.days?.flatMap((d) => d.stops || []).find((s) => s.id === targetStopId);
      ui.showToast(replacement?.name ? `已成功替换为【${replacement.name}】，其余站点保持不变。` : (data.message || '行程已更新。'));
    } catch (err: any) {
      ui.showToast(err.message || '重规划失败');
    } finally {
      loading.value = false;
    }
  }

  async function saveTrip() {
    if (!trip.value) {
      ui.showToast('还没有可保存的行程。');
      return;
    }
    try {
      const res = await request<{ message?: string }>('/api/trips/save', {
        method: 'POST',
        body: JSON.stringify({
          trip: trip.value,
          plannerSessionId: sessionId.value || null,
          savedTripId: savedTripId.value || trip.value.savedTripId || null
        })
      });
      trip.value = null;
      sessionId.value = null;
      savedTripId.value = null;
      ui.showToast(res.message || '行程已成功保存！');
    } catch (err: any) {
      ui.showToast(err.message || '保存行程失败');
    }
  }

  async function openSavedTrip(id: string) {
    loading.value = true;
    try {
      const data = await request<{
        sessionId: string;
        savedTripId?: string;
        sessionAccessToken?: string;
        trip: TripPlan;
        message?: string;
      }>(`/api/trips/${encodeURIComponent(id)}/open`, { method: 'POST' });
      sessionId.value = data.sessionId;
      savedTripId.value = data.savedTripId || id;
      sessionAccessToken.value = data.sessionAccessToken || null;
      trip.value = data.trip;
      if (trip.value) trip.value.savedTripId = savedTripId.value;
      prompt.value = data.trip?.prompt || data.trip?.input || prompt.value;
      ui.showToast(data.message || '已打开正式行程，可继续调整。');
    } catch (err: any) {
      ui.showToast(err.message || '打开行程失败');
    } finally {
      loading.value = false;
    }
  }

  async function loadTrips() {
    try {
      const data = await request<{ trips: SavedTripRecord[] }>('/api/trips');
      savedTrips.value = data.trips || [];
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function deleteTrip(id: string) {
    try {
      await request(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' });
      ui.closeDeleteConfirm();
      await loadTrips();
      ui.showToast('已删除这条行程。');
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function loadExplore() {
    try {
      const params = new URLSearchParams({ q: exploreQuery.value, category: exploreCategory.value });
      const data = await request<{ items: ExploreItem[]; categories: string[] }>(`/api/explore?${params}`);
      exploreItems.value = data.items || [];
      if (data.categories) exploreCategories.value = data.categories;
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function addExploreAttraction(id: string, day = 1) {
    if (!trip.value || !sessionId.value) {
      ui.showToast('请先从首页生成一份行程，再添加探索景点。');
      return;
    }
    try {
      const data = await request<{ trip: TripPlan }>('/api/trip/stops', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionId.value,
          attractionId: id,
          day: Number(day || 1),
          operation: 'add'
        })
      });
      trip.value = data.trip;
      ui.showToast(`已成功加入第 ${day} 天行程！`);
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function openDetail(id: string, context: any = {}) {
    loading.value = true;
    detailContext.value = context;
    if (context.fromView) detailFromView.value = context.fromView;
    try {
      const data = await request<{ detail: any }>(`/api/attractions/${id}`);
      detail.value = data.detail;
    } catch (err: any) {
      ui.showToast(err.message);
    } finally {
      loading.value = false;
    }
  }

  async function updateTripWithAttraction(operation: 'add' | 'replace', attractionId: string, day = 1, targetStopId?: string) {
    if (!sessionId.value) return;
    loading.value = true;
    try {
      const data = await request<{ trip: TripPlan }>('/api/trip/stops', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionId.value,
          attractionId,
          day: Number(day || 1),
          operation,
          targetStopId
        })
      });
      trip.value = data.trip;
      ui.showToast(operation === 'replace' ? '已成功替换当前站点，路线已重新优化。' : `已加入第 ${day} 天行程！`);
    } catch (err: any) {
      ui.showToast(err.message);
    } finally {
      loading.value = false;
    }
  }

  async function loadHistory() {
    try {
      const data = await request<{ sessions: HistorySessionRecord[]; sync: any }>('/api/history');
      historySessions.value = data.sessions || [];
      historySync.value = data.sync || null;
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function loadHistorySession(id: string) {
    loading.value = true;
    try {
      const data = await request<{
        session: { id: string; trip: TripPlan; prompt?: string; formalTripId?: string };
        savedTripId?: string;
        sync?: any;
      }>(`/api/history/${encodeURIComponent(id)}`);
      sessionId.value = data.session.id;
      trip.value = data.session.trip;
      savedTripId.value = data.savedTripId || data.session.formalTripId || null;
      if (trip.value && savedTripId.value) trip.value.savedTripId = savedTripId.value;
      prompt.value = data.session.prompt || prompt.value;
      historySync.value = data.sync || historySync.value;
      ui.showToast('已恢复 Java 正式行程，可继续调整后覆盖保存。');
    } catch (err: any) {
      ui.showToast(err.message);
    } finally {
      loading.value = false;
    }
  }

  async function loadProfile() {
    try {
      profile.value = await request<any>('/api/profile');
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  return {
    prompt,
    trip,
    sessionId,
    sessionAccessToken,
    savedTripId,
    loading,
    loadingPhase,
    constraintEditing,
    selectedMapDay,
    selectedStopId,
    activeDay,
    pinnedStopIds,
    preferences,
    userLocation,
    locating,
    savedTrips,
    historySessions,
    historySync,
    profile,
    exploreItems,
    exploreCategories,
    exploreQuery,
    exploreCategory,
    detail,
    detailContext,
    detailFromView,
    buildPromptFromPreferences,
    applyPreset,
    planTrip,
    removeStop,
    confirmReplan,
    saveTrip,
    openSavedTrip,
    loadTrips,
    deleteTrip,
    loadExplore,
    addExploreAttraction,
    openDetail,
    updateTripWithAttraction,
    loadHistory,
    loadHistorySession,
    loadProfile
  };
});
