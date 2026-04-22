import { getEntryIdentityKey } from "./library.js";

const MODES = ["english", "russian"];

export function createEmptyWordProgress() {
  return {
    english: {},
    russian: {},
  };
}

export function normalizeWordProgress(payload) {
  const nextProgress = createEmptyWordProgress();
  if (!payload || typeof payload !== "object") {
    return nextProgress;
  }

  MODES.forEach((mode) => {
    const modePayload = payload[mode];
    if (!modePayload || typeof modePayload !== "object" || Array.isArray(modePayload)) {
      return;
    }

    Object.entries(modePayload).forEach(([key, value]) => {
      if (!value || typeof value !== "object") {
        return;
      }

      const word = String(value.word || "").trim();
      const meaning = String(value.meaning || "").trim();
      if (!word || !meaning) {
        return;
      }

      nextProgress[mode][key] = {
        word,
        meaning,
        correctCount: normalizeCount(value.correctCount),
        wrongCount: normalizeCount(value.wrongCount),
        mastered: Boolean(value.mastered),
        updatedAt: normalizeDateText(value.updatedAt),
        lastCorrectAt: normalizeDateText(value.lastCorrectAt),
        lastWrongAt: normalizeDateText(value.lastWrongAt),
      };
    });
  });

  return nextProgress;
}

export function pruneWordProgress(progress, groupsByMode) {
  const nextProgress = createEmptyWordProgress();
  const safeProgress = normalizeWordProgress(progress);

  MODES.forEach((mode) => {
    const liveEntries = new Map();
    (groupsByMode[mode] || []).forEach((group) => {
      group.entries.forEach((entry) => {
        const key = getEntryIdentityKey(entry);
        if (!liveEntries.has(key)) {
          liveEntries.set(key, {
            word: entry.word,
            meaning: entry.meaning,
          });
        }
      });
    });

    Object.entries(safeProgress[mode]).forEach(([key, value]) => {
      const liveEntry = liveEntries.get(key);
      if (!liveEntry) {
        return;
      }

      nextProgress[mode][key] = {
        ...value,
        word: liveEntry.word,
        meaning: liveEntry.meaning,
      };
    });
  });

  return nextProgress;
}

export function updateWordProgress(progress, mode, entry, isCorrect) {
  const nextProgress = normalizeWordProgress(progress);
  const key = getEntryIdentityKey(entry);
  const now = new Date().toISOString();
  const previous = nextProgress[mode][key] || {
    word: entry.word,
    meaning: entry.meaning,
    correctCount: 0,
    wrongCount: 0,
    mastered: false,
    updatedAt: "",
    lastCorrectAt: "",
    lastWrongAt: "",
  };

  const nextRecord = {
    ...previous,
    word: entry.word,
    meaning: entry.meaning,
    updatedAt: now,
  };

  if (isCorrect) {
    nextRecord.correctCount += 1;
    nextRecord.mastered = true;
    nextRecord.lastCorrectAt = now;
  } else {
    nextRecord.wrongCount += 1;
    nextRecord.mastered = false;
    nextRecord.lastWrongAt = now;
  }

  nextProgress[mode][key] = nextRecord;
  return nextProgress;
}

export function getMasteredProgressKeys(progress, mode, entries) {
  return collectProgressKeys(progress, mode, entries, (record) => record.mastered);
}

export function getWrongProgressKeys(progress, mode, entries) {
  return collectProgressKeys(progress, mode, entries, (record) => !record.mastered && record.wrongCount > 0);
}

export function buildGroupProgressSummary(group, progress, mode) {
  if (!group) {
    return createEmptyGroupProgressSummary();
  }

  const modeProgress = getModeProgressRecords(progress, mode);
  const uniqueEntries = new Map();

  group.entries.forEach((entry) => {
    const key = getEntryIdentityKey(entry);
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, {
        key,
        word: entry.word,
        meaning: entry.meaning,
      });
    }
  });

  const masteredEntries = [];
  const wrongEntries = [];

  uniqueEntries.forEach((entry) => {
    const record = modeProgress[entry.key];
    if (!record) {
      return;
    }

    if (record.mastered) {
      masteredEntries.push({
        word: entry.word,
        meaning: entry.meaning,
        updatedAt: record.lastCorrectAt || record.updatedAt || "",
      });
      return;
    }

    if (record.wrongCount > 0) {
      wrongEntries.push({
        word: entry.word,
        meaning: entry.meaning,
        wrongCount: record.wrongCount,
        updatedAt: record.lastWrongAt || record.updatedAt || "",
      });
    }
  });

  masteredEntries.sort(compareProgressEntries);
  wrongEntries.sort(compareWrongEntries);

  return {
    totalCount: uniqueEntries.size,
    masteredCount: masteredEntries.length,
    wrongCount: wrongEntries.length,
    remainingCount: Math.max(uniqueEntries.size - masteredEntries.length, 0),
    masteredEntries,
    wrongEntries,
  };
}

export function buildGroupProgressMap(groups, progress, mode) {
  const map = {};
  groups.forEach((group) => {
    map[group.id] = buildGroupProgressSummary(group, progress, mode);
  });
  return map;
}

function collectProgressKeys(progress, mode, entries, predicate) {
  const modeProgress = getModeProgressRecords(progress, mode);
  const keys = new Set();

  entries.forEach((entry) => {
    const key = getEntryIdentityKey(entry);
    const record = modeProgress[key];
    if (record && predicate(record)) {
      keys.add(key);
    }
  });

  return keys;
}

function normalizeCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.floor(numericValue);
}

function normalizeDateText(value) {
  return String(value || "").trim();
}

function getModeProgressRecords(progress, mode) {
  const modeProgress = progress?.[mode];
  if (!modeProgress || typeof modeProgress !== "object" || Array.isArray(modeProgress)) {
    return {};
  }

  return modeProgress;
}

function createEmptyGroupProgressSummary() {
  return {
    totalCount: 0,
    masteredCount: 0,
    wrongCount: 0,
    remainingCount: 0,
    masteredEntries: [],
    wrongEntries: [],
  };
}

function compareProgressEntries(left, right) {
  return compareIsoDates(right.updatedAt, left.updatedAt) || left.word.localeCompare(right.word, "zh-CN");
}

function compareWrongEntries(left, right) {
  return (
    right.wrongCount - left.wrongCount ||
    compareIsoDates(right.updatedAt, left.updatedAt) ||
    left.word.localeCompare(right.word, "zh-CN")
  );
}

function compareIsoDates(left, right) {
  if (left === right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  return left.localeCompare(right);
}
