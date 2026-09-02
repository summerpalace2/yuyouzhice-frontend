<template>
  <main class="page shell">
    <div v-if="!authStore.user" class="panel trip-empty">
      <div class="empty-symbol">存</div>
      <h2>登录后查看已保存行程</h2>
      <p class="muted">登录后行程将持久化保存，并在任意设备随时恢复。</p>
      <button class="primary" @click="authStore.openLogin('login')">登录 / 注册</button>
    </div>

    <div v-else-if="tripStore.savedTrips === null" class="panel trip-empty">
      <p>正在读取您的行程……</p>
    </div>

    <div v-else-if="tripStore.savedTrips.length === 0" class="panel trip-empty">
      <div class="empty-symbol">空</div>
      <h2>还没有保存的行程</h2>
      <p class="muted">从首页生成定制方案后，点击“保存行程”。</p>
      <button class="primary" @click="router.push('/')">开始定制规划</button>
    </div>

    <div v-else>
      <div class="section-title">
        <div>
          <div class="eyebrow">您的专属旅行资产库</div>
          <h2>我的行程</h2>
          <p>已保存 {{ tripStore.savedTrips.length }} 份精彩重庆行程方案。</p>
        </div>
      </div>

      <article v-for="item in tripStore.savedTrips" :key="item.id" class="panel trip-card">
        <div>
          <div class="eyebrow">保存时间：{{ new Date(item.savedAt).toLocaleString('zh-CN') }}</div>
          <h3>{{ item.trip.title }}</h3>
          <p>{{ item.trip.subtitle }} · 第 {{ item.trip.version }} 版 · 共 {{ item.trip.days?.length || 2 }} 天</p>
        </div>
        <div class="trip-actions">
          <button class="secondary" @click="handleOpenTrip(item.id)">打开行程</button>
          <button class="secondary" @click="handleExportPdf(item.id)">导出 PDF</button>
          <button class="danger" @click="ui.openDeleteConfirm(item.id)">删除</button>
        </div>
      </article>
    </div>

    <!-- 删除确认弹窗 -->
    <BaseModal :model-value="Boolean(ui.deleteTripConfirmId)" @close="ui.closeDeleteConfirm()">
      <div class="delete-modal-content">
        <h2>删除这条行程？</h2>
        <p>该行程将从当前账号中永久移除，无法撤回。</p>
        <div class="modal-actions">
          <button class="secondary" @click="ui.closeDeleteConfirm()">取消</button>
          <button class="danger" @click="handleConfirmDelete">确认删除</button>
        </div>
      </div>
    </BaseModal>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import { useAuthStore } from '@/app/stores/auth';
import { useUiStore } from '@/app/stores/ui';
import BaseModal from '@/shared/ui/BaseModal.vue';
import { deviceId, getCsrfToken } from '@/shared/api/client';

const router = useRouter();
const tripStore = useTripStore();
const authStore = useAuthStore();
const ui = useUiStore();

onMounted(() => {
  if (authStore.user) {
    tripStore.loadTrips();
  }
});

async function handleOpenTrip(id: string) {
  await tripStore.openSavedTrip(id);
  router.push('/planning');
}

async function handleConfirmDelete() {
  if (!ui.deleteTripConfirmId) return;
  await tripStore.deleteTrip(ui.deleteTripConfirmId);
}

async function handleExportPdf(id: string) {
  try {
    const csrf = getCsrfToken();
    const response = await fetch(`/api/trips/${encodeURIComponent(id)}/pdf`, {
      credentials: 'same-origin',
      headers: {
        'x-yuyouzhice-device': deviceId(),
        ...(csrf ? { 'x-yuyouzhice-csrf': csrf } : {})
      }
    });
    if (!response.ok) throw new Error('PDF 导出失败');
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `yuyouzhice-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    ui.showToast('PDF 已生成并开始下载。');
  } catch (err: any) {
    ui.showToast(err.message);
  }
}
</script>

<style scoped>
.trip-card {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.trip-card h3 {
  font-size: 18px;
  margin: 4px 0 6px;
  font-weight: 700;
}
.trip-card p {
  font-size: 13.5px;
  color: var(--ink-secondary);
  margin: 0;
}

.trip-actions {
  display: flex;
  gap: 8px;
}

.trip-empty {
  padding: 60px 20px;
  text-align: center;
}
.empty-symbol {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--surface-tint);
  display: grid;
  place-items: center;
  margin: 0 auto 16px;
  font-size: 24px;
  font-weight: 800;
  color: var(--red);
}

.delete-modal-content h2 {
  font-size: 20px;
  margin: 0 0 8px;
}
.delete-modal-content p {
  color: var(--muted);
  font-size: 13.5px;
  margin: 0 0 20px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
