const { contextBridge, ipcRenderer } = require('electron')
const { STORAGE_MANIFEST } = require('./lib/storage-manifest.cjs')

function normalizePathname(pathname) {
  return pathname.replace(/\\/g, '/')
}

function resolveManifestEntry(pathname) {
  const normalized = normalizePathname(pathname)
  return STORAGE_MANIFEST.find((entry) => normalized.endsWith(entry.pathSuffix)) || null
}

function readDesktopStorage(moduleId) {
  try {
    return ipcRenderer.sendSync('desktop-storage:load-sync', moduleId)
  } catch {
    return null
  }
}

function writeDesktopStorage(moduleId, keys) {
  try {
    return ipcRenderer.sendSync('desktop-storage:save-sync', moduleId, {
      version: 1,
      keys,
    })
  } catch {
    return null
  }
}

function buildSnapshot(storageKeys) {
  const snapshot = {}

  storageKeys.forEach((key) => {
    const value = window.localStorage.getItem(key)
    if (value !== null) {
      snapshot[key] = value
    }
  })

  return snapshot
}

let suppressTrackedStoragePersistence = 0

function runWithoutTrackedStoragePersistence(task) {
  suppressTrackedStoragePersistence += 1
  try {
    return task()
  } finally {
    suppressTrackedStoragePersistence = Math.max(0, suppressTrackedStoragePersistence - 1)
  }
}

function hydrateLocalStorage(entry, overwrite = false) {
  const loaded = readDesktopStorage(entry.moduleId)
  const storedKeys = loaded?.state?.keys || {}

  runWithoutTrackedStoragePersistence(() => {
    entry.keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(storedKeys, key) && (overwrite || window.localStorage.getItem(key) === null)) {
        window.localStorage.setItem(key, storedKeys[key])
        return
      }

      if (overwrite && !Object.prototype.hasOwnProperty.call(storedKeys, key)) {
        window.localStorage.removeItem(key)
      }
    })
  })

  return loaded?.filePath || null
}

function installStorageMirror(entry) {
  const localStorageProto = Object.getPrototypeOf(window.localStorage)
  const nativeSetItem = localStorageProto.setItem
  const nativeRemoveItem = localStorageProto.removeItem
  const trackedKeys = new Set(entry.keys)

  function persistTrackedKeys() {
    return writeDesktopStorage(entry.moduleId, buildSnapshot(entry.keys))
  }

  localStorageProto.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value)
    if (trackedKeys.has(String(key)) && suppressTrackedStoragePersistence === 0) {
      persistTrackedKeys()
    }
  }

  localStorageProto.removeItem = function patchedRemoveItem(key) {
    nativeRemoveItem.call(this, key)
    if (trackedKeys.has(String(key)) && suppressTrackedStoragePersistence === 0) {
      persistTrackedKeys()
    }
  }

  return persistTrackedKeys
}

const currentEntry = resolveManifestEntry(window.location.pathname)
let persistStorageState = null
let storageFilePath = null

if (currentEntry) {
  storageFilePath = hydrateLocalStorage(currentEntry)
  persistStorageState = installStorageMirror(currentEntry)
  persistStorageState()
}

