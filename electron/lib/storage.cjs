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

    fs.writeFileSync(filePath, JSON.stringify(nextPayload, null, 2), 'utf8')
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
        fs.unlinkSync(path.join(root, entry.name))
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
