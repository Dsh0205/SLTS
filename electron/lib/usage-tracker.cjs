const MODULE_ID = 'hobby'
const STORAGE_KEY = 'usage-checkin-heatmap-v1'
const STORAGE_VERSION = 1
const DAYS_TO_SHOW = 365
const KEEP_DAYS = 730
const HEARTBEAT_MS = 1000
const SAVE_INTERVAL_MS = 15000

const TEN_MINUTES = 10 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000
const NINETY_MINUTES = 90 * 60 * 1000

function createUsageTracker({ app, BrowserWindow, storage }) {
  let state = loadState()
  trimEntries()
  let activeSessionStartedAt = 0
  let lastPersistedAt = 0
  let heartbeatTimer = null
  let started = false

  const trackedWindows = new Set()
  const visitKeysMarked = new Set()

  function start() {
    if (started) {
      return
    }

    started = true

    BrowserWindow.getAllWindows().forEach(attachWindow)

    app.on('browser-window-created', (_event, browserWindow) => {
      attachWindow(browserWindow)
      syncTrackingState()
    })

    app.on('browser-window-focus', () => {
      syncTrackingState()
    })

    app.on('browser-window-blur', () => {
      syncTrackingState()
    })

    app.on('before-quit', () => {
      flushAndStop()
    })

    heartbeatTimer = setInterval(handleHeartbeat, HEARTBEAT_MS)
    syncTrackingState()
  }

  function attachWindow(browserWindow) {
    if (!browserWindow || browserWindow.isDestroyed() || trackedWindows.has(browserWindow)) {
      return
    }

    trackedWindows.add(browserWindow)

    const handleWindowChange = () => {
      syncTrackingState()
    }

    browserWindow.on('show', handleWindowChange)
    browserWindow.on('hide', handleWindowChange)
    browserWindow.on('focus', handleWindowChange)
    browserWindow.on('blur', handleWindowChange)
    browserWindow.on('minimize', handleWindowChange)
    browserWindow.on('restore', handleWindowChange)
    browserWindow.on('closed', () => {
      trackedWindows.delete(browserWindow)
      syncTrackingState()
    })
  }

  function handleHeartbeat() {
    const now = Date.now()

    if (activeSessionStartedAt) {
      markVisit(formatDateKey(new Date(now)), now)

      if (now - lastPersistedAt >= SAVE_INTERVAL_MS) {
        commitActiveDuration(now)
      }
    }
  }

  function syncTrackingState(now = Date.now()) {
    if (hasFocusedVisibleWindow()) {
      startTracking(now)
      return
    }

    pauseTracking(now)
  }

  function hasFocusedVisibleWindow() {
    for (const browserWindow of trackedWindows) {
      if (!browserWindow || browserWindow.isDestroyed()) {
        continue
      }

      if (!browserWindow.isVisible() || browserWindow.isMinimized()) {
        continue
      }

      if (browserWindow.isFocused()) {
        return true
      }
    }

    return false
  }

  function startTracking(now = Date.now()) {
    if (activeSessionStartedAt) {
      return
    }

    activeSessionStartedAt = now
    lastPersistedAt = now
    markVisit(formatDateKey(new Date(now)), now)
  }

  function pauseTracking(now = Date.now()) {
    if (!activeSessionStartedAt) {
      return
    }

    commitActiveDuration(now)
    activeSessionStartedAt = 0
  }

  function flushAndStop() {
    pauseTracking(Date.now())

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function commitActiveDuration(now = Date.now()) {
    if (!activeSessionStartedAt || now <= activeSessionStartedAt) {
      return
    }

    const slices = splitDurationByDay(activeSessionStartedAt, now)

    Object.entries(slices).forEach(([dayKey, durationMs]) => {
      const entry = ensureEntry(dayKey)
      entry.durationMs += durationMs
      entry.updatedAt = new Date(now).toISOString()
    })

    activeSessionStartedAt = now
    lastPersistedAt = now
    saveState(now)
    broadcastStorageChange()
  }

  function markVisit(dayKey, now = Date.now()) {
    if (visitKeysMarked.has(dayKey)) {
      return
    }

    const entry = ensureEntry(dayKey)
    entry.visits += 1
    entry.updatedAt = new Date(now).toISOString()

    visitKeysMarked.add(dayKey)
    lastPersistedAt = now
    saveState(now)
    broadcastStorageChange()
  }

  function ensureEntry(dayKey) {
    if (!state.entries[dayKey]) {
      state.entries[dayKey] = createEmptyEntry()
    }

    return state.entries[dayKey]
  }

  function getSnapshot(now = Date.now()) {
    const projectedSlices = activeSessionStartedAt ? splitDurationByDay(activeSessionStartedAt, now) : null
    const windowDays = buildTrailingDays(DAYS_TO_SHOW, new Date(now))

    let totalDurationMs = 0
    let activeDays = 0

    const days = windowDays.map((day) => {
      const baseEntry = state.entries[day.key] || createEmptyEntry()
      const durationMs = baseEntry.durationMs + (projectedSlices?.[day.key] || 0)
      const visits = baseEntry.visits

      totalDurationMs += durationMs
      if (durationMs > 0) {
        activeDays += 1
      }

      return {
        ...day,
        durationMs,
        visits,
        level: resolveLevel(durationMs),
        isTracking: day.isToday && Boolean(activeSessionStartedAt),
      }
    })

    return {
      source: 'main-process',
      isTracking: Boolean(activeSessionStartedAt),
      todayKey: days[days.length - 1].key,
      todayDurationMs: days[days.length - 1].durationMs,
      totalDurationMs,
      activeDays,
      currentStreak: computeCurrentStreak(days),
      updatedAt: activeSessionStartedAt ? new Date(now).toISOString() : state.updatedAt,
      days,
    }
  }

  function reloadFromStorage(now = Date.now()) {
    state = loadState()
    trimEntries()

    if (activeSessionStartedAt) {
      activeSessionStartedAt = now
      lastPersistedAt = now
      markVisit(formatDateKey(new Date(now)), now)
      return
    }

    broadcastStorageChange()
  }

  function loadState() {
    try {
      const storedModule = storage.readModuleStorage(MODULE_ID)
      const raw = storedModule?.keys?.[STORAGE_KEY]

      if (typeof raw !== 'string' || raw.trim().length === 0) {
        return createEmptyState()
      }

      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        return createEmptyState()
      }

      const entries = {}
      const sourceEntries = parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {}

      Object.entries(sourceEntries).forEach(([dayKey, value]) => {
        if (!isValidDayKey(dayKey) || !value || typeof value !== 'object') {
          return
        }

        entries[dayKey] = {
          durationMs: sanitizeDuration(value.durationMs),
          visits: sanitizeCount(value.visits),
          updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
        }
      })

      return {
        version: STORAGE_VERSION,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        entries,
      }
    } catch {
      return createEmptyState()
    }
  }

  function saveState(now = Date.now()) {
    trimEntries()

    state.version = STORAGE_VERSION
    state.updatedAt = new Date(now).toISOString()

    const currentModuleStorage = storage.readModuleStorage(MODULE_ID)
    const nextKeys = currentModuleStorage?.keys && typeof currentModuleStorage.keys === 'object'
      ? { ...currentModuleStorage.keys }
      : {}

    nextKeys[STORAGE_KEY] = JSON.stringify(state)

    storage.writeModuleStorage(MODULE_ID, {
      version: 1,
      keys: nextKeys,
    })
  }

  function trimEntries() {
    const keepKeys = new Set(buildTrailingDays(KEEP_DAYS).map((day) => day.key))
    const trimmedEntries = {}

    Object.entries(state.entries).forEach(([dayKey, value]) => {
      if (keepKeys.has(dayKey)) {
        trimmedEntries[dayKey] = value
      }
    })

    state.entries = trimmedEntries
  }

  function broadcastStorageChange() {
    BrowserWindow.getAllWindows().forEach((browserWindow) => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents.send('desktop-storage:changed', MODULE_ID)
      }
    })
  }

  return {
    start,
    getSnapshot,
    reloadFromStorage,
  }
}

