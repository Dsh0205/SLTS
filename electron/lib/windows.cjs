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
    loadRendererPage({
      browserWindow: mainWindow,
      app,
      rootDir,
      devServerUrl,
      relativePath: 'index.html',
    })

    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }

    return mainWindow
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

    floatingNotesWindow = new BrowserWindow({
      width: 430,
      height: 760,
      minWidth: 360,
      minHeight: 520,
      maxWidth: 520,
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: true,
      movable: true,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: '#00000000',
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

    floatingNotesWindow.setAlwaysOnTop(floatingNotesPinned, floatingNotesPinned ? 'screen-saver' : 'normal')
    registerExternalLinkPolicy(floatingNotesWindow, shell)
    loadRendererPage({
      browserWindow: floatingNotesWindow,
      app,
      rootDir,
      devServerUrl,
      relativePath: 'modules/notes/floating.html',
      query: { noteId: noteId ?? '' },
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
      floatingNotesWindow.setAlwaysOnTop(floatingNotesPinned, floatingNotesPinned ? 'screen-saver' : 'normal')
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
