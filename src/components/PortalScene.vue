<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, type ComponentPublicInstance } from 'vue'
import type { ModuleDefinition, ModuleKey } from '../lib/modules'

const props = defineProps<{ modules: ModuleDefinition[] }>()
const emit = defineEmits<{ openModule: [moduleKey: ModuleKey] }>()

type DesktopBridge = {
  isElectron?: boolean
  exportBackup?: () => Promise<{ canceled?: boolean, moduleCount?: number } | null>
  importBackup?: () => Promise<{ canceled?: boolean, moduleCount?: number } | null>
  getAutoLaunch?: () => Promise<{ supported?: boolean, enabled?: boolean } | null>
  setAutoLaunch?: (enabled: boolean) => Promise<{ supported?: boolean, enabled?: boolean } | null>
}

const stageRef = ref<HTMLElement | null>(null)
const infoCardRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLButtonElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)
const sunCoreRef = ref<HTMLElement | null>(null)
const desktopBridge = ref<DesktopBridge | null>(null)

const zoom = ref(1)
const hoveredKey = ref<ModuleKey | null>(null)
const launchingKey = ref<ModuleKey | null>(null)
const pointerInside = ref(false)
const settingsOpen = ref(false)
const sunTransitionActive = ref(false)
const backupBusy = ref(false)
const startupBusy = ref(false)
const launchAtStartupEnabled = ref(false)
const desktopActionMessage = ref('')
const desktopActionTone = ref<'info' | 'success' | 'error'>('info')

const cardPosition = reactive({ x: 0, y: 0 })
const connector = reactive({ x: 0, y: 0, length: 0, angle: 0 })
const burst = reactive({ active: false, x: 0, y: 0, color: '#fff', softColor: '#fff', radius: 0 })

const nodeRefs = new Map<ModuleKey, HTMLButtonElement>()
const ORBIT_PREVIEW_MS = 1800
const SUN_TRANSITION_MS = 1000
const EXPANSION_MS = 1800
let pointerX = 0
let pointerY = 0
let trackingFrame = 0
let launchSunTimer = 0
let launchBurstTimer = 0
let launchCompleteTimer = 0

const stageStyle = computed(() => ({
  '--scene-zoom': zoom.value.toFixed(3),
}))

const isDesktop = computed(() => Boolean(desktopBridge.value?.isElectron))
const hoveredModule = computed(() => props.modules.find((module) => module.key === hoveredKey.value) ?? null)
const launchingModule = computed(() => props.modules.find((module) => module.key === launchingKey.value) ?? null)

const cardStyle = computed(() => ({
  left: `${cardPosition.x}px`,
  top: `${cardPosition.y}px`,
  '--card-accent': hoveredModule.value?.color ?? '#fff',
}))

const connectorStyle = computed(() => ({
  left: `${connector.x}px`,
  top: `${connector.y}px`,
  width: `${connector.length}px`,
  '--connector-color': hoveredModule.value?.color ?? 'rgba(255,255,255,.92)',
  '--connector-length': `${connector.length}px`,
  transform: `translateY(-50%) rotate(${connector.angle}rad)`,
}))

const burstStyle = computed(() => ({
  '--burst-color': burst.color,
  '--burst-color-soft': burst.softColor,
  '--burst-x': `${burst.x}px`,
  '--burst-y': `${burst.y}px`,
  '--burst-radius': `${burst.radius}px`,
}))

const sunTintStyle = computed(() => ({
  '--sun-tint-color': launchingModule.value?.color ?? '#ff9b32',
  '--sun-tint-color-soft': launchingModule.value?.colorSoft ?? '#ffd08a',
}))

function getBurstOrigin() {
  const rect = sunCoreRef.value?.getBoundingClientRect()
  if (rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }
}

