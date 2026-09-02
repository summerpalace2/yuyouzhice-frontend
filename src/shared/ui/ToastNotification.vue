<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="message" class="toast">
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<style scoped>
.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(28, 25, 23, 0.92);
  color: white;
  padding: 10px 22px;
  border-radius: var(--radius-full);
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: var(--shadow-lg);
  z-index: 200;
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -16px);
}

.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}
</style>
