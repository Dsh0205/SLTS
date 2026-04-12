const path = require('node:path')
const { loadRendererPage, registerExternalLinkPolicy } = require('./window-loader.cjs')

function createWindowsManager({
  app,
  BrowserWindow,
  shell,
  iconPath,
  preloadPath,
  rootDir,
  devServerUrl,
}) {
  let mainWindow = null
  let floatingNotesWindow = null
  let floatingNotesPinned = true

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1100,
      minHeight: 720,
      autoHideMenuBar: true,
      backgroundColor: '#050914',
      title: 'SHANLIC LIFE TRACKER SYSTEM',
      icon: iconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    registerExternalLinkPolicy(mainWindow, shell)
    void loadRendererPage({
      browserWindow: mainWindow,
      app,
      rootDir,
      devServerUrl,
      relativePath: 'index.html',
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load main window.', {
        errorCode,
        errorDescription,
        validatedURL,
      })
    })

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('Main window render process exited.', details)
    })

    mainWindow.on('page-title-updated', (event) => {
      event.preventDefault()
      if (!mainWindow?.isDestroyed()) {
        mainWindow.setTitle('SHANLIC LIFE TRACKER SYSTEM')
      }
    })

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }

    return mainWindow
  }

  function applyFloatingNotesAlwaysOnTop(enabled) {
    if (!floatingNotesWindow || floatingNotesWindow.isDestroyed()) {
      return
    }

    floatingNotesWindow.setAlwaysOnTop(Boolean(enabled), enabled ? 'floating' : 'normal')
  }

  function focusFloatingNotesWindow(noteId) {
    if (!floatingNotesWindow || floatingNotesWindow.isDestroyed()) {
      return false
    }

    floatingNotesWindow.show()
    floatingNotesWindow.focus()

    if (noteId !== undefined && noteId !== null) {
      floatingNotesWindow.webContents.send('floating-notes:select-note', String(noteId))
    }

    return true
  }

  function openFloatingNotesWindow(noteId) {
    if (focusFloatingNotesWindow(noteId)) {
      return floatingNotesWindow
    }

    const parentWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null

    floatingNotesWindow = new BrowserWindow({
      parent: parentWindow ?? undefined,
      width: 430,
      height: 760,
      minWidth: 360,
      minHeight: 520,
      maxWidth: 520,
      show: false,
      frame: false,
      // Electron 官方文档提到透明窗口不支持稳定缩放，
      // `transparent: true` 与 `resizable: true` 的组合在部分平台会导致窗口无法正常显示。
      transparent: false,
      hasShadow: true,
      resizable: true,
      movable: true,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: '#f7f1ff',
      title: '悬浮笔记窗',
      icon: iconPath,
      alwaysOnTop: floatingNotesPinned,
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    applyFloatingNotesAlwaysOnTop(floatingNotesPinned)
    registerExternalLinkPolicy(floatingNotesWindow, shell)
    void loadRendererPage({
      browserWindow: floatingNotesWindow,
      app,
      rootDir,
      devServerUrl,
      relativePath: 'modules/notes/floating.html',
      query: { noteId: noteId ?? '' },
    })

    floatingNotesWindow.once('ready-to-show', () => {
      if (!floatingNotesWindow || floatingNotesWindow.isDestroyed()) {
        return
      }

      floatingNotesWindow.show()
      floatingNotesWindow.focus()
    })

    floatingNotesWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load floating notes window.', {
        errorCode,
        errorDescription,
        validatedURL,
      })
    })

    floatingNotesWindow.on('closed', () => {
      floatingNotesWindow = null
    })

    return floatingNotesWindow
  }

  function getFloatingNotesPinState() {
    return floatingNotesPinned
  }

  function setFloatingNotesPinState(enabled) {
    floatingNotesPinned = Boolean(enabled)

    if (floatingNotesWindow && !floatingNotesWindow.isDestroyed()) {
      applyFloatingNotesAlwaysOnTop(floatingNotesPinned)
    }

    return floatingNotesPinned
  }

  return {
    createMainWindow,
    openFloatingNotesWindow,
    getFloatingNotesPinState,
    setFloatingNotesPinState,
  }
}

module.exports = {
  createWindowsManager,
}
