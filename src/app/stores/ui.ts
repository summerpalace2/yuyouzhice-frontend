import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toastMessage = ref('');
  let toastTimer: number | null = null;

  function showToast(message: string, duration = 2600) {
    toastMessage.value = message;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMessage.value = '';
      toastTimer = null;
    }, duration);
  }

  // Modals state
  const replanTargetStopId = ref<string | null>(null);
  const replanReason = ref('少走路');
  const deleteTripConfirmId = ref<string | null>(null);
  const feedbackOpen = ref(false);
  const memoryProposal = ref<{ copy: string } | null>(null);
  const preferenceProposal = ref<{ copy: string } | null>(null);
  const mapFullscreen = ref(false);

  function openReplan(stopId: string) {
    replanTargetStopId.value = stopId;
  }
  function closeReplan() {
    replanTargetStopId.value = null;
  }

  function openDeleteConfirm(id: string) {
    deleteTripConfirmId.value = id;
  }
  function closeDeleteConfirm() {
    deleteTripConfirmId.value = null;
  }

  return {
    toastMessage,
    showToast,
    replanTargetStopId,
    replanReason,
    deleteTripConfirmId,
    feedbackOpen,
    memoryProposal,
    preferenceProposal,
    mapFullscreen,
    openReplan,
    closeReplan,
    openDeleteConfirm,
    closeDeleteConfirm
  };
});
