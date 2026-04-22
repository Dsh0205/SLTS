export function generateId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function normalizeEntryIdentityPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function getEntryIdentityKey(entry) {
  return normalizeEntryIdentityPart(entry?.word) + "\u0000" + normalizeEntryIdentityPart(entry?.meaning);
}

export function getEntryWordKey(entry) {
  return normalizeEntryIdentityPart(entry?.word);
}

export function createEmptyGroup(name) {
  return {
    id: generateId("group"),
    name,
    entries: [],
  };
}

export function createGroup(groups, name) {
  const group = createEmptyGroup(name);
  groups.push(group);
  return group;
}

export function createNamedGroup(groups, rawName) {
  const name = String(rawName || "").trim();
  if (!name) {
    return { error: "empty", group: null, name: "" };
  }

  const duplicate = groups.some((group) => group.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    return { error: "duplicate", group: null, name };
  }

  return { error: null, group: createGroup(groups, name), name };
}

export function cloneGroup(group) {
  return {
    id: group.id,
    name: group.name,
    entries: group.entries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      meaning: entry.meaning,
    })),
  };
}

export function normalizeEntryArray(entries, label) {
  return entries.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(label + " entry " + (index + 1) + " is invalid.");
    }

    const word = String(item.word || "").trim();
    const meaning = String(item.meaning || "").trim();
    if (!word || !meaning) {
      throw new Error(label + " entry " + (index + 1) + " is missing word or meaning.");
    }

    return {
      id: String(item.id || generateId("entry")),
      word,
      meaning,
    };
  });
}

export function normalizeGroupArray(groups, label) {
  return groups.map((group, index) => {
    if (!group || typeof group !== "object") {
      throw new Error(label + " group item " + (index + 1) + " is invalid.");
    }

    const name = String(group.name || "").trim();
    if (!name) {
      throw new Error(label + " group item " + (index + 1) + " is missing a name.");
    }

    return {
      id: String(group.id || generateId("group")),
      name,
      entries: normalizeEntryArray(group.entries || [], label),
    };
  });
}

export function normalizeImportedModePayload(payload, label, fallbackGroupName) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return [{
      id: generateId("group"),
      name: fallbackGroupName,
      entries: normalizeEntryArray(payload, label),
    }];
  }

  if (Array.isArray(payload.groups)) {
    return normalizeGroupArray(payload.groups, label);
  }

  const words = Array.isArray(payload.words) ? payload.words : [];
  const meanings = Array.isArray(payload.meanings) ? payload.meanings : [];
  const total = Math.min(words.length, meanings.length);
  if (total === 0) {
    return [];
  }

  return [{
    id: generateId("group"),
    name: fallbackGroupName,
    entries: Array.from({ length: total }, (_, index) => ({
      id: generateId("entry"),
      word: String(words[index] || "").trim(),
      meaning: String(meanings[index] || "").trim(),
    })).filter((entry) => entry.word && entry.meaning),
  }];
}

export function hydrateGroupsFromModePayload(payload, defaultGroupName, label) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload.groups)) {
    return normalizeGroupArray(payload.groups, label).map(cloneGroup);
  }

  const words = Array.isArray(payload.words) ? payload.words : [];
  const meanings = Array.isArray(payload.meanings) ? payload.meanings : [];
  const total = Math.min(words.length, meanings.length);
  if (total === 0) {
    return [];
  }

  const group = createEmptyGroup(defaultGroupName);
  for (let index = 0; index < total; index += 1) {
    const word = String(words[index] || "").trim();
    const meaning = String(meanings[index] || "").trim();
    if (word && meaning) {
      group.entries.push({
        id: generateId("entry"),
        word,
        meaning,
      });
    }
  }

  return group.entries.length > 0 ? [group] : [];
}

