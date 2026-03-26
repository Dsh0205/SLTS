<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, type ComponentPublicInstance } from 'vue'
import type { ModuleDefinition, ModuleKey } from '../lib/modules'

const props = defineProps<{
  modules: ModuleDefinition[]
}>()

const emit = defineEmits<{
  openModule: [moduleKey: ModuleKey]
}>()

const stageRef = ref<HTMLElement | null>(null)
const infoCardRef = ref<HTMLElement | null>(null)
const zoom = ref(1)
const hoveredKey = ref<ModuleKey | null>(null)
const launchingKey = ref<ModuleKey | null>(null)
const pointerInside = ref(false)

const nodeRefs = new Map<ModuleKey, HTMLButtonElement>()
let launchTimer = 0
let pointerX = 0
let pointerY = 0
let trackingFrame = 0

const cardPosition = reactive({
  x: 0,
  y: 0
})

const connector = reactive({
  x: 0,
  y: 0,
  length: 0,
  angle: 0
})

const burst = reactive({
  active: false,
  x: 0,
  y: 0,
  color: '#ffffff'
})

const flash = reactive({
  active: false,
  color: '#ffffff'
})

const stageStyle = computed(() => ({
  '--scene-zoom': zoom.value.toFixed(3),
  '--flash-color': flash.color
}))

const hoveredModule = computed(() => {
  return props.modules.find((module) => module.key === hoveredKey.value) ?? null
})

const cardStyle = computed(() => ({
  left: `${cardPosition.x}px`,
  top: `${cardPosition.y}px`,
  '--card-accent': hoveredModule.value?.color ?? '#ffffff'
}))

const connectorStyle = computed(() => ({
  left: `${connector.x}px`,
  top: `${connector.y}px`,
  width: `${connector.length}px`,
  '--connector-color': hoveredModule.value?.color ?? 'rgba(255,255,255,0.92)',
  '--connector-length': `${connector.length}px`,
  transform: `translateY(-50%) rotate(${connector.angle}rad)`
}))

const burstStyle = computed(() => ({
  left: `${burst.x}px`,
  top: `${burst.y}px`,
  '--burst-color': burst.color
}))

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setNodeRef(moduleKey: ModuleKey, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) {
    nodeRefs.set(moduleKey, element)
    return
  }

  nodeRefs.delete(moduleKey)
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const delta = Math.exp(-event.deltaY * 0.0011)
  zoom.value = clamp(zoom.value * delta, 0.76, 1.55)
}

function handlePointerMove(event: PointerEvent) {
  pointerInside.value = true
  pointerX = event.clientX
  pointerY = event.clientY
}

function handlePointerLeave() {
  pointerInside.value = false
  if (!launchingKey.value) {
    hoveredKey.value = null
    connector.length = 0
  }
}

async function setHovered(moduleKey: ModuleKey) {
  hoveredKey.value = moduleKey
  await nextTick()
  updateHoverGeometry()
}

function clearHovered(moduleKey?: ModuleKey) {
  if (moduleKey && hoveredKey.value !== moduleKey) {
    return
  }

  if (pointerInside.value || launchingKey.value) {
    return
  }

  hoveredKey.value = null
  connector.length = 0
}

function trackNearestNode() {
  if (pointerInside.value && !launchingKey.value) {
    const nearest = findNearestNode(pointerX, pointerY)
    if (nearest) {
      if (hoveredKey.value !== nearest.key) {
        void setHovered(nearest.key)
      } else {
        updateHoverGeometry()
      }
    } else if (hoveredKey.value) {
      hoveredKey.value = null
      connector.length = 0
    }
  } else if (hoveredKey.value) {
    updateHoverGeometry()
  }

  trackingFrame = window.requestAnimationFrame(trackNearestNode)
}