function getBurstRadius(originX: number, originY: number) {
  return Math.max(
    Math.hypot(originX, originY),
    Math.hypot(window.innerWidth - originX, originY),
    Math.hypot(originX, window.innerHeight - originY),
    Math.hypot(window.innerWidth - originX, window.innerHeight - originY),
  ) + 80
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function setNodeRef(moduleKey: ModuleKey, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement) nodeRefs.set(moduleKey, element)
  else nodeRefs.delete(moduleKey)
}

function getBoostedDuration(duration: string, factor = 0.1) {
  const numeric = Number.parseFloat(duration)
  if (!Number.isFinite(numeric) || numeric <= 0) return duration
  return duration.trim().endsWith('ms')
    ? `${Math.max(120, Math.round(numeric * factor))}ms`
    : `${Math.max(0.12, numeric * factor).toFixed(2)}s`
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoom.value = clamp(zoom.value * Math.exp(-event.deltaY * 0.0011), 0.76, 1.55)
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
  if (moduleKey && hoveredKey.value !== moduleKey) return
  if (pointerInside.value || launchingKey.value) return
  hoveredKey.value = null
  connector.length = 0
}

function findNearestNode(clientX: number, clientY: number): { key: ModuleKey, node: HTMLButtonElement } | null {
  let nearest: { key: ModuleKey, node: HTMLButtonElement } | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  nodeRefs.forEach((node, key) => {
    const rect = node.getBoundingClientRect()
    const distance = Math.hypot(rect.left + rect.width / 2 - clientX, rect.top + rect.height / 2 - clientY)
    if (distance < nearestDistance) {
      nearest = { key, node }
      nearestDistance = distance
    }
  })
  return nearestDistance <= 110 ? nearest : null
}

function getClosestPointOnRect(x: number, y: number, left: number, top: number, right: number, bottom: number) {
  return { x: clamp(x, left, right), y: clamp(y, top, bottom) }
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

  const target = getClosestPointOnRect(
    sourceX,
    sourceY,
    targetX - cardWidth / 2,
    targetY - cardHeight / 2,
    targetX + cardWidth / 2,
    targetY + cardHeight / 2,
  )
  const dx = target.x - sourceX
  const dy = target.y - sourceY
  const distance = Math.hypot(dx, dy)
  if (distance < 8) {
    connector.length = 0
    return
  }

  const offset = Math.min(Math.max(nodeRect.width * 0.34, 12), Math.max(distance - 8, 0))
  const ux = dx / distance
  const uy = dy / distance
  const startX = sourceX + ux * offset
  const startY = sourceY + uy * offset
  const lineDx = target.x - startX
  const lineDy = target.y - startY
  connector.x = startX
  connector.y = startY
  connector.length = Math.hypot(lineDx, lineDy)
  connector.angle = Math.atan2(lineDy, lineDx)
}

function trackNearestNode() {
  if (pointerInside.value && !launchingKey.value) {
    const nearest = findNearestNode(pointerX, pointerY)
    if (nearest) {
      if (hoveredKey.value !== nearest.key) void setHovered(nearest.key)
      else updateHoverGeometry()
    } else if (hoveredKey.value) {
      hoveredKey.value = null
      connector.length = 0
    }
  } else if (hoveredKey.value) {
    updateHoverGeometry()
  }
  trackingFrame = window.requestAnimationFrame(trackNearestNode)
}

function setDesktopMessage(message: string, tone: 'info' | 'success' | 'error') {
  desktopActionMessage.value = message
  desktopActionTone.value = tone
}

async function syncAutoLaunchState() {
  if (!desktopBridge.value?.getAutoLaunch) {
    launchAtStartupEnabled.value = false
    return
  }
  try {
    const state = await desktopBridge.value.getAutoLaunch()
    launchAtStartupEnabled.value = Boolean(state?.enabled)
  } catch {
    launchAtStartupEnabled.value = false
  }
}

