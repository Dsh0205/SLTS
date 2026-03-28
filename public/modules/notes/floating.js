document.addEventListener('DOMContentLoaded', async () => {
  const STORAGE_KEY = 'shanlic_notes';
  const ACTIVE_NOTE_KEY = 'shanlic_notes_widget_active_id';
  const AUTOSAVE_DELAY = 500;

  const desktopBridge = window.shanlicDesktop || null;
  const params = new URLSearchParams(window.location.search);

  const notePicker = document.getElementById('note-picker');
  const noteTitleInput = document.getElementById('note-title');
  const noteContentInput = document.getElementById('note-content');
  const newNoteBtn = document.getElementById('new-note-btn');
  const closeWidgetBtn = document.getElementById('close-widget-btn');
  const saveNoteBtn = document.getElementById('save-note-btn');
  const saveStatus = document.getElementById('save-status');
  const pinToggleBtn = document.getElementById('pin-toggle-btn');
  const pinStatusBtn = document.getElementById('pin-status-btn');
  const pinStatusLabel = document.getElementById('pin-status-label');

  desktopBridge?.reloadMirroredStorage?.();

  let notes = hydrateNotes(readStoredNotes());
  let activeNoteId = resolveInitialNoteId();
  let autosaveTimer = 0;
  let suppressInputSave = false;
  let isPinned = true;

  renderPicker();
  ensureActiveNote();
  bindEvents();
  await hydratePinState();

  function bindEvents() {
    newNoteBtn.addEventListener('click', createNote);
    closeWidgetBtn.addEventListener('click', () => {
      window.close();
    });
    saveNoteBtn.addEventListener('click', () => {
      saveCurrentNote({ announce: true });
    });

    pinToggleBtn?.addEventListener('click', () => {
      togglePinState();
    });
    pinStatusBtn?.addEventListener('click', () => {
      togglePinState();
    });

    notePicker.addEventListener('change', (event) => {
      const nextId = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(nextId)) return;
      saveCurrentNote();
      selectNote(nextId);
    });

    noteTitleInput.addEventListener('input', handleDraftInput);
    noteContentInput.addEventListener('input', handleDraftInput);

    window.addEventListener('beforeunload', () => {
      window.clearTimeout(autosaveTimer);
      saveCurrentNote();
    });

    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      syncFromStorage();
    });

    document.addEventListener('keydown', (event) => {
      const hasModifier = event.ctrlKey || event.metaKey;
      if (hasModifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveCurrentNote({ announce: true });
        return;
      }

      if (hasModifier && event.key === '1') {
        event.preventDefault();
        applyHeadingLevel(1);
        return;
      }

      if (hasModifier && event.key === '2') {
        event.preventDefault();
        applyHeadingLevel(2);
      }
    });

    if (desktopBridge?.onFloatingNotesSelect) {
      desktopBridge.onFloatingNotesSelect((noteId) => {
        const parsedId = Number.parseInt(String(noteId || ''), 10);
        if (Number.isNaN(parsedId)) return;

        saveCurrentNote();
        syncFromStorage();

        if (findNoteById(parsedId)) {
          selectNote(parsedId, { preserveDraft: false });
        }
      });
    }

    desktopBridge?.onMirroredStorageChanged?.((moduleId) => {
      if (moduleId === 'notes') {
        syncFromStorage();
      }
    });
  }

  async function hydratePinState() {
    if (!desktopBridge?.getFloatingNotesPinState) {
      updatePinStateUI(isPinned);
      return;
    }

    try {
      const result = await desktopBridge.getFloatingNotesPinState();
      isPinned = Boolean(result?.enabled);
    } catch (error) {
      console.error(error);
    }

    updatePinStateUI(isPinned);
  }

  async function togglePinState() {
    const nextPinned = !isPinned;

    if (!desktopBridge?.setFloatingNotesPinState) {
      isPinned = nextPinned;
      updatePinStateUI(isPinned);
      return;
    }

    try {
      const result = await desktopBridge.setFloatingNotesPinState(nextPinned);
      isPinned = Boolean(result?.enabled);
      updatePinStateUI(isPinned);
      saveStatus.textContent = isPinned ? '悬浮窗已固定' : '悬浮窗取消固定';
    } catch (error) {
      console.error(error);
      saveStatus.textContent = '固定状态切换失败';
    }
  }

  function updatePinStateUI(enabled) {
    pinToggleBtn?.classList.toggle('is-active', enabled);
    pinStatusBtn?.classList.toggle('is-active', enabled);
    if (pinStatusLabel) {
      pinStatusLabel.textContent = enabled ? '固定中' : '未固定';
    }
    if (pinToggleBtn) {
      pinToggleBtn.title = enabled ? '点击取消固定' : '点击固定悬浮窗';
    }
  }

  function handleDraftInput() {
    if (suppressInputSave) return;

    saveStatus.textContent = '正在输入...';
    saveNoteBtn.classList.add('is-primary');
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      saveCurrentNote();
    }, AUTOSAVE_DELAY);
  }

  function readStoredNotes() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
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

  function createNoteId() {
    return Date.now() + Math.floor(Math.random() * 10000);
  }

  function resolveInitialNoteId() {
    const queryId = Number.parseInt(params.get('noteId') || '', 10);
    if (!Number.isNaN(queryId)) return queryId;

    const storedId = Number.parseInt(localStorage.getItem(ACTIVE_NOTE_KEY) || '', 10);
    if (!Number.isNaN(storedId)) return storedId;

    return null;
  }

  function ensureActiveNote() {
    if (activeNoteId && findNoteById(activeNoteId)) {
      selectNote(activeNoteId, { preserveDraft: false });
      return;
    }

    const firstNote = getFlattenedNotes()[0];
    if (firstNote) {
      selectNote(firstNote.id, { preserveDraft: false });
      return;
    }

    createNote();
  }

  function getFlattenedNotes() {
    const output = [];

    function walk(list, depth) {
      getSortedNotes(list).forEach((note) => {
        output.push({
          id: note.id,
          title: note.title || '无标题笔记',
          depth,
        });

        if (note.children.length > 0) {
          walk(note.children, depth + 1);
        }
      });
    }

    walk(notes, 0);
    return output;
  }

  function getSortedNotes(list) {
    return [...list].sort((a, b) => getUpdatedAt(b) - getUpdatedAt(a));
  }

  function getUpdatedAt(note) {
    if (Number.isFinite(note.updatedAt)) return note.updatedAt;
    return Date.parse(note.lastModified) || 0;
  }

  function renderPicker() {
    const flattened = getFlattenedNotes();
    notePicker.innerHTML = '';

    flattened.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${'  '.repeat(item.depth)}${item.depth > 0 ? '└ ' : ''}${item.title}`;
      notePicker.appendChild(option);
    });

    if (activeNoteId && flattened.some((item) => item.id === activeNoteId)) {
      notePicker.value = String(activeNoteId);
    }
  }

  function findNoteById(id, list = notes) {
    for (const note of list) {
      if (note.id === id) return note;
      if (note.children.length > 0) {
        const found = findNoteById(id, note.children);
        if (found) return found;
      }
    }
    return null;
  }

  function selectNote(id, options = {}) {
    const note = findNoteById(id);
    if (!note) return;

    activeNoteId = id;
    localStorage.setItem(ACTIVE_NOTE_KEY, String(id));
    renderPicker();
    notePicker.value = String(id);

    suppressInputSave = true;
    noteTitleInput.value = note.title || '';
    noteContentInput.value = note.content || '';
    suppressInputSave = false;

    if (!options.preserveDraft) {
      saveStatus.textContent = `最后修改：${note.lastModified}`;
      saveNoteBtn.classList.remove('is-primary');
    }
  }

  function createNote() {
    saveCurrentNote();

    const now = new Date();
    const newNote = {
      id: createNoteId(),
      title: '',
      content: '',
      lastModified: now.toLocaleString(),
      updatedAt: now.getTime(),
      children: [],
    };

    notes.unshift(newNote);
    persistNotes();
    activeNoteId = newNote.id;
    localStorage.setItem(ACTIVE_NOTE_KEY, String(newNote.id));
    renderPicker();
    selectNote(newNote.id, { preserveDraft: true });
    saveStatus.textContent = '已创建新笔记';
    saveNoteBtn.classList.add('is-primary');
    noteTitleInput.focus();
  }

  function persistNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function syncFromStorage() {
    desktopBridge?.reloadMirroredStorage?.();
    notes = hydrateNotes(readStoredNotes());
    renderPicker();

    if (activeNoteId && findNoteById(activeNoteId)) {
      selectNote(activeNoteId, { preserveDraft: false });
      return;
    }

    ensureActiveNote();
  }

  function saveCurrentNote(options = {}) {
    window.clearTimeout(autosaveTimer);

    let note = activeNoteId ? findNoteById(activeNoteId) : null;
    if (!note) {
      const now = new Date();
      note = {
        id: createNoteId(),
        title: '',
        content: '',
        lastModified: now.toLocaleString(),
        updatedAt: now.getTime(),
        children: [],
      };
      notes.unshift(note);
      activeNoteId = note.id;
      localStorage.setItem(ACTIVE_NOTE_KEY, String(note.id));
    }

    note.title = noteTitleInput.value.trim() || '无标题笔记';
    note.content = noteContentInput.value;
    note.lastModified = new Date().toLocaleString();
    note.updatedAt = Date.now();

    persistNotes();
    renderPicker();
    notePicker.value = String(note.id);
    saveNoteBtn.classList.remove('is-primary');
    saveStatus.textContent = options.announce
      ? `已保存 ${new Date().toLocaleTimeString()}`
      : `自动保存 ${new Date().toLocaleTimeString()}`;
  }

  function applyHeadingLevel(level) {
    noteContentInput.focus();
    replaceLinePrefix(noteContentInput, `${'#'.repeat(level)} `, /^(#{1,6}\s+)/);
    handleDraftInput();
  }

  function replaceLinePrefix(input, prefix, matcher) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
    const lineText = value.slice(lineStart, safeLineEnd);
    const matchedPrefix = matcher ? lineText.match(matcher)?.[0] || '' : '';
    const nextLineText = matchedPrefix ? prefix + lineText.slice(matchedPrefix.length) : prefix + lineText;

    input.value = value.slice(0, lineStart) + nextLineText + value.slice(safeLineEnd);

    const selectionOffset = matcher && matchedPrefix
      ? Math.max(0, start - lineStart - matchedPrefix.length)
      : start - lineStart;
    const nextCursor = lineStart + prefix.length + selectionOffset;

    input.selectionStart = input.selectionEnd = nextCursor;
    input.focus();
  }
});