function splitDurationByDay(startMs, endMs) {
  const slices = {}
  let cursor = startMs

  while (cursor < endMs) {
    const currentDay = startOfLocalDay(new Date(cursor))
    const nextDay = new Date(currentDay)
    nextDay.setDate(currentDay.getDate() + 1)

    const sliceEnd = Math.min(endMs, nextDay.getTime())
    const dayKey = formatDateKey(currentDay)

    slices[dayKey] = (slices[dayKey] || 0) + (sliceEnd - cursor)
    cursor = sliceEnd
  }

  return slices
}

function buildTrailingDays(totalDays = DAYS_TO_SHOW, endDate = new Date()) {
  const today = startOfLocalDay(endDate)
  const days = []

  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)

    days.push({
      key: formatDateKey(date),
      order: totalDays - offset,
      distanceFromToday: offset,
      isToday: offset === 0,
    })
  }

  return days
}

function computeCurrentStreak(days) {
  let streak = 0

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].durationMs <= 0) {
      break
    }

    streak += 1
  }

  return streak
}

function resolveLevel(durationMs) {
  if (durationMs <= 0) {
    return 0
  }

  if (durationMs < TEN_MINUTES) {
    return 1
  }

  if (durationMs < THIRTY_MINUTES) {
    return 2
  }

  if (durationMs < NINETY_MINUTES) {
    return 3
  }

  return 4
}

function startOfLocalDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sanitizeDuration(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function sanitizeCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function createEmptyState() {
  return {
    version: STORAGE_VERSION,
    updatedAt: '',
    entries: {},
  }
}

function createEmptyEntry() {
  return {
    durationMs: 0,
    visits: 0,
    updatedAt: '',
  }
}

module.exports = {
  createUsageTracker,
}
