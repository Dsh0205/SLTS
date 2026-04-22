const STORAGE_KEY = "usage-checkin-heatmap-v1";
const STORAGE_VERSION = 1;
const FOCUS_STORAGE_KEY = "focus-timer-state-v1";
const FOCUS_STORAGE_VERSION = 1;
const DAYS_TO_SHOW = 365;
const KEEP_DAYS = 730;
const HEARTBEAT_MS = 1000;
const SAVE_INTERVAL_MS = 15000;
const DESKTOP_SYNC_MS = 1000;
const FOCUS_TICK_MS = 1000;
const MAX_FOCUS_MINUTES = 720;
const DEFAULT_FOCUS_MINUTES = 25;

const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const NINETY_MINUTES = 90 * 60 * 1000;
const LEVEL_LABELS = ["未记录", "轻量", "稳定", "专注", "高强度"];

const desktopBridge = window.shanlicDesktop || null;
const useDesktopUsageTracking = Boolean(
  desktopBridge?.isElectron && desktopBridge?.getUsageHeatmapState,
);

const trackingBadge = document.getElementById("trackingBadge");
const jumpTodayBtn = document.getElementById("jumpTodayBtn");
const todayLevelValue = document.getElementById("todayLevelValue");
const activeDaysValue = document.getElementById("activeDaysValue");
const streakValue = document.getElementById("streakValue");
const boardScroll = document.getElementById("boardScroll");
const heatmapGrid = document.getElementById("heatmapGrid");
const rangeHint = document.getElementById("rangeHint");
const syncStatusValue = document.getElementById("syncStatusValue");
const openFocusDialogBtn = document.getElementById("openFocusDialogBtn");
const focusTimerValue = document.getElementById("focusTimerValue");
const focusSummaryValue = document.getElementById("focusSummaryValue");
const focusStatusValue = document.getElementById("focusStatusValue");
const focusHistoryList = document.getElementById("focusHistoryList");
const focusDialog = document.getElementById("focusDialog");
const focusDurationInput = document.getElementById("focusDurationInput");
const focusCancelBtn = document.getElementById("focusCancelBtn");
const focusConfirmBtn = document.getElementById("focusConfirmBtn");
const focusCompleteModal = document.getElementById("focusCompleteModal");
const focusCompleteText = document.getElementById("focusCompleteText");
const focusCompleteBtn = document.getElementById("focusCompleteBtn");

let state = loadState();
let focusState = loadFocusState();
let activeSessionStartedAt = 0;
let lastPersistedAt = 0;
let heartbeatTimer = 0;
let desktopSyncTimer = 0;
let desktopSyncBusy = false;
let focusTickTimer = 0;
let renderedTodayKey = "";
let hasAutoScrolled = false;
let removeStorageChangeListener = () => {};

const cellRefs = new Map();
const visitKeysMarked = new Set();

initialize();

function initialize() {
  trimEntries();
  trimFocusSessions();
  bindEvents();
  checkFocusCompletion(Date.now());
  updateFocusUI(Date.now());

  focusTickTimer = window.setInterval(handleFocusTick, FOCUS_TICK_MS);
  window.addEventListener("beforeunload", cleanup, { capture: true });

  if (useDesktopUsageTracking) {
    refreshUI();
    void syncFromDesktop(true);

    desktopSyncTimer = window.setInterval(() => {
      void syncFromDesktop();
    }, DESKTOP_SYNC_MS);

    if (desktopBridge?.onMirroredStorageChanged) {
      removeStorageChangeListener = desktopBridge.onMirroredStorageChanged((moduleId) => {
        if (moduleId !== "hobby") {
          return;
        }

        desktopBridge.reloadMirroredStorage?.();
        state = loadState();
        focusState = loadFocusState();
        trimEntries();
        trimFocusSessions();
        checkFocusCompletion(Date.now());
        updateFocusUI(Date.now());
        void syncFromDesktop(true);
      });
    }

    return;
  }

  document.addEventListener("visibilitychange", syncTrackingState);
  window.addEventListener("pagehide", cleanup, { capture: true });

  syncTrackingState();
  refreshUI();
  heartbeatTimer = window.setInterval(handleHeartbeat, HEARTBEAT_MS);
}

