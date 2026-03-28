const path = require('node:path')

function loadRendererPage({ browserWindow, app, rootDir, devServerUrl, relativePath, query = {} }) {
  if (app.isPackaged) {
    browserWindow.loadFile(path.join(rootDir, '..', 'dist', relativePath), { query })
    return
  }

  const url = new URL(relativePath, `${devServerUrl}/`)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  browserWindow.loadURL(url.toString())
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
