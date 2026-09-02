<template>
  <div v-if="planContext" class="strategy-cards-cluster">
    <div v-if="planContext.routeStrategy" class="strategy-card">
      <div class="strategy-card-title">交通衔接策略</div>
      <div class="strategy-card-desc">{{ planContext.routeStrategy }}</div>
    </div>
    <div v-if="planContext.budgetStrategy" class="strategy-card">
      <div class="strategy-card-title">预算管理策略</div>
      <div class="strategy-card-desc">{{ planContext.budgetStrategy }}</div>
    </div>
    <div v-if="planContext.foodGuidance" class="strategy-card">
      <div class="strategy-card-title">餐饮风味引导</div>
      <div class="strategy-card-desc">{{ planContext.foodGuidance }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlanContext } from '@/shared/types/contracts';

defineProps<{
  planContext?: PlanContext;
}>();
</script>

<style scoped>
.strategy-cards-cluster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.strategy-card {
  background: var(--surface-tint);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
}

.strategy-card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--red-deep);
  margin-bottom: 4px;
}

.strategy-card-desc {
  font-size: 13px;
  color: var(--ink-secondary);
  line-height: 1.5;
}
</style>
