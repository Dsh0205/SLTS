import { exportGroups, hydrateGroupsFromModePayload } from "./library.js";
import { createEmptyWordProgress, normalizeWordProgress } from "./progress.js";

export function buildWordLibraryPayload(groupsByMode, progressByMode = createEmptyWordProgress()) {
  return {
    english: { groups: exportGroups(groupsByMode.english || []) },
    russian: { groups: exportGroups(groupsByMode.russian || []) },
    progress: normalizeWordProgress(progressByMode),
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
    };
  }

  return null;
}

export function saveWordBanksToStorage(storageKey, groupsByMode, progressByMode = createEmptyWordProgress()) {
  localStorage.setItem(storageKey, JSON.stringify({
    wordBanks: buildWordLibraryPayload(groupsByMode, progressByMode),
  }));
}
