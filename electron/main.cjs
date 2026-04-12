const path = require('node:path')
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')

const { createStorageManager } = require('./lib/storage.cjs')
const { createNotesAssetsManager } = require('./lib/notes-assets.cjs')
const { createPhotographyAssetsManager } = require('./lib/photography-assets.cjs')
const { createUpdaterManager } = require('./lib/updater.cjs')
const { createWindowsManager } = require('./lib/windows.cjs')
const { registerDesktopIpcHandlers } = require('./lib/ipc-handlers.cjs')

const DEV_SERVER_URL = 'http://127.0.0.1:5173'
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.png')
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs')

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
const notesAssets = createNotesAssetsManager({ app })
const photographyAssets = createPhotographyAssetsManager({ storage })
const updater = createUpdaterManager({ app, BrowserWindow })
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
  getAutoLaunchState,
  setAutoLaunchEnabled,
  updater,
})

app.whenReady().then(() => {
  windows.createMainWindow()
  updater.scheduleStartupCheck()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windows.createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
