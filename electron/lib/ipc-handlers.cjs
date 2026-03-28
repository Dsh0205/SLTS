const fs = require('node:fs')
const path = require('node:path')

function registerDesktopIpcHandlers({
  ipcMain,
  BrowserWindow,
  dialog,
  storage,
  notesAssets,
  windows,
  getAutoLaunchState,
  setAutoLaunchEnabled,
}) {
  ipcMain.on('desktop-storage:load-sync', (event, moduleId) => {
    event.returnValue = {
      moduleId,
      filePath: storage.getModuleStoragePath(moduleId),
      state: storage.readModuleStorage(moduleId),
    }
  })

  ipcMain.on('desktop-storage:save-sync', (event, moduleId, payload) => {
    const filePath = storage.writeModuleStorage(moduleId, payload)
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents.send('desktop-storage:changed', moduleId)
      }
    })
    event.returnValue = {
      ok: true,
      moduleId,
      filePath,
    }
  })

  ipcMain.handle('desktop-files:open-json', async (event, options = {}) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(browserWindow, {
      title: options.title || '打开 JSON 文件',
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    const text = fs.readFileSync(filePath, 'utf8')

    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      text,
    }
  })

  ipcMain.handle('desktop-files:save-json', async (event, payload = {}) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    let targetPath = payload.filePath || ''

    if (!targetPath) {
      const result = await dialog.showSaveDialog(browserWindow, {
        title: payload.title || '保存 JSON 文件',
        defaultPath: payload.suggestedName || 'words.json',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      targetPath = result.filePath
    }

    fs.writeFileSync(targetPath, String(payload.text || ''), 'utf8')

    return {
      canceled: false,
      filePath: targetPath,
      fileName: path.basename(targetPath),
    }
  })

  ipcMain.handle('desktop-notes:pick-image', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(browserWindow, {
      title: '选择笔记图片',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    return {
      canceled: false,
      ...notesAssets.importNoteImageFromPath(result.filePaths[0]),
    }
  })

  ipcMain.handle('desktop-notes:save-pasted-image', async (_event, dataUrl) => {
    return {
      canceled: false,
      ...notesAssets.savePastedNoteImage(dataUrl),
    }
  })

  ipcMain.handle('desktop-backup:export', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const now = new Date()
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')

    const result = await dialog.showSaveDialog(browserWindow, {
      title: '导出桌面数据备份',
      defaultPath: `shanlic-backup-${stamp}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const payload = {
      version: 1,
      app: 'SHANLIC LIFE TRACKER SYSTEM',
      createdAt: new Date().toISOString(),
      modules: storage.readAllModuleStorage(),
      assets: {
        notes: notesAssets.readNotesAssetsBackup(),
      },
    }

    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8')

    return {
      canceled: false,
      filePath: result.filePath,
      moduleCount: Object.keys(payload.modules).length,
    }
  })

  ipcMain.handle('desktop-backup:import', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(browserWindow, {
      title: '导入桌面数据备份',
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object' || !parsed.modules || typeof parsed.modules !== 'object') {
      throw new Error('备份文件格式无效。')
    }

    storage.replaceAllModuleStorage(parsed.modules)
    notesAssets.replaceNotesAssets(parsed.assets?.notes || [])

    return {
      canceled: false,
      filePath,
      moduleCount: Object.keys(parsed.modules).length,
    }
  })

  ipcMain.handle('desktop-settings:get-auto-launch', () => {
    return getAutoLaunchState()
  })

  ipcMain.handle('desktop-settings:set-auto-launch', (_event, enabled) => {
    setAutoLaunchEnabled(Boolean(enabled))
    return getAutoLaunchState()
  })

  ipcMain.handle('desktop-windows:open-floating-notes', (_event, noteId) => {
    const browserWindow = windows.openFloatingNotesWindow(noteId)
    return {
      ok: Boolean(browserWindow),
    }
  })

  ipcMain.handle('desktop-windows:get-floating-notes-pin', () => {
    return {
      enabled: windows.getFloatingNotesPinState(),
    }
  })

  ipcMain.handle('desktop-windows:set-floating-notes-pin', (_event, enabled) => {
    return {
      enabled: windows.setFloatingNotesPinState(enabled),
    }
  })
}

module.exports = {
  registerDesktopIpcHandlers,
}