function bindEvents() {
  jumpTodayBtn?.addEventListener("click", () => {
    scrollHeatmapToToday("smooth");

    if (useDesktopUsageTracking) {
      void syncFromDesktop();
      return;
    }

    refreshUI();
  });

  openFocusDialogBtn?.addEventListener("click", () => {
    if (focusState.activeSession) {
      return;
    }

    openFocusDialog();
  });

  focusCancelBtn?.addEventListener("click", closeFocusDialog);
  focusConfirmBtn?.addEventListener("click", confirmFocusDuration);
  focusDurationInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmFocusDuration();
    }
  });

  focusDialog?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute("data-close-focus-dialog")) {
      closeFocusDialog();
    }
  });

  focusCompleteBtn?.addEventListener("click", closeFocusCompleteModal);
  focusCompleteModal?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.hasAttribute("data-close-focus-complete")) {
      closeFocusCompleteModal();
    }
  });
}

function cleanup() {
  removeStorageChangeListener();
  removeStorageChangeListener = () => {};

  if (desktopSyncTimer) {
    window.clearInterval(desktopSyncTimer);
    desktopSyncTimer = 0;
  }

  if (heartbeatTimer) {
    pauseTracking(Date.now());
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
  }

  if (focusTickTimer) {
    window.clearInterval(focusTickTimer);
    focusTickTimer = 0;
  }
}

async function syncFromDesktop(forceRenderFallback = false) {
  if (!desktopBridge?.getUsageHeatmapState || desktopSyncBusy) {
    return;
  }

  desktopSyncBusy = true;

  try {
    const snapshot = await desktopBridge.getUsageHeatmapState();

    if (!snapshot || !Array.isArray(snapshot.days)) {
      if (forceRenderFallback) {
        refreshUI();
      }
      return;
    }

    renderSnapshot(snapshot, Date.now());
  } catch {
    if (forceRenderFallback) {
      refreshUI();
    }
  } finally {
    desktopSyncBusy = false;
  }
}

function handleHeartbeat() {
  const now = Date.now();

  if (activeSessionStartedAt) {
    markVisit(formatDateKey(new Date(now)), now);

    if (now - lastPersistedAt >= SAVE_INTERVAL_MS) {
      commitActiveDuration(now);
    }
  }

  refreshUI(now);
}

function handleFocusTick() {
  const now = Date.now();
  checkFocusCompletion(now);
  updateFocusUI(now);
}

function syncTrackingState() {
  if (document.visibilityState === "visible") {
    startTracking();
    return;
  }

  pauseTracking();
}

function startTracking(now = Date.now()) {
  if (activeSessionStartedAt) {
    return;
  }

  activeSessionStartedAt = now;
  lastPersistedAt = now;
  markVisit(formatDateKey(new Date(now)), now);
}

function pauseTracking(now = Date.now()) {
  if (!activeSessionStartedAt) {
    return;
  }

  commitActiveDuration(now);
  activeSessionStartedAt = 0;
}

function refreshUI(now = Date.now()) {
  renderSnapshot(createSnapshot(now), now);
}

function renderSnapshot(snapshot, now = Date.now()) {
  if (renderedTodayKey !== snapshot.todayKey || cellRefs.size !== snapshot.days.length) {
    renderHeatmap(snapshot.days);
    renderedTodayKey = snapshot.todayKey;
  } else {
    updateHeatmapCells(snapshot.days);
  }

  updateTrackingState(snapshot);
  updateStats(snapshot);
  updateFooter(snapshot, now);
}

function renderHeatmap(days) {
  heatmapGrid.innerHTML = "";
  cellRefs.clear();

  days.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    cell.setAttribute("role", "gridcell");
    heatmapGrid.appendChild(cell);
    cellRefs.set(day.key, cell);
  });

  updateHeatmapCells(days);

  if (!hasAutoScrolled) {
    scrollHeatmapToToday("auto");
    hasAutoScrolled = true;
  }
}

function updateHeatmapCells(days) {
  days.forEach((day) => {
    const cell = cellRefs.get(day.key);
    if (!cell) {
      return;
    }

    cell.className = [
      "heat-cell",
      `level-${day.level}`,
      day.isToday ? "is-today" : "",
      day.isToday && day.isTracking ? "is-live" : "",
    ].filter(Boolean).join(" ");

    const title = buildCellTitle(day);
    cell.title = title;
    cell.setAttribute("aria-label", title);
  });
}

function updateTrackingState(snapshot) {
  const isLive = Boolean(snapshot.isTracking);
  const isMainProcess = snapshot.source === "main-process";

  trackingBadge.textContent = isMainProcess
    ? (isLive ? "桌面记录中" : "桌面暂停")
    : (isLive ? "记录中" : "暂停");
  trackingBadge.classList.toggle("is-live", isLive);
}

