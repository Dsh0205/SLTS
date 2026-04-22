const fs = require('node:fs')
const path = require('node:path')

function resolvePackagedRendererPath(rootDir, relativePath) {
  const candidates = [
    path.join(rootDir, '..', 'dist', relativePath),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', relativePath),
    path.join(process.resourcesPath || '', 'dist', relativePath),
  ]

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates[0]
}

function buildRendererLoadErrorPage(relativePath, error) {
  const message = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<meta charset="utf-8">',
    '<title>Renderer Load Error</title>',
    '<body style="margin:0;padding:24px;font:14px/1.6 Microsoft YaHei UI,sans-serif;background:#0b1712;color:#e9fff1;">',
    '<h1 style="margin:0 0 12px;font-size:20px;">页面加载失败</h1>',
    `<p style="margin:0 0 8px;">目标页面: <code>${String(relativePath || '')}</code></p>`,
    `<pre style="white-space:pre-wrap;word-break:break-word;padding:16px;border-radius:12px;background:#13251d;">${String(error?.stack || error?.message || error || 'Unknown error')}</pre>`,
    '</body>',
    '</html>',
  ].join('')

  return `data:text/html;charset=utf-8,${encodeURIComponent(message)}`
}

function loadRendererPage({ browserWindow, app, rootDir, devServerUrl, relativePath, query = {} }) {
  if (app.isPackaged) {
    const targetPath = resolvePackagedRendererPath(rootDir, relativePath)
    return browserWindow.loadFile(targetPath, { query }).catch((error) => {
      console.error('Failed to load packaged renderer page.', {
        relativePath,
        targetPath,
        error: error?.stack || error?.message || error,
      })
      return browserWindow.loadURL(buildRendererLoadErrorPage(relativePath, error))
    })
  }

  const url = new URL(relativePath, `${devServerUrl}/`)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return browserWindow.loadURL(url.toString()).catch((error) => {
    const fallbackPath = resolvePackagedRendererPath(rootDir, relativePath)
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      console.error('Development renderer unavailable, falling back to local dist file.', {
        relativePath,
        url: url.toString(),
        fallbackPath,
        error: error?.stack || error?.message || error,
      })
      return browserWindow.loadFile(fallbackPath, { query }).catch((fallbackError) => {
        console.error('Failed to load local dist fallback renderer page.', {
          relativePath,
          fallbackPath,
          error: fallbackError?.stack || fallbackError?.message || fallbackError,
        })
        return browserWindow.loadURL(buildRendererLoadErrorPage(relativePath, fallbackError))
      })
    }

    console.error('Failed to load development renderer page.', {
      relativePath,
      url: url.toString(),
      error: error?.stack || error?.message || error,
    })
    return browserWindow.loadURL(buildRendererLoadErrorPage(relativePath, error))
  })
}

function registerExternalLinkPolicy(browserWindow, shell) {
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

module.exports = {
  loadRendererPage,
  registerExternalLinkPolicy,
}
