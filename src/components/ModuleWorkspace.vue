<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ModuleDefinition } from '../lib/modules'

const props = defineProps<{
  module: ModuleDefinition
}>()

const emit = defineEmits<{
  back: []
}>()

const frameKey = ref(0)
const frameSrc = computed(() => props.module.publicEntry)
const workspaceStyle = computed(() => ({
  '--module-color': props.module.color,
  '--module-color-soft': props.module.colorSoft
}))

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('back')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <section class="workspace-shell" :style="workspaceStyle">
    <button
      class="back-button"
      type="button"
      @click="emit('back')"
    >
      <span class="back-button-icon" aria-hidden="true">←</span>
      <span>返回主页</span>
    </button>
    <iframe
      :key="frameKey"
      class="workspace-frame"
      :src="frameSrc"
      :title="module.title"
    ></iframe>
  </section>
</template>

<style scoped>
.workspace-shell {
  position: relative;
  min-height: 100vh;
  background:
    radial-gradient(circle at top center, color-mix(in srgb, var(--module-color-soft) 34%, transparent), transparent 30%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--module-color) 18%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--module-color) 18%, #050914), color-mix(in srgb, var(--module-color) 10%, #050914));
}

.back-button {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--module-color-soft) 28%, rgba(255, 255, 255, 0.12));
  border-radius: 999px;
  padding: 10px 18px 10px 14px;
  background: color-mix(in srgb, var(--module-color) 16%, rgba(8, 14, 26, 0.82));
  color: #f5f7ff;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  backdrop-filter: blur(12px);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.back-button-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--module-color-soft) 18%, rgba(255, 255, 255, 0.08));
  font-size: 0.95rem;
}

.back-button:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--module-color) 24%, rgba(12, 20, 36, 0.92));
  border-color: color-mix(in srgb, var(--module-color-soft) 40%, rgba(255, 255, 255, 0.2));
  box-shadow:
    0 14px 28px color-mix(in srgb, var(--module-color) 18%, rgba(0, 0, 0, 0.28)),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.back-button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.86);
  outline-offset: 3px;
}

.workspace-frame {
  width: 100%;
  height: 100vh;
  border: 0;
  background: color-mix(in srgb, var(--module-color-soft) 24%, #ffffff);
}

@media (max-width: 640px) {
  .back-button {
    top: 14px;
    left: 14px;
    padding: 9px 15px 9px 12px;
    font-size: 0.9rem;
  }
}
</style>
