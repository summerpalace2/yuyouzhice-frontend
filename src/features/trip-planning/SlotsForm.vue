<template>
  <aside class="panel">
    <!-- 展示模式 -->
    <div v-if="!editing" class="panel-pad">
      <div class="panel-title-row">
        <div class="panel-title">已识别的旅行条件</div>
        <button class="ghost" @click="emit('edit')">修改条件</button>
      </div>
      <div v-for="[mark, title, note] in rows" :key="mark" class="slot">
        <div class="slot-mark">{{ mark }}</div>
        <div>
          <strong>{{ title }}</strong>
          <span>{{ note }}</span>
        </div>
      </div>
      <div class="constraint-source">点击修改条件可直接重新生成定制行程。</div>
    </div>

    <!-- 编辑表单模式 -->
    <form v-else class="panel-pad constraint-form" @submit.prevent="handleSubmit">
      <div class="panel-title-row">
        <div class="panel-title">修改旅行条件</div>
        <button type="button" class="ghost" @click="emit('cancel')">取消</button>
      </div>
      <label>到达时间<input v-model="form.arrivalAt" placeholder="如：周六下午" /></label>
      <label>离开时间<input v-model="form.departureAt" placeholder="如：周日晚上" /></label>
      <label>同行人<input v-model="form.companions" placeholder="如：带父母、情侣、独自" /></label>
      <label>
        步行强度
        <select v-model="form.walkingTolerance">
          <option value="低">低 · 少走路</option>
          <option value="正常">正常</option>
        </select>
      </label>
      <label>住宿区域<input v-model="form.stayArea" placeholder="如：解放碑、观音桥" /></label>
      <label>
        交通偏好
        <select v-model="form.transportPreference">
          <option value="未提供">未指定</option>
          <option value="公交优先">公交优先</option>
          <option value="公共交通优先">公共交通优先</option>
          <option value="地铁优先">地铁/轻轨优先</option>
          <option value="打车优先">打车优先</option>
        </select>
      </label>
      <label>
        饮食偏好
        <select v-model="form.dietPreference">
          <option value="未提供">未指定</option>
          <option value="重庆火锅">九宫格老火锅</option>
          <option value="地道江湖菜">地道江湖菜</option>
          <option value="街头小吃">街头小吃小面</option>
          <option value="本地菜优先">本地菜优先</option>
          <option value="清淡">清淡</option>
        </select>
      </label>
      <label>预算<input v-model="form.budget" placeholder="如：有限" /></label>
      <label>兴趣<input v-model="interestText" placeholder="城市、人文、夜景、8D魔幻" /></label>
      <button class="primary constraint-submit" type="submit">按新条件重新规划</button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { TripConstraints } from '@/shared/types/contracts';

const props = defineProps<{
  constraints?: TripConstraints;
  editing: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'cancel'): void;
  (e: 'submit', values: TripConstraints): void;
}>();

const form = reactive<TripConstraints>({
  arrivalAt: '',
  departureAt: '',
  companions: '',
  walkingTolerance: '正常',
  stayArea: '',
  transportPreference: '未提供',
  dietPreference: '未提供',
  budget: '',
  interests: []
});

const interestText = ref('');

watch(
  () => props.constraints,
  (c) => {
    if (!c) return;
    form.arrivalAt = c.arrivalAt || '';
    form.departureAt = c.departureAt || '';
    form.companions = c.companions || '';
    form.walkingTolerance = c.walkingTolerance || '正常';
    form.stayArea = c.stayArea || '';
    form.transportPreference = c.transportPreference || '未提供';
    form.dietPreference = c.dietPreference || '未提供';
    form.budget = c.budget || '';
    form.interests = c.interests || [];
    interestText.value = (c.interests || []).join('、');
  },
  { immediate: true }
);

const rows = computed(() => {
  const c = props.constraints || {};
  return [
    ['人', c.companions || '未提供', '同行人与出行特点'],
    ['时', `${c.arrivalAt || '未提供'} → ${c.departureAt || '未提供'}`, `${c.durationDays || 2} 天节奏 · 弹性可调`],
    ['趣', (c.interests || ['城市', '人文', '夜景']).join(' + '), '兴趣偏好'],
    ['步', c.walkingTolerance === '低' ? '少走路优先' : '正常步行', `${c.transportPreference || '路线待计算'}`],
    ['住', c.stayArea || '未提供', '住宿区域影响出发衔接'],
    ['食', c.dietPreference || '未提供', '餐饮策略'],
    ['钱', c.budget || '未提供', '预算策略']
  ] as const;
});

function handleSubmit() {
  const finalInterests = interestText.value
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  emit('submit', {
    ...form,
    interests: finalInterests
  });
}
</script>

<style scoped>
.panel-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}

.slot {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.slot:last-of-type {
  border-bottom: none;
}

.slot-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-tint);
  color: var(--red-deep);
  font-weight: 800;
  font-size: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.slot strong {
  display: block;
  font-size: 13.5px;
  color: var(--ink);
}
.slot span {
  display: block;
  font-size: 11.5px;
  color: var(--muted);
}

.constraint-source {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  font-size: 11.5px;
  color: var(--muted);
}

.constraint-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.constraint-form label {
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-secondary);
  gap: 4px;
}
.constraint-form input,
.constraint-form select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 13px;
}
.constraint-submit {
  margin-top: 10px;
}
</style>