export function parseImportedWordsText(rawText, options) {
  const {
    importedGroupName,
    englishLabel,
    russianLabel,
  } = options;
  const parsed = JSON.parse(rawText);

  if (Array.isArray(parsed)) {
    return {
      english: normalizeImportedModePayload(parsed, englishLabel, importedGroupName),
      russian: [],
      progress: null,
    };
  }

  if (parsed.wordBanks) {
    return {
      english: normalizeImportedModePayload(parsed.wordBanks.english, englishLabel, importedGroupName),
      russian: normalizeImportedModePayload(parsed.wordBanks.russian, russianLabel, importedGroupName),
      progress: parsed.wordBanks.progress || null,
    };
  }

  if (parsed.english || parsed.russian) {
    return {
      english: normalizeImportedModePayload(parsed.english, englishLabel, importedGroupName),
      russian: normalizeImportedModePayload(parsed.russian, russianLabel, importedGroupName),
      progress: parsed.progress || null,
    };
  }

  const englishWords = Array.isArray(parsed.englishWords) ? parsed.englishWords : null;
  const chineseMeanings = Array.isArray(parsed.chineseMeanings) ? parsed.chineseMeanings : null;

  if (!englishWords || !chineseMeanings || englishWords.length !== chineseMeanings.length) {
    throw new Error("Invalid JSON format. Use grouped data or englishWords/chineseMeanings.");
  }

  return {
    english: [{
      id: generateId("group"),
      name: importedGroupName,
      entries: englishWords.map((word, index) => ({
        id: generateId("entry"),
        word: String(word || "").trim(),
        meaning: String(chineseMeanings[index] || "").trim(),
      })).filter((entry) => entry.word && entry.meaning),
    }],
    russian: [],
    progress: null,
  };
}

export function exportGroups(groups) {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    entries: group.entries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      meaning: entry.meaning,
    })),
  }));
}

export function findGroup(groups, groupId) {
  return groups.find((group) => group.id === groupId) || null;
}

export function pushEntryToGroup(groups, groupId, entry, options = {}) {
  const group = findGroup(groups, groupId);
  if (!group) {
    return { added: false, duplicateEntry: null };
  }

  const matchWordOnly = Boolean(options.matchWordOnly);
  const getKey = matchWordOnly ? getEntryWordKey : getEntryIdentityKey;
  const entryKey = getKey(entry);
  const exists = group.entries.some((item) => getKey(item) === entryKey);
  if (exists) {
    return {
      added: false,
      duplicateEntry: {
        word: String(entry?.word || "").trim(),
        meaning: String(entry?.meaning || "").trim(),
      },
    };
  }

  group.entries.push({
    id: generateId("entry"),
    word: entry.word,
    meaning: entry.meaning,
  });
  return { added: true, duplicateEntry: null };
}

export function addEntriesToGroup(groups, groupId, entries, options = {}) {
  let addedCount = 0;
  const duplicateEntries = [];

  entries.forEach((entry) => {
    const result = pushEntryToGroup(groups, groupId, entry, options);
    if (result.added) {
      addedCount += 1;
      return;
    }

    if (result.duplicateEntry) {
      duplicateEntries.push(result.duplicateEntry);
    }
  });

  return {
    addedCount,
    duplicateEntries,
  };
}

export function removeEntryFromGroup(groups, groupId, entryId) {
  const group = findGroup(groups, groupId);
  if (!group) {
    return { group: null, entry: null, removed: false };
  }

  const index = group.entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    return { group, entry: null, removed: false };
  }

  const [entry] = group.entries.splice(index, 1);
  return { group, entry, removed: true };
}

export function findEntryInGroup(groups, groupId, entryId) {
  const group = findGroup(groups, groupId);
  if (!group) {
    return { group: null, entry: null, index: -1 };
  }

  const index = group.entries.findIndex((entry) => entry.id === entryId);
  return {
    group,
    entry: index === -1 ? null : group.entries[index],
    index,
  };
}

export function removeGroup(groups, groupId) {
  const index = groups.findIndex((group) => group.id === groupId);
  if (index === -1) {
    return { group: null, removed: false };
  }

  const [group] = groups.splice(index, 1);
  return { group, removed: true };
}

export function collectEntriesFromGroups(groups, groupIds) {
  const uniqueEntries = new Map();

  groupIds.forEach((groupId) => {
    const group = findGroup(groups, groupId);
    if (!group) {
      return;
    }

    group.entries.forEach((entry) => {
      const key = getEntryIdentityKey(entry);
      if (!uniqueEntries.has(key)) {
        uniqueEntries.set(key, {
          id: entry.id,
          groupId: group.id,
          groupName: group.name,
          word: entry.word,
          meaning: entry.meaning,
        });
      }
    });
  });

  return Array.from(uniqueEntries.values());
}

export function ensureValidActiveGroupId(groups, currentGroupId) {
  if (groups.length === 0) {
    return "";
  }

  const hasCurrent = groups.some((group) => group.id === currentGroupId);
  return hasCurrent ? currentGroupId : groups[0].id;
}
