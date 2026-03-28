import { exportGroups, hydrateGroupsFromModePayload } from "./library.js";

export function buildWordLibraryPayload(groupsByMode) {
  return {
    english: { groups: exportGroups(groupsByMode.english || []) },
    russian: { groups: exportGroups(groupsByMode.russian || []) },
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
    };
  }

  if (Array.isArray(parsed.englishWords) && Array.isArray(parsed.chineseMeanings)) {
    return {
      english: hydrateGroupsFromModePayload({
        words: parsed.englishWords,
        meanings: parsed.chineseMeanings,
      }, defaultGroupName, englishLabel),
      russian: [],
    };
  }

  return null;
}

export function saveWordBanksToStorage(storageKey, groupsByMode) {
  localStorage.setItem(storageKey, JSON.stringify({
    wordBanks: buildWordLibraryPayload(groupsByMode),
  }));
}
