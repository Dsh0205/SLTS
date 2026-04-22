const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')

const { createStorageManager } = require('./lib/storage.cjs')
const { createNotesAssetsManager } = require('./lib/notes-assets.cjs')
const { createPhotographyAssetsManager } = require('./lib/photography-assets.cjs')
const { createUpdaterManager } = require('./lib/updater.cjs')
const { createWindowsManager } = require('./lib/windows.cjs')
const { createUsageTracker } = require('./lib/usage-tracker.cjs')
const { registerDesktopIpcHandlers } = require('./lib/ipc-handlers.cjs')

const DEV_SERVER_URL = 'http://127.0.0.1:5173'
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.png')
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs')
const STARTUP_LOG_PATH = path.join(app.getPath('userData'), 'startup-debug.log')

function appendStartupLog(message, extra) {
  const timestamp = new Date().toISOString()
  const details = extra === undefined ? '' : ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`

  try {
    fs.appendFileSync(STARTUP_LOG_PATH, `[${timestamp}] ${message}${details}\n`, 'utf8')
  } catch {}
}

const nativeConsoleError = console.error.bind(console)
const nativeConsoleLog = console.log.bind(console)

console.error = (...args) => {
  appendStartupLog('console.error', args.map((value) => String(value)).join(' | '))
  nativeConsoleError(...args)
}

console.log = (...args) => {
  appendStartupLog('console.log', args.map((value) => String(value)).join(' | '))
  nativeConsoleLog(...args)
}

appendStartupLog('main-process:start', {
  packaged: app.isPackaged,
  cwd: process.cwd(),
  execPath: process.execPath,
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process.', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in main process.', reason)
})

function getAutoLaunchState() {
  if (!app.isPackaged) {
    return {
      supported: false,
      enabled: false,
    }
  }

  const settings = app.getLoginItemSettings()
  return {
    supported: true,
    enabled: Boolean(settings.openAtLogin),
  }
}

function setAutoLaunchEnabled(enabled) {
  if (!app.isPackaged) {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: false,
    path: process.execPath,
  })
}

const storage = createStorageManager({ app })
const notesAssets = createNotesAssetsManager({ app, storage })
const photographyAssets = createPhotographyAssetsManager({ storage })
const updater = createUpdaterManager({ app, BrowserWindow })
const usageTracker = createUsageTracker({ app, BrowserWindow, storage })
const windows = createWindowsManager({
  app,
  BrowserWindow,
  shell,
  iconPath: APP_ICON_PATH,
  preloadPath: PRELOAD_PATH,
  rootDir: __dirname,
  devServerUrl: DEV_SERVER_URL,
})

registerDesktopIpcHandlers({
  app,
  ipcMain,
  BrowserWindow,
  dialog,
  storage,
  notesAssets,
  photographyAssets,
  windows,
  usageTracker,
  getAutoLaunchState,
  setAutoLaunchEnabled,
  updater,
})

app.whenReady().then(() => {
  appendStartupLog('app:ready')
  windows.createMainWindow()
  appendStartupLog('windows:createMainWindow-called')
  usageTracker.start()
  appendStartupLog('usageTracker:start')
  updater.scheduleStartupCheck()
  appendStartupLog('updater:scheduleStartupCheck')

  app.on('activate', () => {
    appendStartupLog('app:activate')
    if (windows.restoreMainWindow()) {
      appendStartupLog('windows:restoreMainWindow-hit')
      return
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      appendStartupLog('windows:createMainWindow-on-activate')
      windows.createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  appendStartupLog('app:window-all-closed', { platform: process.platform })
  if (process.platform !== 'darwin') {
    appendStartupLog('app:quit-from-window-all-closed')
    app.quit()
  }
})
