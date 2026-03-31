<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, type ComponentPublicInstance } from 'vue'
import type PortalOrbitScene from './portal/PortalOrbitScene.vue'
import type PortalSettingsPanel from './portal/PortalSettingsPanel.vue'
import PortalOrbitSceneView from './portal/PortalOrbitScene.vue'
import PortalSettingsPanelView from './portal/PortalSettingsPanel.vue'
import { usePortalAnimation } from './portal/usePortalAnimation'
import { usePortalMusic } from './portal/usePortalMusic'
import type { ModuleDefinition, ModuleKey } from '../lib/modules'

const props = defineProps<{
  modules: ModuleDefinition[]
  centerModule: ModuleDefinition
}>()
const emit = defineEmits<{ openModule: [moduleKey: ModuleKey] }>()

type DesktopBridge = {
  isElectron?: boolean
  exportBackup?: () => Promise<{ canceled?: boolean, moduleCount?: number } | null>
  importBackup?: () => Promise<{ canceled?: boolean, moduleCount?: number } | null>
  getAutoLaunch?: () => Promise<{ supported?: boolean, enabled?: boolean } | null>
  setAutoLaunch?: (enabled: boolean) => Promise<{ supported?: boolean, enabled?: boolean } | null>
  getUpdateState?: () => Promise<DesktopUpdateState | null>
  checkForUpdates?: () => Promise<DesktopUpdateState | null>
  installUpdate?: () => Promise<{ started?: boolean, state?: DesktopUpdateState | null } | null>
  onUpdateStateChange?: (callback: (state: DesktopUpdateState | null) => void) => (() => void)
}

type SettingsPanelExpose = InstanceType<typeof PortalSettingsPanel>
type OrbitSceneExpose = InstanceType<typeof PortalOrbitScene>
type DesktopUpdateState = {
  supported?: boolean
  status?: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | 'unsupported'
  version?: string | null
  availableVersion?: string | null
  downloadedVersion?: string | null
  progressPercent?: number
  message?: string
}

const desktopBridge = ref<DesktopBridge | null>(null)
const settingsPanelRef = ref<SettingsPanelExpose | null>(null)
const orbitSceneRef = ref<OrbitSceneExpose | null>(null)

const zoom = ref(1)
const hoveredKey = ref<ModuleKey | null>(null)
const pointerInside = ref(false)
const settingsOpen = ref(false)
const backupBusy = ref(false)
const startupBusy = ref(false)
const launchAtStartupEnabled = ref(false)
const desktopUpdateState = ref<DesktopUpdateState>({
  supported: false,
  status: 'unsupported',
  progressPercent: 0,
  message: '自动更新仅在打包安装后的桌面版中可用。',
})
const desktopActionMessage = ref('')
const desktopActionTone = ref<'info' | 'success' | 'error'>('info')

const cardPosition = reactive({ x: 0, y: 0 })
const connector = reactive({ x: 0, y: 0, length: 0, angle: 0 })

const nodeRefs = new Map<ModuleKey, HTMLButtonElement>()
let pointerX = 0
let pointerY = 0
let trackingFrame = 0
let removeUpdateStateListener = () => {}
const HOVER_SNAP_DISTANCE = 110
const HOVER_RELEASE_DISTANCE = 146
const HOVER_SWITCH_ADVANTAGE = 16

const stageStyle = computed(() => ({
  '--scene-zoom': zoom.value.toFixed(3),
}))

const launchableModules = computed(() => [
  ...props.modules,
  props.centerModule,
])

const isDesktop = computed(() => Boolean(desktopBridge.value?.isElectron))
const hoveredModule = computed(() => launchableModules.value.find((module) => module.key === hoveredKey.value) ?? null)
const updateSupported = computed(() => Boolean(desktopUpdateState.value.supported))
const updateActionBusy = computed(() => {
  const status = desktopUpdateState.value.status
  return status === 'checking' || status === 'downloading'
})
const updateButtonLabel = computed(() => {
  const status = desktopUpdateState.value.status

  if (!isDesktop.value) {
    return '桌面版可用'
  }

  if (!updateSupported.value || status === 'unsupported') {
    return '打包后可用'
  }

  if (status === 'checking') {
    return '正在检查更新...'
  }

  if (status === 'downloading') {
    return `正在下载更新 ${desktopUpdateState.value.progressPercent ?? 0}%`
  }

  if (status === 'downloaded') {
    return '立即安装更新'
  }

  if (status === 'available') {
    return '正在准备下载...'
  }

  return '检查更新'
})
const updateStatusText = computed(() => desktopUpdateState.value.message ?? '')

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

