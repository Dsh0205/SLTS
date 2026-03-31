<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue'
import type { ModuleDefinition, ModuleKey } from '../../lib/modules'

type InlineStyle = Record<string, string | number>

const props = defineProps<{
  modules: ModuleDefinition[]
  centerModule: ModuleDefinition
  stageStyle: InlineStyle
  musicLabel: string
  hoveredKey: ModuleKey | null
  hoveredModule: ModuleDefinition | null
  launchingKey: ModuleKey | null
  launchingActive: boolean
  sunTransitionActive: boolean
  cardStyle: InlineStyle
  connectorStyle: InlineStyle
  connectorLength: number
  burstStyle: InlineStyle
  burstActive: boolean
  sunTintStyle: InlineStyle
  getBoostedDuration: (duration: string) => string
  setNodeRef: (moduleKey: ModuleKey, element: Element | ComponentPublicInstance | null) => void
}>()

const emit = defineEmits<{
  wheel: [event: WheelEvent]
  pointerMove: [event: PointerEvent]
  pointerLeave: []
  hoverModule: [moduleKey: ModuleKey]
  clearHover: [moduleKey: ModuleKey]
  launchModule: [moduleKey: ModuleKey]
}>()

const stageRef = ref<HTMLElement | null>(null)
const infoCardRef = ref<HTMLElement | null>(null)
const sunCoreRef = ref<HTMLElement | null>(null)

function getStageElement() {
  return stageRef.value
}

function getInfoCardElement() {
  return infoCardRef.value
}

function getSunCoreElement() {
  return sunCoreRef.value
}

defineExpose({
  getInfoCardElement,
  getStageElement,
  getSunCoreElement,
})
</script>

<template>
  <section
    ref="stageRef"
    class="portal-scene"
    :style="props.stageStyle"
    @wheel.prevent="emit('wheel', $event)"
    @pointermove="emit('pointerMove', $event)"
    @pointerleave="emit('pointerLeave')"
  >
    <div class="music-status">{{ props.musicLabel }}</div>

    <div class="system-title" aria-label="SHANLIC LIFE TRACKER SYSTEM">
      <span class="system-title-chip">SYSTEM CORE</span>
      <h1 class="system-title-main">
        <span class="system-title-glow">SHANLIC LIFE TRACKER SYSTEM</span>
        <span class="system-title-text">SHANLIC LIFE TRACKER SYSTEM</span>
      </h1>
      <span class="system-title-meta">ORBITAL GRID :: ONLINE</span>
    </div>

    <div
      v-if="props.hoveredModule"
      ref="infoCardRef"
      class="info-card"
      :style="props.cardStyle"
    >
      <strong>{{ props.hoveredModule.title }}</strong>
      <span>{{ props.hoveredModule.subtitle }}</span>
    </div>

    <div
      v-if="props.hoveredModule && props.connectorLength > 0"
      class="info-link"
      :style="props.connectorStyle"
      aria-hidden="true"
    >
      <span class="info-link-line"></span>
      <span class="info-link-travel"></span>
      <span class="info-link-dot"></span>
    </div>

    <div class="scene-shell">
      <div class="solar-plane">
        <div
          ref="sunCoreRef"
          class="sun-core"
          :class="{
            'is-hovered': props.hoveredKey === props.centerModule.key,
            'is-launching': props.launchingKey === props.centerModule.key,
            'is-priming': props.launchingActive,
            'is-transitioning': props.sunTransitionActive,
          }"
        >
          <span class="sun-glow"></span>
          <span class="sun-transition-glow" :style="props.sunTintStyle"></span>
          <span class="sun-surface"></span>
          <span class="sun-transition-surface" :style="props.sunTintStyle"></span>
          <button
            :ref="(element) => props.setNodeRef(props.centerModule.key, element)"
            class="sun-core-button"
            type="button"
            :aria-label="props.centerModule.title"
            @mouseenter="emit('hoverModule', props.centerModule.key)"
            @focus="emit('hoverModule', props.centerModule.key)"
            @blur="emit('clearHover', props.centerModule.key)"
            @click="emit('launchModule', props.centerModule.key)"
          >
            <span class="sun-core-button-ring"></span>
            <span class="sun-core-button-label">{{ props.centerModule.title }}</span>
          </button>
        </div>

        <div
          v-for="module in props.modules"
          :key="module.key"
          class="orbit-shell"
          :class="{ 'is-hovered': props.hoveredKey === module.key, 'is-launching': props.launchingKey === module.key }"
          :style="{
            '--orbit-size': module.orbit.size,
            '--orbit-duration': module.orbit.duration,
            '--orbit-duration-boost': props.getBoostedDuration(module.orbit.duration),
            '--orbit-delay': module.orbit.delay,
            '--orbit-rotation': module.orbit.rotation,
            '--planet-color': module.color,
            '--planet-color-soft': module.colorSoft,
          }"
        >
          <div class="orbit-ring"></div>
          <div class="orbit-node-anchor">
            <button
              :ref="(element) => props.setNodeRef(module.key, element)"
              class="orbit-node"
              type="button"
              @mouseenter="emit('hoverModule', module.key)"
              @focus="emit('hoverModule', module.key)"
              @blur="emit('clearHover', module.key)"
              @click="emit('launchModule', module.key)"
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
      :class="{ active: props.burstActive }"
      :style="props.burstStyle"
      aria-hidden="true"
    ></div>
  </section>
