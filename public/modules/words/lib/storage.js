import { exportGroups, hydrateGroupsFromModePayload } from "./library.js";
import { createEmptyWordNotebook, normalizeWordNotebook } from "./notebook.js";
import { createEmptyWordProgress, normalizeWordProgress } from "./progress.js";

export function buildWordLibraryPayload(
  groupsByMode,
  progressByMode = createEmptyWordProgress(),
  notebookByMode = createEmptyWordNotebook(),
) {
  return {
    english: { groups: exportGroups(groupsByMode.english || []) },
    russian: { groups: exportGroups(groupsByMode.russian || []) },
    progress: normalizeWordProgress(progressByMode),
    notebook: normalizeWordNotebook(notebookByMode),
  };
}

export function loadWordBanksFromStorage(storageKey, options) {
  const {
    defaultGroupName,
    englishLabel,
    russianLabel,
  } = options;
  const raw = localStorage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw);
  if (parsed.wordBanks) {
    return {
      english: hydrateGroupsFromModePayload(parsed.wordBanks.english, defaultGroupName, englishLabel),
      russian: hydrateGroupsFromModePayload(parsed.wordBanks.russian, defaultGroupName, russianLabel),
      progress: normalizeWordProgress(parsed.wordBanks.progress),
      notebook: normalizeWordNotebook(parsed.wordBanks.notebook),
    };
  }

  if (Array.isArray(parsed.englishWords) && Array.isArray(parsed.chineseMeanings)) {
    return {
      english: hydrateGroupsFromModePayload({
        words: parsed.englishWords,
        meanings: parsed.chineseMeanings,
      }, defaultGroupName, englishLabel),
      russian: [],
      progress: createEmptyWordProgress(),
      notebook: createEmptyWordNotebook(),
    };
  }

  return null;
}

export function saveWordBanksToStorage(
  storageKey,
  groupsByMode,
  progressByMode = createEmptyWordProgress(),
  notebookByMode = createEmptyWordNotebook(),
) {
  localStorage.setItem(storageKey, JSON.stringify({
    wordBanks: buildWordLibraryPayload(groupsByMode, progressByMode, notebookByMode),
  }));
}
