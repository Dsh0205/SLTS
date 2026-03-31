const { autoUpdater } = require('electron-updater')

function createUpdaterManager({ app, BrowserWindow }) {
  const state = {
    supported: app.isPackaged,
    status: app.isPackaged ? 'idle' : 'unsupported',
    version: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: 0,
    message: app.isPackaged ? '可以检查更新。' : '自动更新仅在打包安装后的桌面版中可用。',
    checkedAt: null,
  }

  let initialized = false
  let pendingCheck = null

  function getState() {
    return { ...state }
  }

  function broadcastState() {
    const snapshot = getState()
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents.send('desktop-updater:state', snapshot)
      }
    })
  }

  function applyState(patch) {
    Object.assign(state, patch)
    broadcastState()
  }

  function initialize() {
    if (initialized) {
      return
    }

    initialized = true

    if (!app.isPackaged) {
      broadcastState()
      return
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      applyState({
        status: 'checking',
        progressPercent: 0,
        message: '正在检查更新...',
        checkedAt: new Date().toISOString(),
      })
    })

    autoUpdater.on('update-available', (info) => {
      applyState({
        status: 'available',
        availableVersion: info?.version ?? null,
        downloadedVersion: null,
        progressPercent: 0,
        message: `发现新版本 ${info?.version ?? ''}，正在后台下载...`,
        checkedAt: new Date().toISOString(),
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)))
      applyState({
        status: 'downloading',
        progressPercent: percent,
        message: `正在下载更新 ${percent}%...`,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      const version = info?.version ?? state.availableVersion
      applyState({
        status: 'downloaded',
        availableVersion: version,
        downloadedVersion: version,
        progressPercent: 100,
        message: `新版本 ${version ?? ''} 已下载完成，点击“立即安装更新”。`,
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      applyState({
        status: 'up-to-date',
        availableVersion: info?.version ?? null,
        downloadedVersion: null,
        progressPercent: 100,
        message: `当前已是最新版本 ${app.getVersion()}。`,
        checkedAt: new Date().toISOString(),
      })
    })

    autoUpdater.on('error', (error) => {
      applyState({
        status: 'error',
        progressPercent: 0,
        message: error?.message || '检查更新失败，请稍后再试。',
      })
    })

    broadcastState()
  }

  async function checkForUpdates() {
    initialize()

    if (!app.isPackaged) {
      return getState()
    }

    if (pendingCheck) {
      return pendingCheck
    }

    pendingCheck = autoUpdater.checkForUpdates()
      .then(() => getState())
      .finally(() => {
        pendingCheck = null
      })

    return pendingCheck
  }

  function quitAndInstall() {
    initialize()

    if (!app.isPackaged || state.status !== 'downloaded') {
      return {
        started: false,
        state: getState(),
      }
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })

    return {
      started: true,
      state: getState(),
    }
  }

  function scheduleStartupCheck(delayMs = 5000) {
    initialize()

    if (!app.isPackaged) {
      return
    }

    setTimeout(() => {
      void checkForUpdates().catch(() => {})
    }, delayMs)
  }

  return {
    initialize,
    getState,
    checkForUpdates,
    quitAndInstall,
    scheduleStartupCheck,
  }
}

module.exports = {
  createUpdaterManager,
}