function findNearestNode(clientX: number, clientY: number): { key: ModuleKey, node: HTMLButtonElement } | null {
  let nearest: { key: ModuleKey, node: HTMLButtonElement } | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  nodeRefs.forEach((node, key) => {
    const rect = node.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = Math.hypot(centerX - clientX, centerY - clientY)

    if (distance < nearestDistance) {
      nearest = { key, node }
      nearestDistance = distance
    }
  })

  return nearestDistance <= 110 ? nearest : null
}

function updateHoverGeometry() {
  if (!hoveredKey.value || !stageRef.value || !infoCardRef.value) {
    connector.length = 0
    return
  }

  const node = nodeRefs.get(hoveredKey.value)
  if (!node) {
    connector.length = 0
    return
  }

  const stageRect = stageRef.value.getBoundingClientRect()
  const nodeRect = node.getBoundingClientRect()
  const cardRect = infoCardRef.value.getBoundingClientRect()
  const sourceX = nodeRect.left + nodeRect.width / 2 - stageRect.left
  const sourceY = nodeRect.top + nodeRect.height / 2 - stageRect.top
  const cardWidth = Math.max(220, cardRect.width || 240)
  const cardHeight = Math.max(82, cardRect.height || 90)
  const side = sourceX < stageRect.width / 2 ? 1 : -1

  let targetX = sourceX + side * (nodeRect.width / 2 + cardWidth / 2 + 34)
  let targetY = sourceY

  targetX = clamp(targetX, cardWidth / 2 + 18, stageRect.width - cardWidth / 2 - 18)
  targetY = clamp(targetY, cardHeight / 2 + 24, stageRect.height - cardHeight / 2 - 108)

  cardPosition.x = targetX
  cardPosition.y = targetY

  const cardLeft = targetX - cardWidth / 2
  const cardRight = targetX + cardWidth / 2
  const cardTop = targetY - cardHeight / 2
  const cardBottom = targetY + cardHeight / 2
  const targetPoint = getClosestPointOnRect(sourceX, sourceY, cardLeft, cardTop, cardRight, cardBottom)
  const deltaX = targetPoint.x - sourceX
  const deltaY = targetPoint.y - sourceY
  const distance = Math.hypot(deltaX, deltaY)

  if (distance < 8) {
    connector.length = 0
    return
  }

  const offset = Math.min(Math.max(nodeRect.width * 0.34, 12), Math.max(distance - 8, 0))
  const unitX = deltaX / distance
  const unitY = deltaY / distance
  const startX = sourceX + unitX * offset
  const startY = sourceY + unitY * offset
  const lineDx = targetPoint.x - startX
  const lineDy = targetPoint.y - startY

  connector.x = startX
  connector.y = startY
  connector.length = Math.hypot(lineDx, lineDy)
  connector.angle = Math.atan2(lineDy, lineDx)
}

function getClosestPointOnRect(x: number, y: number, left: number, top: number, right: number, bottom: number) {
  return {
    x: clamp(x, left, right),
    y: clamp(y, top, bottom)
  }
}

async function launchModule(moduleKey: ModuleKey, event?: MouseEvent | FocusEvent) {
  if (launchingKey.value) {
    return
  }

  const module = props.modules.find((item) => item.key === moduleKey)
  if (!module) {
    return
  }

  const target = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : nodeRefs.get(moduleKey)

  const rect = target?.getBoundingClientRect()
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2

  launchingKey.value = moduleKey
  burst.x = x
  burst.y = y
  burst.color = module.color
  burst.active = false
  flash.color = module.color
  flash.active = false
  void stageRef.value?.offsetWidth
  burst.active = true
  flash.active = true

  window.clearTimeout(launchTimer)
  launchTimer = window.setTimeout(() => {
    emit('openModule', moduleKey)
    burst.active = false
    flash.active = false
    launchingKey.value = null
  }, 360)
}

function handleResize() {
  if (hoveredKey.value) {
    updateHoverGeometry()
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleResize, { passive: true })
  trackingFrame = window.requestAnimationFrame(trackNearestNode)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleResize)
  window.clearTimeout(launchTimer)
  window.cancelAnimationFrame(trackingFrame)
})
</script>

