const fs = require('node:fs')
const path = require('node:path')
const { STORAGE_MANIFEST } = require('./storage-manifest.cjs')

function createStorageManager({ app }) {
  function getSettingsPath() {
    return path.join(app.getPath('userData'), 'storage-settings.json')
  }

  function getDefaultStorageRoot() {
    const root = path.join(app.getPath('userData'), 'storage')
    fs.mkdirSync(root, { recursive: true })
    return root
  }

  function readStorageSettings() {
    const filePath = getSettingsPath()
    if (!fs.existsSync(filePath)) {
      return { moduleDirectories: {} }
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        moduleDirectories: parsed?.moduleDirectories && typeof parsed.moduleDirectories === 'object'
          ? parsed.moduleDirectories
          : {},
      }
    } catch {
      return { moduleDirectories: {} }
    }
  }

  function writeStorageSettings(settings) {
    const filePath = getSettingsPath()
    const nextSettings = {
      moduleDirectories: settings?.moduleDirectories && typeof settings.moduleDirectories === 'object'
        ? settings.moduleDirectories
        : {},
    }
    fs.writeFileSync(filePath, JSON.stringify(nextSettings, null, 2), 'utf8')
  }

  function getModuleCustomDirectory(moduleId) {
    const settings = readStorageSettings()
    const rawPath = settings.moduleDirectories?.[moduleId]
    if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
      return null
    }

    const resolvedPath = path.resolve(rawPath)
    fs.mkdirSync(resolvedPath, { recursive: true })
    return resolvedPath
  }

  function getStorageRoot() {
    return getDefaultStorageRoot()
  }

  function getKnownModuleIds() {
    const moduleIds = new Set(
      STORAGE_MANIFEST
        .map((entry) => entry?.moduleId)
        .filter((moduleId) => typeof moduleId === 'string' && moduleId.length > 0),
    )
    const settings = readStorageSettings()
    Object.keys(settings.moduleDirectories || {}).forEach((moduleId) => {
      if (typeof moduleId === 'string' && moduleId.length > 0) {
        moduleIds.add(moduleId)
      }
    })

    const root = getStorageRoot()
    if (fs.existsSync(root)) {
      fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .forEach((entry) => {
          moduleIds.add(entry.name.replace(/\.json$/i, ''))
        })
    }

    return Array.from(moduleIds)
  }

  function getModuleStorageInfo(moduleId) {
    const customDirectory = getModuleCustomDirectory(moduleId)
    if (customDirectory) {
      const historyRoot = path.join(customDirectory, `${moduleId}-history`)
      fs.mkdirSync(historyRoot, { recursive: true })
      return {
        moduleId,
        directoryPath: customDirectory,
        defaultDirectoryPath: getDefaultStorageRoot(),
        filePath: path.join(customDirectory, `${moduleId}.json`),
        historyRoot,
        usesCustomDirectory: true,
      }
    }

    const historyRoot = path.join(app.getPath('userData'), 'storage-history', moduleId)
    fs.mkdirSync(historyRoot, { recursive: true })
    return {
      moduleId,
      directoryPath: getDefaultStorageRoot(),
      defaultDirectoryPath: getDefaultStorageRoot(),
      filePath: path.join(getDefaultStorageRoot(), `${moduleId}.json`),
      historyRoot,
      usesCustomDirectory: false,
    }
  }

  function getModuleStoragePath(moduleId) {
    return getModuleStorageInfo(moduleId).filePath
  }

  function getModuleHistoryRoot(moduleId) {
    return getModuleStorageInfo(moduleId).historyRoot
  }

  function trimModuleHistory(moduleId, maxEntries = 20) {
    const historyRoot = getModuleHistoryRoot(moduleId)
    const entries = fs.readdirSync(historyRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const filePath = path.join(historyRoot, entry.name)
        return {
          filePath,
          mtimeMs: fs.statSync(filePath).mtimeMs,
        }
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs)

    entries.slice(maxEntries).forEach((entry) => {
      fs.unlinkSync(entry.filePath)
    })
  }

  function snapshotModuleStorage(moduleId, rawContent) {
    if (typeof rawContent !== 'string' || rawContent.length === 0) {
      return null
    }

    const historyRoot = getModuleHistoryRoot(moduleId)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(historyRoot, `${stamp}.json`)
    fs.writeFileSync(filePath, rawContent, 'utf8')
    trimModuleHistory(moduleId)
    return filePath
  }

  function readModuleStorage(moduleId) {
    const filePath = getModuleStoragePath(moduleId)
    if (!fs.existsSync(filePath)) {
      return { version: 1, keys: {} }
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        return { version: 1, keys: {} }
      }

      return {
        version: 1,
        keys: parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
      }
    } catch {
      return { version: 1, keys: {} }
    }
  }

  function writeModuleStorage(moduleId, payload) {
    const filePath = getModuleStoragePath(moduleId)
    const nextPayload = {
      version: 1,
      keys: payload && payload.keys && typeof payload.keys === 'object' ? payload.keys : {},
    }
    const nextRaw = JSON.stringify(nextPayload, null, 2)

    if (fs.existsSync(filePath)) {
      const previousRaw = fs.readFileSync(filePath, 'utf8')
      if (previousRaw === nextRaw) {
        return filePath
      }
      snapshotModuleStorage(moduleId, previousRaw)
    }

    fs.writeFileSync(filePath, nextRaw, 'utf8')
    return filePath
  }

  function readAllModuleStorage() {
    const states = {}

    getKnownModuleIds().forEach((moduleId) => {
      const filePath = getModuleStoragePath(moduleId)
      if (fs.existsSync(filePath)) {
        states[moduleId] = readModuleStorage(moduleId)
      }
    })

    return states
  }

  function replaceAllModuleStorage(modulesPayload) {
    const nextModules = modulesPayload && typeof modulesPayload === 'object'
      ? modulesPayload
      : {}
    const moduleIds = new Set([
      ...getKnownModuleIds(),
      ...Object.keys(nextModules),
    ])

    moduleIds.forEach((moduleId) => {
      if (typeof moduleId !== 'string' || moduleId.length === 0) {
        return
      }

      const filePath = getModuleStoragePath(moduleId)
      if (!fs.existsSync(filePath)) {
        return
      }

      snapshotModuleStorage(moduleId, fs.readFileSync(filePath, 'utf8'))
      fs.unlinkSync(filePath)
    })

    Object.entries(nextModules).forEach(([moduleId, payload]) => {
      if (typeof moduleId === 'string' && moduleId.length > 0) {
        writeModuleStorage(moduleId, payload)
      }
    })
  }

  function moveModuleStorage(moduleId, nextDirectoryPath = null) {
    const previousInfo = getModuleStorageInfo(moduleId)
    const previousRaw = fs.existsSync(previousInfo.filePath)
      ? fs.readFileSync(previousInfo.filePath, 'utf8')
      : null
    const previousHistoryEntries = fs.existsSync(previousInfo.historyRoot)
      ? fs.readdirSync(previousInfo.historyRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => ({
          name: entry.name,
          raw: fs.readFileSync(path.join(previousInfo.historyRoot, entry.name), 'utf8'),
        }))
      : []

    const settings = readStorageSettings()
    const normalizedNextDirectory = typeof nextDirectoryPath === 'string' && nextDirectoryPath.trim().length > 0
      ? path.resolve(nextDirectoryPath)
      : null

    if (normalizedNextDirectory && normalizedNextDirectory !== getDefaultStorageRoot()) {
      settings.moduleDirectories[moduleId] = normalizedNextDirectory
    } else {
      delete settings.moduleDirectories[moduleId]
    }

    writeStorageSettings(settings)

    const nextInfo = getModuleStorageInfo(moduleId)

    if (previousRaw && previousInfo.filePath !== nextInfo.filePath) {
      if (fs.existsSync(nextInfo.filePath)) {
        snapshotModuleStorage(moduleId, fs.readFileSync(nextInfo.filePath, 'utf8'))
      }
      fs.writeFileSync(nextInfo.filePath, previousRaw, 'utf8')
    }

    if (previousInfo.historyRoot !== nextInfo.historyRoot) {
      previousHistoryEntries.forEach((entry) => {
        const targetPath = path.join(nextInfo.historyRoot, entry.name)
        if (!fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath, entry.raw, 'utf8')
        }
      })
    }

    if (previousInfo.filePath !== nextInfo.filePath && fs.existsSync(previousInfo.filePath)) {
      fs.unlinkSync(previousInfo.filePath)
    }

    if (previousInfo.historyRoot !== nextInfo.historyRoot && fs.existsSync(previousInfo.historyRoot)) {
      fs.rmSync(previousInfo.historyRoot, { recursive: true, force: true })
    }

    return nextInfo
  }

  return {
    getDefaultStorageRoot,
    getStorageRoot,
    getModuleStorageInfo,
    getModuleStoragePath,
    readModuleStorage,
    writeModuleStorage,
    readAllModuleStorage,
    replaceAllModuleStorage,
    moveModuleStorage,
  }
}

module.exports = {
  createStorageManager,
}