function getSunCoreElement() {
  return orbitSceneRef.value?.getSunCoreElement() ?? null
}

function getStageElement() {
  return orbitSceneRef.value?.getStageElement() ?? null
}

function getInfoCardElement() {
  return orbitSceneRef.value?.getInfoCardElement() ?? null
}

const {
  burst,
  burstStyle,
  getBoostedDuration,
  launchingKey,
  launchingModule,
  clearLaunchTimers,
  launchModule: startLaunchAnimation,
  resetLaunchState,
  sunTintStyle,
  sunTransitionActive,
} = usePortalAnimation({
  modules: launchableModules.value,
  getSunCoreElement,
  getReflowElement: getStageElement,
  onLaunchComplete(moduleKey) {
    emit('openModule', moduleKey)
  },
})

const {
  importTracks,
  musicLabel,
  musicTracks,
  removeTrack,
  selectedTrackId,
  selectTrack,
} = usePortalMusic()

async function handleSelectMusic(trackId: string | null) {
  try {
    await selectTrack(trackId)

    if (!trackId) {
      setDesktopMessage('已停止播放，音乐文件仍保存在当前浏览器中。', 'info')
      return
    }

    const track = musicTracks.value.find((item) => item.id === trackId)
    setDesktopMessage(`已切换到：${track?.name ?? '所选音乐'}。之后重新打开主页时会自动尝试播放。`, 'success')
  } catch (error) {
    console.error(error)
    setDesktopMessage('切换音乐失败，请稍后再试。', 'error')
  }
}

async function handleImportMusic(files: File[]) {
  try {
    await importTracks(files)

    const importedMp3Count = files.filter((file) => {
      const lowerName = file.name.toLowerCase()
      return file.type === 'audio/mpeg' || lowerName.endsWith('.mp3')
    }).length

    if (importedMp3Count === 0) {
      setDesktopMessage('没有识别到 MP3 文件，请重新选择。', 'error')
      return
    }

    setDesktopMessage(`已导入 ${importedMp3Count} 首音乐，文件会保存在当前浏览器中，之后打开主页会自动尝试播放。`, 'success')
  } catch (error) {
    console.error(error)
    setDesktopMessage('导入音乐失败，请稍后再试。', 'error')
  }
}

async function handleRemoveMusic(trackId: string) {
  try {
    const track = musicTracks.value.find((item) => item.id === trackId)
    await removeTrack(trackId)
    setDesktopMessage(`已删除：${track?.name ?? '所选音乐'}。`, 'info')
  } catch (error) {
    console.error(error)
    setDesktopMessage('删除音乐失败，请稍后再试。', 'error')
  }
}

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

function getNodeDistance(node: HTMLButtonElement, clientX: number, clientY: number) {
  const rect = node.getBoundingClientRect()
  return Math.hypot(rect.left + rect.width / 2 - clientX, rect.top + rect.height / 2 - clientY)
}

function findNearestNode(
  clientX: number,
  clientY: number,
  maxDistance = HOVER_SNAP_DISTANCE,
): { key: ModuleKey, node: HTMLButtonElement, distance: number } | null {
  let nearest: { key: ModuleKey, node: HTMLButtonElement, distance: number } | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  nodeRefs.forEach((node, key) => {
    const distance = getNodeDistance(node, clientX, clientY)
    if (distance < nearestDistance) {
      nearest = { key, node, distance }
      nearestDistance = distance
    }
  })

  return nearestDistance <= maxDistance ? nearest : null
}

