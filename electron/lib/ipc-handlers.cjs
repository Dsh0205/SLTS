const fs = require('node:fs')
const path = require('node:path')

function registerDesktopIpcHandlers({
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
}) {
  function calculatePathUsage(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) {
      return {
        path: targetPath || null,
        totalBytes: 0,
        fileCount: 0,
      }
    }

    const stat = fs.statSync(targetPath)
    if (stat.isFile()) {
      return {
        path: targetPath,
        totalBytes: stat.size,
        fileCount: 1,
      }
    }

    let totalBytes = 0
    let fileCount = 0
    const stack = [targetPath]

    while (stack.length > 0) {
      const currentPath = stack.pop()
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })

      entries.forEach((entry) => {
        const fullPath = path.join(currentPath, entry.name)
        if (entry.isDirectory()) {
          stack.push(fullPath)
          return
        }

        if (entry.isFile()) {
          totalBytes += fs.statSync(fullPath).size
          fileCount += 1
        }
      })
    }

    return {
      path: targetPath,
      totalBytes,
      fileCount,
    }
  }

  function notifyStorageChanged(moduleId) {
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents.send('desktop-storage:changed', moduleId)
      }
    })
  }

  function decorateModuleStorageInfo(moduleId, info) {
    if (moduleId === 'photography' && photographyAssets) {
      return photographyAssets.getStorageInfoWithAssets(info)
    }

    return info
  }

  ipcMain.on('desktop-storage:load-sync', (event, moduleId) => {
    event.returnValue = {
      moduleId,
      filePath: storage.getModuleStoragePath(moduleId),
      state: storage.readModuleStorage(moduleId),
    }
  })

  ipcMain.on('desktop-storage:save-sync', (event, moduleId, payload) => {
    const filePath = storage.writeModuleStorage(moduleId, payload)
    notifyStorageChanged(moduleId)
    event.returnValue = {
      ok: true,
      moduleId,
      filePath,
    }
  })

  ipcMain.handle('desktop-storage:get-module-info', (_event, moduleId) => {
    return decorateModuleStorageInfo(moduleId, storage.getModuleStorageInfo(moduleId))
  })

  ipcMain.handle('desktop-storage:choose-module-directory', async (event, moduleId) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const currentInfo = storage.getModuleStorageInfo(moduleId)
    const result = await dialog.showOpenDialog(browserWindow, {
      title: `选择 ${moduleId} 模块的保存目录`,
      defaultPath: currentInfo.directoryPath,
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        canceled: true,
        ...currentInfo,
      }
    }

    const nextInfo = storage.moveModuleStorage(moduleId, result.filePaths[0])
    if (moduleId === 'photography' && photographyAssets) {
      const { assetsRoot } = photographyAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = photographyAssets.rewritePhotographyModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    notifyStorageChanged(moduleId)
    return {
      canceled: false,
      ...decorateModuleStorageInfo(moduleId, storage.getModuleStorageInfo(moduleId)),
    }
  })

  ipcMain.handle('desktop-storage:reset-module-directory', (_event, moduleId) => {
    const currentInfo = storage.getModuleStorageInfo(moduleId)
    const nextInfo = storage.moveModuleStorage(moduleId, null)
    if (moduleId === 'photography' && photographyAssets) {
      const { assetsRoot } = photographyAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = photographyAssets.rewritePhotographyModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    notifyStorageChanged(moduleId)
    return {
      canceled: false,
      ...decorateModuleStorageInfo(moduleId, storage.getModuleStorageInfo(moduleId)),
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

  ipcMain.handle('desktop-photography:save-photo', async (_event, payload = {}) => {
    if (!photographyAssets) {
      return { canceled: true }
    }

    return {
      canceled: false,
      ...photographyAssets.savePhotoFromDataUrl(payload.dataUrl, payload),
    }
  })

  ipcMain.handle('desktop-photography:delete-photo', async (_event, filePath) => {
    if (!photographyAssets) {
      return { deleted: false }
    }

    return {
      deleted: photographyAssets.deletePhotoAsset(filePath),
    }
  })

  ipcMain.handle('desktop-photography:delete-photos', async (_event, filePaths) => {
    if (!photographyAssets) {
      return { deletedCount: 0 }
    }

    return photographyAssets.deletePhotoAssets(filePaths)
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
        photography: photographyAssets?.readPhotographyAssetsBackup?.() || [],
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

    const nextModules = parsed.modules && typeof parsed.modules === 'object'
      ? { ...parsed.modules }
      : {}

    if (nextModules.photography && photographyAssets) {
      const assetsRoot = photographyAssets.getPhotographyAssetsRoot()
      nextModules.photography = photographyAssets.rewritePhotographyModulePayload(
        nextModules.photography,
        assetsRoot,
      )
    }

    storage.replaceAllModuleStorage(nextModules)
    notesAssets.replaceNotesAssets(parsed.assets?.notes || [])
    photographyAssets?.replacePhotographyAssets?.(parsed.assets?.photography || [])

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

  ipcMain.handle('desktop-storage:get-usage', () => {
    const rootPath = app.getPath('userData')
    const rootUsage = calculatePathUsage(rootPath)
    const sections = fs.existsSync(rootPath)
      ? fs.readdirSync(rootPath, { withFileTypes: true })
        .map((entry) => {
          const fullPath = path.join(rootPath, entry.name)
          const usage = calculatePathUsage(fullPath)
          return {
            name: entry.name,
            path: fullPath,
            totalBytes: usage.totalBytes,
            fileCount: usage.fileCount,
          }
        })
        .sort((left, right) => right.totalBytes - left.totalBytes)
      : []

    return {
      rootPath,
      totalBytes: rootUsage.totalBytes,
      fileCount: rootUsage.fileCount,
      sections,
    }
  })

  ipcMain.handle('desktop-updater:get-state', () => {
    return updater?.getState?.() ?? {
      supported: false,
      status: 'unsupported',
      message: '自动更新当前不可用。',
    }
  })

  ipcMain.handle('desktop-updater:check', async () => {
    if (!updater?.checkForUpdates) {
      return {
        supported: false,
        status: 'unsupported',
        message: '自动更新当前不可用。',
      }
    }

    return updater.checkForUpdates()
  })

  ipcMain.handle('desktop-updater:install', () => {
    if (!updater?.quitAndInstall) {
      return {
        started: false,
        state: {
          supported: false,
          status: 'unsupported',
          message: '自动更新当前不可用。',
        },
      }
    }

    return updater.quitAndInstall()
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