<template>
  <section
    ref="stageRef"
    class="portal-scene"
    :class="{ 'is-flashing': flash.active }"
    :style="stageStyle"
    @wheel.prevent="onWheel"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  >
    <h1 class="system-title">SHANLIC LIFE TRACKER SYSTEM</h1>

    <div
      v-if="hoveredModule"
      ref="infoCardRef"
      class="info-card"
      :style="cardStyle"
    >
      <strong>{{ hoveredModule.title }}</strong>
      <span>{{ hoveredModule.subtitle }}</span>
    </div>

    <div
      v-if="hoveredModule && connector.length > 0"
      class="info-link"
      :style="connectorStyle"
      aria-hidden="true"
    >
      <span class="info-link-line"></span>
      <span class="info-link-travel"></span>
      <span class="info-link-dot"></span>
    </div>

    <div class="scene-shell">
      <div class="solar-plane">
        <div class="sun-core" aria-hidden="true">
          <span class="sun-glow"></span>
          <span class="sun-surface"></span>
        </div>

        <div
          v-for="module in modules"
          :key="module.key"
          class="orbit-shell"
          :class="{ 'is-hovered': hoveredKey === module.key }"
          :style="{
            '--orbit-size': module.orbit.size,
            '--orbit-duration': module.orbit.duration,
            '--orbit-delay': module.orbit.delay,
            '--orbit-rotation': module.orbit.rotation,
            '--planet-color': module.color,
            '--planet-color-soft': module.colorSoft
          }"
        >
          <div class="orbit-ring"></div>
          <div class="orbit-node-anchor">
            <button
              :ref="(element) => setNodeRef(module.key, element)"
              class="orbit-node"
              type="button"
              @mouseenter="setHovered(module.key)"
              @focus="setHovered(module.key)"
              @blur="clearHovered(module.key)"
              @click="launchModule(module.key, $event)"
            >
              <span class="planet-ball">
                <span class="planet-glow"></span>
                <span class="planet-surface"></span>
                <span class="planet-core"></span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      class="transition-burst"
      :class="{ active: burst.active }"
      :style="burstStyle"
      aria-hidden="true"
    ></div>
  </section>
</template>

<style scoped>
.portal-scene {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(3, 8, 16, 0.38), rgba(4, 10, 18, 0.56)),
    url('/assets/portal/space-bg.jpg') center / cover no-repeat;
}

.portal-scene::before,
.portal-scene::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.portal-scene::before {
  background:
    radial-gradient(circle at 50% 14%, rgba(255, 255, 255, 0.05), transparent 18%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.24));
}

.portal-scene::after {
  background-image:
    radial-gradient(circle at 14% 20%, rgba(255, 255, 255, 0.9) 0 1px, transparent 2px),
    radial-gradient(circle at 32% 72%, rgba(255, 255, 255, 0.75) 0 1px, transparent 2px),
    radial-gradient(circle at 58% 18%, rgba(255, 255, 255, 0.8) 0 1px, transparent 2px),
    radial-gradient(circle at 80% 68%, rgba(255, 255, 255, 0.68) 0 1px, transparent 2px);
  opacity: 0.34;
}

.portal-scene.is-flashing::before {
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--flash-color) 16%, transparent), transparent 48%),
    radial-gradient(circle at 50% 14%, rgba(255, 255, 255, 0.05), transparent 18%),
    linear-gradient(180deg, color-mix(in srgb, var(--flash-color) 10%, rgba(0, 0, 0, 0.04)), rgba(0, 0, 0, 0.24));
  animation: page-flash 0.38s ease-out forwards;
}

