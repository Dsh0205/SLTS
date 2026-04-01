const fs = require('node:fs')
const path = require('node:path')

function createStorageManager({ app }) {
  function getStorageRoot() {
    const root = path.join(app.getPath('userData'), 'storage')
    fs.mkdirSync(root, { recursive: true })
    return root
  }

  function getModuleStoragePath(moduleId) {
    return path.join(getStorageRoot(), `${moduleId}.json`)
  }

  function getModuleHistoryRoot(moduleId) {
    const root = path.join(app.getPath('userData'), 'storage-history', moduleId)
    fs.mkdirSync(root, { recursive: true })
    return root
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
    const root = getStorageRoot()
    const states = {}

    fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .forEach((entry) => {
        const moduleId = entry.name.replace(/\.json$/i, '')
        states[moduleId] = readModuleStorage(moduleId)
      })

    return states
  }

  function replaceAllModuleStorage(modulesPayload) {
    const root = getStorageRoot()

    fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .forEach((entry) => {
        const filePath = path.join(root, entry.name)
        const moduleId = entry.name.replace(/\.json$/i, '')
        snapshotModuleStorage(moduleId, fs.readFileSync(filePath, 'utf8'))
        fs.unlinkSync(filePath)
      })

    Object.entries(modulesPayload || {}).forEach(([moduleId, payload]) => {
      writeModuleStorage(moduleId, payload)
    })
  }

  return {
    getStorageRoot,
    getModuleStoragePath,
    readModuleStorage,
    writeModuleStorage,
    readAllModuleStorage,
    replaceAllModuleStorage,
  }
}

module.exports = {
  createStorageManager,
}