function updateStats(snapshot) {
  const today = snapshot.days[snapshot.days.length - 1] || null;

  todayLevelValue.textContent = today ? LEVEL_LABELS[today.level] : LEVEL_LABELS[0];
  activeDaysValue.textContent = `${snapshot.activeDays} 天`;
  streakValue.textContent = `${snapshot.currentStreak} 天`;
}

function updateFooter(snapshot) {
  rangeHint.textContent = `365 GRID · ${Math.ceil(DAYS_TO_SHOW / 7)} COL`;
  syncStatusValue.textContent = snapshot.isTracking ? "AUTO SAVE ON" : "AUTO SAVE";
}

function openFocusDialog() {
  if (!focusDialog || !focusDurationInput) {
    return;
  }

  focusDurationInput.value = String(DEFAULT_FOCUS_MINUTES);
  focusDialog.hidden = false;
  window.setTimeout(() => {
    focusDurationInput.focus();
    focusDurationInput.select();
  }, 20);
}

function closeFocusDialog() {
  if (!focusDialog) {
    return;
  }

  focusDialog.hidden = true;
}

function confirmFocusDuration() {
  if (!focusDurationInput) {
    return;
  }

  const minutes = sanitizeFocusMinutes(focusDurationInput.value);
  if (!minutes) {
    focusDurationInput.focus();
    focusDurationInput.select();
    return;
  }

  startFocusSession(minutes, Date.now());
  closeFocusDialog();
}

function startFocusSession(minutes, now = Date.now()) {
  if (focusState.activeSession) {
    return;
  }

  focusState.activeSession = {
    id: `focus-${now}`,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + minutes * 60 * 1000).toISOString(),
    durationMinutes: minutes,
  };
  saveFocusState(now);
  updateFocusUI(now);
}

function checkFocusCompletion(now = Date.now()) {
  const activeSession = focusState.activeSession;
  if (!activeSession) {
    return;
  }

  const endsAt = Date.parse(activeSession.endsAt);
  if (!Number.isFinite(endsAt) || now < endsAt) {
    return;
  }

  completeFocusSession(endsAt);
}

function completeFocusSession(completedAtMs = Date.now()) {
  const activeSession = focusState.activeSession;
  if (!activeSession) {
    return;
  }

  const durationMinutes = sanitizeFocusMinutes(activeSession.durationMinutes);
  if (!durationMinutes) {
    focusState.activeSession = null;
    saveFocusState(completedAtMs);
    updateFocusUI(completedAtMs);
    return;
  }

  focusState.sessions.unshift({
    id: activeSession.id,
    startedAt: activeSession.startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMinutes,
  });
  focusState.activeSession = null;

  trimFocusSessions();
  saveFocusState(completedAtMs);
  updateFocusUI(completedAtMs);
  showFocusCompleteModal(durationMinutes);
}

function showFocusCompleteModal(durationMinutes) {
  if (!focusCompleteModal || !focusCompleteText) {
    window.alert(`恭喜完成专注，本次共 ${formatMinutes(durationMinutes)}。`);
    return;
  }

  focusCompleteText.textContent = `本次已完成 ${formatMinutes(durationMinutes)} 专注。`;
  focusCompleteModal.hidden = false;
}

function closeFocusCompleteModal() {
  if (!focusCompleteModal) {
    return;
  }

  focusCompleteModal.hidden = true;
}

function updateFocusUI(now = Date.now()) {
  const activeSession = focusState.activeSession;
  const monthSessions = getCurrentMonthSessions(new Date(now));
  const totalMonthMinutes = monthSessions.reduce(
    (sum, session) => sum + sanitizeFocusMinutes(session.durationMinutes),
    0,
  );

  focusSummaryValue.textContent = formatMinutes(totalMonthMinutes);

  if (activeSession) {
    const remainingMs = Math.max(0, Date.parse(activeSession.endsAt) - now);
    focusTimerValue.textContent = formatCountdown(remainingMs);
    focusStatusValue.textContent = `${sanitizeFocusMinutes(activeSession.durationMinutes)} 分钟专注中`;
    openFocusDialogBtn.textContent = "专注中";
    openFocusDialogBtn.disabled = true;
  } else {
    focusTimerValue.textContent = "未开始";
    focusStatusValue.textContent = monthSessions.length > 0 ? `本月 ${monthSessions.length} 次` : "准备开始";
    openFocusDialogBtn.textContent = "开始专注";
    openFocusDialogBtn.disabled = false;
  }

  renderFocusHistory(monthSessions);
}

