<template>
  <div id="app-root">
    <TheHeader />
    <RouterView />
    <ToastNotification :message="ui.toastMessage" />
    <AuthModal />
    <PreferenceProposalModal />
    <MemoryProposalModal />
    <FeedbackModal />

    <!-- 管理员身份快速返回控制台浮动按钮 -->
    <div
      v-if="authStore.user?.role === 'admin' && route.path !== '/admin'"
      class="floating-admin-btn"
      title="您当前以管理员身份浏览，点击随时返回控制台"
      @click="router.push('/admin')"
    >
      返回管理中心
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import TheHeader from '@/widgets/TheHeader.vue';
import ToastNotification from '@/shared/ui/ToastNotification.vue';
import AuthModal from '@/features/auth/AuthModal.vue';
import PreferenceProposalModal from '@/features/trip-planning/PreferenceProposalModal.vue';
import MemoryProposalModal from '@/features/trip-replan/MemoryProposalModal.vue';
import FeedbackModal from '@/features/trip-planning/FeedbackModal.vue';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const ui = useUiStore();

onMounted(async () => {
  await authStore.restoreSession();
});
</script>

<style>
@import "@/app/styles/main.css";
</style>
