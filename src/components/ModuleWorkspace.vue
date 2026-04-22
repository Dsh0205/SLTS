<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ModuleDefinition } from '../lib/modules'

const props = defineProps<{
  module: ModuleDefinition
}>()

const emit = defineEmits<{
  back: []
}>()

const frameKey = ref(0)
const frameRef = ref<HTMLIFrameElement | null>(null)
const frameLoadError = ref('')
const frameSrc = computed(() => resolveFrameSrc(props.module.publicEntry))
const isWarmWorkspace = computed(() => props.module.key === 'hobby')
const workspaceStyle = computed(() => ({
  '--module-color': props.module.color,
  '--module-color-soft': props.module.colorSoft
}))

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('back')
  }
}

function resolveFrameSrc(publicEntry: string) {
  const entry = String(publicEntry || '').replace(/^\.?\//, '')
  const baseUrl = new URL(window.location.href.split('#')[0] || window.location.href)
  return new URL(`./${entry}`, baseUrl).toString()
}

function reloadFrame() {
  frameLoadError.value = ''
  frameKey.value += 1
}

function handleFrameLoad() {
  const locationHref = readFrameLocationHref()
  if (!locationHref) {
    frameLoadError.value = ''
    return
  }

  if (locationHref === 'about:blank' || locationHref.startsWith('chrome-error://')) {
    frameLoadError.value = '模块页面没有成功加载，请重新打开一次。'
    return
  }

  frameLoadError.value = ''
}

function readFrameLocationHref() {
  try {
    return frameRef.value?.contentWindow?.location?.href || ''
  } catch {
    return ''
  }
}

watch(() => props.module.key, () => {
  reloadFrame()
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <section class="workspace-shell" :class="{ 'workspace-shell--warm': isWarmWorkspace }" :style="workspaceStyle">
    <button
      class="back-button"
      type="button"
      aria-label="返回主页"
      title="返回主页"
      @click="emit('back')"
    >
      <svg class="back-button-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.75 5.75 8.5 12l6.25 6.25" />
      </svg>
    </button>
    <iframe
      ref="frameRef"
      :key="frameKey"
      class="workspace-frame"
      :src="frameSrc"
      :title="module.title"
      @load="handleFrameLoad"
    ></iframe>
    <div v-if="frameLoadError" class="workspace-error-banner">
      <span>{{ frameLoadError }}</span>
      <button class="workspace-error-action" type="button" @click="reloadFrame">重新打开</button>
    </div>
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

.workspace-shell--warm {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--module-color-soft) 52%, white 22%), transparent 28%),
    radial-gradient(circle at bottom center, color-mix(in srgb, var(--module-color) 34%, transparent), transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--module-color-soft) 76%, white 10%), var(--module-color));
}

.back-button {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 5;
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--module-color-soft) 28%, rgba(255, 255, 255, 0.12));
  border-radius: 14px;
  background: color-mix(in srgb, var(--module-color) 18%, rgba(8, 14, 26, 0.84));
  color: #f5f7ff;
  font: inherit;
  cursor: pointer;
  backdrop-filter: blur(12px);
  box-shadow:
    0 10px 22px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.back-button-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.back-button:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--module-color) 28%, rgba(12, 20, 36, 0.92));
  border-color: color-mix(in srgb, var(--module-color-soft) 40%, rgba(255, 255, 255, 0.2));
  box-shadow:
    0 14px 28px color-mix(in srgb, var(--module-color) 18%, rgba(0, 0, 0, 0.24)),
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

.workspace-shell--warm .workspace-frame {
  background: color-mix(in srgb, var(--module-color-soft) 56%, #fff6ea);
}

.workspace-error-banner {
  position: absolute;
  right: 18px;
  bottom: 18px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100vw - 36px));
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  background: rgba(9, 15, 27, 0.88);
  color: #f5f7ff;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(12px);
}

.workspace-error-banner span {
  flex: 1;
  font-size: 0.92rem;
  line-height: 1.5;
}

.workspace-error-action {
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.workspace-error-action:hover {
  background: rgba(255, 255, 255, 0.14);
}

@media (max-width: 640px) {
  .back-button {
    top: 14px;
    left: 14px;
    width: 38px;
    height: 38px;
    border-radius: 13px;
  }

  .back-button-icon {
    width: 17px;
    height: 17px;
  }

  .workspace-error-banner {
    right: 14px;
    bottom: 14px;
    left: 14px;
    max-width: none;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
