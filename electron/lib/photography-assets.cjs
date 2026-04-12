const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { nativeImage } = require('electron')

const PHOTOGRAPHY_MODULE_ID = 'photography'
const PHOTOGRAPHY_STORAGE_KEY = 'shanlic-photography-map-v1'
const ASSETS_DIRNAME = 'photography-assets'
const MAX_IMAGE_SIDE = 1800
const JPEG_QUALITY = 86

function createPhotographyAssetsManager({ storage }) {
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
      'image/avif': '.avif',
    }
    return map[normalized] || '.jpg'
  }

  function createAssetName(extension, baseName = 'photo') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeBase = sanitizeAssetName(baseName) || 'photo'
    const ext = extension && String(extension).startsWith('.')
      ? extension
      : `.${String(extension || 'jpg').replace(/^\./, '')}`
    return `${safeBase}-${stamp}-${Math.random().toString(36).slice(2, 8)}${ext}`
  }

  function getAssetsRootForDirectory(directoryPath) {
    return path.join(path.resolve(directoryPath), ASSETS_DIRNAME)
  }

  function ensureDirectory(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true })
    return targetPath
  }

  function getPhotographyAssetsRoot() {
    const directoryPath = storage.getModuleStorageInfo(PHOTOGRAPHY_MODULE_ID).directoryPath
    return ensureDirectory(getAssetsRootForDirectory(directoryPath))
  }

  function buildAssetResult(filePath) {
    return {
      filePath,
      fileName: path.basename(filePath),
      fileUrl: pathToFileURL(filePath).toString(),
    }
  }

  function parsePhotoDataUrl(dataUrl) {
    const matched = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''))
    if (!matched) {
      throw new Error('Invalid photography image payload.')
    }

    return {
      mimeType: matched[1],
      base64: matched[2],
    }
  }

  function savePhotoFromDataUrl(dataUrl, options = {}) {
    const { mimeType, base64 } = parsePhotoDataUrl(dataUrl)
    const parsedName = path.parse(String(options.originalName || options.fileName || options.displayName || 'photo'))
    const extension = parsedName.ext || extensionFromMime(options.mimeType || mimeType)
    const baseName = parsedName.name || options.displayName || 'photo'
    const targetPath = path.join(
      getPhotographyAssetsRoot(),
      createAssetName(extension, baseName),
    )

    fs.writeFileSync(targetPath, Buffer.from(base64, 'base64'))
    return buildAssetResult(targetPath)
  }

  function shouldCopySourceAsIs(extension) {
    const normalizedExtension = String(extension || '').toLowerCase()
    return normalizedExtension === '.gif' || normalizedExtension === '.svg'
  }

  function optimizeImportedRasterPhoto(sourcePath) {
    const image = nativeImage.createFromPath(sourcePath)
    if (image.isEmpty()) {
      return null
    }

    const { width, height } = image.getSize()
    if (!width || !height) {
      return null
    }

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
    const nextWidth = Math.max(1, Math.round(width * scale))
    const nextHeight = Math.max(1, Math.round(height * scale))
    const resized = scale < 1
      ? image.resize({ width: nextWidth, height: nextHeight, quality: 'best' })
      : image

    return resized.toJPEG(JPEG_QUALITY)
  }

  function importPhotoFromPath(sourcePath, options = {}) {
    const resolvedSourcePath = path.resolve(String(sourcePath || ''))
    if (!resolvedSourcePath || !fs.existsSync(resolvedSourcePath) || !fs.statSync(resolvedSourcePath).isFile()) {
      throw new Error('Photography source file does not exist.')
    }

    const parsedName = path.parse(resolvedSourcePath)
    const sourceExtension = parsedName.ext || extensionFromMime(options.mimeType)
    const baseName = parsedName.name || options.displayName || 'photo'
    const shouldCopyAsIs = shouldCopySourceAsIs(sourceExtension)
    const targetExtension = shouldCopyAsIs ? sourceExtension : '.jpg'
    const targetPath = path.join(
      getPhotographyAssetsRoot(),
      createAssetName(targetExtension, baseName),
    )

    if (shouldCopyAsIs) {
      fs.copyFileSync(resolvedSourcePath, targetPath)
    } else {
      const optimizedBuffer = optimizeImportedRasterPhoto(resolvedSourcePath)
      if (optimizedBuffer) {
        fs.writeFileSync(targetPath, optimizedBuffer)
      } else {
        fs.copyFileSync(resolvedSourcePath, targetPath)
      }
    }

    return {
      ...buildAssetResult(targetPath),
      originalName: parsedName.base || path.basename(resolvedSourcePath),
    }
  }

  function isPhotographyAssetPath(filePath) {
    const resolved = path.resolve(String(filePath || ''))
    return resolved.toLowerCase().includes(`${path.sep}${ASSETS_DIRNAME}${path.sep}`.toLowerCase())
  }

  function cleanupEmptyDirectories(startPath, stopPath) {
    let currentPath = path.resolve(startPath)
    const resolvedStopPath = path.resolve(stopPath)

    while (currentPath.startsWith(resolvedStopPath) && currentPath !== resolvedStopPath) {
      if (!fs.existsSync(currentPath) || fs.readdirSync(currentPath).length > 0) {
        return
      }

      fs.rmdirSync(currentPath)
      currentPath = path.dirname(currentPath)
    }
  }

  function deletePhotoAsset(filePath) {
    const resolvedPath = path.resolve(String(filePath || ''))
    if (!resolvedPath || !isPhotographyAssetPath(resolvedPath) || !fs.existsSync(resolvedPath)) {
      return false
    }

    if (!fs.statSync(resolvedPath).isFile()) {
      return false
    }

    fs.unlinkSync(resolvedPath)
    cleanupEmptyDirectories(path.dirname(resolvedPath), path.dirname(path.dirname(resolvedPath)))
    return true
  }

  function deletePhotoAssets(filePaths) {
    if (!Array.isArray(filePaths)) {
      return { deletedCount: 0 }
    }

    let deletedCount = 0
    filePaths.forEach((filePath) => {
      try {
        if (deletePhotoAsset(filePath)) {
          deletedCount += 1
        }
      } catch {
        // Ignore individual cleanup failures so other files can still be removed.
      }
    })

    return { deletedCount }
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

  function moveAssetsForStorageChange(previousInfo, nextInfo) {
    const previousRoot = getAssetsRootForDirectory(previousInfo.directoryPath)
    const nextRoot = ensureDirectory(getAssetsRootForDirectory(nextInfo.directoryPath))

    if (path.resolve(previousRoot) === path.resolve(nextRoot)) {
      return {
        previousAssetsRoot: previousRoot,
        assetsRoot: nextRoot,
      }
    }

    readAssetFiles(previousRoot).forEach((entry) => {
      fs.copyFileSync(entry.filePath, path.join(nextRoot, entry.name))
    })

    if (fs.existsSync(previousRoot)) {
      fs.rmSync(previousRoot, { recursive: true, force: true })
    }

    return {
      previousAssetsRoot: previousRoot,
      assetsRoot: nextRoot,
    }
  }

  function getPhotoAssetFileName(photo) {
    if (!photo || typeof photo !== 'object') {
      return ''
    }

    if (typeof photo.assetFileName === 'string' && photo.assetFileName.trim().length > 0) {
      return sanitizeAssetName(path.basename(photo.assetFileName.trim()))
    }

    if (typeof photo.filePath === 'string' && photo.filePath.trim().length > 0) {
      return sanitizeAssetName(path.basename(photo.filePath.trim()))
    }

    return ''
  }

  function rewritePhotographyStateObject(state, assetsRoot) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.anchors)) {
      return state
    }

    state.anchors.forEach((anchor) => {
      if (!anchor || !Array.isArray(anchor.albums)) {
        return
      }

      anchor.albums.forEach((album) => {
        if (!album || !Array.isArray(album.photos)) {
          return
        }

        album.photos.forEach((photo) => {
          const assetFileName = getPhotoAssetFileName(photo)
          if (!assetFileName) {
            return
          }

          photo.assetFileName = assetFileName
          photo.filePath = path.join(assetsRoot, assetFileName)
          delete photo.fileUrl
        })
      })
    })

    return state
  }

  function rewritePhotographyModulePayload(payload, assetsRoot) {
    const nextPayload = payload && typeof payload === 'object'
      ? JSON.parse(JSON.stringify(payload))
      : { version: 1, keys: {} }
    const rawState = nextPayload?.keys?.[PHOTOGRAPHY_STORAGE_KEY]

    if (typeof rawState !== 'string' || rawState.trim().length === 0) {
      return nextPayload
    }

    let parsedState = null

    try {
      parsedState = JSON.parse(rawState)
    } catch {
      return nextPayload
    }

    nextPayload.keys[PHOTOGRAPHY_STORAGE_KEY] = JSON.stringify(
      rewritePhotographyStateObject(parsedState, assetsRoot),
    )
    return nextPayload
  }

  function readPhotographyAssetsBackup() {
    return readAssetFiles(getPhotographyAssetsRoot()).map((entry) => ({
      name: entry.name,
      dataBase64: fs.readFileSync(entry.filePath).toString('base64'),
    }))
  }

  function replacePhotographyAssets(files) {
    const root = getPhotographyAssetsRoot()

    readAssetFiles(root).forEach((entry) => {
      fs.unlinkSync(entry.filePath)
    })

    if (!Array.isArray(files)) {
      return
    }

    files.forEach((file, index) => {
      if (!file || typeof file !== 'object') {
        throw new Error(`Invalid photography backup entry at index ${index}.`)
      }

      const name = sanitizeAssetName(file.name || '')
      const dataBase64 = String(file.dataBase64 || '')
      if (!name || !dataBase64) {
        throw new Error(`Photography backup entry ${index} is missing a file name or payload.`)
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
    getPhotographyAssetsRoot,
    getAssetsRootForDirectory,
    getStorageInfoWithAssets,
    importPhotoFromPath,
    savePhotoFromDataUrl,
    deletePhotoAsset,
    deletePhotoAssets,
    moveAssetsForStorageChange,
    rewritePhotographyModulePayload,
    readPhotographyAssetsBackup,
    replacePhotographyAssets,
  }
}

module.exports = {
  createPhotographyAssetsManager,
  PHOTOGRAPHY_MODULE_ID,
  PHOTOGRAPHY_STORAGE_KEY,
}
