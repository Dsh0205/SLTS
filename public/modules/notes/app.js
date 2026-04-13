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
  readStoredNotesState,
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

  const initialNotesState = readStoredNotesState(STORAGE_KEY);
  let notes = hydrateNotesFromStorage(initialNotesState.ok ? initialNotesState.notes : []);
  let activeNoteId = null;
  let draftNoteId = null;
  let draftTitle = '';
  let draftContent = '';
  let draftLoaded = false;
  let syncingDraftInputs = false;
  let storageProtectionActive = !initialNotesState.ok;
  let storageProtectionMessage = buildStorageProtectionMessage(initialNotesState);

  const noteListEl = document.getElementById('note-list');
  const addNoteBtn = document.getElementById('add-note-btn');
  const sidebarSearchInput = document.getElementById('sidebar-search-input');
  const topSearchInput = document.getElementById('search-input');
  const searchInputs = [sidebarSearchInput, topSearchInput].filter((input) => input instanceof HTMLInputElement);
  const lastModifiedEl = document.getElementById('last-modified');
  const logoEl = document.querySelector('.logo');

  const noteMenu = document.getElementById('note-menu');
  const noteMenuBtn = document.getElementById('note-menu-btn');
  const noteMenuPanel = document.getElementById('note-menu-panel');
  const topSideEditorBtn = document.getElementById('note-menu-side-panel-btn');
  const topDesktopBtn = document.getElementById('note-menu-desktop-btn');
  const inlineDesktopBtn = null;

  const viewContainer = document.getElementById('view-container');
  const viewTitle = document.getElementById('view-title');
  const viewDate = document.getElementById('view-date');
  const viewContent = document.getElementById('view-content');
  const viewBody = viewContainer?.querySelector('.view-body') ?? null;
  const viewToc = document.querySelector('.view-toc');
  const viewTocList = document.getElementById('view-toc-list');
  const saveMenuBtn = document.getElementById('note-menu-save-btn');
  const editBtn = document.getElementById('note-menu-edit-btn');
  const importBtn = document.getElementById('note-menu-import-btn');
  const exportBtn = document.getElementById('note-menu-export-btn');

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
  const panelSaveBtn = document.getElementById('panel-save-btn');
  const panelTitleInput = document.getElementById('side-note-title');
  const panelContentInput = document.getElementById('side-note-content');
  const panelStatus = document.getElementById('panel-status');
  const toast = document.getElementById('notes-toast');
  const noteImageLightbox = document.getElementById('note-image-lightbox');
  const noteImageLightboxImage = document.getElementById('note-image-lightbox-image');
  const noteImageLightboxCaption = document.getElementById('note-image-lightbox-caption');
  const noteImageLightboxCloseBtn = document.getElementById('note-image-lightbox-close-btn');

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
  const collapsedNoteImageKeys = new Set();
  const handleMainEditorChange = () => handleDraftInput('main');
  let toastTimer = 0;
  let activeTocHeadingId = '';

  marked.setOptions({
    headerIds: true,
    gfm: true,
    breaks: true,
  });

  function getVisibleSearchInput() {
    return searchInputs.find((input) => input.offsetParent !== null) ?? searchInputs[0] ?? null;
  }

  function getSearchQuery() {
    return getVisibleSearchInput()?.value ?? searchInputs[0]?.value ?? '';
  }

  function syncSearchInputs(value, source = null) {
    searchInputs.forEach((input) => {
      if (input !== source) {
        input.value = value;
      }
    });
  }

  document.body.classList.toggle('is-desktop-shell', Boolean(desktopBridge?.isElectron));
  if (logoEl instanceof HTMLImageElement) {
    logoEl.src = 'logo.jpg';
  }
  syncLauncherButton();
  applyStorageProtectionState();

  renderNoteList();
  showEmptyState();
  applyStorageProtectionState({ announce: storageProtectionActive });

  addNoteBtn.addEventListener('click', createNote);
  searchInputs.forEach((input) => {
    input.addEventListener('input', (event) => {
      const nextValue = event.target.value;
      syncSearchInputs(nextValue, event.target);
      renderNoteList(nextValue);
    });
  });
  viewBody?.addEventListener('scroll', syncActiveTocHeading, { passive: true });
  window.addEventListener('resize', syncActiveTocHeading);
  noteImageLightboxCloseBtn?.addEventListener('click', closeNoteImageLightbox);
  noteImageLightbox?.addEventListener('click', (event) => {
    if (event.target === noteImageLightbox) {
      closeNoteImageLightbox();
    }
  });

  noteMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNoteMenu();
  });
  noteMenuPanel?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  topSideEditorBtn?.addEventListener('click', () => {
    closeNoteMenu();
    toggleSideEditor();
  });
  editorLauncher?.addEventListener('click', handleLauncherClick);
  closeEditorBtn.addEventListener('click', () => closeEditorPanel());
  panelOpenMainBtn.addEventListener('click', () => {
    closeNoteMenu();
    switchToEditorMode();
  });

  topDesktopBtn?.addEventListener('click', () => {
    closeNoteMenu();
    openDesktopFloatingEditor();
  });
  inlineDesktopBtn?.addEventListener('click', () => {
    closeNoteMenu();
    openDesktopFloatingEditor();
  });
  saveMenuBtn?.addEventListener('click', () => {
    closeNoteMenu();
    if (isMainEditorVisible()) {
      saveAndShowViewer('main');
      return;
    }
    if (isEditorVisible()) {
      saveAndShowViewer('panel');
    }
  });

  panelSaveBtn.addEventListener('click', () => {
    saveAndShowViewer('panel');
  });

  saveMainBtn.addEventListener('click', () => {
    saveAndShowViewer('main');
  });

  submitBtn.addEventListener('click', () => {
    saveAndShowViewer('main');
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
    closeNoteMenu();
    switchToEditorMode();
  });

  exportBtn.addEventListener('click', () => {
    closeNoteMenu();
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

  importBtn?.addEventListener('click', async () => {
    closeNoteMenu();
    await exportActiveNoteAsJpg();
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
      if (!noteImageLightbox?.hidden) {
        event.preventDefault();
        closeNoteImageLightbox();
        return;
      }

      if (isNoteMenuOpen()) {
        event.preventDefault();
        closeNoteMenu();
        return;
      }

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
      getVisibleSearchInput()?.focus();
      getVisibleSearchInput()?.select();
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

  document.addEventListener('click', (event) => {
    contextMenu.style.display = 'none';

    if (noteMenu && event.target instanceof Node && !noteMenu.contains(event.target)) {
      closeNoteMenu();
    }
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

  function isNoteMenuOpen() {
    return noteMenu?.classList.contains('is-open') ?? false;
  }

  function openNoteMenu() {
    if (!noteMenu || !noteMenuBtn || !noteMenuPanel || noteMenuBtn.disabled) return;

    noteMenu.classList.add('is-open');
    noteMenuPanel.hidden = false;
    noteMenuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeNoteMenu() {
    if (!noteMenu || !noteMenuBtn || !noteMenuPanel) return;

    noteMenu.classList.remove('is-open');
    noteMenuPanel.hidden = true;
    noteMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleNoteMenu() {
    if (isNoteMenuOpen()) {
      closeNoteMenu();
      return;
    }

    openNoteMenu();
  }

  function syncNoteMenuState() {
    if (!noteMenuBtn) return;

    const activeNote = activeNoteId ? findNoteById(activeNoteId) : null;
    const canSaveFromMenu = !storageProtectionActive && (isMainEditorVisible() || isEditorVisible());

    if (saveMenuBtn) {
      saveMenuBtn.disabled = !canSaveFromMenu;
    }

    if (editBtn) {
      editBtn.disabled = storageProtectionActive;
    }

    if (importBtn) {
      importBtn.hidden = !desktopBridge?.isElectron;
      importBtn.disabled = !desktopBridge?.isElectron || !activeNote;
    }

    if (exportBtn) {
      exportBtn.disabled = !activeNote;
    }

    if (topSideEditorBtn) {
      topSideEditorBtn.disabled = storageProtectionActive;
    }

    if (topDesktopBtn) {
      topDesktopBtn.hidden = !desktopBridge?.isElectron;
      topDesktopBtn.disabled = storageProtectionActive || !desktopBridge?.isElectron;
    }

    const visibleButtons = [saveMenuBtn, editBtn, importBtn, exportBtn, topSideEditorBtn, topDesktopBtn]
      .filter((button) => button && !button.hidden);
    const hasEnabledAction = visibleButtons.some((button) => !button.disabled);

    noteMenuBtn.disabled = !hasEnabledAction;

    if (!hasEnabledAction) {
      closeNoteMenu();
    }
  }

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

  async function handleLauncherClick() {
    if (desktopBridge?.isElectron) {
      await openDesktopFloatingEditor();
      return;
    }

    toggleSideEditor();
  }

  function saveNotes() {
    if (!ensureStorageWritable()) return false;
    try {
      persistNotes(STORAGE_KEY, notes);
      return true;
    } catch (error) {
      activateStorageProtection('write-error', error);
      return false;
    }
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
    editorLauncher?.classList.add('is-active');
  }

  function closeEditorPanel(force = false) {
    if (!force && !confirmDiscardDraft()) return false;

    editorContainer.classList.remove('is-open');
    editorLauncher?.classList.remove('is-active');
    return true;
  }

  function updateStatus(text) {
    lastModifiedEl.textContent = text;
    editorStatus.textContent = text;
    panelStatus.textContent = text;
  }

  function showToast(text) {
    if (!toast) return;

    toast.textContent = text;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }

  function enhanceRenderedNoteImages(note) {
    const renderedImages = Array.from(viewContent.querySelectorAll('img'))
      .filter((image) => !image.closest('.note-inline-figure'));

    renderedImages.forEach((image, index) => {
      const source = image.getAttribute('src') || image.currentSrc || '';
      const imageName = getNoteImageDisplayName(source, image.getAttribute('alt'));
      const imageKey = createNoteImageStateKey(note?.id ?? 'draft', source, index);

      const wrapper = document.createElement('span');
      wrapper.className = 'note-inline-figure';
      wrapper.dataset.imageKey = imageKey;

      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'note-inline-preview';
      previewButton.dataset.imageSource = source;
      previewButton.dataset.imageName = imageName;
      previewButton.setAttribute('aria-label', `放大查看 ${imageName}`);
      previewButton.addEventListener('click', () => {
        openNoteImageLightbox(source, imageName, image.alt || imageName);
      });

      image.classList.add('note-inline-image');
      image.dataset.noteImageEnhanced = 'true';
      image.alt = image.alt || imageName;
      image.replaceWith(wrapper);
      previewButton.appendChild(image);

      const meta = document.createElement('span');
      meta.className = 'note-inline-meta';

      const name = document.createElement('span');
      name.className = 'note-inline-name';
      name.textContent = imageName;

      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'note-inline-toggle';
      toggleButton.addEventListener('click', () => {
        const collapsed = !wrapper.classList.contains('is-collapsed');
        updateCollapsedNoteImageState(imageKey, collapsed);
        applyNoteImageCollapsedState(wrapper, collapsed);
      });

      meta.append(name, toggleButton);
      wrapper.append(previewButton, meta);
      applyNoteImageCollapsedState(wrapper, collapsedNoteImageKeys.has(imageKey));
    });
  }

  function applyNoteImageCollapsedState(wrapper, collapsed) {
    const previewButton = wrapper?.querySelector('.note-inline-preview');
    const toggleButton = wrapper?.querySelector('.note-inline-toggle');
    if (!(previewButton instanceof HTMLButtonElement) || !(toggleButton instanceof HTMLButtonElement)) return;

    wrapper.classList.toggle('is-collapsed', collapsed);
    previewButton.hidden = collapsed;
    previewButton.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    toggleButton.textContent = collapsed ? '展开图片' : '收起图片';
    toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function updateCollapsedNoteImageState(imageKey, collapsed) {
    if (!imageKey) return;
    if (collapsed) {
      collapsedNoteImageKeys.add(imageKey);
      return;
    }

    collapsedNoteImageKeys.delete(imageKey);
  }

  function openNoteImageLightbox(source, imageName, altText = imageName) {
    if (!noteImageLightbox || !noteImageLightboxImage || !noteImageLightboxCaption) return;

    noteImageLightboxImage.src = source;
    noteImageLightboxImage.alt = altText || imageName;
    noteImageLightboxCaption.textContent = imageName;
    noteImageLightbox.hidden = false;
  }

  function closeNoteImageLightbox() {
    if (!noteImageLightbox || !noteImageLightboxImage || !noteImageLightboxCaption) return;

    noteImageLightbox.hidden = true;
    noteImageLightboxImage.src = '';
    noteImageLightboxCaption.textContent = '';
  }

  function createNoteImageStateKey(noteId, source, index) {
    return `${noteId || 'draft'}::${source || 'image'}::${index}`;
  }

  function getNoteImageDisplayName(source, fallbackText = '') {
    const fromPath = extractNoteImageNameFromSource(source);
    if (fromPath) return fromPath;

    const fallback = String(fallbackText || '').trim();
    return fallback || '图片';
  }

  function extractNoteImageNameFromSource(source) {
    const raw = String(source || '').trim();
    if (!raw) return '';

    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:image\/([a-z0-9.+-]+)/i);
      if (!match) return '内嵌图片';
      const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      return `内嵌图片.${extension}`;
    }

    try {
      const url = new URL(raw, window.location.href);
      const segments = decodeURIComponent(url.pathname || '')
        .split('/')
        .filter(Boolean);
      return segments.at(-1) || '';
    } catch {
      const segments = decodeURIComponent(raw)
        .split(/[\\/]/)
        .filter(Boolean);
      return segments.at(-1) || '';
    }
  }

  function focusEditorField(source) {
    const target = source === 'panel' ? panelContentInput : mainContentInput;
    if (!(target instanceof HTMLElement)) return;

    window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (target instanceof HTMLTextAreaElement) {
        const end = target.value.length;
        target.setSelectionRange(end, end);
      }
    });
  }

  function saveAndKeepEditing(source) {
    const savedNote = saveCurrentNote({ announce: true });
    if (!savedNote) return;

    showToast('笔记已保存。');
    focusEditorField(source);
  }

  function saveAndShowViewer(source) {
    const savedNote = saveCurrentNote({ announce: true });
    if (!savedNote) return;

    showToast('笔记已保存。');

    if (source === 'panel') {
      closeEditorPanel(true);
    }

    showViewer(savedNote);
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

  function syncDraftInputs(excludeSource = null) {
    syncingDraftInputs = true;
    if (excludeSource !== 'main') {
      mainTitleInput.value = draftTitle;
      mainContentInput.value = draftContent;
    }
    if (excludeSource !== 'panel') {
      panelTitleInput.value = draftTitle;
      panelContentInput.value = draftContent;
    }
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

    syncDraftInputs(source);
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
    activeTocHeadingId = '';
    closeNoteImageLightbox();
    viewToc.classList.add('hidden');
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

    closeNoteImageLightbox();
    viewTitle.textContent = note.title || '无标题笔记';
    viewDate.textContent = `最后修改：${note.lastModified}`;
    viewContent.innerHTML = marked.parse(note.content || '');
    enhanceRenderedNoteImages(note);
    if (viewBody) {
      viewBody.scrollTop = 0;
    }
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
    closeNoteImageLightbox();
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
    if (!ensureStorageWritable()) return;
    if (!confirmDiscardDraft()) return;

    activeNoteId = null;
    showMainEditor(null, '新笔记 · 尚未保存');
    renderNoteList(getSearchQuery());
  }

  function createSubNote(parentId) {
    if (!ensureStorageWritable()) return;
    if (!confirmDiscardDraft()) return;

    const parent = findNoteById(parentId);
    if (!parent) return;

    const previousNotes = cloneNotesSnapshot();
    const previousExpandedIds = new Set(expandedNoteIds);
    const previousActiveNoteId = activeNoteId;
    const newNote = createEmptyNote();

    parent.children.push(newNote);
    expandedNoteIds.add(parentId);
    activeNoteId = newNote.id;
    if (!saveNotes()) {
      notes = previousNotes;
      expandedNoteIds.clear();
      previousExpandedIds.forEach((noteId) => expandedNoteIds.add(noteId));
      activeNoteId = previousActiveNoteId;
      return;
    }

    renderNoteList(getSearchQuery());
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
      syncNoteMenuState();
      return;
    }

    getSortedNotes(notes).forEach((note) => {
      noteListEl.appendChild(createNoteTree(note, 0));
    });
    syncNoteMenuState();
  }

  function flattenNotes(list, output) {
    flattenNotesInTree(list, output);
  }

  function createNoteTree(note, depth = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'note-tree-item';

    const row = createNoteRow(note, note.children.length > 0, expandedNoteIds.has(note.id), depth);
    wrapper.appendChild(row);

    if (note.children.length > 0 && expandedNoteIds.has(note.id)) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'note-children expanded';
      getSortedNotes(note.children).forEach((child) => {
        childrenContainer.appendChild(createNoteTree(child, depth + 1));
      });
      wrapper.appendChild(childrenContainer);
    }

    return wrapper;
  }

  function createNoteRow(note, hasChildren = false, isExpanded = false, depth = 0) {
    const row = document.createElement('div');
    row.className = `note-item ${activeNoteId === note.id ? 'active' : ''}`;
    row.dataset.id = String(note.id);
    row.dataset.depth = String(depth);

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
        renderNoteList(getSearchQuery());
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

    renderNoteList(getSearchQuery());
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
    if (!ensureStorageWritable()) return;
    const note = activeNoteId ? findNoteById(activeNoteId) : null;
    showMainEditor(note, note ? `最后修改时间：${note.lastModified}` : '新笔记 · 尚未保存');
  }

  function saveCurrentNote(options = {}) {
    if (!ensureStorageWritable()) return null;
    ensureDraftReady();

    const title = draftTitle.trim() || '无标题笔记';
    const content = draftContent;
    const now = new Date();
    const previousNotes = cloneNotesSnapshot();
    const previousActiveNoteId = activeNoteId;
    const previousDraftNoteId = draftNoteId;
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

    if (!saveNotes()) {
      notes = previousNotes;
      activeNoteId = previousActiveNoteId;
      draftNoteId = previousDraftNoteId;
      draftLoaded = true;
      syncDraftInputs();
      applyStorageProtectionState();
      return null;
    }

    const savedNote = findNoteById(noteIdToSelect);
    renderViewer(savedNote);
    loadDraftFromNote(savedNote, options.announce ? `已保存：${savedNote.lastModified}` : `最后修改时间：${savedNote.lastModified}`);
    renderNoteList(getSearchQuery());
    animateActiveNote(noteIdToSelect);

    if (!isMainEditorVisible()) {
      showViewer(savedNote);
    }

    return savedNote;
  }

  function deleteNote(id) {
    if (!ensureStorageWritable()) return;
    const target = findNoteById(id);
    if (!target) return;

    if (!confirm('确定要删除这篇笔记及其子笔记吗？')) return;

    const previousNotes = cloneNotesSnapshot();
    const previousExpandedIds = new Set(expandedNoteIds);
    const previousActiveNoteId = activeNoteId;
    const previousDraftNoteId = draftNoteId;
    const previousDraftTitle = draftTitle;
    const previousDraftContent = draftContent;
    const previousDraftLoaded = draftLoaded;
    const removedActive = noteTreeContainsId(target, activeNoteId);
    deleteNoteById(id);
    if (!saveNotes()) {
      notes = previousNotes;
      expandedNoteIds.clear();
      previousExpandedIds.forEach((noteId) => expandedNoteIds.add(noteId));
      activeNoteId = previousActiveNoteId;
      draftNoteId = previousDraftNoteId;
      draftTitle = previousDraftTitle;
      draftContent = previousDraftContent;
      draftLoaded = previousDraftLoaded;
      syncDraftInputs();
      applyStorageProtectionState();
      renderNoteList(getSearchQuery());
      return;
    }
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

    renderNoteList(getSearchQuery());
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

  function setActiveTocHeading(id) {
    activeTocHeadingId = id || '';

    viewTocList.querySelectorAll('a').forEach((anchor) => {
      const isActive = anchor.dataset.targetId === activeTocHeadingId;
      anchor.classList.toggle('is-active', isActive);
      if (isActive) {
        anchor.setAttribute('aria-current', 'true');
      } else {
        anchor.removeAttribute('aria-current');
      }
    });
  }

  function syncActiveTocHeading() {
    if (!viewBody) {
      return;
    }

    const headings = Array.from(viewContent.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) {
      setActiveTocHeading('');
      return;
    }

    const viewBodyRect = viewBody.getBoundingClientRect();
    const threshold = viewBodyRect.top + 96;
    let nextActiveId = headings[0].id;

    headings.forEach((heading) => {
      if (heading.getBoundingClientRect().top <= threshold) {
        nextActiveId = heading.id;
      }
    });

    setActiveTocHeading(nextActiveId);
  }

  function generateViewTOC() {
    viewTocList.innerHTML = '';
    const headings = Array.from(viewContent.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    if (headings.length === 0) {
      viewToc.classList.add('hidden');
      setActiveTocHeading('');
      return;
    }

    viewToc.classList.remove('hidden');
    viewToc.scrollTop = 0;

    headings.forEach((heading, index) => {
      if (!heading.id) {
        heading.id = createHeadingId(heading.textContent || `section-${index}`, index);
      }

      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = `#${heading.id}`;
      anchor.textContent = heading.textContent || `标题 ${index + 1}`;
      anchor.className = `toc-h${heading.tagName.substring(1)}`;
      anchor.dataset.targetId = heading.id;
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        setActiveTocHeading(heading.id);
        document.getElementById(heading.id)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });

      li.appendChild(anchor);
      viewTocList.appendChild(li);
    });

    syncActiveTocHeading();
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

    renderNoteList(getSearchQuery());
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
    const disableEditing = storageProtectionActive;
    const editableInputs = [mainTitleInput, mainContentInput, panelTitleInput, panelContentInput];
    const actionButtons = [
      addNoteBtn,
      topSideEditorBtn,
      editorLauncher,
      panelOpenMainBtn,
      editBtn,
      inlineDesktopBtn,
      panelSaveBtn,
      saveMainBtn,
      submitBtn,
    ];

    editableInputs.forEach((input) => {
      input.readOnly = disableEditing;
    });

    actionButtons.forEach((button) => {
      if (button) {
        button.disabled = disableEditing;
      }
    });

    syncNoteMenuState();

    if (!disableEditing) {
      return;
    }

    updateStatus(storageProtectionMessage);
    if (announce) {
      showToast(storageProtectionMessage);
      console.warn(storageProtectionMessage);
    }
  }

  function ensureStorageWritable() {
    if (!storageProtectionActive) {
      return true;
    }

    updateStatus(storageProtectionMessage);
    showToast(storageProtectionMessage);
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

  async function exportActiveNoteAsJpg() {
    if (!desktopBridge?.exportNoteAsJpg) {
      showToast('当前环境暂不支持导出 JPG');
      return false;
    }

    const hadUnsavedChanges = hasUnsavedChanges();
    const latest = hadUnsavedChanges
      ? saveCurrentNote({ announce: false })
      : (activeNoteId ? findNoteById(activeNoteId) : null);

    if (hadUnsavedChanges && !latest) {
      showToast('当前笔记保存失败，暂时无法导出 JPG');
      return false;
    }

    const note = latest ?? (activeNoteId ? findNoteById(activeNoteId) : null);
    if (!note) {
      return false;
    }

    try {
      const result = await desktopBridge.exportNoteAsJpg(buildNoteJpgExportPayload(note));
      if (result?.canceled) {
        return false;
      }

      if (!result?.fileName) {
        showToast('JPG 导出失败，请重试');
        return false;
      }

      showToast(`已导出 JPG：${result.fileName}`);
      return true;
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'JPG 导出失败，请重试');
      return false;
    }
  }

  function buildNoteJpgExportPayload(note) {
    const parser = typeof markedInstance?.parse === 'function' ? markedInstance : marked;
    const contentHtml = parser.parse(note?.content || '');

    return {
      title: note?.title || '无标题笔记',
      lastModified: note?.lastModified || '',
      contentHtml: sanitizeNoteExportMarkup(contentHtml),
    };
  }

  function sanitizeNoteExportMarkup(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
    const root = doc.body.firstElementChild;

    if (!root) {
      return '';
    }

    root.querySelectorAll('script, iframe, object, embed, link, style, meta, base').forEach((element) => {
      element.remove();
    });

    root.querySelectorAll('*').forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const normalizedName = attribute.name.toLowerCase();
        if (normalizedName.startsWith('on')) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (normalizedName === 'href' || normalizedName === 'src' || normalizedName === 'poster') {
          const nextValue = sanitizeNoteExportUrl(attribute.value);
          if (nextValue) {
            element.setAttribute(attribute.name, nextValue);
          } else {
            element.removeAttribute(attribute.name);
          }
          return;
        }

        if (normalizedName === 'target') {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.tagName === 'A' && element.getAttribute('href')) {
        element.setAttribute('rel', 'noreferrer noopener');
      }
    });

    return root.innerHTML;
  }

  function sanitizeNoteExportUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    if (/^(javascript|vbscript):/i.test(raw)) {
      return '';
    }

    if (/^data:/i.test(raw) && !/^data:(image|video)\//i.test(raw)) {
      return '';
    }

    try {
      return new URL(raw, window.location.href).toString();
    } catch {
      return '';
    }
  }

  async function openDesktopFloatingEditor() {
    if (!desktopBridge?.openFloatingNotesWindow) return false;

    const latest = hasUnsavedChanges() ? saveCurrentNote({ announce: false }) : (activeNoteId ? findNoteById(activeNoteId) : null);
    if (hasUnsavedChanges() && !latest) {
      showToast('当前笔记保存失败，暂时无法打开悬浮窗口');
      return false;
    }

    try {
      const result = await desktopBridge.openFloatingNotesWindow(latest?.id ?? activeNoteId ?? null);
      if (!result?.ok) {
        showToast('悬浮窗口打开失败，请重试');
        return false;
      }

      return true;
    } catch (error) {
      console.error(error);
      showToast('悬浮窗口打开失败，请重试');
      return false;
    }
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
