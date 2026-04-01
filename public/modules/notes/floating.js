import { applyHeadingLevel as applyHeadingLevelToInput } from './lib/editor.js'
import {
  createEmptyNote,
  getSortedNotes as getSortedNotesFromStorage,
  hydrateNotes as hydrateNotesFromStorage,
  persistNotes as persistNotesToStorage,
  readStoredNotesState,
} from './lib/storage.js'
import { findNoteById as findNoteByIdInTree } from './lib/tree.js'

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

  const initialNotesState = readStoredNotesState(STORAGE_KEY);
  let notes = hydrateNotesFromStorage(initialNotesState.ok ? initialNotesState.notes : []);
  let activeNoteId = resolveInitialNoteId();
  let autosaveTimer = 0;
  let suppressInputSave = false;
  let isPinned = true;
  let storageProtectionActive = !initialNotesState.ok;
  let storageProtectionMessage = buildStorageProtectionMessage(initialNotesState);

  renderPicker();
  applyStorageProtectionState({ announce: storageProtectionActive });
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

    [pinToggleBtn, pinStatusBtn].forEach((button) => {
      button?.addEventListener('click', () => {
        togglePinState();
      });
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
      saveStatus.textContent = isPinned ? '悬浮窗已固定' : '悬浮窗已取消固定';
    } catch (error) {
      console.error(error);
      saveStatus.textContent = '固定状态切换失败';
    }
  }

  function updatePinStateUI(enabled) {
    pinToggleBtn?.classList.toggle('is-active', enabled);
    pinStatusBtn?.classList.toggle('is-active', enabled);
    if (pinStatusLabel) {
      pinStatusLabel.textContent = enabled ? '已固定' : '未固定';
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

  function resolveInitialNoteId() {
    const queryId = Number.parseInt(params.get('noteId') || '', 10);
    if (!Number.isNaN(queryId)) return queryId;

    const storedId = Number.parseInt(localStorage.getItem(ACTIVE_NOTE_KEY) || '', 10);
    if (!Number.isNaN(storedId)) return storedId;

    return null;
  }

  function ensureActiveNote() {
    if (storageProtectionActive) {
      notePicker.value = '';
      noteTitleInput.value = '';
      noteContentInput.value = '';
      saveStatus.textContent = storageProtectionMessage;
      return;
    }

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
    return getSortedNotesFromStorage(list);
  }

  function renderPicker() {
    const flattened = getFlattenedNotes();
    notePicker.innerHTML = '';

    flattened.forEach((item) => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${'  '.repeat(item.depth)}${item.depth > 0 ? '• ' : ''}${item.title}`;
      notePicker.appendChild(option);
    });

    if (activeNoteId && flattened.some((item) => item.id === activeNoteId)) {
      notePicker.value = String(activeNoteId);
    }
  }

  function findNoteById(id, list = notes) {
    return findNoteByIdInTree(id, list);
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
    if (!ensureStorageWritable()) return;
    const shouldSaveCurrent = Boolean(activeNoteId)
      || noteTitleInput.value.trim() !== ''
      || noteContentInput.value.trim() !== '';
    if (shouldSaveCurrent && !saveCurrentNote()) {
      return;
    }

    const previousNotes = cloneNotesSnapshot();
    const previousActiveNoteId = activeNoteId;
    const previousStoredActiveId = localStorage.getItem(ACTIVE_NOTE_KEY);
    const newNote = createEmptyNote();
    notes.unshift(newNote);
    if (!persistCurrentNotes()) {
      notes = previousNotes;
      activeNoteId = previousActiveNoteId;
      restoreActiveNoteStorage(previousStoredActiveId);
      renderPicker();
      if (previousActiveNoteId && findNoteById(previousActiveNoteId)) {
        notePicker.value = String(previousActiveNoteId);
      }
      return;
    }

    activeNoteId = newNote.id;
    localStorage.setItem(ACTIVE_NOTE_KEY, String(newNote.id));
    renderPicker();
    selectNote(newNote.id, { preserveDraft: true });
    saveStatus.textContent = '已创建新笔记';
    saveNoteBtn.classList.add('is-primary');
    noteTitleInput.focus();
  }

  function persistCurrentNotes() {
    try {
      persistNotesToStorage(STORAGE_KEY, notes);
      return true;
    } catch (error) {
      activateStorageProtection('write-error', error);
      return false;
    }
  }

  function syncFromStorage() {
    desktopBridge?.reloadMirroredStorage?.();
    const nextState = readStoredNotesState(STORAGE_KEY);
    if (!nextState.ok) {
      storageProtectionActive = true;
      storageProtectionMessage = buildStorageProtectionMessage(nextState);
      applyStorageProtectionState({ announce: true });
      return;
    }

    storageProtectionActive = false;
    storageProtectionMessage = '';
    applyStorageProtectionState();
    notes = hydrateNotesFromStorage(nextState.notes);
    renderPicker();

    if (activeNoteId && findNoteById(activeNoteId)) {
      selectNote(activeNoteId, { preserveDraft: false });
      return;
    }

    ensureActiveNote();
  }

  function saveCurrentNote(options = {}) {
    if (!ensureStorageWritable()) return null;
    window.clearTimeout(autosaveTimer);

    const previousNotes = cloneNotesSnapshot();
    const previousActiveNoteId = activeNoteId;
    const previousStoredActiveId = localStorage.getItem(ACTIVE_NOTE_KEY);
    let note = activeNoteId ? findNoteById(activeNoteId) : null;
    const isNewNote = !note;
    if (!note) {
      note = createEmptyNote();
      notes.unshift(note);
    }

    note.title = noteTitleInput.value.trim() || '无标题笔记';
    note.content = noteContentInput.value;
    note.lastModified = new Date().toLocaleString();
    note.updatedAt = Date.now();

    if (!persistCurrentNotes()) {
      notes = previousNotes;
      activeNoteId = previousActiveNoteId;
      restoreActiveNoteStorage(previousStoredActiveId);
      renderPicker();
      if (previousActiveNoteId && findNoteById(previousActiveNoteId)) {
        notePicker.value = String(previousActiveNoteId);
      }
      return null;
    }

    if (isNewNote) {
      activeNoteId = note.id;
      localStorage.setItem(ACTIVE_NOTE_KEY, String(note.id));
    }

    renderPicker();
    notePicker.value = String(note.id);
    saveNoteBtn.classList.remove('is-primary');
    saveStatus.textContent = options.announce
      ? `已保存 ${new Date().toLocaleTimeString()}`
      : `自动保存 ${new Date().toLocaleTimeString()}`;
    return note;
  }

  function buildStorageProtectionMessage(result) {
    if (result?.reason === 'write-error') {
      return '检测到笔记写入失败，已进入只读保护，避免继续覆盖现有数据。';
    }

    if (result?.reason === 'parse-error') {
      return '检测到笔记数据损坏，已进入只读保护，避免覆盖现有数据。';
    }

    if (result?.reason === 'invalid-shape') {
      return '检测到笔记数据结构异常，已进入只读保护，避免覆盖现有数据。';
    }

    return '检测到笔记数据异常，已进入只读保护，避免覆盖现有数据。';
  }

  function applyStorageProtectionState(options = {}) {
    const announce = Boolean(options.announce);
    noteTitleInput.readOnly = storageProtectionActive;
    noteContentInput.readOnly = storageProtectionActive;
    newNoteBtn.disabled = storageProtectionActive;
    saveNoteBtn.disabled = storageProtectionActive;

    if (!storageProtectionActive) {
      return;
    }

    saveNoteBtn.classList.remove('is-primary');
    saveStatus.textContent = storageProtectionMessage;
    if (announce) {
      console.warn(storageProtectionMessage);
    }
  }

  function ensureStorageWritable() {
    if (!storageProtectionActive) {
      return true;
    }

    saveStatus.textContent = storageProtectionMessage;
    console.warn(storageProtectionMessage);
    return false;
  }

  function activateStorageProtection(reason, error) {
    storageProtectionActive = true;
    storageProtectionMessage = buildStorageProtectionMessage({ reason });
    applyStorageProtectionState({ announce: true });
    if (error) {
      console.error(error);
    }
  }

  function cloneNotesSnapshot(list = notes) {
    return hydrateNotesFromStorage(list);
  }

  function restoreActiveNoteStorage(storedValue) {
    if (storedValue === null) {
      localStorage.removeItem(ACTIVE_NOTE_KEY);
      return;
    }

    localStorage.setItem(ACTIVE_NOTE_KEY, storedValue);
  }

  function applyHeadingLevel(level) {
    applyHeadingLevelToInput(noteContentInput, level, handleDraftInput);
  }
});