</template>

<style scoped>
.portal-scene{position:relative;min-height:100vh;overflow:hidden;background:linear-gradient(180deg,rgba(3,8,16,.38),rgba(4,10,18,.56)),url('/assets/portal/space-bg.jpg') center/cover no-repeat}
.portal-scene::before,.portal-scene::after{content:'';position:absolute;inset:0;pointer-events:none}
.portal-scene::before{background:radial-gradient(circle at 50% 14%,rgba(255,255,255,.05),transparent 18%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.24))}
.portal-scene::after{background-image:radial-gradient(circle at 14% 20%,rgba(255,255,255,.9) 0 1px,transparent 2px),radial-gradient(circle at 32% 72%,rgba(255,255,255,.75) 0 1px,transparent 2px),radial-gradient(circle at 58% 18%,rgba(255,255,255,.8) 0 1px,transparent 2px),radial-gradient(circle at 80% 68%,rgba(255,255,255,.68) 0 1px,transparent 2px);opacity:.34}
.system-title{position:absolute;left:50%;top:22px;z-index:3;display:grid;justify-items:center;gap:6px;min-width:min(760px,calc(100vw - 120px));padding:10px 24px 14px;transform:translateX(-50%);border:1px solid rgba(138,198,255,.14);border-radius:22px;background:linear-gradient(180deg,rgba(7,14,26,.54),rgba(6,11,20,.18));box-shadow:0 18px 44px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06),0 0 32px rgba(107,195,255,.08);backdrop-filter:blur(12px);overflow:hidden}
.system-title::before,.system-title::after{content:'';position:absolute;pointer-events:none}
.system-title::before{inset:0;background:linear-gradient(90deg,transparent,rgba(123,208,255,.08),transparent);transform:translateX(-120%);animation:title-scan 6.4s linear infinite}
.system-title::after{left:22px;right:22px;top:50%;height:1px;background:linear-gradient(90deg,transparent,rgba(123,208,255,.36),transparent);opacity:.34}
.system-title-chip,.system-title-meta{position:relative;z-index:1;font-size:.65rem;letter-spacing:.42em;text-transform:uppercase;color:rgba(154,212,255,.72);white-space:nowrap}
.system-title-main{position:relative;z-index:1;margin:0;display:grid;place-items:center;white-space:nowrap;text-transform:uppercase;letter-spacing:.34em;font-size:clamp(1.15rem,2vw,1.95rem)}
.system-title-glow,.system-title-text{grid-area:1/1}
.system-title-glow{color:rgba(120,211,255,.3);filter:blur(10px);transform:scale(1.02)}
.system-title-text{position:relative;padding:0 .08em;background:linear-gradient(180deg,#f4fbff 0%,#bce9ff 42%,#7dcfff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 20px rgba(125,207,255,.24),0 8px 24px rgba(0,0,0,.42)}
.system-title-text::before{content:'';position:absolute;left:-16px;right:-16px;top:50%;height:48%;transform:translateY(-50%);background:linear-gradient(90deg,transparent,rgba(184,234,255,.12),transparent);filter:blur(10px);z-index:-1}
.info-card{position:absolute;z-index:4;min-width:180px;padding:14px 18px;transform:translate(-50%,-50%);border-radius:16px;border:1px solid color-mix(in srgb,var(--card-accent) 34%,rgba(255,255,255,.18));background:rgba(8,14,24,.52);backdrop-filter:blur(12px);color:#f4f7ff;box-shadow:0 18px 44px rgba(0,0,0,.28),0 0 24px color-mix(in srgb,var(--card-accent) 12%,transparent);pointer-events:none;will-change:left,top,transform;transition:left .16s ease,top .16s ease,border-color .16s ease,box-shadow .16s ease}
.info-card strong,.info-card span{display:block}
.info-card span{margin-top:4px;color:rgba(234,239,255,.72);font-size:.88rem}
.info-link{position:absolute;z-index:3;height:14px;transform-origin:left center;pointer-events:none}
.info-link-line{position:absolute;inset:50% 0 auto 0;height:1px;transform:translateY(-50%);background:linear-gradient(90deg,color-mix(in srgb,var(--connector-color) 35%,transparent),rgba(255,255,255,.96));box-shadow:0 0 12px color-mix(in srgb,var(--connector-color) 18%,transparent)}
.info-link-travel,.info-link-dot{position:absolute;left:0;top:50%;border-radius:50%;transform:translate(-50%,-50%)}
.info-link-travel{width:12px;height:12px;background:radial-gradient(circle at 34% 34%,rgba(255,255,255,.95),rgba(255,255,255,.2) 42%,transparent 70%),color-mix(in srgb,var(--connector-color) 84%,white 16%);box-shadow:0 0 18px color-mix(in srgb,var(--connector-color) 46%,transparent),0 0 34px color-mix(in srgb,var(--connector-color) 20%,transparent);animation:connector-travel 1.8s ease-in-out infinite}
.info-link-dot{width:10px;height:10px;background:rgba(255,255,255,.94);box-shadow:0 0 18px rgba(255,255,255,.3)}
.scene-shell{position:absolute;inset:0;display:grid;place-items:center}
.solar-plane{position:relative;width:min(88vw,1040px);aspect-ratio:1;transform:scale(var(--scene-zoom));transition:transform .32s ease}
.sun-core{position:absolute;left:50%;top:50%;width:138px;height:138px;transform:translate(-50%,-50%);transition:transform 1s ease,filter .22s ease}
.sun-glow,.sun-transition-glow,.sun-surface,.sun-transition-surface,.planet-ball>span{position:absolute;inset:0;border-radius:50%}
.sun-glow{inset:-44px;background:radial-gradient(circle,rgba(255,186,78,.34),rgba(255,131,18,.14),transparent 74%);filter:blur(10px);transition:opacity 1s ease,transform 1s ease,filter .22s ease}
.sun-transition-glow{inset:-58px;opacity:0;background:radial-gradient(circle,color-mix(in srgb,var(--sun-tint-color-soft) 44%,white 10%),color-mix(in srgb,var(--sun-tint-color) 22%,transparent) 42%,transparent 78%);filter:blur(16px);transform:scale(.78);transition:opacity 1s ease,transform 1s ease}
.sun-surface{background:radial-gradient(circle at 32% 28%,#fff1c9,#ffb347 48%,#ff871d 76%,#d85a06);box-shadow:0 0 48px rgba(255,152,35,.54),0 0 110px rgba(255,152,35,.24);transition:opacity 1s ease,transform 1s ease,filter .22s ease}
.sun-transition-surface{opacity:0;background:radial-gradient(circle at 34% 24%,color-mix(in srgb,var(--sun-tint-color-soft) 72%,white 28%),color-mix(in srgb,var(--sun-tint-color-soft) 28%,white 12%) 16%,transparent 22%),radial-gradient(circle at 65% 72%,color-mix(in srgb,var(--sun-tint-color) 22%,transparent),transparent 48%),radial-gradient(circle at 42% 42%,color-mix(in srgb,var(--sun-tint-color-soft) 82%,white 18%) 0%,var(--sun-tint-color) 58%,color-mix(in srgb,var(--sun-tint-color) 92%,white 8%) 100%);box-shadow:0 0 72px color-mix(in srgb,var(--sun-tint-color) 56%,transparent),0 0 140px color-mix(in srgb,var(--sun-tint-color) 24%,transparent);transform:scale(.82);transition:opacity 1s ease,transform 1s ease}
.sun-core-button{position:absolute;inset:0;z-index:2;display:grid;place-items:center;padding:0;border:0;background:transparent;cursor:pointer;border-radius:50%;color:#fff5e0;pointer-events:auto}
.sun-core-button-ring{position:absolute;inset:-10px;border-radius:50%;border:1px solid rgba(255,228,186,.28);box-shadow:0 0 0 1px rgba(255,255,255,.06) inset,0 0 24px rgba(255,166,66,.12);opacity:0;transform:scale(.9);transition:opacity .22s ease,transform .22s ease}
.sun-core-button-label{position:absolute;bottom:-34px;left:50%;padding:6px 12px;border-radius:999px;background:rgba(10,14,22,.56);border:1px solid rgba(255,214,157,.22);font-size:.72rem;font-weight:700;letter-spacing:.08em;white-space:nowrap;transform:translateX(-50%);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;backdrop-filter:blur(10px)}
.sun-core.is-hovered,.sun-core:focus-within{transform:translate(-50%,-50%) scale(1.04)}
.sun-core.is-hovered .sun-glow,.sun-core:focus-within .sun-glow{transform:scale(1.12);opacity:1}
.sun-core.is-hovered .sun-glow,.sun-core:focus-within .sun-glow{animation:pulse-glow 1.35s ease-in-out infinite}
.sun-core.is-hovered .sun-surface,.sun-core:focus-within .sun-surface{transform:scale(1.08);filter:saturate(1.08) brightness(1.05)}
.sun-core.is-hovered .sun-core-button-ring,.sun-core:focus-within .sun-core-button-ring{opacity:1;transform:scale(1)}
.sun-core.is-hovered .sun-core-button-label,.sun-core:focus-within .sun-core-button-label{opacity:1;transform:translateX(-50%) translateY(-4px)}
.sun-core.is-launching .sun-core-button-ring{opacity:1;transform:scale(1.06)}
.sun-core.is-launching .sun-glow{opacity:1;filter:blur(16px);transform:scale(1.28);animation:pulse-glow .72s ease-in-out infinite}
.sun-core.is-launching .sun-surface{transform:scale(1.14);filter:saturate(1.16) brightness(1.08)}
.sun-core-button:focus-visible{outline:2px solid rgba(255,255,255,.86);outline-offset:6px}
.sun-core.is-priming:not(.is-transitioning){animation:sun-warmup 1.5s ease-in-out infinite alternate}
.sun-core.is-transitioning{transform:translate(-50%,-50%) scale(1.08)}
.sun-core.is-transitioning .sun-glow,.sun-core.is-transitioning .sun-surface{opacity:.2;transform:scale(.94)}
.sun-core.is-transitioning .sun-transition-glow,.sun-core.is-transitioning .sun-transition-surface{opacity:1;transform:scale(1.06)}
.orbit-shell{position:absolute;left:50%;top:50%;width:var(--orbit-size);height:var(--orbit-size);transform:translate(-50%,-50%) rotate(var(--orbit-rotation));animation:orbit-spin var(--orbit-duration) linear infinite;animation-delay:var(--orbit-delay);pointer-events:none}
.orbit-shell.is-hovered:not(.is-launching),.orbit-shell:focus-within:not(.is-launching){animation-play-state:paused}
.orbit-shell.is-launching{animation-duration:var(--orbit-duration-boost)}
.orbit-ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03),0 0 20px rgba(255,255,255,.04)}
.orbit-shell.is-launching .orbit-ring{border-color:color-mix(in srgb,var(--planet-color) 46%,rgba(255,255,255,.22));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--planet-color-soft) 16%,rgba(255,255,255,.08)),0 0 26px color-mix(in srgb,var(--planet-color) 24%,transparent)}
.orbit-node-anchor{position:absolute;left:50%;top:0;transform:translate(-50%,-50%);animation:orbit-counter var(--orbit-duration) linear infinite reverse;animation-delay:var(--orbit-delay)}
.orbit-shell.is-hovered:not(.is-launching) .orbit-node-anchor,.orbit-shell:focus-within:not(.is-launching) .orbit-node-anchor{animation-play-state:paused}
.orbit-shell.is-launching .orbit-node-anchor{animation-duration:var(--orbit-duration-boost)}
.orbit-node{position:relative;width:88px;height:88px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;transform:rotate(calc(var(--orbit-rotation) * -1));cursor:pointer;pointer-events:auto;overflow:visible;isolation:isolate}
.planet-ball{position:relative;width:46px;height:46px;display:block;border-radius:50%;transition:transform .22s ease,filter .22s ease}
.planet-glow{inset:-18px!important;background:radial-gradient(circle,color-mix(in srgb,var(--planet-color-soft) 52%,white 12%) 0%,transparent 66%);filter:blur(14px);opacity:.92;transition:opacity .22s ease,transform .22s ease}
.planet-surface{background:var(--planet-color);box-shadow:0 0 24px color-mix(in srgb,var(--planet-color) 52%,transparent),0 10px 24px color-mix(in srgb,var(--planet-color) 20%,transparent)}
.planet-core{inset:6px!important;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.92),rgba(255,255,255,.3) 14%,transparent 26%),radial-gradient(circle at 62% 64%,color-mix(in srgb,var(--planet-color-soft) 26%,transparent),transparent 58%);opacity:.78}
.orbit-shell.is-hovered .planet-ball,.orbit-node:hover .planet-ball,.orbit-node:focus-visible .planet-ball{transform:scale(1.72);filter:saturate(1.08) brightness(1.06)}
.orbit-shell.is-launching .planet-ball{transform:scale(1.96);filter:saturate(1.18) brightness(1.16)}
.orbit-shell.is-hovered .planet-glow,.orbit-node:hover .planet-glow,.orbit-node:focus-visible .planet-glow{opacity:1;filter:blur(16px);transform:scale(1.18);animation:pulse-glow 1.35s ease-in-out infinite}
.orbit-shell.is-launching .planet-glow{opacity:1;filter:blur(18px);transform:scale(1.34);animation:pulse-glow .72s ease-in-out infinite}
.orbit-node:focus-visible{outline:2px solid rgba(255,255,255,.86);outline-offset:4px}
.transition-burst{position:fixed;inset:0;opacity:0;background:radial-gradient(circle at var(--burst-x) var(--burst-y),color-mix(in srgb,var(--burst-color) 100%,transparent) 0%,color-mix(in srgb,var(--burst-color) 98%,transparent) 28%,color-mix(in srgb,var(--burst-color) 94%,transparent) 66%,color-mix(in srgb,var(--burst-color-soft) 90%,transparent) 100%);box-shadow:0 0 120px color-mix(in srgb,var(--burst-color-soft) 78%,transparent),0 0 220px color-mix(in srgb,var(--burst-color) 64%,transparent);pointer-events:none;z-index:8;clip-path:circle(0 at var(--burst-x) var(--burst-y))}
.transition-burst.active{animation:burst-expand 1.8s cubic-bezier(.18,.78,.12,1) forwards}
@keyframes orbit-spin{from{transform:translate(-50%,-50%) rotate(var(--orbit-rotation)) rotate(0)}to{transform:translate(-50%,-50%) rotate(var(--orbit-rotation)) rotate(360deg)}}
@keyframes orbit-counter{from{transform:translate(-50%,-50%) rotate(0)}to{transform:translate(-50%,-50%) rotate(-360deg)}}
@keyframes connector-travel{0%{transform:translate(-50%,-50%) scale(.35);opacity:0}16%,84%{opacity:1}100%{transform:translate(calc(var(--connector-length,0px) - 6px),-50%) scale(1);opacity:0}}
@keyframes pulse-glow{0%,100%{opacity:.9;transform:scale(1.08)}50%{opacity:1;transform:scale(1.3)}}
@keyframes sun-warmup{from{transform:translate(-50%,-50%) scale(1)}to{transform:translate(-50%,-50%) scale(1.04)}}
@keyframes burst-expand{from{clip-path:circle(0 at var(--burst-x) var(--burst-y));opacity:1}to{clip-path:circle(var(--burst-radius) at var(--burst-x) var(--burst-y));opacity:1}}
@keyframes title-scan{0%{transform:translateX(-120%)}48%,100%{transform:translateX(120%)}}
.music-status{position:absolute;left:24px;bottom:20px;z-index:5;max-width:min(420px,calc(100vw - 32px));padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(7,12,22,.48);backdrop-filter:blur(12px);color:rgba(236,242,255,.84);font-size:.76rem;letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 12px 28px rgba(0,0,0,.18)}
@media (max-width:760px){.system-title{top:18px;min-width:calc(100% - 28px);padding:10px 12px 12px}.system-title-chip,.system-title-meta{font-size:.56rem;letter-spacing:.24em}.system-title-main{font-size:clamp(.86rem,4vw,1.1rem);letter-spacing:.14em;text-align:center;white-space:normal;line-height:1.25}.solar-plane{width:min(100vw,680px)}.sun-core{width:110px;height:110px}.orbit-node{width:70px;height:70px}.planet-ball{width:38px;height:38px}.music-status{left:12px;bottom:12px;max-width:calc(100vw - 24px);font-size:.7rem}}
</style>
