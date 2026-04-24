import { generateId, getEntryIdentityKey, normalizeEntryArray } from "./library.js";

const MODES = ["english", "russian"];

export function createEmptyWordNotebook() {
  return {
    english: [],
    russian: [],
  };
}

export function normalizeWordNotebook(payload) {
  const nextNotebook = createEmptyWordNotebook();

  if (!payload || typeof payload !== "object") {
    return nextNotebook;
  }

  MODES.forEach((mode) => {
    const entries = Array.isArray(payload[mode]) ? payload[mode] : [];
    const normalizedEntries = normalizeEntryArray(entries, mode + " notebook");
    const uniqueEntries = [];
    const seenKeys = new Set();

    normalizedEntries.forEach((entry) => {
      const key = getEntryIdentityKey(entry);
      if (seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      uniqueEntries.push({
        id: String(entry.id || generateId("entry")),
        word: entry.word,
        meaning: entry.meaning,
      });
    });

    nextNotebook[mode] = uniqueEntries;
  });

  return nextNotebook;
}

export function pruneWordNotebook(notebook, groupsByMode) {
  const safeNotebook = normalizeWordNotebook(notebook);
  const nextNotebook = createEmptyWordNotebook();

  MODES.forEach((mode) => {
    const liveEntryKeys = new Set();

    (groupsByMode[mode] || []).forEach((group) => {
      group.entries.forEach((entry) => {
        liveEntryKeys.add(getEntryIdentityKey(entry));
      });
    });

    nextNotebook[mode] = safeNotebook[mode]
      .filter((entry) => liveEntryKeys.has(getEntryIdentityKey(entry)))
      .map((entry) => ({
        id: entry.id,
        word: entry.word,
        meaning: entry.meaning,
      }));
  });

  return nextNotebook;
}

export function addEntryToNotebook(notebook, mode, entry) {
  const list = notebook[mode];
  const entryKey = getEntryIdentityKey(entry);
  const exists = list.some((item) => getEntryIdentityKey(item) === entryKey);

  if (exists) {
    return { added: false };
  }

  list.push({
    id: generateId("entry"),
    word: String(entry?.word || "").trim(),
    meaning: String(entry?.meaning || "").trim(),
  });

  return { added: true };
}

export function hasNotebookEntry(notebook, mode, entry) {
  const entryKey = getEntryIdentityKey(entry);
  return notebook[mode].some((item) => getEntryIdentityKey(item) === entryKey);
}

export function removeNotebookEntry(notebook, mode, entryId) {
  const list = notebook[mode];
  const index = list.findIndex((entry) => entry.id === entryId);

  if (index === -1) {
    return { removed: false, entry: null };
  }

  const [entry] = list.splice(index, 1);
  return { removed: true, entry };
}
