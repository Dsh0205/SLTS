const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

function createNotesAssetsManager({ app }) {
  function getNotesAssetsRoot() {
    const root = path.join(app.getPath('userData'), 'notes-assets')
    fs.mkdirSync(root, { recursive: true })
    return root
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
      throw new Error('无效的图片数据。')
    }

    const fileName = createNotesAssetName(extensionFromMime(matched[1]), 'pasted-image')
    const targetPath = path.join(getNotesAssetsRoot(), fileName)
    fs.writeFileSync(targetPath, Buffer.from(matched[2], 'base64'))
    return buildNotesAssetResult(targetPath)
  }

  function readNotesAssetsBackup() {
    const root = getNotesAssetsRoot()
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const filePath = path.join(root, entry.name)
        return {
          name: entry.name,
          dataBase64: fs.readFileSync(filePath).toString('base64'),
        }
      })
  }

  function replaceNotesAssets(files) {
    const root = getNotesAssetsRoot()

    fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        fs.unlinkSync(path.join(root, entry.name))
      })

    if (!Array.isArray(files)) return

    files.forEach((file, index) => {
      if (!file || typeof file !== 'object') {
        throw new Error(`图片备份第 ${index + 1} 项无效。`)
      }

      const name = sanitizeAssetName(file.name || '')
      const dataBase64 = String(file.dataBase64 || '')
      if (!name || !dataBase64) {
        throw new Error(`图片备份第 ${index + 1} 项缺少名称或内容。`)
      }

      fs.writeFileSync(path.join(root, name), Buffer.from(dataBase64, 'base64'))
    })
  }

  return {
    getNotesAssetsRoot,
    importNoteImageFromPath,
    savePastedNoteImage,
    readNotesAssetsBackup,
    replaceNotesAssets,
  }
}

module.exports = {
  createNotesAssetsManager,
}
