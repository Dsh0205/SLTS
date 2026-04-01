<script setup lang="ts">
import { ref } from 'vue'
import type { PortalMusicTrackSummary } from './usePortalMusic'

const props = defineProps<{
  open: boolean
  isDesktop: boolean
  startupBusy: boolean
  backupBusy: boolean
  storageBusy: boolean
  launchAtStartupEnabled: boolean
  updateSupported: boolean
  updateBusy: boolean
  updateButtonLabel: string
  updateStatusText: string
  message: string
  tone: 'info' | 'success' | 'error'
  musicTracks: PortalMusicTrackSummary[]
  selectedMusicId: string | null
}>()

const emit = defineEmits<{
  toggle: []
  toggleAutoLaunch: []
  inspectStorage: []
  triggerUpdateAction: []
  exportBackup: []
  importBackup: []
  selectMusic: [trackId: string | null]
  importMusic: [files: File[]]
  removeMusic: [trackId: string]
}>()

const buttonRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const musicMenuOpen = ref(false)

function getButtonElement() {
  return buttonRef.value
}

function getPanelElement() {
  return panelRef.value
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function openImportPicker() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = Array.from(input?.files ?? [])
  if (files.length > 0) {
    emit('importMusic', files)
  }

  if (input) {
    input.value = ''
  }
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
        {{ props.isDesktop ? '桌面版启动、备份与恢复入口已集中到这里。' : '当前是浏览器模式，导入的 MP3 会保存在当前浏览器本地。' }}
      </p>

      <button
        class="submenu-toggle"
        :class="{ active: musicMenuOpen }"
        type="button"
        :aria-expanded="musicMenuOpen"
        @click="musicMenuOpen = !musicMenuOpen"
      >
        <span class="submenu-toggle-label">背景音乐</span>
        <span class="submenu-toggle-meta">
          <strong>{{ props.musicTracks.length }} 首</strong>
          <span class="submenu-toggle-arrow">{{ musicMenuOpen ? '收起' : '展开' }}</span>
        </span>
      </button>

      <div v-if="musicMenuOpen" class="submenu-panel">
        <div class="music-toolbar">
          <button class="settings-action primary" type="button" @click="openImportPicker">
            导入 MP3
          </button>
          <button
            class="settings-action"
            type="button"
            :disabled="!props.selectedMusicId"
            @click="emit('selectMusic', null)"
          >
            停止播放
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".mp3,audio/mpeg"
            multiple
            hidden
            @change="handleFileChange"
          >
        </div>

        <p class="settings-copy compact">
          导入后的音乐会保存在当前浏览器里。之后每次打开主页，系统都会自动尝试播放你上次选中的那首。
        </p>

        <div v-if="props.musicTracks.length === 0" class="music-empty">
          还没有导入音乐文件。
        </div>

        <div v-else class="music-list">
          <div
            v-for="track in props.musicTracks"
            :key="track.id"
            class="music-row"
            :class="{ active: props.selectedMusicId === track.id }"
          >
            <button
              class="music-select"
              type="button"
              @click="emit('selectMusic', track.id)"
            >
              <strong>{{ track.name }}</strong>
              <span>{{ formatFileSize(track.size) }}</span>
            </button>
            <button
              class="music-remove"
              type="button"
              aria-label="删除音乐"
              @click="emit('removeMusic', track.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button
          class="settings-action primary"
          type="button"
          :disabled="!props.isDesktop || !props.updateSupported || props.updateBusy"
          @click="emit('triggerUpdateAction')"
        >
          {{ props.updateButtonLabel }}
        </button>
        <button
          class="settings-action"
          type="button"
          :disabled="!props.isDesktop || props.startupBusy"
          @click="emit('toggleAutoLaunch')"
        >
          {{ props.launchAtStartupEnabled ? '关闭开机自启动' : '开启开机自启动' }}
        </button>
        <button
          class="settings-action"
          type="button"
          :disabled="props.storageBusy"
          @click="emit('inspectStorage')"
        >
          {{ props.storageBusy ? '正在统计占用...' : '查看本地存储占用' }}
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

      <p v-if="props.updateStatusText" class="settings-copy compact">{{ props.updateStatusText }}</p>
      <p v-if="props.message" class="settings-status">{{ props.message }}</p>
    </div>
  </div>
</template>

<style scoped>
.settings-anchor{position:absolute;top:22px;left:24px;z-index:6}
.settings-button{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:16px;background:rgba(7,12,22,.56);color:rgba(255,240,214,.96);cursor:pointer;backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);transition:transform .16s ease,border-color .16s ease,background .16s ease}
.settings-button:hover{transform:translateY(-1px);border-color:rgba(255,196,108,.36);background:rgba(12,19,34,.74)}
.settings-button svg{width:22px;height:22px;fill:currentColor}
.settings-panel{width:min(340px,calc(100vw - 32px));margin-top:12px;padding:16px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:rgba(7,12,22,.72);backdrop-filter:blur(16px);box-shadow:0 22px 48px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05)}
.settings-title{color:rgba(255,240,214,.95);font-size:.92rem;letter-spacing:.12em;text-transform:uppercase}
.settings-copy,.settings-status{margin:10px 0 0;color:rgba(224,232,249,.8);font-size:.86rem;line-height:1.6}
.settings-copy.compact{font-size:.8rem}
.submenu-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding:12px 14px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.08);color:rgba(240,245,255,.92);font:inherit;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.12);transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}
.submenu-toggle:hover{transform:translateY(-1px);border-color:rgba(255,196,108,.28);background:rgba(255,255,255,.1)}
.submenu-toggle.active{border-color:rgba(255,191,110,.54);background:linear-gradient(135deg,rgba(255,192,106,.22),rgba(255,143,76,.18));box-shadow:0 12px 28px rgba(255,140,74,.16)}
.submenu-toggle-label{display:inline-flex;align-items:center;gap:8px}
.submenu-toggle-label::before{content:'♪';display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;background:rgba(255,255,255,.12);color:rgba(255,226,173,.92);font-size:.8rem}
.submenu-toggle-meta{display:grid;justify-items:end;gap:2px}
.submenu-toggle strong{color:rgba(255,214,156,.92);font-size:.78rem}
.submenu-toggle-arrow{color:rgba(214,224,248,.68);font-size:.72rem;font-weight:600}
.submenu-panel{display:grid;gap:10px;margin-top:10px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.04)}
.music-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.music-empty{padding:12px;border-radius:12px;background:rgba(255,255,255,.05);color:rgba(214,224,248,.72);font-size:.82rem}
.music-list{display:grid;gap:8px}
.music-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.04)}
.music-row.active{border-color:rgba(255,191,110,.54);background:linear-gradient(135deg,rgba(255,197,115,.2),rgba(255,143,76,.14))}
.music-select{display:grid;gap:4px;padding:0;border:0;background:transparent;color:rgba(240,245,255,.94);font:inherit;text-align:left;cursor:pointer}
.music-select strong{font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.music-select span{color:rgba(214,224,248,.68);font-size:.76rem}
.music-remove{padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.08);color:rgba(255,224,218,.9);font:inherit;font-size:.78rem;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease}
.music-remove:hover{transform:translateY(-1px);border-color:rgba(255,145,122,.38);background:rgba(255,145,122,.14)}
.settings-actions{display:grid;gap:10px;margin-top:14px}
.settings-action{border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 14px;background:rgba(255,255,255,.08);color:rgba(240,245,255,.92);font:inherit;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,opacity .16s ease}
.settings-action.primary{background:linear-gradient(135deg,rgba(255,192,106,.92),rgba(255,143,76,.92));color:#0d1016;border-color:transparent;box-shadow:0 10px 24px rgba(255,140,74,.24)}
.settings-action:hover:not(:disabled){transform:translateY(-1px)}
.settings-action:disabled{opacity:.48;cursor:not-allowed}
.settings-panel[data-tone='success'] .settings-status{color:#bfffd1}
.settings-panel[data-tone='error'] .settings-status{color:#ffd2cf}
@media (max-width:760px){.settings-anchor{top:16px;left:14px}.settings-panel{width:min(320px,calc(100vw - 28px))}.music-toolbar{grid-template-columns:1fr}.music-row{grid-template-columns:1fr}}
</style>
