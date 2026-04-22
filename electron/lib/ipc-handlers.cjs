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
  usageTracker,
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
    if (moduleId === 'notes' && notesAssets) {
      return notesAssets.getStorageInfoWithAssets(info)
    }

    if (moduleId === 'photography' && photographyAssets) {
      return photographyAssets.getStorageInfoWithAssets(info)
    }

    return info
  }

  function sanitizeFileName(name, fallback = 'note') {
    const cleaned = String(name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return cleaned || fallback
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function buildNoteJpgExportDocument(payload = {}) {
    const title = escapeHtml(payload.title || '无标题笔记')
    const lastModified = escapeHtml(payload.lastModified || '')
    const contentHtml = String(payload.contentHtml || '').trim()
    const metaLine = lastModified
      ? `<p class="export-meta">最后修改：${lastModified}</p>`
      : ''
    const content = contentHtml || '<p class="export-empty">这篇笔记还没有内容。</p>'

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --page-bg:
        radial-gradient(circle at top right, rgba(223, 208, 255, 0.96), transparent 22%),
        radial-gradient(circle at 12% 18%, rgba(204, 171, 255, 0.42), transparent 22%),
        linear-gradient(180deg, #f5f0ff 0%, #efe7ff 48%, #f8f4ff 100%);
      --sheet-bg: rgba(255, 255, 255, 0.96);
      --sheet-border: rgba(125, 93, 193, 0.12);
      --heading: #2f2150;
      --text: #4a3d67;
      --muted: #7a6d99;
      --accent: #6a5acd;
      --pre-bg: #f6f0ff;
      --quote-bg: #f4edff;
      --quote-border: rgba(106, 90, 205, 0.28);
      --table-border: rgba(125, 93, 193, 0.18);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      width: 1216px;
      background: transparent;
      font: 16px/1.7 "Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif;
    }

    body {
      padding: 48px;
      background: var(--page-bg);
      color: var(--text);
    }

    .export-sheet {
      width: 1120px;
      padding: 40px 44px 48px;
      border: 1px solid var(--sheet-border);
      border-radius: 32px;
      background: var(--sheet-bg);
      box-shadow: 0 28px 72px rgba(74, 51, 128, 0.16);
    }

    .export-kicker {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .export-title {
      margin: 0;
      color: var(--heading);
      font-size: 34px;
      line-height: 1.2;
      word-break: break-word;
    }

    .export-meta {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }

    .export-divider {
      height: 1px;
      margin: 26px 0 30px;
      background: linear-gradient(90deg, rgba(106, 90, 205, 0.28), rgba(106, 90, 205, 0));
    }

    .export-content {
      color: var(--text);
      word-break: break-word;
    }

    .export-content > :first-child {
      margin-top: 0;
    }

    .export-content > :last-child {
      margin-bottom: 0;
    }

    .export-content h1,
    .export-content h2,
    .export-content h3,
    .export-content h4,
    .export-content h5,
    .export-content h6 {
      margin: 1.5em 0 0.58em;
      color: var(--heading);
      line-height: 1.28;
    }

    .export-content h1 { font-size: 1.95rem; }
    .export-content h2 { font-size: 1.6rem; }
    .export-content h3 { font-size: 1.3rem; }

    .export-content p,
    .export-content ul,
    .export-content ol,
    .export-content blockquote,
    .export-content pre,
    .export-content table,
    .export-content hr {
      margin: 0 0 1em;
    }

    .export-content ul,
    .export-content ol {
      padding-left: 1.4em;
    }

    .export-content li + li {
      margin-top: 0.32em;
    }

    .export-content a {
      color: var(--accent);
      text-decoration: none;
    }

    .export-content strong {
      color: var(--heading);
    }

    .export-content blockquote {
      padding: 14px 18px;
      border-left: 4px solid var(--quote-border);
      border-radius: 0 18px 18px 0;
      background: var(--quote-bg);
      color: #5e4f7f;
    }

    .export-content code {
      padding: 0.18em 0.42em;
      border-radius: 8px;
      background: rgba(106, 90, 205, 0.1);
      color: #513c82;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 0.92em;
    }

    .export-content pre {
      overflow: hidden;
      padding: 18px 20px;
      border-radius: 20px;
      background: var(--pre-bg);
      border: 1px solid rgba(125, 93, 193, 0.12);
      white-space: pre-wrap;
    }

    .export-content pre code {
      padding: 0;
      background: transparent;
      color: inherit;
      font-size: 0.94em;
    }

    .export-content table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      border-style: hidden;
      box-shadow: 0 0 0 1px var(--table-border);
    }

    .export-content th,
    .export-content td {
      padding: 12px 14px;
      border: 1px solid var(--table-border);
      text-align: left;
      vertical-align: top;
    }

    .export-content th {
      background: rgba(106, 90, 205, 0.08);
      color: var(--heading);
    }

    .export-content hr {
      border: none;
      height: 1px;
      background: rgba(125, 93, 193, 0.18);
    }

    .export-content img,
    .export-content video {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 20px 0;
      border-radius: 22px;
      background: rgba(243, 236, 255, 0.88);
      box-shadow: 0 18px 44px rgba(93, 63, 160, 0.14);
    }

    .export-content input[type="checkbox"] {
      margin-right: 8px;
      accent-color: var(--accent);
    }

    .export-empty {
      margin: 0;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="export-sheet">
    <p class="export-kicker">SHANLIC Notes</p>
    <h1 class="export-title">${title}</h1>
    ${metaLine}
    <div class="export-divider"></div>
    <article class="export-content">${content}</article>
  </main>
</body>
</html>`
  }

  async function exportNoteAsJpg(browserWindow, payload = {}) {
    const exportWindow = new BrowserWindow({
      width: 1216,
      height: 900,
      show: false,
      paintWhenInitiallyHidden: true,
      useContentSize: true,
      autoHideMenuBar: true,
      backgroundColor: '#f5f0ff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false,
      },
    })

    try {
      await exportWindow.loadURL('about:blank')
      const documentHtml = buildNoteJpgExportDocument(payload)

      await exportWindow.webContents.executeJavaScript(`
        const html = ${JSON.stringify(documentHtml)};
        document.open();
        document.write(html);
        document.close();
      `, true)

      const dimensions = await exportWindow.webContents.executeJavaScript(`
        (async () => {
          const waitForImage = (image) => {
            if (image.complete) {
              return Promise.resolve();
            }

            return new Promise((resolve) => {
              const done = () => resolve();
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', done, { once: true });
              window.setTimeout(done, 3000);
            });
          };

          const waitForVideo = (video) => {
            if (video.readyState >= 2) {
              return Promise.resolve();
            }

            return new Promise((resolve) => {
              const done = () => resolve();
              video.addEventListener('loadeddata', done, { once: true });
              video.addEventListener('error', done, { once: true });
              window.setTimeout(done, 3000);
            });
          };

          await Promise.all(Array.from(document.images).map(waitForImage));
          await Promise.all(Array.from(document.querySelectorAll('video')).map(waitForVideo));

          if (document.fonts?.ready) {
            try {
              await document.fonts.ready;
            } catch {}
          }

          await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          });

          const root = document.documentElement;
          const body = document.body;
          return {
            width: Math.max(root.scrollWidth, root.clientWidth, body.scrollWidth, body.clientWidth),
            height: Math.max(root.scrollHeight, root.clientHeight, body.scrollHeight, body.clientHeight),
          };
        })()
      `, true)

      const maxDimension = 12000
      if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
        throw new Error('导出的 JPG 尺寸过大，请缩短笔记内容后重试。')
      }

      exportWindow.setContentSize(Math.max(dimensions.width, 1216), Math.max(dimensions.height, 900))

      await new Promise((resolve) => {
        setTimeout(resolve, 120)
      })

      const result = await dialog.showSaveDialog(browserWindow, {
        title: '导出笔记 JPG',
        defaultPath: `${sanitizeFileName(payload.title, 'note')}.jpg`,
        filters: [
          { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      const image = await exportWindow.webContents.capturePage()
      fs.writeFileSync(result.filePath, image.toJPEG(92))

      return {
        canceled: false,
        filePath: result.filePath,
        fileName: path.basename(result.filePath),
      }
    } finally {
      if (!exportWindow.isDestroyed()) {
        exportWindow.close()
      }
    }
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
    if (moduleId === 'notes' && notesAssets) {
      const { assetsRoot } = notesAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = notesAssets.rewriteNotesModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    if (moduleId === 'photography' && photographyAssets) {
      const { assetsRoot } = photographyAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = photographyAssets.rewritePhotographyModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    if (moduleId === 'hobby') {
      usageTracker?.reloadFromStorage?.()
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
    if (moduleId === 'notes' && notesAssets) {
      const { assetsRoot } = notesAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = notesAssets.rewriteNotesModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    if (moduleId === 'photography' && photographyAssets) {
      const { assetsRoot } = photographyAssets.moveAssetsForStorageChange(currentInfo, nextInfo)
      const rewrittenPayload = photographyAssets.rewritePhotographyModulePayload(
        storage.readModuleStorage(moduleId),
        assetsRoot,
      )
      storage.writeModuleStorage(moduleId, rewrittenPayload)
    }
    if (moduleId === 'hobby') {
      usageTracker?.reloadFromStorage?.()
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

  ipcMain.handle('desktop-notes:export-jpg', async (event, payload = {}) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    return exportNoteAsJpg(browserWindow, payload)
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

  ipcMain.handle('desktop-photography:pick-photos', async (event) => {
    if (!photographyAssets) {
      return {
        canceled: true,
        photos: [],
      }
    }

    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(browserWindow, {
      title: '选择摄影照片',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return {
        canceled: true,
        photos: [],
      }
    }

    return {
      canceled: false,
      photos: result.filePaths.map((filePath) => photographyAssets.importPhotoFromPath(filePath)),
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

    if (nextModules.notes && notesAssets) {
      const assetsRoot = notesAssets.getNotesAssetsRoot()
      nextModules.notes = notesAssets.rewriteNotesModulePayload(
        nextModules.notes,
        assetsRoot,
        {
          assetNames: Array.isArray(parsed.assets?.notes)
            ? parsed.assets.notes.map((entry) => entry?.name)
            : [],
        },
      )
    }

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
    usageTracker?.reloadFromStorage?.()
    notifyStorageChanged('hobby')

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

  ipcMain.handle('desktop-usage:get-heatmap-state', () => {
    return usageTracker?.getSnapshot?.() ?? null
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
