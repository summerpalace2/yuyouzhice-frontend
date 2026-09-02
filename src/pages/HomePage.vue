<template>
  <main class="page shell">
    <section class="hero">
      <div class="hero-content">
        <div class="eyebrow">山城漫游 · 专属路线定制</div>
        <h1>让每一次<br /><em>重庆出发</em>都更笃定</h1>
        <p class="lede">输入你的天数、同行人、体力与风味偏好，生成不绕路、不重复、可自由微调的高德核验方案。</p>

        <PromptInput @submit="handleStartPlan" />
        <PreferenceChips />
      </div>

      <div class="hero-visual">
        <div class="visual-tag">精选 24 大重庆核心地标</div>
        <div class="visual-caption">
          <strong>立体山城 · 两江交汇</strong>
          <span>解放碑 · 洪崖洞 · 三峡博物馆 · 李子坝 · 鹅岭二厂 · 磁器口</span>
        </div>
      </div>
    </section>

    <section class="feature-strip">
      <div class="feature">
        <div class="feature-marker">01</div>
        <div>
          <strong>智能去重与多天规划</strong>
          <span>支持 1-4 天个性化组合，景点绝不重复，自动编排最佳游览次序。</span>
        </div>
      </div>
      <div class="feature">
        <div class="feature-marker">02</div>
        <div>
          <strong>高德多天轨迹交互</strong>
          <span>按天切换分色路线，站点时长与交通换乘一目了然，支持全屏沉浸地图。</span>
        </div>
      </div>
      <div class="feature">
        <div class="feature-marker">03</div>
        <div>
          <strong>自由增删与局部微调</strong>
          <span>随时添加/移除站点、灵活替换景区，行程随心而变。</span>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useTripStore } from '@/app/stores/trip';
import PromptInput from '@/features/trip-planning/PromptInput.vue';
import PreferenceChips from '@/entities/user/PreferenceChips.vue';

const router = useRouter();
const tripStore = useTripStore();

async function handleStartPlan() {
  await tripStore.planTrip();
  router.push('/planning');
}
</script>

<style scoped>
.hero {
  min-height: 420px;
  display: grid;
  grid-template-columns: 1.18fr 0.82fr;
  gap: 36px;
  align-items: start;
}

h1 {
  font-size: clamp(34px, 4.5vw, 52px);
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  font-weight: 800;
}
h1 em {
  color: var(--red);
  font-style: normal;
}

.lede {
  color: var(--ink-secondary);
  font-size: 15px;
  line-height: 1.7;
  max-width: 530px;
  margin-bottom: 20px;
}

.hero-visual {
  min-height: 480px;
  border-radius: var(--radius-lg);
  background: url('/outputs/home.png'), url('/outputs/attraction-hero.png'), var(--surface-tint);
  background-size: cover;
  background-position: center;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.visual-tag {
  background: rgba(28, 25, 23, 0.72);
  color: white;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  align-self: flex-start;
  backdrop-filter: blur(4px);
}

.visual-caption {
  background: rgba(251, 249, 245, 0.92);
  padding: 14px 18px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
}
.visual-caption strong {
  display: block;
  font-size: 15px;
  color: var(--ink);
}
.visual-caption span {
  font-size: 12px;
  color: var(--muted);
}

.feature-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 48px;
}

.feature {
  display: flex;
  gap: 16px;
  padding: 22px 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.feature-marker {
  font-size: 26px;
  font-weight: 800;
  color: var(--red);
  opacity: 0.35;
}

.feature strong {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
}
.feature span {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
</style>
