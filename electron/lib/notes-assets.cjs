const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL, fileURLToPath } = require('node:url')

const NOTES_MODULE_ID = 'notes'
const NOTES_STORAGE_KEY = 'shanlic_notes'
const ASSETS_DIRNAME = 'notes-assets'

function createNotesAssetsManager({ app, storage }) {
  function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true })
    return targetPath
  }

  function getLegacyNotesAssetsRoot() {
    return path.join(app.getPath('userData'), ASSETS_DIRNAME)
  }

  function getAssetsRootForDirectory(directoryPath) {
    return path.join(path.resolve(directoryPath), ASSETS_DIRNAME)
  }

  function getNotesAssetsRoot() {
    const directoryPath = storage?.getModuleStorageInfo
      ? storage.getModuleStorageInfo(NOTES_MODULE_ID).directoryPath
      : app.getPath('userData')
    return ensureDirectory(getAssetsRootForDirectory(directoryPath))
  }

  function sanitizeAssetName(name) {
    return String(name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function extensionFromMime(mimeType) {
    const normalized = String(mimeType || '').toLowerCase()
    const map = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
    }
    return map[normalized] || '.png'
  }

  function createNotesAssetName(extension, baseName = 'note-image') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeBase = sanitizeAssetName(baseName) || 'note-image'
    const ext = extension && String(extension).startsWith('.')
      ? extension
      : `.${String(extension || 'png').replace(/^\./, '')}`
    return `${safeBase}-${stamp}-${Math.random().toString(36).slice(2, 8)}${ext}`
  }

  function buildNotesAssetResult(filePath) {
    return {
      filePath,
      fileName: path.basename(filePath),
      fileUrl: pathToFileURL(filePath).toString(),
    }
  }

  function importNoteImageFromPath(sourcePath) {
    const parsed = path.parse(sourcePath)
    const fileName = createNotesAssetName(parsed.ext || '.png', parsed.name || 'note-image')
    const targetPath = path.join(getNotesAssetsRoot(), fileName)
    fs.copyFileSync(sourcePath, targetPath)
    return buildNotesAssetResult(targetPath)
  }

  function savePastedNoteImage(dataUrl) {
    const matched = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''))
    if (!matched) {
      throw new Error('Invalid note image payload.')
    }

    const fileName = createNotesAssetName(extensionFromMime(matched[1]), 'pasted-image')
    const targetPath = path.join(getNotesAssetsRoot(), fileName)
    fs.writeFileSync(targetPath, Buffer.from(matched[2], 'base64'))
    return buildNotesAssetResult(targetPath)
  }

  function readAssetFiles(rootPath) {
    if (!fs.existsSync(rootPath)) {
      return []
    }

    return fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        name: entry.name,
        filePath: path.join(rootPath, entry.name),
      }))
  }

  function copyAssetFiles(sourceRoot, targetRoot) {
    readAssetFiles(sourceRoot).forEach((entry) => {
      const targetPath = path.join(targetRoot, entry.name)
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(entry.filePath, targetPath)
      }
    })
  }

  function moveAssetsForStorageChange(previousInfo, nextInfo) {
    const nextRoot = ensureDirectory(getAssetsRootForDirectory(nextInfo.directoryPath))
    const sourceRoots = Array.from(new Set([
      getAssetsRootForDirectory(previousInfo.directoryPath),
      getLegacyNotesAssetsRoot(),
    ].map((rootPath) => path.resolve(rootPath))))
      .filter((rootPath) => rootPath !== path.resolve(nextRoot))

    sourceRoots.forEach((sourceRoot) => {
      if (fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory()) {
        copyAssetFiles(sourceRoot, nextRoot)
      }
    })

    sourceRoots.forEach((sourceRoot) => {
      if (fs.existsSync(sourceRoot) && fs.statSync(sourceRoot).isDirectory()) {
        fs.rmSync(sourceRoot, { recursive: true, force: true })
      }
    })

    return {
      previousAssetsRoots: sourceRoots,
      assetsRoot: nextRoot,
    }
  }

  function isNotesAssetPath(filePath) {
    const resolvedPath = path.resolve(String(filePath || ''))
    return resolvedPath.toLowerCase().includes(`${path.sep}${ASSETS_DIRNAME}${path.sep}`.toLowerCase())
  }

  function normalizeAssetNames(assetNames, assetsRoot) {
    const names = Array.isArray(assetNames) && assetNames.length > 0
      ? assetNames
      : readAssetFiles(assetsRoot).map((entry) => entry.name)

    return new Set(
      names
        .map((name) => sanitizeAssetName(path.basename(String(name || ''))))
        .filter(Boolean),
    )
  }

  function rewriteNoteContentAssetUrls(content, assetsRoot, assetNames) {
    const text = typeof content === 'string' ? content : ''
    if (!text) {
      return text
    }

    const knownAssetNames = normalizeAssetNames(assetNames, assetsRoot)
    if (knownAssetNames.size === 0) {
      return text
    }

    return text.replace(/file:\/\/\/[^\s<>"')\]]+/g, (rawUrl) => {
      try {
        const url = new URL(rawUrl)
        if (url.protocol !== 'file:') {
          return rawUrl
        }

        const resolvedFilePath = path.resolve(fileURLToPath(url))
        const fileName = sanitizeAssetName(path.basename(resolvedFilePath))
        if (!fileName || !knownAssetNames.has(fileName) || !isNotesAssetPath(resolvedFilePath)) {
          return rawUrl
        }

        return pathToFileURL(path.join(assetsRoot, fileName)).toString()
      } catch {
        return rawUrl
      }
    })
  }

  function rewriteNotesStateObject(noteList, assetsRoot, assetNames) {
    if (!Array.isArray(noteList)) {
      return noteList
    }

    noteList.forEach((note) => {
      if (!note || typeof note !== 'object') {
        return
      }

      if (typeof note.content === 'string') {
        note.content = rewriteNoteContentAssetUrls(note.content, assetsRoot, assetNames)
      }

      if (Array.isArray(note.children)) {
        rewriteNotesStateObject(note.children, assetsRoot, assetNames)
      }
    })

    return noteList
  }

  function rewriteNotesModulePayload(payload, assetsRoot, options = {}) {
    const nextPayload = payload && typeof payload === 'object'
      ? JSON.parse(JSON.stringify(payload))
      : { version: 1, keys: {} }
    const rawState = nextPayload?.keys?.[NOTES_STORAGE_KEY]

    if (typeof rawState !== 'string' || rawState.trim().length === 0) {
      return nextPayload
    }

    let parsedState = null
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return nextPayload
    }

    nextPayload.keys[NOTES_STORAGE_KEY] = JSON.stringify(
      rewriteNotesStateObject(parsedState, assetsRoot, options.assetNames),
    )
    return nextPayload
  }

  function readNotesAssetsBackup() {
    const root = getNotesAssetsRoot()
    return readAssetFiles(root).map((entry) => ({
      name: entry.name,
      dataBase64: fs.readFileSync(entry.filePath).toString('base64'),
    }))
  }

  function replaceNotesAssets(files) {
    const root = getNotesAssetsRoot()

    readAssetFiles(root).forEach((entry) => {
      fs.unlinkSync(entry.filePath)
    })

    if (!Array.isArray(files)) {
      return
    }

    files.forEach((file, index) => {
      if (!file || typeof file !== 'object') {
        throw new Error(`Invalid note asset backup entry at index ${index}.`)
      }

      const name = sanitizeAssetName(file.name || '')
      const dataBase64 = String(file.dataBase64 || '')
      if (!name || !dataBase64) {
        throw new Error(`Note asset backup entry ${index} is missing a file name or payload.`)
      }

      fs.writeFileSync(path.join(root, name), Buffer.from(dataBase64, 'base64'))
    })
  }

  function getStorageInfoWithAssets(storageInfo) {
    return {
      ...storageInfo,
      assetsDirectoryPath: ensureDirectory(getAssetsRootForDirectory(storageInfo.directoryPath)),
    }
  }

  return {
    getNotesAssetsRoot,
    getAssetsRootForDirectory,
    getStorageInfoWithAssets,
    importNoteImageFromPath,
    savePastedNoteImage,
    moveAssetsForStorageChange,
    rewriteNotesModulePayload,
    readNotesAssetsBackup,
    replaceNotesAssets,
  }
}

module.exports = {
  createNotesAssetsManager,
}
