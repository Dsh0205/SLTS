import { getEntryIdentityKey } from "./library.js";

export function getEntryKey(entry) {
  return getEntryIdentityKey(entry);
}

export function getWrongRecordKey(entry) {
  return getEntryKey(entry);
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function getUniqueMeaningCount(entries) {
  return new Set(entries.map((entry) => entry.meaning)).size;
}

export function hasSufficientQuizEntries(entries) {
  return entries.length >= 2 && getUniqueMeaningCount(entries) >= 2;
}

export function getRemainingPracticeEntries(practiceEntries, masteredEntryKeys) {
  return practiceEntries.filter((entry) => !masteredEntryKeys.has(getEntryKey(entry)));
}

export function hasNextRoundAvailable(practiceEntries, masteredEntryKeys) {
  return hasSufficientQuizEntries(getRemainingPracticeEntries(practiceEntries, masteredEntryKeys));
}

export function pickQuestionEntry(entries, lastQuestionKey) {
  let index = Math.floor(Math.random() * entries.length);
  let entry = entries[index];

  while (entries.length > 1 && getEntryKey(entry) === lastQuestionKey) {
    index = Math.floor(Math.random() * entries.length);
    entry = entries[index];
  }

  return entry;
}

export function buildOptionItems(entries, correctEntry) {
  const targetOptionCount = Math.max(2, Math.min(4, getUniqueMeaningCount(entries)));
  const optionItems = [{
    meaning: correctEntry.meaning,
    correct: true,
  }];
  const usedMeanings = new Set([correctEntry.meaning]);

  while (optionItems.length < targetOptionCount) {
    const randomIndex = Math.floor(Math.random() * entries.length);
    const meaning = entries[randomIndex].meaning;
    if (usedMeanings.has(meaning)) {
      continue;
    }

    usedMeanings.add(meaning);
    optionItems.push({
      meaning,
      correct: false,
    });
  }

  return shuffleArray(optionItems);
}

export function buildRoundEntries(availableEntries, carryOverWrongKeys, roundSize) {
  const carryEntries = [];
  const freshEntries = [];

  availableEntries.forEach((entry) => {
    if (carryOverWrongKeys.has(getEntryKey(entry))) {
      carryEntries.push(entry);
      return;
    }

    freshEntries.push(entry);
  });

  shuffleArray(carryEntries);
  shuffleArray(freshEntries);

  const roundEntries = [];
  const selectedKeys = new Set();

  [carryEntries, freshEntries].forEach((collection) => {
    collection.forEach((entry) => {
      const key = getEntryKey(entry);
      if (roundEntries.length >= roundSize || selectedKeys.has(key)) {
        return;
      }

      roundEntries.push(entry);
      selectedKeys.add(key);
    });
  });

  if (getUniqueMeaningCount(roundEntries) >= 2 || roundEntries.length < 2) {
    return roundEntries;
  }

  const fallbackEntry = availableEntries.find((entry) => (
    !selectedKeys.has(getEntryKey(entry)) &&
    entry.meaning !== roundEntries[0].meaning
  ));

  if (!fallbackEntry) {
    return roundEntries;
  }

  if (roundEntries.length < roundSize) {
    roundEntries.push(fallbackEntry);
    return roundEntries;
  }

  roundEntries[roundEntries.length - 1] = fallbackEntry;
  return roundEntries;
}
