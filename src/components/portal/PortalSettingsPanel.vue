<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  open: boolean
  isDesktop: boolean
  startupBusy: boolean
  backupBusy: boolean
  launchAtStartupEnabled: boolean
  message: string
  tone: 'info' | 'success' | 'error'
}>()

const emit = defineEmits<{
  toggle: []
  toggleAutoLaunch: []
  exportBackup: []
  importBackup: []
}>()

const buttonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function getButtonElement() {
  return buttonRef.value
}

function getPanelElement() {
  return panelRef.value
}

defineExpose({
  getButtonElement,
  getPanelElement,
})
</script>

<template>
  <div class="settings-anchor">
    <button
      ref="buttonRef"
      class="settings-button"
      type="button"
      :aria-expanded="props.open"
      aria-label="打开设置"
      @click.stop="emit('toggle')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.14 12.94a7.96 7.96 0 0 0 .05-.94a7.96 7.96 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.41 7.41 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.22-1.11.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.57-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
      </svg>
    </button>

    <div
      v-if="props.open"
      ref="panelRef"
      class="settings-panel"
      :data-tone="props.tone"
    >
      <div class="settings-title">系统设置</div>
      <p class="settings-copy">
        {{ props.isDesktop ? '桌面版启动、备份与恢复入口已集中到这里。' : '当前是浏览器模式，桌面专属设置会在 Electron 版中可用。' }}
      </p>
      <div class="settings-actions">
        <button
          class="settings-action primary"
          type="button"
          :disabled="!props.isDesktop || props.startupBusy"
          @click="emit('toggleAutoLaunch')"
        >
          {{ props.launchAtStartupEnabled ? '关闭开机自启动' : '开启开机自启动' }}
        </button>
        <button
          class="settings-action"
          type="button"
          :disabled="!props.isDesktop || props.backupBusy"
          @click="emit('exportBackup')"
        >
          导出备份
        </button>
        <button
          class="settings-action"
          type="button"
          :disabled="!props.isDesktop || props.backupBusy"
          @click="emit('importBackup')"
        >
          导入恢复
        </button>
      </div>
      <p v-if="props.message" class="settings-status">{{ props.message }}</p>
    </div>
  </div>
</template>

<style scoped>
.settings-anchor{position:absolute;top:22px;left:24px;z-index:6}
.settings-button{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(7,12,22,.56);color:rgba(255,240,214,.96);cursor:pointer;backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);transition:transform .16s ease,border-color .16s ease,background .16s ease}
.settings-button:hover{transform:translateY(-1px);border-color:rgba(255,196,108,.36);background:rgba(12,19,34,.74)}
.settings-button svg{width:22px;height:22px;fill:currentColor}
.settings-panel{width:min(320px,calc(100vw - 32px));margin-top:12px;padding:16px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:rgba(7,12,22,.72);backdrop-filter:blur(16px);box-shadow:0 22px 48px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05)}
.settings-title{color:rgba(255,240,214,.95);font-size:.92rem;letter-spacing:.12em;text-transform:uppercase}
.settings-copy,.settings-status{margin:10px 0 0;color:rgba(224,232,249,.8);font-size:.86rem;line-height:1.6}
.settings-actions{display:grid;gap:10px;margin-top:14px}
.settings-action{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 14px;background:rgba(255,255,255,.08);color:rgba(240,245,255,.92);font:inherit;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,opacity .16s ease}
.settings-action.primary{background:linear-gradient(135deg,rgba(255,192,106,.92),rgba(255,143,76,.92));color:#0d1016;border-color:transparent;box-shadow:0 10px 24px rgba(255,140,74,.24)}
.settings-action:hover:not(:disabled){transform:translateY(-1px)}
.settings-action:disabled{opacity:.48;cursor:not-allowed}
.settings-panel[data-tone='success'] .settings-status{color:#bfffd1}
.settings-panel[data-tone='error'] .settings-status{color:#ffd2cf}
@media (max-width:760px){.settings-anchor{top:16px;left:14px}.settings-panel{width:min(300px,calc(100vw - 28px))}}
</style>