contextBridge.exposeInMainWorld('shanlicDesktop', {
  isElectron: true,
  platform: process.platform,
  moduleId: currentEntry?.moduleId || null,
  storageFilePath,
  getMirroredStorageInfo() {
    if (!currentEntry) {
      return null
    }

    return ipcRenderer.invoke('desktop-storage:get-module-info', currentEntry.moduleId)
  },
  async chooseMirroredStorageDirectory() {
    if (!currentEntry) {
      return null
    }

    const result = await ipcRenderer.invoke('desktop-storage:choose-module-directory', currentEntry.moduleId)
    if (!result?.canceled) {
      storageFilePath = hydrateLocalStorage(currentEntry, true)
    }
    return {
      ...result,
      filePath: storageFilePath || result?.filePath || null,
    }
  },
  async resetMirroredStorageDirectory() {
    if (!currentEntry) {
      return null
    }

    const result = await ipcRenderer.invoke('desktop-storage:reset-module-directory', currentEntry.moduleId)
    if (!result?.canceled) {
      storageFilePath = hydrateLocalStorage(currentEntry, true)
    }
    return {
      ...result,
      filePath: storageFilePath || result?.filePath || null,
    }
  },
  openJsonFile(options) {
    return ipcRenderer.invoke('desktop-files:open-json', options)
  },
  saveJsonFile(payload) {
    return ipcRenderer.invoke('desktop-files:save-json', payload)
  },
  pickNoteImage() {
    return ipcRenderer.invoke('desktop-notes:pick-image')
  },
  savePastedNoteImage(dataUrl) {
    return ipcRenderer.invoke('desktop-notes:save-pasted-image', dataUrl)
  },
  savePhotographyPhoto(payload) {
    return ipcRenderer.invoke('desktop-photography:save-photo', payload)
  },
  deletePhotographyPhoto(filePath) {
    return ipcRenderer.invoke('desktop-photography:delete-photo', filePath)
  },
  deletePhotographyPhotos(filePaths) {
    return ipcRenderer.invoke('desktop-photography:delete-photos', filePaths)
  },
  exportBackup() {
    return ipcRenderer.invoke('desktop-backup:export')
  },
  importBackup() {
    return ipcRenderer.invoke('desktop-backup:import')
  },
  openFloatingNotesWindow(noteId) {
    return ipcRenderer.invoke('desktop-windows:open-floating-notes', noteId ?? null)
  },
  getFloatingNotesPinState() {
    return ipcRenderer.invoke('desktop-windows:get-floating-notes-pin')
  },
  setFloatingNotesPinState(enabled) {
    return ipcRenderer.invoke('desktop-windows:set-floating-notes-pin', Boolean(enabled))
  },
  getAutoLaunch() {
    return ipcRenderer.invoke('desktop-settings:get-auto-launch')
  },
  setAutoLaunch(enabled) {
    return ipcRenderer.invoke('desktop-settings:set-auto-launch', enabled)
  },
  getStorageUsage() {
    return ipcRenderer.invoke('desktop-storage:get-usage')
  },
  getUpdateState() {
    return ipcRenderer.invoke('desktop-updater:get-state')
  },
  checkForUpdates() {
    return ipcRenderer.invoke('desktop-updater:check')
  },
  installUpdate() {
    return ipcRenderer.invoke('desktop-updater:install')
  },
  onUpdateStateChange(callback) {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const listener = (_event, payload) => {
      callback(payload)
    }

    ipcRenderer.on('desktop-updater:state', listener)
    return () => {
      ipcRenderer.removeListener('desktop-updater:state', listener)
    }
  },
  onFloatingNotesSelect(callback) {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const listener = (_event, noteId) => {
      callback(noteId)
    }

    ipcRenderer.on('floating-notes:select-note', listener)
    return () => {
      ipcRenderer.removeListener('floating-notes:select-note', listener)
    }
  },
  reloadMirroredStorage() {
    if (!currentEntry) {
      return null
    }

    storageFilePath = hydrateLocalStorage(currentEntry, true)
    return {
      moduleId: currentEntry.moduleId,
      filePath: storageFilePath,
    }
  },
  onMirroredStorageChanged(callback) {
    if (typeof callback !== 'function') {
      return () => {}
    }

    const listener = (_event, moduleId) => {
      callback(moduleId)
    }

    ipcRenderer.on('desktop-storage:changed', listener)
    return () => {
      ipcRenderer.removeListener('desktop-storage:changed', listener)
    }
  },
  flushStorage() {
    if (!persistStorageState) {
      return null
    }

    return persistStorageState()
  },
})
