<template>
  <BaseModal :model-value="Boolean(adminStore.editingDoc)" @close="adminStore.editingDoc = null">
    <div v-if="adminStore.editingDoc" class="doc-edit-modal">
      <h2>编辑知识库语料 · {{ adminStore.editingDoc.entityName }}</h2>
      <p class="muted">修改后将保存到本地语料库并自动触发向量重建与索引更新。</p>
      <form @submit.prevent="handleSubmit">
        <div class="form-row">
          <label>文档标题</label>
          <input v-model="editTitle" required />
        </div>
        <div class="form-row">
          <label>语料核心内容（完整文本）</label>
          <textarea v-model="editContent" rows="9" class="doc-editor-textarea" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" @click="adminStore.editingDoc = null">取消</button>
          <button type="submit" class="primary" :disabled="loading">
            {{ loading ? '保存中…' : '保存并更新索引' }}
          </button>
        </div>
      </form>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseModal from '@/shared/ui/BaseModal.vue';
import { useAdminStore } from '@/app/stores/admin';

const adminStore = useAdminStore();
const editTitle = ref('');
const editContent = ref('');
const loading = ref(false);

watch(
  () => adminStore.editingDoc,
  (doc) => {
    if (doc) {
      editTitle.value = doc.title;
      editContent.value = doc.content;
    }
  },
  { immediate: true }
);

async function handleSubmit() {
  if (!adminStore.editingDoc) return;
  loading.value = true;
  try {
    await adminStore.saveDoc(adminStore.editingDoc.docId, editTitle.value, editContent.value);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.doc-edit-modal h2 {
  font-size: 20px;
  margin: 0 0 6px;
  font-weight: 800;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.form-row label {
  font-size: 12.5px;
  font-weight: 600;
}
.form-row input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.doc-editor-textarea {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  resize: vertical;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
