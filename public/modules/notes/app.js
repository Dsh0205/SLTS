import { resolveDesktopBridge } from './lib/bridge.js'
import {
  applyHeadingLevel as applyHeadingLevelToInput,
  insertAtCursor as insertAtCursorInInput,
  insertAtLineStart as insertAtLineStartInInput,
  insertAtRange as insertAtRangeInInput,
  replaceLinePrefix as replaceLinePrefixInInput,
} from './lib/editor.js'
import {
  createEmptyNote,
  getSortedNotes as getSortedNotesFromStorage,
  hydrateNotes as hydrateNotesFromStorage,
  persistNotes,
  readStoredNotes,
} from './lib/storage.js'
import {
  deleteNoteById as deleteNoteByIdInTree,
  expandPathToNote as expandPathToNoteInTree,
  findNoteById as findNoteByIdInTree,
  flattenNotes as flattenNotesInTree,
  noteTreeContainsId as noteTreeContainsIdInTree,
} from './lib/tree.js'

document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'shanlic_notes';
  const desktopBridge = resolveDesktopBridge();
  const markedInstance = window.marked;

  let notes = hydrateNotesFromStorage(readStoredNotes(STORAGE_KEY));
  let activeNoteId = null;
  let draftNoteId = null;
  let draftTitle = '';
  let draftContent = '';
  let draftLoaded = false;
  let syncingDraftInputs = false;

  const noteListEl = document.getElementById('note-list');
  const addNoteBtn = document.getElementById('add-note-btn');
  const searchInput = document.getElementById('search-input');
  const lastModifiedEl = document.getElementById('last-modified');
  const logoEl = document.querySelector('.logo');

  const topSideEditorBtn = document.getElementById('side-editor-toggle-btn');
  const topDesktopBtn = document.getElementById('desktop-floating-btn');

  const viewContainer = document.getElementById('view-container');
  const viewTitle = document.getElementById('view-title');
  const viewDate = document.getElementById('view-date');
  const viewContent = document.getElementById('view-content');
  const viewToc = document.querySelector('.view-toc');
  const viewTocList = document.getElementById('view-toc-list');
  const editBtn = document.getElementById('edit-note-btn');
  const importBtn = document.getElementById('import-note-btn');
  const exportBtn = document.getElementById('export-note-btn');
  const importInput = document.getElementById('import-file-input');

  const editorView = document.getElementById('editor-view');
  const editorViewTitle = document.getElementById('editor-view-title');
  const editorStatus = document.getElementById('editor-status');
  const mainTitleInput = document.getElementById('main-note-title');
  const mainContentInput = document.getElementById('main-note-content');
  const saveMainBtn = document.getElementById('save-main-note-btn');
  const submitBtn = document.getElementById('submit-note-btn');
  const backToViewBtn = document.getElementById('back-to-view-btn');

  const contextMenu = document.getElementById('context-menu');
  const deleteOption = document.getElementById('delete-note-option');
  const openOption = document.getElementById('open-note-option');
  const addSubNoteOption = document.getElementById('add-sub-note-option');

  const editorContainer = document.getElementById('editor-container');
  const editorLauncher = document.getElementById('editor-launcher');
  const editorLauncherIcon = editorLauncher?.querySelector('i') ?? null;
  const editorLauncherLabel = editorLauncher?.querySelector('span') ?? null;
  const closeEditorBtn = document.getElementById('close-editor-btn');
  const emptyState = document.getElementById('empty-state');
  const panelOpenMainBtn = document.getElementById('panel-open-main-btn');
  const panelOpenDesktopBtn = document.getElementById('panel-open-desktop-btn');
  const panelSaveBtn = document.getElementById('panel-save-btn');
  const panelTitleInput = document.getElementById('side-note-title');
  const panelContentInput = document.getElementById('side-note-content');
  const panelStatus = document.getElementById('panel-status');

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const selectHeading = document.getElementById('select-heading');
  const btnBold = document.getElementById('btn-bold');
  const btnItalic = document.getElementById('btn-italic');
  const btnStrikethrough = document.getElementById('btn-strikethrough');
  const btnMark = document.getElementById('btn-mark');
  const btnUl = document.getElementById('btn-ul');
  const btnOl = document.getElementById('btn-ol');
  const btnTask = document.getElementById('btn-task');
  const btnAlignLeft = document.getElementById('btn-align-left');
  const btnAlignCenter = document.getElementById('btn-align-center');
  const btnAlignRight = document.getElementById('btn-align-right');
  const btnHr = document.getElementById('btn-hr');
  const btnQuote = document.getElementById('btn-quote');
  const btnCode = document.getElementById('btn-code');
  const btnTable = document.getElementById('btn-table');
  const btnImage = document.getElementById('btn-image');
  const btnVideo = document.getElementById('btn-video');
  const btnFormula = document.getElementById('btn-formula');
  const btnLink = document.getElementById('btn-link');
  const btnDate = document.getElementById('btn-date');
  const btnWidescreen = document.getElementById('btn-widescreen');

  const expandedNoteIds = new Set();
  const handleMainEditorChange = () => handleDraftInput('main');

  marked.setOptions({
    headerIds: true,
    gfm: true,
    breaks: true,
  });

  document.body.classList.toggle('is-desktop-shell', Boolean(desktopBridge?.isElectron));
  if (logoEl instanceof HTMLImageElement) {
    logoEl.src = 'logo.jpg';
  }
  syncLauncherButton();

  renderNoteList();
  showEmptyState();

  addNoteBtn.addEventListener('click', createNote);
  searchInput.addEventListener('input', (event) => renderNoteList(event.target.value));

  topSideEditorBtn.addEventListener('click', toggleSideEditor);
  editorLauncher.addEventListener('click', handleLauncherClick);
  closeEditorBtn.addEventListener('click', () => closeEditorPanel());
  panelOpenMainBtn.addEventListener('click', () => {
    switchToEditorMode();
  });

  [topDesktopBtn, panelOpenDesktopBtn].forEach((button) => {
    if (!button) return;
    button.addEventListener('click', () => {
      openDesktopFloatingEditor();
    });
  });

  panelSaveBtn.addEventListener('click', () => {
    saveCurrentNote({ announce: true });
    alert('笔记已保存。');
  });

  saveMainBtn.addEventListener('click', () => {
    saveCurrentNote({ announce: true });
  });

  submitBtn.addEventListener('click', () => {
    saveCurrentNote({ announce: true });
    alert('笔记已保存。');
  });

  backToViewBtn.addEventListener('click', () => {
    if (hasUnsavedChanges() && !confirmDiscardDraft()) {
      return;
    }

    const note = activeNoteId ? findNoteById(activeNoteId) : null;
    if (note) {
      showViewer(note);
    } else {
      showEmptyState();
    }
  });

  editBtn.addEventListener('click', () => {
    switchToEditorMode();
  });

  exportBtn.addEventListener('click', () => {
    if (!activeNoteId) return;

    if (draftNoteId === activeNoteId && hasUnsavedChanges()) {
      saveCurrentNote({ announce: false });
    }

    const note = findNoteById(activeNoteId);
    if (!note) return;

    const blob = new Blob([note.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${note.title || '无标题笔记'}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => {
    if (activeNoteId) {
      importInput.click();
    }
  });

  importInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (!file || !activeNoteId) return;

    if (!confirm('导入会覆盖当前笔记内容，确定继续吗？')) {
      importInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const note = findNoteById(activeNoteId);
      if (!note) return;

      note.content = String(loadEvent.target.result || '');
      note.lastModified = new Date().toLocaleString();
      note.updatedAt = Date.now();
      saveNotes();

      const latest = findNoteById(activeNoteId);
      renderViewer(latest);

      if (isMainEditorVisible() || isEditorVisible()) {
        loadDraftFromNote(latest, `最后修改时间：${latest.lastModified}`);
      } else {
        updateStatus(`最后修改时间：${latest.lastModified}`);
      }

      renderNoteList(searchInput.value);
      alert('导入成功。');
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  mainTitleInput.addEventListener('input', () => handleDraftInput('main'));
  mainContentInput.addEventListener('input', () => handleDraftInput('main'));
  panelTitleInput.addEventListener('input', () => handleDraftInput('panel'));
  panelContentInput.addEventListener('input', () => handleDraftInput('panel'));

  btnUndo.addEventListener('click', () => {
    mainContentInput.focus();
    document.execCommand('undo');
  });

  btnRedo.addEventListener('click', () => {
    mainContentInput.focus();
    document.execCommand('redo');
  });

  selectHeading.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value) {
      applyHeadingLevel(Number(value.replace('h', '')));
    }
    event.target.value = '';
  });

  btnBold.addEventListener('click', () => insertAtCursor(mainContentInput, '**加粗文本**', 2, -2));
  btnItalic.addEventListener('click', () => insertAtCursor(mainContentInput, '*斜体文本*', 1, -1));
  btnStrikethrough.addEventListener('click', () => insertAtCursor(mainContentInput, '~~删除线文本~~', 2, -2));
  btnMark.addEventListener('click', () => insertAtCursor(mainContentInput, '<mark>高亮文本</mark>', 6, -7));

  btnUl.addEventListener('click', () => insertAtLineStart(mainContentInput, '- '));
  btnOl.addEventListener('click', () => insertAtLineStart(mainContentInput, '1. '));
  btnTask.addEventListener('click', () => insertAtLineStart(mainContentInput, '- [ ] '));

  btnAlignLeft.addEventListener('click', () => insertAtCursor(mainContentInput, '<p align="left">左对齐文本</p>', 16, -4));
  btnAlignCenter.addEventListener('click', () => insertAtCursor(mainContentInput, '<p align="center">居中文本</p>', 18, -4));
  btnAlignRight.addEventListener('click', () => insertAtCursor(mainContentInput, '<p align="right">右对齐文本</p>', 17, -4));
  btnHr.addEventListener('click', () => insertAtCursor(mainContentInput, '\n---\n'));

  btnQuote.addEventListener('click', () => insertAtLineStart(mainContentInput, '> '));
  btnCode.addEventListener('click', () => insertAtCursor(mainContentInput, '\n```\n代码块\n```\n', 5, -5));

  btnTable.addEventListener('click', () => {
    const rowsStr = prompt('请输入表格行数（不包含表头）:', '3');
    if (rowsStr === null) return;

    const colsStr = prompt('请输入表格列数:', '3');
    if (colsStr === null) return;

    const rows = Number.parseInt(rowsStr, 10);
    const cols = Number.parseInt(colsStr, 10);

    if (Number.isNaN(rows) || Number.isNaN(cols) || rows < 1 || cols < 1) {
      alert('请输入有效的行数和列数。');
      return;
    }

    let tableMd = '\n|';
    for (let index = 1; index <= cols; index += 1) {
      tableMd += ` 表头${index} |`;
    }
    tableMd += '\n|';
    for (let index = 0; index < cols; index += 1) {
      tableMd += ' --- |';
    }
    tableMd += '\n';

    for (let row = 0; row < rows; row += 1) {
      tableMd += '|';
      for (let col = 0; col < cols; col += 1) {
        tableMd += ' 内容 |';
      }
      tableMd += '\n';
    }

    tableMd += '\n';
    insertAtCursor(mainContentInput, tableMd);
  });

  btnLink.addEventListener('click', () => insertAtCursor(mainContentInput, '[链接描述](url)', 1, -6));
  btnImage.addEventListener('click', async () => {
    if (!desktopBridge?.pickNoteImage) {
      insertAtCursor(mainContentInput, '![图片描述](url)', 2, -6);
      return;
    }

    const selectionStart = mainContentInput.selectionStart;
    const selectionEnd = mainContentInput.selectionEnd;

    try {
      const result = await desktopBridge.pickNoteImage();
      if (!result || result.canceled || !result.fileUrl) return;
      insertAtRange(mainContentInput, `![图片](${result.fileUrl})`, selectionStart, selectionEnd);
      updateStatus('图片已保存到 notes-assets 文件夹。');
    } catch (error) {
      console.error(error);
      updateStatus('插入图片失败，请稍后重试。');
    }
  });
  btnVideo.addEventListener('click', () => insertAtCursor(mainContentInput, '<video src="视频地址" controls width="100%"></video>', 12, -26));
  btnFormula.addEventListener('click', () => insertAtCursor(mainContentInput, '$$ 公式 $$', 3, -3));
  btnDate.addEventListener('click', () => insertAtCursor(mainContentInput, new Date().toLocaleDateString()));
  btnWidescreen.addEventListener('click', () => {
    document.querySelector('.app-container').classList.toggle('widescreen');
    btnWidescreen.classList.toggle('active');
  });

  mainContentInput.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items || [];
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;

      const selectionStart = mainContentInput.selectionStart;
      const selectionEnd = mainContentInput.selectionEnd;
      event.preventDefault();

      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        const dataUrl = String(loadEvent.target?.result || '');

        if (desktopBridge?.savePastedNoteImage) {
          try {
            const result = await desktopBridge.savePastedNoteImage(dataUrl);
            if (result?.fileUrl) {
              insertAtRange(mainContentInput, `![粘贴图片](${result.fileUrl})`, selectionStart, selectionEnd);
              updateStatus('图片已保存到 notes-assets 文件夹。');
              return;
            }
          } catch (error) {
            console.error(error);
            updateStatus('粘贴图片保存失败，已回退为内嵌图片。');
          }
        }

        insertAtRange(mainContentInput, `![粘贴图片](${dataUrl})`, selectionStart, selectionEnd);
      };
      reader.readAsDataURL(file);
      break;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (isEditorVisible()) {
        event.preventDefault();
        closeEditorPanel();
      }
      return;
    }

    const isModifier = event.ctrlKey || event.metaKey;
    if (!isModifier) return;

    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (key === 's' && isMainEditorVisible()) {
      event.preventDefault();
      saveCurrentNote({ announce: true });
      return;
    }

    if (!isMainEditorVisible()) return;

    if (event.key === '1') {
      event.preventDefault();
      applyHeadingLevel(1);
      return;
    }

    if (event.key === '2') {
      event.preventDefault();
      applyHeadingLevel(2);
    }
  });

  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    syncNotesFromStorage();
  });

  desktopBridge?.onMirroredStorageChanged?.((moduleId) => {
    if (moduleId === 'notes') {
      syncNotesFromStorage();
    }
  });

  deleteOption.addEventListener('click', () => {
    const noteId = Number.parseInt(contextMenu.dataset.noteId || '', 10);
    if (!Number.isNaN(noteId)) {
      deleteNote(noteId);
    }
  });

  openOption.addEventListener('click', () => {
    const noteId = Number.parseInt(contextMenu.dataset.noteId || '', 10);
    if (!Number.isNaN(noteId)) {
      selectNote(noteId);
    }
  });

  addSubNoteOption.addEventListener('click', () => {
    const noteId = Number.parseInt(contextMenu.dataset.noteId || '', 10);
    if (!Number.isNaN(noteId)) {
      createSubNote(noteId);
    }
  });

  function syncLauncherButton() {
    if (!editorLauncher) return;

    if (desktopBridge?.isElectron) {
      editorLauncher.title = '打开悬浮窗口';
      if (editorLauncherIcon) {
        editorLauncherIcon.className = 'fas fa-window-restore';
      }
      if (editorLauncherLabel) {
        editorLauncherLabel.textContent = '悬浮窗口';
      }
      return;
    }

    editorLauncher.title = '打开侧边小窗';
    if (editorLauncherIcon) {
      editorLauncherIcon.className = 'fas fa-note-sticky';
    }
    if (editorLauncherLabel) {
      editorLauncherLabel.textContent = '侧边小窗';
    }
  }

  function handleLauncherClick() {
    if (desktopBridge?.isElectron) {
      openDesktopFloatingEditor();
      return;
    }

    toggleSideEditor();
  }

  function saveNotes() {
    persistNotes(STORAGE_KEY, notes);
  }

  function getSortedNotes(list) {
    return getSortedNotesFromStorage(list);
  }

  function isEditorVisible() {
    return editorContainer.classList.contains('is-open');
  }

  function isMainEditorVisible() {
    return editorView.style.display !== 'none';
  }

  function toggleSideEditor() {
    if (isEditorVisible()) {
      closeEditorPanel();
      return;
    }

    ensureDraftReady();
    openEditorPanel();
  }

  function openEditorPanel() {
    editorContainer.classList.add('is-open');
    editorLauncher.classList.add('is-active');
  }

  function closeEditorPanel(force = false) {
    if (!force && !confirmDiscardDraft()) return false;

    editorContainer.classList.remove('is-open');
    editorLauncher.classList.remove('is-active');
    return true;
  }

  function updateStatus(text) {
    lastModifiedEl.textContent = text;
    editorStatus.textContent = text;
    panelStatus.textContent = text;
  }

  function getDraftStatusText() {
    const note = draftNoteId ? findNoteById(draftNoteId) : null;

    if (note) {
      return hasUnsavedChanges()
        ? `最后修改时间：${note.lastModified} · 当前有未保存修改`
        : `最后修改时间：${note.lastModified}`;
    }

    return hasUnsavedChanges()
      ? '新笔记 · 当前有未保存修改'
      : '新笔记 · 尚未保存';
  }

  function syncDraftInputs() {
    syncingDraftInputs = true;
    mainTitleInput.value = draftTitle;
    mainContentInput.value = draftContent;
    panelTitleInput.value = draftTitle;
    panelContentInput.value = draftContent;
    syncingDraftInputs = false;
    updateStatus(getDraftStatusText());
  }

  function loadDraftFromNote(note, statusText) {
    draftLoaded = true;
    draftNoteId = note?.id ?? null;
    draftTitle = note?.title || '';
    draftContent = note?.content || '';
    editorViewTitle.textContent = note ? `完整编辑 · ${note.title || '无标题笔记'}` : '完整编辑 · 新笔记';
    syncDraftInputs();

    if (statusText) {
      updateStatus(statusText);
    }
  }

  function ensureDraftReady() {
    if (draftLoaded) return;
    const note = activeNoteId ? findNoteById(activeNoteId) : null;
    loadDraftFromNote(note);
  }

  function handleDraftInput(source) {
    if (syncingDraftInputs) return;

    draftLoaded = true;

    if (source === 'main') {
      draftTitle = mainTitleInput.value;
      draftContent = mainContentInput.value;
    } else {
      draftTitle = panelTitleInput.value;
      draftContent = panelContentInput.value;
    }

    syncDraftInputs();
  }

  function hasUnsavedChanges() {
    if (!draftLoaded) return false;

    const note = draftNoteId ? findNoteById(draftNoteId) : null;

    if (!note) {
      return draftTitle.trim() !== '' || draftContent !== '';
    }

    return draftTitle !== (note.title || '') || draftContent !== (note.content || '');
  }

  function confirmDiscardDraft() {
    if (!hasUnsavedChanges()) return true;
    return confirm('当前内容还没有保存，确定继续吗？');
  }

  function showEmptyState() {
    viewContainer.style.display = 'none';
    editorView.style.display = 'none';
    emptyState.style.display = 'flex';
    lastModifiedEl.textContent = '最后修改时间：-';
  }

  function renderViewer(note) {
    if (!note) {
      showEmptyState();
      return;
    }

    viewTitle.textContent = note.title || '无标题笔记';
    viewDate.textContent = `最后修改：${note.lastModified}`;
    viewContent.innerHTML = marked.parse(note.content || '');
    generateViewTOC();
  }

  function showViewer(note) {
    if (!note) {
      showEmptyState();
      return;
    }

    renderViewer(note);
    viewContainer.style.display = 'flex';
    editorView.style.display = 'none';
    emptyState.style.display = 'none';
    updateStatus(`最后修改时间：${note.lastModified}`);
  }

  function showMainEditor(note, statusText) {
    loadDraftFromNote(note, statusText);
    editorView.style.display = 'flex';
    viewContainer.style.display = 'none';
    emptyState.style.display = 'none';
    mainTitleInput.focus();
  }

  function findNoteById(id, list = notes) {
    return findNoteByIdInTree(id, list);
  }

  function deleteNoteById(id, list = notes) {
    return deleteNoteByIdInTree(id, list);
  }

  function noteTreeContainsId(note, id) {
    return noteTreeContainsIdInTree(note, id);
  }

  function expandPathToNote(targetId, list = notes) {
    return expandPathToNoteInTree(targetId, list, expandedNoteIds);
  }

  function createNote() {
    if (!confirmDiscardDraft()) return;

    activeNoteId = null;
    showMainEditor(null, '新笔记 · 尚未保存');
    renderNoteList(searchInput.value);
  }

  function createSubNote(parentId) {
    if (!confirmDiscardDraft()) return;

    const parent = findNoteById(parentId);
    if (!parent) return;

    const newNote = createEmptyNote();

    parent.children.push(newNote);
    expandedNoteIds.add(parentId);
    activeNoteId = newNote.id;
    saveNotes();

    renderNoteList(searchInput.value);
    showMainEditor(newNote, '新建子笔记 · 尚未保存');
    animateActiveNote(newNote.id);
  }

  function renderNoteList(searchQuery = '') {
    noteListEl.innerHTML = '';
    const keyword = searchQuery.trim().toLowerCase();

    if (keyword) {
      const flattened = [];
      flattenNotes(notes, flattened);

      getSortedNotes(
        flattened.filter((note) => {
          const title = (note.title || '').toLowerCase();
          const content = (note.content || '').toLowerCase();
          return title.includes(keyword) || content.includes(keyword);
        }),
      ).forEach((note) => {
        noteListEl.appendChild(createNoteRow(note));
      });
      return;
    }

    getSortedNotes(notes).forEach((note) => {
      noteListEl.appendChild(createNoteTree(note));
    });
  }

  function flattenNotes(list, output) {
    flattenNotesInTree(list, output);
  }

  function createNoteTree(note) {
    const wrapper = document.createElement('div');
    wrapper.className = 'note-tree-item';

    const row = createNoteRow(note, note.children.length > 0, expandedNoteIds.has(note.id));
    wrapper.appendChild(row);

    if (note.children.length > 0 && expandedNoteIds.has(note.id)) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'note-children expanded';
      getSortedNotes(note.children).forEach((child) => {
        childrenContainer.appendChild(createNoteTree(child));
      });
      wrapper.appendChild(childrenContainer);
    }

    return wrapper;
  }

  function createNoteRow(note, hasChildren = false, isExpanded = false) {
    const row = document.createElement('div');
    row.className = `note-item ${activeNoteId === note.id ? 'active' : ''}`;
    row.dataset.id = String(note.id);

    const content = document.createElement('div');
    content.className = 'note-item-content';

    if (hasChildren) {
      const toggle = document.createElement('i');
      toggle.className = `fas fa-caret-right toggle-icon ${isExpanded ? 'expanded' : ''}`;
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (expandedNoteIds.has(note.id)) {
          expandedNoteIds.delete(note.id);
        } else {
          expandedNoteIds.add(note.id);
        }
        renderNoteList(searchInput.value);
      });
      content.appendChild(toggle);
    } else {
      const icon = document.createElement('i');
      icon.className = 'fas fa-file-alt note-icon';
      content.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'note-info-wrapper';

    const title = document.createElement('div');
    title.className = 'note-item-title';
    title.textContent = note.title || '无标题笔记';

    const date = document.createElement('div');
    date.className = 'note-item-date';
    date.textContent = note.lastModified;

    info.appendChild(title);
    info.appendChild(date);
    content.appendChild(info);
    row.appendChild(content);

    row.addEventListener('click', () => selectNote(note.id));
    row.addEventListener('contextmenu', (event) => showContextMenu(event, note.id));

    return row;
  }

  function selectNote(id) {
    if (activeNoteId !== id && !confirmDiscardDraft()) return;

    const note = findNoteById(id);
    if (!note) return;

    activeNoteId = id;
    expandPathToNote(id);
    renderViewer(note);

    if (isMainEditorVisible() || isEditorVisible()) {
      loadDraftFromNote(note, `最后修改时间：${note.lastModified}`);
    } else {
      updateStatus(`最后修改时间：${note.lastModified}`);
    }

    if (!isMainEditorVisible()) {
      showViewer(note);
    }

    renderNoteList(searchInput.value);
    animateActiveNote(id);
  }

  function animateActiveNote(id) {
    const activeNoteEl = noteListEl.querySelector(`.note-item[data-id="${id}"]`);
    if (!activeNoteEl) return;

    activeNoteEl.classList.remove('highlight-anim');
    void activeNoteEl.offsetWidth;
    activeNoteEl.classList.add('highlight-anim');

    window.setTimeout(() => {
      activeNoteEl.classList.remove('highlight-anim');
    }, 2000);
  }

  function switchToEditorMode() {
    const note = activeNoteId ? findNoteById(activeNoteId) : null;
    showMainEditor(note, note ? `最后修改时间：${note.lastModified}` : '新笔记 · 尚未保存');
  }

  function saveCurrentNote(options = {}) {
    ensureDraftReady();

    const title = draftTitle.trim() || '无标题笔记';
    const content = draftContent;
    const now = new Date();
    let noteIdToSelect = draftNoteId;

    if (draftNoteId) {
      const note = findNoteById(draftNoteId);
      if (!note) return null;

      note.title = title;
      note.content = content;
      note.lastModified = now.toLocaleString();
      note.updatedAt = now.getTime();
    } else {
      const newNote = createEmptyNote({
        title,
        content,
        lastModified: now.toLocaleString(),
        updatedAt: now.getTime(),
      });
      notes.unshift(newNote);
      noteIdToSelect = newNote.id;
    }

    activeNoteId = noteIdToSelect;
    draftNoteId = noteIdToSelect;
    draftTitle = title;
    draftContent = content;

    saveNotes();

    const savedNote = findNoteById(noteIdToSelect);
    renderViewer(savedNote);
    loadDraftFromNote(savedNote, options.announce ? `已保存：${savedNote.lastModified}` : `最后修改时间：${savedNote.lastModified}`);
    renderNoteList(searchInput.value);
    animateActiveNote(noteIdToSelect);

    if (!isMainEditorVisible()) {
      showViewer(savedNote);
    }

    return savedNote;
  }

  function deleteNote(id) {
    const target = findNoteById(id);
    if (!target) return;

    if (!confirm('确定要删除这篇笔记及其子笔记吗？')) return;

    const removedActive = noteTreeContainsId(target, activeNoteId);
    deleteNoteById(id);
    saveNotes();
    expandedNoteIds.delete(id);

    if (removedActive) {
      activeNoteId = null;
      draftNoteId = null;
      draftTitle = '';
      draftContent = '';
      draftLoaded = false;
      closeEditorPanel(true);
      showEmptyState();
    }

    renderNoteList(searchInput.value);
  }

  function showContextMenu(event, id) {
    event.preventDefault();
    event.stopPropagation();

    contextMenu.style.display = 'block';

    const left = Math.min(event.pageX, window.innerWidth - contextMenu.offsetWidth - 12);
    const top = Math.min(event.pageY, window.innerHeight - contextMenu.offsetHeight - 12);

    contextMenu.style.left = `${Math.max(12, left)}px`;
    contextMenu.style.top = `${Math.max(12, top)}px`;
    contextMenu.dataset.noteId = String(id);
  }

  function generateViewTOC() {
    viewTocList.innerHTML = '';
    const headings = viewContent.querySelectorAll('h1, h2, h3, h4, h5, h6');

    if (headings.length === 0) {
      viewToc.classList.add('hidden');
      return;
    }

    viewToc.classList.remove('hidden');

    headings.forEach((heading, index) => {
      if (!heading.id) {
        heading.id = createHeadingId(heading.textContent || `section-${index}`, index);
      }

      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = `#${heading.id}`;
      anchor.textContent = heading.textContent || `标题 ${index + 1}`;
      anchor.className = `toc-h${heading.tagName.substring(1)}`;
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' });
      });

      li.appendChild(anchor);
      viewTocList.appendChild(li);
    });
  }

  function createHeadingId(text, index) {
    const normalized = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-');

    return `${normalized || 'heading'}-${index}`;
  }

  function syncNotesFromStorage() {
    desktopBridge?.reloadMirroredStorage?.();

    try {
      notes = hydrateNotesFromStorage(readStoredNotes(STORAGE_KEY));
    } catch {
      notes = [];
    }

    if (activeNoteId) {
      const note = findNoteById(activeNoteId);
      if (note) {
        renderViewer(note);

        if (!hasUnsavedChanges()) {
          loadDraftFromNote(note, `最后修改时间：${note.lastModified}`);
        }

        if (!isMainEditorVisible()) {
          showViewer(note);
        }
      } else {
        activeNoteId = null;
        draftNoteId = null;
        draftTitle = '';
        draftContent = '';
        draftLoaded = false;
        closeEditorPanel(true);
        showEmptyState();
      }
    } else if (notes.length === 0) {
      showEmptyState();
    }

    renderNoteList(searchInput.value);
  }

  function openDesktopFloatingEditor() {
    if (!desktopBridge?.openFloatingNotesWindow) return false;

    const latest = hasUnsavedChanges() ? saveCurrentNote({ announce: false }) : (activeNoteId ? findNoteById(activeNoteId) : null);
    desktopBridge.openFloatingNotesWindow(latest?.id ?? activeNoteId ?? null);
    return true;
  }

  function applyHeadingLevel(level) {
    applyHeadingLevelToInput(mainContentInput, level, handleMainEditorChange);
  }

  function insertAtLineStart(input, text) {
    insertAtLineStartInInput(input, text, handleMainEditorChange);
  }

  function replaceLinePrefix(input, prefix, matcher) {
    replaceLinePrefixInInput(input, prefix, matcher, handleMainEditorChange);
  }

  function insertAtRange(input, text, start, end) {
    insertAtRangeInInput(input, text, start, end, handleMainEditorChange);
  }

  function insertAtCursor(input, text, selectStartOffset = 0, selectEndOffset = 0) {
    insertAtCursorInInput(input, text, selectStartOffset, selectEndOffset, handleMainEditorChange);
  }
});
