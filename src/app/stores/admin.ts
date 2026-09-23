import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AdminOverview, IntentShadowStats, KnowledgeDocument } from '@/shared/types/contracts';
import { request } from '@/shared/api/client';
import { useUiStore } from './ui';

export const useAdminStore = defineStore('admin', () => {
  const ui = useUiStore();

  const healthData = ref<any | null>(null);
  const overview = ref<AdminOverview | null>(null);
  const intentShadow = ref<IntentShadowStats | null>(null);
  const docs = ref<KnowledgeDocument[]>([]);
  const docQuery = ref('');
  const docTopic = ref('');
  const docsFolded = ref(true);
  const expandedDocs = ref<Set<string>>(new Set());
  const editingDoc = ref<KnowledgeDocument | null>(null);

  async function fetchHealth() {
    try {
      healthData.value = await request('/api/health');
      try {
        overview.value = await request<AdminOverview>('/api/admin/overview');
      } catch {
        overview.value = null;
      }
      try {
        const docData = await request<{ documents: KnowledgeDocument[] }>('/api/admin/knowledge/documents');
        docs.value = docData.documents || [];
      } catch {
        docs.value = [];
      }
      try {
        const shadowData = await request<{ stats: { data?: IntentShadowStats } | IntentShadowStats }>('/api/admin/llm/intent/shadow');
        const payload: any = shadowData.stats;
        intentShadow.value = payload?.data || payload;
      } catch {
        intentShadow.value = null;
      }
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function probeIntentCapability() {
    try {
      const response = await request<{ result: { data?: Record<string, unknown> } | Record<string, unknown> }>('/api/admin/llm/intent/capability-probe', { method: 'POST' });
      const payload: any = response.result;
      ui.showToast(String(payload?.data?.message || payload?.message || '协议探测已完成'));
      return payload?.data || payload;
    } catch (err: any) {
      ui.showToast(err.message);
      return null;
    }
  }

  async function saveDoc(docId: string, title: string, content: string) {
    try {
      await request('/api/admin/knowledge/update', {
        method: 'POST',
        body: JSON.stringify({ docId, title, content })
      });
      editingDoc.value = null;
      ui.showToast(`语料文档“${title}”已成功保存并重新建立索引！`);
      await fetchHealth();
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function toggleUserRole(userId: string, role: string) {
    try {
      await request('/api/admin/users/role', {
        method: 'POST',
        body: JSON.stringify({ userId, role })
      });
      ui.showToast(`用户权限已成功更新为：${role === 'admin' ? '系统管理员' : '普通用户'}`);
      await fetchHealth();
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function resetUserData(userId: string, name: string) {
    try {
      await request('/api/admin/users/reset', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      ui.showToast(`已成功重置用户【${name}】的行程与偏好数据。`);
      await fetchHealth();
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  async function deleteUser(userId: string, name: string) {
    try {
      await request('/api/admin/users/delete', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      ui.showToast(`已成功删除用户【${name}】。`);
      await fetchHealth();
    } catch (err: any) {
      ui.showToast(err.message);
    }
  }

  function toggleDocExpand(id: string) {
    if (expandedDocs.value.has(id)) {
      expandedDocs.value.delete(id);
    } else {
      expandedDocs.value.add(id);
    }
  }

  return {
    healthData,
    overview,
    intentShadow,
    docs,
    docQuery,
    docTopic,
    docsFolded,
    expandedDocs,
    editingDoc,
    fetchHealth,
    probeIntentCapability,
    saveDoc,
    toggleUserRole,
    resetUserData,
    deleteUser,
    toggleDocExpand
  };
});