function renderFocusHistory(monthSessions) {
  focusHistoryList.innerHTML = "";

  if (!monthSessions.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "focus-history-item focus-history-empty";
    emptyItem.textContent = "本月还没有专注记录";
    focusHistoryList.appendChild(emptyItem);
    return;
  }

  monthSessions.slice(0, 12).forEach((session) => {
    const item = document.createElement("li");
    item.className = "focus-history-item";

    const label = document.createElement("span");
    label.className = "focus-history-label";
    label.textContent = formatSessionLabel(session.completedAt);

    const value = document.createElement("span");
    value.className = "focus-history-value";
    value.textContent = formatMinutes(session.durationMinutes);

    item.appendChild(label);
    item.appendChild(value);
    focusHistoryList.appendChild(item);
  });
}

function scrollHeatmapToToday(behavior = "smooth") {
  if (!boardScroll) {
    return;
  }

  boardScroll.scrollTo({
    left: boardScroll.scrollWidth,
    behavior,
  });
}

function createSnapshot(now = Date.now()) {
  const projectedSlices = activeSessionStartedAt ? splitDurationByDay(activeSessionStartedAt, now) : null;
  const windowDays = buildTrailingDays(DAYS_TO_SHOW, new Date(now));

  let activeDays = 0;

  const days = windowDays.map((day) => {
    const baseEntry = state.entries[day.key] || createEmptyEntry();
    const durationMs = baseEntry.durationMs + (projectedSlices?.[day.key] || 0);

    if (durationMs > 0) {
      activeDays += 1;
    }

    return {
      ...day,
      durationMs,
      level: resolveLevel(durationMs),
      isTracking: day.isToday && Boolean(activeSessionStartedAt),
    };
  });

  return {
    source: "page-fallback",
    isTracking: Boolean(activeSessionStartedAt),
    todayKey: days[days.length - 1].key,
    activeDays,
    currentStreak: computeCurrentStreak(days),
    updatedAt: activeSessionStartedAt ? new Date(now).toISOString() : state.updatedAt,
    days,
  };
}

function computeCurrentStreak(days) {
  let streak = 0;

  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].durationMs <= 0) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function resolveLevel(durationMs) {
  if (durationMs <= 0) {
    return 0;
  }

  if (durationMs < TEN_MINUTES) {
    return 1;
  }

  if (durationMs < THIRTY_MINUTES) {
    return 2;
  }

  if (durationMs < NINETY_MINUTES) {
    return 3;
  }

  return 4;
}

function buildCellTitle(day) {
  return `${day.label || formatLabelFromKey(day.key)} · ${LEVEL_LABELS[day.level] || LEVEL_LABELS[0]}`;
}

function commitActiveDuration(now = Date.now()) {
  if (!activeSessionStartedAt || now <= activeSessionStartedAt) {
    return;
  }

  const slices = splitDurationByDay(activeSessionStartedAt, now);

  Object.entries(slices).forEach(([dayKey, durationMs]) => {
    const entry = ensureEntry(dayKey);
    entry.durationMs += durationMs;
    entry.updatedAt = new Date(now).toISOString();
  });

  activeSessionStartedAt = now;
  saveState(now);
  lastPersistedAt = now;
}

function splitDurationByDay(startMs, endMs) {
  const slices = {};
  let cursor = startMs;

  while (cursor < endMs) {
    const currentDay = startOfLocalDay(new Date(cursor));
    const nextDay = new Date(currentDay);
    nextDay.setDate(currentDay.getDate() + 1);

    const sliceEnd = Math.min(endMs, nextDay.getTime());
    const dayKey = formatDateKey(currentDay);

    slices[dayKey] = (slices[dayKey] || 0) + (sliceEnd - cursor);
    cursor = sliceEnd;
  }

  return slices;
}

function markVisit(dayKey, now = Date.now()) {
  if (visitKeysMarked.has(dayKey)) {
    return;
  }

  const entry = ensureEntry(dayKey);
  entry.visits += 1;
  entry.updatedAt = new Date(now).toISOString();

  visitKeysMarked.add(dayKey);
  saveState(now);
  lastPersistedAt = now;
}

function ensureEntry(dayKey) {
  if (!state.entries[dayKey]) {
    state.entries[dayKey] = createEmptyEntry();
  }

  return state.entries[dayKey];
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return createEmptyState();
    }

    const entries = {};
    const sourceEntries = parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};

    Object.entries(sourceEntries).forEach(([dayKey, value]) => {
      if (!isValidDayKey(dayKey) || !value || typeof value !== "object") {
        return;
      }

      entries[dayKey] = {
        durationMs: sanitizeDuration(value.durationMs),
        visits: sanitizeCount(value.visits),
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
      };
    });

    return {
      version: STORAGE_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      entries,
    };
  } catch {
    return createEmptyState();
  }
}