async function toggleAutoLaunch() {
  if (!desktopBridge.value?.setAutoLaunch || startupBusy.value) return
  startupBusy.value = true
  try {
    const state = await desktopBridge.value.setAutoLaunch(!launchAtStartupEnabled.value)
    if (!state?.supported) {
      setDesktopMessage('开机自启动仅在打包安装后的桌面版中可用。', 'info')
      return
    }
    launchAtStartupEnabled.value = Boolean(state.enabled)
    setDesktopMessage(launchAtStartupEnabled.value ? '已开启开机自启动。' : '已关闭开机自启动。', 'success')
  } catch (error) {
    console.error(error)
    setDesktopMessage('开机自启动设置失败，请稍后再试。', 'error')
  } finally {
    startupBusy.value = false
  }
}

async function exportDesktopBackup() {
  if (!desktopBridge.value?.exportBackup || backupBusy.value) return
  backupBusy.value = true
  setDesktopMessage('正在导出桌面备份...', 'info')
  try {
    const result = await desktopBridge.value.exportBackup()
    if (result?.canceled) setDesktopMessage('已取消导出。', 'info')
    else setDesktopMessage(`备份完成，已收集 ${result?.moduleCount ?? 0} 个模块。`, 'success')
  } catch (error) {
    console.error(error)
    setDesktopMessage('导出失败，请稍后再试。', 'error')
  } finally {
    backupBusy.value = false
  }
}

async function importDesktopBackup() {
  if (!desktopBridge.value?.importBackup || backupBusy.value) return
  backupBusy.value = true
  setDesktopMessage('正在导入桌面备份...', 'info')
  try {
    const result = await desktopBridge.value.importBackup()
    if (result?.canceled) setDesktopMessage('已取消导入。', 'info')
    else setDesktopMessage(`导入完成，已恢复 ${result?.moduleCount ?? 0} 个模块。`, 'success')
  } catch (error) {
    console.error(error)
    setDesktopMessage('导入失败，请确认备份文件格式正确。', 'error')
  } finally {
    backupBusy.value = false
  }
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!settingsOpen.value) return
  const target = event.target as Node | null
  if (!target) {
    settingsOpen.value = false
    return
  }
  if (settingsButtonRef.value?.contains(target) || settingsPanelRef.value?.contains(target)) return
  settingsOpen.value = false
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') settingsOpen.value = false
}

async function launchModule(moduleKey: ModuleKey) {
  if (launchingKey.value) return
  const module = props.modules.find((item) => item.key === moduleKey)
  if (!module) return

  launchingKey.value = moduleKey
  hoveredKey.value = null
  connector.length = 0
  settingsOpen.value = false
  const origin = getBurstOrigin()
  burst.x = origin.x
  burst.y = origin.y
  burst.color = module.color
  burst.softColor = module.colorSoft
  burst.radius = getBurstRadius(origin.x, origin.y)
  burst.active = false
  sunTransitionActive.value = false

  window.clearTimeout(launchSunTimer)
  window.clearTimeout(launchBurstTimer)
  window.clearTimeout(launchCompleteTimer)
  void stageRef.value?.offsetWidth

  launchSunTimer = window.setTimeout(() => { sunTransitionActive.value = true }, ORBIT_PREVIEW_MS)
  launchBurstTimer = window.setTimeout(() => {
    const nextOrigin = getBurstOrigin()
    burst.x = nextOrigin.x
    burst.y = nextOrigin.y
    burst.radius = getBurstRadius(nextOrigin.x, nextOrigin.y)
    void stageRef.value?.offsetWidth
    burst.active = true
  }, ORBIT_PREVIEW_MS + SUN_TRANSITION_MS)
  launchCompleteTimer = window.setTimeout(() => {
    emit('openModule', moduleKey)
    burst.active = false
    sunTransitionActive.value = false
    launchingKey.value = null
  }, ORBIT_PREVIEW_MS + SUN_TRANSITION_MS + EXPANSION_MS)
}

function handleResize() {
  if (hoveredKey.value) updateHoverGeometry()
}

