export function readStoredNotes(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

export function createNoteId() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

export function hydrateNotes(list) {
  if (!Array.isArray(list)) return [];

  return list.map((note) => ({
    id: note.id || createNoteId(),
    title: typeof note.title === 'string' ? note.title : '',
    content: typeof note.content === 'string' ? note.content : '',
    lastModified: typeof note.lastModified === 'string' ? note.lastModified : '未保存',
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.parse(note.lastModified) || 0,
    children: hydrateNotes(note.children || []),
  }));
}

export function createEmptyNote(overrides = {}) {
  const now = new Date();
  return {
    id: createNoteId(),
    title: '',
    content: '',
    lastModified: now.toLocaleString(),
    updatedAt: now.getTime(),
    children: [],
    ...overrides,
  };
}

export function persistNotes(storageKey, notes) {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}

export function getNoteUpdatedAt(note) {
  if (Number.isFinite(note.updatedAt)) return note.updatedAt;
  return Date.parse(note.lastModified) || 0;
}

export function getSortedNotes(list) {
  return [...list].sort((a, b) => getNoteUpdatedAt(b) - getNoteUpdatedAt(a));
}

window.readStoredNotes = readStoredNotes;
window.createNoteId = createNoteId;
window.hydrateNotes = hydrateNotes;
window.createEmptyNote = createEmptyNote;
window.persistNotes = persistNotes;
window.getNoteUpdatedAt = getNoteUpdatedAt;
window.getSortedNotes = getSortedNotes;