.system-title {
  position: absolute;
  left: 50%;
  top: 30px;
  z-index: 3;
  margin: 0;
  transform: translateX(-50%);
  color: rgba(255, 245, 225, 0.94);
  font-size: clamp(1.2rem, 2vw, 2rem);
  letter-spacing: 0.34em;
  text-transform: uppercase;
  white-space: nowrap;
  text-shadow:
    0 0 18px rgba(255, 201, 108, 0.22),
    0 6px 18px rgba(0, 0, 0, 0.42);
}

.info-card {
  position: absolute;
  z-index: 4;
  min-width: 180px;
  padding: 14px 18px;
  transform: translate(-50%, -50%);
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--card-accent) 34%, rgba(255, 255, 255, 0.18));
  background: rgba(8, 14, 24, 0.52);
  backdrop-filter: blur(12px);
  color: #f4f7ff;
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.28),
    0 0 24px color-mix(in srgb, var(--card-accent) 12%, transparent);
  pointer-events: none;
}

.info-card strong,
.info-card span {
  display: block;
}

.info-card span {
  margin-top: 4px;
  color: rgba(234, 239, 255, 0.72);
  font-size: 0.88rem;
}

.info-link {
  position: absolute;
  z-index: 3;
  height: 14px;
  transform-origin: left center;
  pointer-events: none;
}

.info-link-line {
  position: absolute;
  inset: 50% 0 auto 0;
  height: 1px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, color-mix(in srgb, var(--connector-color) 35%, transparent), rgba(255, 255, 255, 0.96));
  box-shadow: 0 0 12px color-mix(in srgb, var(--connector-color) 18%, transparent);
}

.info-link-travel {
  position: absolute;
  left: 0;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background:
    radial-gradient(circle at 34% 34%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.2) 42%, transparent 70%),
    color-mix(in srgb, var(--connector-color) 84%, white 16%);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--connector-color) 46%, transparent),
    0 0 34px color-mix(in srgb, var(--connector-color) 20%, transparent);
  animation: connector-travel 1.8s ease-in-out infinite;
}

.info-link-dot {
  position: absolute;
  left: 0;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.3);
}

.scene-shell {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.solar-plane {
  position: relative;
  width: min(88vw, 1040px);
  aspect-ratio: 1;
  transform: scale(var(--scene-zoom));
  transition: transform 0.32s ease;
}

.sun-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 138px;
  height: 138px;
  transform: translate(-50%, -50%);
}

.sun-glow,
.sun-surface,
.planet-ball > span {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.sun-glow {
  inset: -44px;
  background: radial-gradient(circle, rgba(255, 186, 78, 0.34), rgba(255, 131, 18, 0.14), transparent 74%);
  filter: blur(10px);
}

.sun-surface {
  background: radial-gradient(circle at 32% 28%, #fff1c9, #ffb347 48%, #ff871d 76%, #d85a06);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.2),
    0 0 48px rgba(255, 152, 35, 0.54),
    0 0 110px rgba(255, 152, 35, 0.24);
}

.orbit-shell {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--orbit-size);
  height: var(--orbit-size);
  transform: translate(-50%, -50%) rotate(var(--orbit-rotation));
  animation: orbit-spin var(--orbit-duration) linear infinite;
  animation-delay: var(--orbit-delay);
  pointer-events: none;
}

.orbit-shell.is-hovered,
.orbit-shell:focus-within {
  animation-play-state: paused;
}

.orbit-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 0 20px rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.orbit-node-anchor {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -50%);
  animation: orbit-counter var(--orbit-duration) linear infinite reverse;
  animation-delay: var(--orbit-delay);
  pointer-events: none;
}

.orbit-shell.is-hovered .orbit-node-anchor,
.orbit-shell:focus-within .orbit-node-anchor {
  animation-play-state: paused;
}

.orbit-node {
  position: relative;
  width: 88px;
  height: 88px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  transform: rotate(calc(var(--orbit-rotation) * -1));
  cursor: pointer;
  pointer-events: auto;
}

.planet-ball {
  position: relative;
  width: 46px;
  height: 46px;
  display: block;
  border-radius: 50%;
  transition: transform 0.22s ease, filter 0.22s ease;
}