onMounted(() => {
  desktopBridge.value = (window as Window & { shanlicDesktop?: DesktopBridge }).shanlicDesktop ?? null
  void syncAutoLaunchState()
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleResize, { passive: true })
  window.addEventListener('pointerdown', handleWindowPointerDown)
  window.addEventListener('keydown', handleWindowKeydown)
  trackingFrame = window.requestAnimationFrame(trackNearestNode)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleResize)
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.clearTimeout(launchSunTimer)
  window.clearTimeout(launchBurstTimer)
  window.clearTimeout(launchCompleteTimer)
  window.cancelAnimationFrame(trackingFrame)
})
</script>

<template>
  <section
    ref="stageRef"
    class="portal-scene"
    :style="stageStyle"
    @wheel.prevent="onWheel"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  >
    <div class="settings-anchor">
      <button ref="settingsButtonRef" class="settings-button" type="button" :aria-expanded="settingsOpen" aria-label="打开设置" @click.stop="toggleSettings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.96 7.96 0 0 0 .05-.94a7.96 7.96 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.41 7.41 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.22-1.11.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.57-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" /></svg>
      </button>
      <div v-if="settingsOpen" ref="settingsPanelRef" class="settings-panel" :data-tone="desktopActionTone">
        <div class="settings-title">系统设置</div>
        <p class="settings-copy">{{ isDesktop ? '桌面版启动、备份与恢复入口已集中到这里。' : '当前是浏览器模式，桌面专属设置会在 Electron 版中可用。' }}</p>
        <div class="settings-actions">
          <button class="settings-action primary" type="button" :disabled="!isDesktop || startupBusy" @click="toggleAutoLaunch">{{ launchAtStartupEnabled ? '关闭开机自启动' : '开启开机自启动' }}</button>
          <button class="settings-action" type="button" :disabled="!isDesktop || backupBusy" @click="exportDesktopBackup">导出备份</button>
          <button class="settings-action" type="button" :disabled="!isDesktop || backupBusy" @click="importDesktopBackup">导入恢复</button>
        </div>
        <p v-if="desktopActionMessage" class="settings-status">{{ desktopActionMessage }}</p>
      </div>
    </div>

    <div class="system-title" aria-label="SHANLIC LIFE TRACKER SYSTEM">
      <span class="system-title-chip">SYSTEM CORE</span>
      <h1 class="system-title-main">
        <span class="system-title-glow">SHANLIC LIFE TRACKER SYSTEM</span>
        <span class="system-title-text">SHANLIC LIFE TRACKER SYSTEM</span>
      </h1>
      <span class="system-title-meta">ORBITAL GRID :: ONLINE</span>
    </div>

    <div v-if="hoveredModule" ref="infoCardRef" class="info-card" :style="cardStyle">
      <strong>{{ hoveredModule.title }}</strong>
      <span>{{ hoveredModule.subtitle }}</span>
    </div>

    <div v-if="hoveredModule && connector.length > 0" class="info-link" :style="connectorStyle" aria-hidden="true">
      <span class="info-link-line"></span>
      <span class="info-link-travel"></span>
      <span class="info-link-dot"></span>
    </div>

    <div class="scene-shell">
      <div class="solar-plane">
        <div ref="sunCoreRef" class="sun-core" :class="{ 'is-priming': Boolean(launchingModule), 'is-transitioning': sunTransitionActive }" aria-hidden="true">
          <span class="sun-glow"></span>
          <span class="sun-transition-glow" :style="sunTintStyle"></span>
          <span class="sun-surface"></span>
          <span class="sun-transition-surface" :style="sunTintStyle"></span>
        </div>

        <div
          v-for="module in modules"
          :key="module.key"
          class="orbit-shell"
          :class="{ 'is-hovered': hoveredKey === module.key, 'is-launching': launchingKey === module.key }"
          :style="{ '--orbit-size': module.orbit.size, '--orbit-duration': module.orbit.duration, '--orbit-duration-boost': getBoostedDuration(module.orbit.duration), '--orbit-delay': module.orbit.delay, '--orbit-rotation': module.orbit.rotation, '--planet-color': module.color, '--planet-color-soft': module.colorSoft }"
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
              @click="launchModule(module.key)"
            >
              <span class="planet-ball"><span class="planet-glow"></span><span class="planet-surface"></span><span class="planet-core"></span></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="transition-burst" :class="{ active: burst.active }" :style="burstStyle" aria-hidden="true"></div>
  </section>