function saveState(now = Date.now()) {
  trimEntries();
  state.version = STORAGE_VERSION;
  state.updatedAt = new Date(now).toISOString();

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors so the page can keep running.
  }
}

function trimEntries() {
  const keepKeys = new Set(buildTrailingDays(KEEP_DAYS).map((day) => day.key));
  const trimmedEntries = {};

  Object.entries(state.entries).forEach(([dayKey, value]) => {
    if (keepKeys.has(dayKey)) {
      trimmedEntries[dayKey] = value;
    }
  });

  state.entries = trimmedEntries;
}

function buildTrailingDays(totalDays = DAYS_TO_SHOW, endDate = new Date()) {
  const today = startOfLocalDay(endDate);
  const days = [];

  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);

    days.push({
      key: formatDateKey(date),
      label: formatDateLabel(date),
      isToday: offset === 0,
    });
  }

  return days;
}

function loadFocusState() {
  try {
    const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (!raw) {
      return createEmptyFocusState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return createEmptyFocusState();
    }

    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map((session) => sanitizeFocusSession(session)).filter(Boolean)
      : [];
    const activeSession = sanitizeActiveFocusSession(parsed.activeSession);

    return {
      version: FOCUS_STORAGE_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      activeSession,
      sessions,
    };
  } catch {
    return createEmptyFocusState();
  }
}

function saveFocusState(now = Date.now()) {
  trimFocusSessions();
  focusState.version = FOCUS_STORAGE_VERSION;
  focusState.updatedAt = new Date(now).toISOString();

  try {
    window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusState));
  } catch {
    // Ignore storage write errors so the page can keep running.
  }
}

function trimFocusSessions() {
  const minimumTime = new Date();
  minimumTime.setMonth(minimumTime.getMonth() - 18);
  const minimumTimestamp = minimumTime.getTime();

  focusState.sessions = focusState.sessions.filter((session) => {
    const completedAt = Date.parse(session.completedAt);
    return Number.isFinite(completedAt) && completedAt >= minimumTimestamp;
  });
}

function sanitizeFocusSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const durationMinutes = sanitizeFocusMinutes(session.durationMinutes);
  if (!durationMinutes || typeof session.completedAt !== "string") {
    return null;
  }

  return {
    id: typeof session.id === "string" ? session.id : `focus-${session.completedAt}`,
    startedAt: typeof session.startedAt === "string" ? session.startedAt : session.completedAt,
    completedAt: session.completedAt,
    durationMinutes,
  };
}

function sanitizeActiveFocusSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  const durationMinutes = sanitizeFocusMinutes(session.durationMinutes);
  if (!durationMinutes || typeof session.startedAt !== "string" || typeof session.endsAt !== "string") {
    return null;
  }

  return {
    id: typeof session.id === "string" ? session.id : `focus-${session.startedAt}`,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    durationMinutes,
  };
}

function getCurrentMonthSessions(referenceDate = new Date()) {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();

  return focusState.sessions.filter((session) => {
    const completedAt = new Date(session.completedAt);
    return !Number.isNaN(completedAt.getTime())
      && completedAt.getFullYear() === currentYear
      && completedAt.getMonth() === currentMonth;
  });
}

function formatCountdown(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function formatMinutes(minutesValue) {
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} 小时 ${remainingMinutes} 分钟`;
  }

  if (hours > 0) {
    return `${hours} 小时`;
  }

  return `${remainingMinutes} 分钟`;
}

function formatSessionLabel(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "本次专注";
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sanitizeFocusMinutes(value) {
  const number = Number.parseInt(String(value), 10);
  return Number.isFinite(number) && number >= 1 && number <= MAX_FOCUS_MINUTES ? number : 0;
}

function startOfLocalDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatLabelFromKey(dayKey) {
  if (!isValidDayKey(dayKey)) {
    return "00/00";
  }

  return dayKey.slice(5).replace("-", "/");
}

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function sanitizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function createEmptyState() {
  return {
    version: STORAGE_VERSION,
    updatedAt: "",
    entries: {},
  };
}

function createEmptyEntry() {
  return {
    durationMs: 0,
    visits: 0,
    updatedAt: "",
  };
}

function createEmptyFocusState() {
  return {
    version: FOCUS_STORAGE_VERSION,
    updatedAt: "",
    activeSession: null,
    sessions: [],
  };
}
