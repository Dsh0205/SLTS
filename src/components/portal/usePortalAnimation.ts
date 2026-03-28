import { computed, reactive, ref } from 'vue'
import type { ModuleDefinition, ModuleKey } from '../../lib/modules'

type BurstState = {
  active: boolean
  x: number
  y: number
  color: string
  softColor: string
  radius: number
}

type UsePortalAnimationOptions = {
  modules: ModuleDefinition[]
  getSunCoreElement: () => HTMLElement | null
  getReflowElement: () => HTMLElement | null
  onLaunchComplete: (moduleKey: ModuleKey) => void
}

const ORBIT_PREVIEW_MS = 1800
const SUN_TRANSITION_MS = 1000
const EXPANSION_MS = 1800

export function usePortalAnimation(options: UsePortalAnimationOptions) {
  const launchingKey = ref<ModuleKey | null>(null)
  const sunTransitionActive = ref(false)
  const burst = reactive<BurstState>({
    active: false,
    x: 0,
    y: 0,
    color: '#fff',
    softColor: '#fff',
    radius: 0,
  })

  let launchSunTimer = 0
  let launchBurstTimer = 0
  let launchCompleteTimer = 0

  const launchingModule = computed(() => {
    return options.modules.find((module) => module.key === launchingKey.value) ?? null
  })

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
    const rect = options.getSunCoreElement()?.getBoundingClientRect()
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

  function clearLaunchTimers() {
    window.clearTimeout(launchSunTimer)
    window.clearTimeout(launchBurstTimer)
    window.clearTimeout(launchCompleteTimer)
  }

  function resetLaunchState() {
    burst.active = false
    sunTransitionActive.value = false
    launchingKey.value = null
  }

  function getBoostedDuration(duration: string, factor = 0.1) {
    const numeric = Number.parseFloat(duration)
    if (!Number.isFinite(numeric) || numeric <= 0) return duration

    return duration.trim().endsWith('ms')
      ? `${Math.max(120, Math.round(numeric * factor))}ms`
      : `${Math.max(0.12, numeric * factor).toFixed(2)}s`
  }

  function launchModule(moduleKey: ModuleKey) {
    if (launchingKey.value) return

    const module = options.modules.find((item) => item.key === moduleKey)
    if (!module) return

    launchingKey.value = moduleKey
    const origin = getBurstOrigin()
    burst.x = origin.x
    burst.y = origin.y
    burst.color = module.color
    burst.softColor = module.colorSoft
    burst.radius = getBurstRadius(origin.x, origin.y)
    burst.active = false
    sunTransitionActive.value = false

    clearLaunchTimers()
    void options.getReflowElement()?.offsetWidth

    launchSunTimer = window.setTimeout(() => {
      sunTransitionActive.value = true
    }, ORBIT_PREVIEW_MS)

    launchBurstTimer = window.setTimeout(() => {
      const nextOrigin = getBurstOrigin()
      burst.x = nextOrigin.x
      burst.y = nextOrigin.y
      burst.radius = getBurstRadius(nextOrigin.x, nextOrigin.y)
      void options.getReflowElement()?.offsetWidth
      burst.active = true
    }, ORBIT_PREVIEW_MS + SUN_TRANSITION_MS)

    launchCompleteTimer = window.setTimeout(() => {
      options.onLaunchComplete(moduleKey)
      resetLaunchState()
    }, ORBIT_PREVIEW_MS + SUN_TRANSITION_MS + EXPANSION_MS)
  }

  return {
    burst,
    burstStyle,
    getBoostedDuration,
    launchingKey,
    launchingModule,
    clearLaunchTimers,
    launchModule,
    resetLaunchState,
    sunTintStyle,
    sunTransitionActive,
  }
}
