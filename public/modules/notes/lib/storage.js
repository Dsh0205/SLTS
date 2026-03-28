function readStoredNotes(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function createNoteId() {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function hydrateNotes(list) {
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

function persistNotes(storageKey, notes) {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}

function getNoteUpdatedAt(note) {
  if (Number.isFinite(note.updatedAt)) return note.updatedAt;
  return Date.parse(note.lastModified) || 0;
}

function getSortedNotes(list) {
  return [...list].sort((a, b) => getNoteUpdatedAt(b) - getNoteUpdatedAt(a));
}

window.readStoredNotes = readStoredNotes;
window.createNoteId = createNoteId;
window.hydrateNotes = hydrateNotes;
window.persistNotes = persistNotes;
window.getNoteUpdatedAt = getNoteUpdatedAt;
window.getSortedNotes = getSortedNotes;