function getClosestPointOnRect(x: number, y: number, left: number, top: number, right: number, bottom: number) {
  return { x: clamp(x, left, right), y: clamp(y, top, bottom) }
}

function updateHoverGeometry() {
  const stageElement = getStageElement()
  const infoCardElement = getInfoCardElement()

  if (!hoveredKey.value || !stageElement || !infoCardElement) {
    connector.length = 0
    return
  }

  const node = nodeRefs.get(hoveredKey.value)
  if (!node) {
    connector.length = 0
    return
  }

  const stageRect = stageElement.getBoundingClientRect()
  const nodeRect = node.getBoundingClientRect()
  const cardRect = infoCardElement.getBoundingClientRect()
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
    const currentNode = hoveredKey.value ? nodeRefs.get(hoveredKey.value) ?? null : null
    const currentDistance = currentNode ? getNodeDistance(currentNode, pointerX, pointerY) : Number.POSITIVE_INFINITY
    const nearest = findNearestNode(
      pointerX,
      pointerY,
      currentNode ? HOVER_RELEASE_DISTANCE : HOVER_SNAP_DISTANCE,
    )
    const keepCurrentHovered = Boolean(currentNode) && currentDistance <= HOVER_RELEASE_DISTANCE
    const shouldSwitchNode = Boolean(
      nearest
      && hoveredKey.value
      && nearest.key !== hoveredKey.value
      && nearest.distance + HOVER_SWITCH_ADVANTAGE < currentDistance,
    )

    if (keepCurrentHovered && !shouldSwitchNode) {
      updateHoverGeometry()
    } else if (nearest && nearest.distance <= HOVER_SNAP_DISTANCE) {
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

function setDesktopMessage(message: string, tone: 'info' | 'success' | 'error') {
  desktopActionMessage.value = message
  desktopActionTone.value = tone
}

function applyDesktopUpdateState(state: DesktopUpdateState | null | undefined) {
  if (!state) {
    return
  }

  desktopUpdateState.value = {
    ...desktopUpdateState.value,
    ...state,
  }
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

async function syncUpdateState() {
  if (!desktopBridge.value?.getUpdateState) {
    desktopUpdateState.value = {
      supported: false,
      status: 'unsupported',
      progressPercent: 0,
      message: '自动更新仅在打包安装后的桌面版中可用。',
    }
    return
  }

  try {
    const state = await desktopBridge.value.getUpdateState()
    applyDesktopUpdateState(state)
  } catch {
    desktopUpdateState.value = {
      supported: true,
      status: 'error',
      progressPercent: 0,
      message: '读取更新状态失败，请稍后再试。',
    }
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

async function triggerUpdateAction() {
  if (!desktopBridge.value?.checkForUpdates) {
    setDesktopMessage('自动更新仅在桌面打包版中可用。', 'info')
    return
  }

  const status = desktopUpdateState.value.status

  if (status === 'checking' || status === 'downloading' || status === 'available') {
    return
  }

  if (status === 'downloaded') {
    try {
      const result = await desktopBridge.value.installUpdate?.()
      if (result?.started) {
        setDesktopMessage('安装程序已启动，应用会退出并完成更新。', 'success')
      } else {
        applyDesktopUpdateState(result?.state)
        setDesktopMessage('更新包还没有准备好，请稍后再试。', 'info')
      }
    } catch (error) {
      console.error(error)
      setDesktopMessage('安装更新失败，请稍后再试。', 'error')
    }
    return
  }

  setDesktopMessage('正在检查更新...', 'info')

  try {
    const state = await desktopBridge.value.checkForUpdates()
    applyDesktopUpdateState(state)

    if (state?.status === 'up-to-date') {
      setDesktopMessage(state.message ?? '当前已是最新版本。', 'success')
    } else if (state?.status === 'error') {
      setDesktopMessage(state.message ?? '检查更新失败，请稍后再试。', 'error')
    } else if (state?.status === 'available' || state?.status === 'downloading' || state?.status === 'downloaded') {
      setDesktopMessage(state.message ?? '发现新版本，正在处理更新。', 'success')
    }
  } catch (error) {
    console.error(error)
    setDesktopMessage('检查更新失败，请稍后再试。', 'error')
  }
}

async function exportDesktopBackup() {
  if (!desktopBridge.value?.exportBackup || backupBusy.value) return

  backupBusy.value = true
  setDesktopMessage('正在导出桌面备份...', 'info')
  try {
    const result = await desktopBridge.value.exportBackup()
    if (result?.canceled) {
      setDesktopMessage('已取消导出。', 'info')
    } else {
      setDesktopMessage(`备份完成，已收集 ${result?.moduleCount ?? 0} 个模块。`, 'success')
    }
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
    if (result?.canceled) {
      setDesktopMessage('已取消导入。', 'info')
    } else {
      setDesktopMessage(`导入完成，已恢复 ${result?.moduleCount ?? 0} 个模块。`, 'success')
    }
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
  const settingsButton = settingsPanelRef.value?.getButtonElement()
  const settingsPanel = settingsPanelRef.value?.getPanelElement()

  if (!target) {
    settingsOpen.value = false
    return
  }

  if (settingsButton?.contains(target) || settingsPanel?.contains(target)) return
  settingsOpen.value = false
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') settingsOpen.value = false
}

function handleLaunchModule(moduleKey: ModuleKey) {
  if (launchingKey.value) return

  hoveredKey.value = null
  connector.length = 0
  settingsOpen.value = false
  startLaunchAnimation(moduleKey)
}

function handleResize() {
  if (hoveredKey.value) updateHoverGeometry()
}

onMounted(() => {
  desktopBridge.value = (window as Window & { shanlicDesktop?: DesktopBridge }).shanlicDesktop ?? null
  void syncAutoLaunchState()
  void syncUpdateState()
  removeUpdateStateListener = desktopBridge.value?.onUpdateStateChange?.((state) => {
    applyDesktopUpdateState(state)
  }) ?? (() => {})
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
  removeUpdateStateListener()
  clearLaunchTimers()
  resetLaunchState()
  window.cancelAnimationFrame(trackingFrame)
})
</script>

<template>
  <section class="portal-shell">
    <PortalSettingsPanelView
      ref="settingsPanelRef"
      :open="settingsOpen"
      :is-desktop="isDesktop"
      :startup-busy="startupBusy"
      :backup-busy="backupBusy"
      :launch-at-startup-enabled="launchAtStartupEnabled"
      :update-supported="updateSupported"
      :update-busy="updateActionBusy"
      :update-button-label="updateButtonLabel"
      :update-status-text="updateStatusText"
      :message="desktopActionMessage"
      :tone="desktopActionTone"
      :music-tracks="musicTracks"
      :selected-music-id="selectedTrackId"
      @toggle="toggleSettings"
      @trigger-update-action="triggerUpdateAction"
      @toggle-auto-launch="toggleAutoLaunch"
      @export-backup="exportDesktopBackup"
      @import-backup="importDesktopBackup"
      @select-music="handleSelectMusic"
      @import-music="handleImportMusic"
      @remove-music="handleRemoveMusic"
    />

    <PortalOrbitSceneView
      ref="orbitSceneRef"
      :modules="props.modules"
      :center-module="props.centerModule"
      :stage-style="stageStyle"
      :music-label="musicLabel"
      :hovered-key="hoveredKey"
      :hovered-module="hoveredModule"
      :launching-key="launchingKey"
      :launching-active="Boolean(launchingModule)"
      :sun-transition-active="sunTransitionActive"
      :card-style="cardStyle"
      :connector-style="connectorStyle"
      :connector-length="connector.length"
      :burst-style="burstStyle"
      :burst-active="burst.active"
      :sun-tint-style="sunTintStyle"
      :get-boosted-duration="getBoostedDuration"
      :set-node-ref="setNodeRef"
      @wheel="onWheel"
      @pointer-move="handlePointerMove"
      @pointer-leave="handlePointerLeave"
      @hover-module="setHovered"
      @clear-hover="clearHovered"
      @launch-module="handleLaunchModule"
    />
  </section>
</template>

<style scoped>
.portal-shell {
  position: relative;
}
</style>