.planet-glow {
  inset: -16px !important;
  background: radial-gradient(circle, color-mix(in srgb, var(--planet-color-soft) 38%, white 14%), transparent 72%);
  filter: blur(12px);
  opacity: 0.88;
  transition: opacity 0.22s ease, filter 0.22s ease, transform 0.22s ease;
}

.planet-surface {
  background:
    radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.22) 16%, transparent 22%),
    radial-gradient(circle at 66% 70%, rgba(0, 0, 0, 0.28), transparent 48%),
    radial-gradient(circle at 42% 42%, var(--planet-color-soft) 0%, var(--planet-color) 58%, color-mix(in srgb, var(--planet-color) 46%, #050915) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.36),
    0 0 26px color-mix(in srgb, var(--planet-color) 62%, transparent),
    inset -10px -12px 16px rgba(0, 0, 0, 0.22),
    0 18px 34px rgba(0, 0, 0, 0.28);
}

.planet-core {
  inset: 7px !important;
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.12) 16%, transparent 26%),
    radial-gradient(circle at 60% 64%, rgba(255, 255, 255, 0.12), transparent 52%);
  opacity: 0.92;
}

.orbit-shell.is-hovered .planet-ball,
.orbit-node:hover .planet-ball,
.orbit-node:focus-visible .planet-ball {
  transform: scale(1.76);
  filter: saturate(1.16) brightness(1.08);
}

.orbit-shell.is-hovered .planet-glow,
.orbit-node:hover .planet-glow,
.orbit-node:focus-visible .planet-glow {
  opacity: 1;
  filter: blur(16px);
  transform: scale(1.18);
  animation: pulse-glow 1.35s ease-in-out infinite;
}

.orbit-node:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.86);
  outline-offset: 4px;
}

.transition-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0.3);
  opacity: 0;
  background:
    radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.28), transparent 26%),
    radial-gradient(circle, var(--burst-color) 0%, color-mix(in srgb, var(--burst-color) 80%, #050915) 72%);
  box-shadow:
    0 0 40px color-mix(in srgb, var(--burst-color) 40%, transparent),
    0 0 120px color-mix(in srgb, var(--burst-color) 24%, transparent);
  pointer-events: none;
  z-index: 5;
}

.transition-burst.active {
  animation: burst-expand 0.38s cubic-bezier(0.2, 0.8, 0.12, 1) forwards;
}

@keyframes orbit-spin {
  from {
    transform: translate(-50%, -50%) rotate(var(--orbit-rotation)) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(var(--orbit-rotation)) rotate(360deg);
  }
}

@keyframes orbit-counter {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(-360deg);
  }
}

@keyframes connector-travel {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0;
  }
  16% {
    opacity: 1;
  }
  84% {
    opacity: 1;
  }
  100% {
    transform: translate(calc(var(--connector-length, 0px) - 6px), -50%) scale(1);
    opacity: 0;
  }
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.9;
    transform: scale(1.08);
  }
  50% {
    opacity: 1;
    transform: scale(1.3);
  }
}

@keyframes burst-expand {
  0% {
    transform: translate(-50%, -50%) scale(0.35);
    opacity: 0.96;
  }
  100% {
    transform: translate(-50%, -50%) scale(56);
    opacity: 1;
  }
}

@keyframes page-flash {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0.78;
  }
}

@media (max-width: 760px) {
  .portal-scene {
    min-height: 100vh;
  }

  .system-title {
    top: 20px;
    width: calc(100% - 28px);
    text-align: center;
    letter-spacing: 0.16em;
  }

  .solar-plane {
    width: min(100vw, 680px);
  }

  .sun-core {
    width: 110px;
    height: 110px;
  }

  .orbit-node {
    width: 70px;
    height: 70px;
  }

  .planet-ball {
    width: 38px;
    height: 38px;
  }
}
</style>