</template>

<style scoped>
.portal-scene{position:relative;min-height:100vh;overflow:hidden;background:linear-gradient(180deg,rgba(3,8,16,.38),rgba(4,10,18,.56)),url('/assets/portal/space-bg.jpg') center/cover no-repeat}
.portal-scene::before,.portal-scene::after{content:'';position:absolute;inset:0;pointer-events:none}.portal-scene::before{background:radial-gradient(circle at 50% 14%,rgba(255,255,255,.05),transparent 18%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.24))}.portal-scene::after{background-image:radial-gradient(circle at 14% 20%,rgba(255,255,255,.9) 0 1px,transparent 2px),radial-gradient(circle at 32% 72%,rgba(255,255,255,.75) 0 1px,transparent 2px),radial-gradient(circle at 58% 18%,rgba(255,255,255,.8) 0 1px,transparent 2px),radial-gradient(circle at 80% 68%,rgba(255,255,255,.68) 0 1px,transparent 2px);opacity:.34}
.settings-anchor{position:absolute;top:22px;left:24px;z-index:6}.settings-button{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(7,12,22,.56);color:rgba(255,240,214,.96);cursor:pointer;backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);transition:transform .16s ease,border-color .16s ease,background .16s ease}.settings-button:hover{transform:translateY(-1px);border-color:rgba(255,196,108,.36);background:rgba(12,19,34,.74)}.settings-button svg{width:22px;height:22px;fill:currentColor}
.settings-panel{width:min(320px,calc(100vw - 32px));margin-top:12px;padding:16px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:rgba(7,12,22,.72);backdrop-filter:blur(16px);box-shadow:0 22px 48px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05)}.settings-title{color:rgba(255,240,214,.95);font-size:.92rem;letter-spacing:.12em;text-transform:uppercase}.settings-copy,.settings-status{margin:10px 0 0;color:rgba(224,232,249,.8);font-size:.86rem;line-height:1.6}.settings-actions{display:grid;gap:10px;margin-top:14px}.settings-action{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 14px;background:rgba(255,255,255,.08);color:rgba(240,245,255,.92);font:inherit;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,opacity .16s ease}.settings-action.primary{background:linear-gradient(135deg,rgba(255,192,106,.92),rgba(255,143,76,.92));color:#0d1016;border-color:transparent;box-shadow:0 10px 24px rgba(255,140,74,.24)}.settings-action:hover:not(:disabled){transform:translateY(-1px)}.settings-action:disabled{opacity:.48;cursor:not-allowed}.settings-panel[data-tone='success'] .settings-status{color:#bfffd1}.settings-panel[data-tone='error'] .settings-status{color:#ffd2cf}
.system-title{position:absolute;left:50%;top:22px;z-index:3;display:grid;justify-items:center;gap:6px;min-width:min(760px,calc(100vw - 120px));padding:10px 24px 14px;transform:translateX(-50%);border:1px solid rgba(138,198,255,.14);border-radius:22px;background:linear-gradient(180deg,rgba(7,14,26,.54),rgba(6,11,20,.18));box-shadow:0 18px 44px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06),0 0 32px rgba(107,195,255,.08);backdrop-filter:blur(12px);overflow:hidden}.system-title::before,.system-title::after{content:'';position:absolute;pointer-events:none}.system-title::before{inset:0;background:linear-gradient(90deg,transparent,rgba(123,208,255,.08),transparent);transform:translateX(-120%);animation:title-scan 6.4s linear infinite}.system-title::after{left:22px;right:22px;top:50%;height:1px;background:linear-gradient(90deg,transparent,rgba(123,208,255,.36),transparent);opacity:.34}.system-title-chip,.system-title-meta{position:relative;z-index:1;font-size:.65rem;letter-spacing:.42em;text-transform:uppercase;color:rgba(154,212,255,.72);white-space:nowrap}.system-title-main{position:relative;z-index:1;margin:0;display:grid;place-items:center;white-space:nowrap;text-transform:uppercase;letter-spacing:.34em;font-size:clamp(1.15rem,2vw,1.95rem)}.system-title-glow,.system-title-text{grid-area:1/1}.system-title-glow{color:rgba(120,211,255,.3);filter:blur(10px);transform:scale(1.02)}.system-title-text{position:relative;padding:0 .08em;background:linear-gradient(180deg,#f4fbff 0%,#bce9ff 42%,#7dcfff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 20px rgba(125,207,255,.24),0 8px 24px rgba(0,0,0,.42)}.system-title-text::before{content:'';position:absolute;left:-16px;right:-16px;top:50%;height:48%;transform:translateY(-50%);background:linear-gradient(90deg,transparent,rgba(184,234,255,.12),transparent);filter:blur(10px);z-index:-1}
.info-card{position:absolute;z-index:4;min-width:180px;padding:14px 18px;transform:translate(-50%,-50%);border-radius:16px;border:1px solid color-mix(in srgb,var(--card-accent) 34%,rgba(255,255,255,.18));background:rgba(8,14,24,.52);backdrop-filter:blur(12px);color:#f4f7ff;box-shadow:0 18px 44px rgba(0,0,0,.28),0 0 24px color-mix(in srgb,var(--card-accent) 12%,transparent);pointer-events:none}.info-card strong,.info-card span{display:block}.info-card span{margin-top:4px;color:rgba(234,239,255,.72);font-size:.88rem}
.info-link{position:absolute;z-index:3;height:14px;transform-origin:left center;pointer-events:none}.info-link-line{position:absolute;inset:50% 0 auto 0;height:1px;transform:translateY(-50%);background:linear-gradient(90deg,color-mix(in srgb,var(--connector-color) 35%,transparent),rgba(255,255,255,.96));box-shadow:0 0 12px color-mix(in srgb,var(--connector-color) 18%,transparent)}.info-link-travel,.info-link-dot{position:absolute;left:0;top:50%;border-radius:50%;transform:translate(-50%,-50%)}.info-link-travel{width:12px;height:12px;background:radial-gradient(circle at 34% 34%,rgba(255,255,255,.95),rgba(255,255,255,.2) 42%,transparent 70%),color-mix(in srgb,var(--connector-color) 84%,white 16%);box-shadow:0 0 18px color-mix(in srgb,var(--connector-color) 46%,transparent),0 0 34px color-mix(in srgb,var(--connector-color) 20%,transparent);animation:connector-travel 1.8s ease-in-out infinite}.info-link-dot{width:10px;height:10px;background:rgba(255,255,255,.94);box-shadow:0 0 18px rgba(255,255,255,.3)}
.scene-shell{position:absolute;inset:0;display:grid;place-items:center}.solar-plane{position:relative;width:min(88vw,1040px);aspect-ratio:1;transform:scale(var(--scene-zoom));transition:transform .32s ease}.sun-core{position:absolute;left:50%;top:50%;width:138px;height:138px;transform:translate(-50%,-50%);transition:transform 1s ease}
.sun-glow,.sun-transition-glow,.sun-surface,.sun-transition-surface,.planet-ball>span{position:absolute;inset:0;border-radius:50%}.sun-glow{inset:-44px;background:radial-gradient(circle,rgba(255,186,78,.34),rgba(255,131,18,.14),transparent 74%);filter:blur(10px);transition:opacity 1s ease,transform 1s ease}.sun-transition-glow{inset:-58px;opacity:0;background:radial-gradient(circle,color-mix(in srgb,var(--sun-tint-color-soft) 44%,white 10%),color-mix(in srgb,var(--sun-tint-color) 22%,transparent) 42%,transparent 78%);filter:blur(16px);transform:scale(.78);transition:opacity 1s ease,transform 1s ease}.sun-surface{background:radial-gradient(circle at 32% 28%,#fff1c9,#ffb347 48%,#ff871d 76%,#d85a06);box-shadow:0 0 48px rgba(255,152,35,.54),0 0 110px rgba(255,152,35,.24);transition:opacity 1s ease,transform 1s ease}.sun-transition-surface{opacity:0;background:radial-gradient(circle at 34% 24%,color-mix(in srgb,var(--sun-tint-color-soft) 72%,white 28%),color-mix(in srgb,var(--sun-tint-color-soft) 28%,white 12%) 16%,transparent 22%),radial-gradient(circle at 65% 72%,color-mix(in srgb,var(--sun-tint-color) 22%,transparent),transparent 48%),radial-gradient(circle at 42% 42%,color-mix(in srgb,var(--sun-tint-color-soft) 82%,white 18%) 0%,var(--sun-tint-color) 58%,color-mix(in srgb,var(--sun-tint-color) 92%,white 8%) 100%);box-shadow:0 0 72px color-mix(in srgb,var(--sun-tint-color) 56%,transparent),0 0 140px color-mix(in srgb,var(--sun-tint-color) 24%,transparent);transform:scale(.82);transition:opacity 1s ease,transform 1s ease}
.sun-core.is-priming:not(.is-transitioning){animation:sun-warmup 1.5s ease-in-out infinite alternate}.sun-core.is-transitioning{transform:translate(-50%,-50%) scale(1.08)}.sun-core.is-transitioning .sun-glow,.sun-core.is-transitioning .sun-surface{opacity:.2;transform:scale(.94)}.sun-core.is-transitioning .sun-transition-glow,.sun-core.is-transitioning .sun-transition-surface{opacity:1;transform:scale(1.06)}
.orbit-shell{position:absolute;left:50%;top:50%;width:var(--orbit-size);height:var(--orbit-size);transform:translate(-50%,-50%) rotate(var(--orbit-rotation));animation:orbit-spin var(--orbit-duration) linear infinite;animation-delay:var(--orbit-delay);pointer-events:none}.orbit-shell.is-hovered:not(.is-launching),.orbit-shell:focus-within:not(.is-launching){animation-play-state:paused}.orbit-shell.is-launching{animation-duration:var(--orbit-duration-boost)}
.orbit-ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03),0 0 20px rgba(255,255,255,.04)}.orbit-shell.is-launching .orbit-ring{border-color:color-mix(in srgb,var(--planet-color) 46%,rgba(255,255,255,.22));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--planet-color-soft) 16%,rgba(255,255,255,.08)),0 0 26px color-mix(in srgb,var(--planet-color) 24%,transparent)}
.orbit-node-anchor{position:absolute;left:50%;top:0;transform:translate(-50%,-50%);animation:orbit-counter var(--orbit-duration) linear infinite reverse;animation-delay:var(--orbit-delay)}.orbit-shell.is-hovered:not(.is-launching) .orbit-node-anchor,.orbit-shell:focus-within:not(.is-launching) .orbit-node-anchor{animation-play-state:paused}.orbit-shell.is-launching .orbit-node-anchor{animation-duration:var(--orbit-duration-boost)}
.orbit-node{position:relative;width:88px;height:88px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;transform:rotate(calc(var(--orbit-rotation) * -1));cursor:pointer;pointer-events:auto;overflow:visible;isolation:isolate}.planet-ball{position:relative;width:46px;height:46px;display:block;border-radius:50%;transition:transform .22s ease,filter .22s ease}.planet-glow{inset:-18px!important;background:radial-gradient(circle,color-mix(in srgb,var(--planet-color-soft) 52%,white 12%) 0%,transparent 66%);filter:blur(14px);opacity:.92;transition:opacity .22s ease,transform .22s ease}.planet-surface{background:var(--planet-color);box-shadow:0 0 24px color-mix(in srgb,var(--planet-color) 52%,transparent),0 10px 24px color-mix(in srgb,var(--planet-color) 20%,transparent)}.planet-core{inset:6px!important;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.92),rgba(255,255,255,.3) 14%,transparent 26%),radial-gradient(circle at 62% 64%,color-mix(in srgb,var(--planet-color-soft) 26%,transparent),transparent 58%);opacity:.78}
.orbit-shell.is-hovered .planet-ball,.orbit-node:hover .planet-ball,.orbit-node:focus-visible .planet-ball{transform:scale(1.72);filter:saturate(1.08) brightness(1.06)}.orbit-shell.is-launching .planet-ball{transform:scale(1.96);filter:saturate(1.18) brightness(1.16)}.orbit-shell.is-hovered .planet-glow,.orbit-node:hover .planet-glow,.orbit-node:focus-visible .planet-glow{opacity:1;filter:blur(16px);transform:scale(1.18);animation:pulse-glow 1.35s ease-in-out infinite}.orbit-shell.is-launching .planet-glow{opacity:1;filter:blur(18px);transform:scale(1.34);animation:pulse-glow .72s ease-in-out infinite}.orbit-node:focus-visible{outline:2px solid rgba(255,255,255,.86);outline-offset:4px}
.transition-burst{position:fixed;inset:0;opacity:0;background:radial-gradient(circle at var(--burst-x) var(--burst-y),color-mix(in srgb,var(--burst-color) 100%,transparent) 0%,color-mix(in srgb,var(--burst-color) 98%,transparent) 28%,color-mix(in srgb,var(--burst-color) 94%,transparent) 66%,color-mix(in srgb,var(--burst-color-soft) 90%,transparent) 100%);box-shadow:0 0 120px color-mix(in srgb,var(--burst-color-soft) 78%,transparent),0 0 220px color-mix(in srgb,var(--burst-color) 64%,transparent);pointer-events:none;z-index:8;clip-path:circle(0 at var(--burst-x) var(--burst-y))}.transition-burst.active{animation:burst-expand 1.8s cubic-bezier(.18,.78,.12,1) forwards}
@keyframes orbit-spin{from{transform:translate(-50%,-50%) rotate(var(--orbit-rotation)) rotate(0)}to{transform:translate(-50%,-50%) rotate(var(--orbit-rotation)) rotate(360deg)}}@keyframes orbit-counter{from{transform:translate(-50%,-50%) rotate(0)}to{transform:translate(-50%,-50%) rotate(-360deg)}}@keyframes connector-travel{0%{transform:translate(-50%,-50%) scale(.35);opacity:0}16%,84%{opacity:1}100%{transform:translate(calc(var(--connector-length,0px) - 6px),-50%) scale(1);opacity:0}}@keyframes pulse-glow{0%,100%{opacity:.9;transform:scale(1.08)}50%{opacity:1;transform:scale(1.3)}}@keyframes sun-warmup{from{transform:translate(-50%,-50%) scale(1)}to{transform:translate(-50%,-50%) scale(1.04)}}@keyframes burst-expand{from{clip-path:circle(0 at var(--burst-x) var(--burst-y));opacity:1}to{clip-path:circle(var(--burst-radius) at var(--burst-x) var(--burst-y));opacity:1}}@keyframes title-scan{0%{transform:translateX(-120%)}48%,100%{transform:translateX(120%)}}
@media (max-width:760px){.settings-anchor{top:16px;left:14px}.system-title{top:18px;min-width:calc(100% - 28px);padding:10px 12px 12px}.system-title-chip,.system-title-meta{font-size:.56rem;letter-spacing:.24em}.system-title-main{font-size:clamp(.86rem,4vw,1.1rem);letter-spacing:.14em;text-align:center;white-space:normal;line-height:1.25}.settings-panel{width:min(300px,calc(100vw - 28px))}.solar-plane{width:min(100vw,680px)}.sun-core{width:110px;height:110px}.orbit-node{width:70px;height:70px}.planet-ball{width:38px;height:38px}}
</style>

