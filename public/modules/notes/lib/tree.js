function findNoteById(id, list = []) {
  for (const note of list) {
    if (note.id === id) return note;
    if (note.children.length > 0) {
      const found = findNoteById(id, note.children);
      if (found) return found;
    }
  }
  return null;
}

function deleteNoteById(id, list = []) {
  for (let index = 0; index < list.length; index += 1) {
    if (list[index].id === id) {
      list.splice(index, 1);
      return true;
    }

    if (deleteNoteById(id, list[index].children)) {
      return true;
    }
  }

  return false;
}

function noteTreeContainsId(note, id) {
  if (!note || id === null) return false;
  if (note.id === id) return true;
  return note.children.some((child) => noteTreeContainsId(child, id));
}

function expandPathToNote(targetId, list = [], expandedNoteIds = new Set()) {
  for (const note of list) {
    if (note.id === targetId) return true;
    if (note.children.length > 0 && expandPathToNote(targetId, note.children, expandedNoteIds)) {
      expandedNoteIds.add(note.id);
      return true;
    }
  }
  return false;
}

function flattenNotes(list = [], output = []) {
  list.forEach((note) => {
    output.push(note);
    if (note.children.length > 0) {
      flattenNotes(note.children, output);
    }
  });
}

window.findNoteByIdInTree = findNoteById;
window.deleteNoteByIdInTree = deleteNoteById;
window.noteTreeContainsId = noteTreeContainsId;
window.expandPathToNoteInTree = expandPathToNote;
window.flattenNotes = flattenNotes;
