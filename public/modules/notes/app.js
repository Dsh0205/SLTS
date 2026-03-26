document.addEventListener('DOMContentLoaded', () => {
  // 状态管理
  let notes = JSON.parse(localStorage.getItem('shanlic_notes')) || [];
  let activeNoteId = null;

  // DOM 元素
  const noteListEl = document.getElementById('note-list');
  const addNoteBtn = document.getElementById('add-note-btn');
  const searchInput = document.getElementById('search-input');
  const noteTitleInput = document.getElementById('note-title');
  const noteContentInput = document.getElementById('note-content');
  const lastModifiedEl = document.getElementById('last-modified');
  // View Elements
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

  const contextMenu = document.getElementById('context-menu');
  const deleteOption = document.getElementById('delete-note-option');
  const openOption = document.getElementById('open-note-option');
  const addSubNoteOption = document.getElementById('add-sub-note-option');
  const editorContainer = document.getElementById('editor-container');
  const emptyState = document.getElementById('empty-state');
  const submitBtn = document.getElementById('submit-note-btn');

  // Toolbar Buttons
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

  // Expanded State
  const expandedNoteIds = new Set();

  // 初始化
  renderNoteList();

  // 事件监听
  addNoteBtn.addEventListener('click', createNote);
  searchInput.addEventListener('input', (e) => renderNoteList(e.target.value));

  // Toolbar Event Listeners
  // History
  btnUndo.addEventListener('click', () => { document.execCommand('undo'); noteContentInput.focus(); });
  btnRedo.addEventListener('click', () => { document.execCommand('redo'); noteContentInput.focus(); });

  // Format
  selectHeading.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      const prefix = '#'.repeat(parseInt(val.replace('h', ''))) + ' ';
      insertAtLineStart(noteContentInput, prefix);
    }
    e.target.value = ''; // Reset
  });

  btnBold.addEventListener('click', () => insertAtCursor(noteContentInput, '**粗体文本**', 2, -2));
  btnItalic.addEventListener('click', () => insertAtCursor(noteContentInput, '*斜体文本*', 1, -1));
  btnStrikethrough.addEventListener('click', () => insertAtCursor(noteContentInput, '~~删除线文本~~', 2, -2));
  btnMark.addEventListener('click', () => insertAtCursor(noteContentInput, '<mark>高亮文本</mark>', 6, -7));

  // Lists & Align
  btnUl.addEventListener('click', () => insertAtLineStart(noteContentInput, '- '));
  btnOl.addEventListener('click', () => insertAtLineStart(noteContentInput, '1. '));
  btnTask.addEventListener('click', () => insertAtLineStart(noteContentInput, '- [ ] '));

  btnAlignLeft.addEventListener('click', () => insertAtCursor(noteContentInput, '<p align="left">左对齐文本</p>', 16, -4));
  btnAlignCenter.addEventListener('click', () => insertAtCursor(noteContentInput, '<p align="center">居中文本</p>', 18, -4));
  btnAlignRight.addEventListener('click', () => insertAtCursor(noteContentInput, '<p align="right">右对齐文本</p>', 17, -4));
  btnHr.addEventListener('click', () => insertAtCursor(noteContentInput, '\n---\n'));

  // Blocks
  btnQuote.addEventListener('click', () => insertAtLineStart(noteContentInput, '> '));
  btnCode.addEventListener('click', () => insertAtCursor(noteContentInput, '\n```\n代码块\n```\n', 5, -5));

  btnTable.addEventListener('click', () => {
    const rowsStr = prompt('请输入表格行数 (不包括表头):', '3');
    if (rowsStr === null) return; // Cancelled

    const colsStr = prompt('请输入表格列数:', '3');
    if (colsStr === null) return; // Cancelled

    const rows = parseInt(rowsStr);
    const cols = parseInt(colsStr);

    if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) {
      alert('请输入有效的行数和列数！');
      return;
    }

    let tableMd = '\n';

    // Header row
    tableMd += '|';
    for (let i = 1; i <= cols; i++) {
      tableMd += ` 表头${i} |`;
    }
    tableMd += '\n';

    // Separator row
    tableMd += '|';
    for (let i = 1; i <= cols; i++) {
      tableMd += ' --- |';
    }
    tableMd += '\n';

    // Content rows
    for (let r = 1; r <= rows; r++) {
      tableMd += '|';
      for (let c = 1; c <= cols; c++) {
        tableMd += ' 内容 |';
      }
      tableMd += '\n';
    }

    tableMd += '\n';

    insertAtCursor(noteContentInput, tableMd);
  });

  // Media
  btnLink.addEventListener('click', () => insertAtCursor(noteContentInput, '[链接描述](url)', 1, -6));
  btnImage.addEventListener('click', () => insertAtCursor(noteContentInput, '![图片描述](url)', 2, -6));
  btnVideo.addEventListener('click', () => insertAtCursor(noteContentInput, '<video src="视频地址" controls width="100%"></video>', 12, -26));
  btnFormula.addEventListener('click', () => insertAtCursor(noteContentInput, '$$ 公式 $$', 3, -3));
  btnDate.addEventListener('click', () => insertAtCursor(noteContentInput, new Date().toLocaleDateString()));
  btnWidescreen.addEventListener('click', () => {
    document.querySelector('.app-container').classList.toggle('widescreen');
    btnWidescreen.classList.toggle('active');
  });

  // Helper to insert text at line start
  function insertAtLineStart(input, text) {
    const start = input.selectionStart;
    const value = input.value;

    // Find start of current line
    let lineStart = value.lastIndexOf('\n', start - 1) + 1;
    if (lineStart < 0) lineStart = 0;

    input.value = value.substring(0, lineStart) + text + value.substring(lineStart);
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
  }

  // Paste Event for Images
  noteContentInput.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          insertAtCursor(noteContentInput, `![粘贴的图片](${base64})`);
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // Helper to insert text at cursor position with optional selection range
  function insertAtCursor(input, text, selectStartOffset = 0, selectEndOffset = 0) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    input.value = value.substring(0, start) + text + value.substring(end);

    // Set new cursor position or selection
    if (selectStartOffset !== 0 || selectEndOffset !== 0) {
      input.selectionStart = start + selectStartOffset;
      input.selectionEnd = start + text.length + selectEndOffset;
    } else {
      input.selectionStart = input.selectionEnd = start + text.length;
    }

    input.focus();
  }

  // 生成阅读模式的目录 (重构版 - 更可靠)
  // 注意：这个函数被定义在全局作用域内或者作为 helper 函数
  function generateViewTOC() {
    const viewToc = document.querySelector('.view-toc');
    const viewTocList = document.getElementById('view-toc-list');
    const contentEl = document.getElementById('view-content');

    if (!viewToc || !viewTocList || !contentEl) {
      console.error('Missing TOC elements');
      return;
    }

    viewTocList.innerHTML = '';

    // 查找所有 H1-H6 元素
    const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    console.log(`Generating TOC for ${headings.length} headings`);

    // 如果没有标题，隐藏目录容器
    if (headings.length === 0) {
      viewToc.classList.add('hidden');
      return;
    }

    viewToc.classList.remove('hidden');

    headings.forEach((heading, index) => {
      // 确保标题有 ID
      let id = heading.id;
      if (!id) {
        id = `heading-${index}-${Math.random().toString(36).substr(2, 9)}`;
        heading.id = id;
      }

      const li = document.createElement('li');
      const a = document.createElement('a');

      // 获取纯文本内容
      const text = heading.textContent || heading.innerText;
      a.textContent = text;
      a.href = `#${id}`;
      a.className = `toc-h${heading.tagName.substring(1)}`;

      // 点击滚动逻辑
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(id);
        if (target) {
          // 使用 scrollIntoView 
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });

      li.appendChild(a);
      viewTocList.appendChild(li);
    });
  }

  // Submit button listener
  submitBtn.addEventListener('click', () => {
    saveCurrentNote();
    alert('文档已提交保存！');
  });

  // Edit button listener
  editBtn.addEventListener('click', () => {
    if (activeNoteId) {
      switchToEditorMode();
    }
  });

  // Export button listener
  exportBtn.addEventListener('click', () => {
    if (!activeNoteId) return;
    const note = findNoteById(activeNoteId);
    if (!note) return;

    const blob = new Blob([note.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title || '无标题文档'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import button listener
  importBtn.addEventListener('click', () => {
    if (!activeNoteId) return;
    importInput.click();
  });

  // File input change listener
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('导入将覆盖当前文档内容，确定要继续吗？')) {
      importInput.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const note = findNoteById(activeNoteId);
      if (note) {
        note.content = content;
        note.lastModified = new Date().toLocaleString();
        saveNotes();
        selectNote(activeNoteId); // Refresh view
        alert('导入成功！');
      }
    };
    reader.readAsText(file);
    importInput.value = ''; // Reset for next use
  });

  // Ctrl+K 快捷键
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // 右键菜单相关
  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  deleteOption.addEventListener('click', () => {
    if (contextMenu.dataset.noteId) {
      deleteNote(parseInt(contextMenu.dataset.noteId));
    }
  });

  // New listener for Open
  if (openOption) {
    openOption.addEventListener('click', () => {
      if (contextMenu.dataset.noteId) {
        selectNote(parseInt(contextMenu.dataset.noteId));
      }
    });
  }

  // Listener for Add Sub Note
  if (addSubNoteOption) {
    addSubNoteOption.addEventListener('click', () => {
      if (contextMenu.dataset.noteId) {
        createSubNote(parseInt(contextMenu.dataset.noteId));
      }
    });
  }

  // Helper: Find note by ID (Recursive)
  function findNoteById(id, list = notes) {
    for (const note of list) {
      if (note.id === id) return note;
      if (note.children && note.children.length > 0) {
        const found = findNoteById(id, note.children);
        if (found) return found;
      }
    }
    return null;
  }

  // Helper: Delete note by ID (Recursive)
  function deleteNoteById(id, list = notes) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1);
        return true;
      }
      if (list[i].children && list[i].children.length > 0) {
        if (deleteNoteById(id, list[i].children)) return true;
      }
    }
    return false;
  }

  // Helper: Expand path to note
  function expandPathToNote(targetId, currentList) {
    for (const note of currentList) {
      if (note.id === targetId) return true; // Found it

      if (note.children && note.children.length > 0) {
        const foundInChildren = expandPathToNote(targetId, note.children);
        if (foundInChildren) {
          expandedNoteIds.add(note.id); // Expand this parent
          return true;
        }
      }
    }
    return false;
  }

  // 创建新文档 (Root Level)
  function createNote() {
    // 清空输入框，准备输入新内容，而不是直接创建一个已保存的条目
    activeNoteId = null; // 标记为新文档，尚未保存

    // 隐藏 View 模式，显示 Editor 模式
    viewContainer.style.display = 'none';
    editorContainer.style.display = 'flex';
    emptyState.style.display = 'none';

    noteTitleInput.value = '';
    noteContentInput.value = '';
    lastModifiedEl.textContent = '新文档 - 尚未保存';

    // 聚焦标题
    noteTitleInput.focus();

    // 更新列表高亮状态（清除所有高亮）
    renderNoteList(searchInput.value);
  }

  // 创建子文档
  function createSubNote(parentId) {
    const parent = findNoteById(parentId);
    if (!parent) return;

    if (!parent.children) parent.children = [];

    const now = new Date().toLocaleString();
    const newNote = {
      id: Date.now(),
      title: '',
      content: '',
      lastModified: now,
      children: []
    };

    parent.children.push(newNote);

    // Auto expand parent
    expandedNoteIds.add(parentId);

    // Save
    saveNotes();

    // Select new note
    activeNoteId = newNote.id;

    // Switch to editor
    viewContainer.style.display = 'none';
    editorContainer.style.display = 'flex';
    emptyState.style.display = 'none';

    noteTitleInput.value = '';
    noteContentInput.value = '';
    lastModifiedEl.textContent = '新子文档 - 尚未保存';
    noteTitleInput.focus();

    renderNoteList(searchInput.value);
  }

  // 渲染文档列表
  function renderNoteList(searchQuery = '') {
    noteListEl.innerHTML = '';

    if (searchQuery) {
      // Flatten list for search
      const flatList = [];
      function flatten(list) {
        list.forEach(n => {
          flatList.push(n);
          if (n.children) flatten(n.children);
        });
      }
      flatten(notes);

      const filtered = flatList.filter(n =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

      filtered.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      filtered.forEach(note => {
        const li = document.createElement('div');
        li.className = `note-item ${activeNoteId && note.id === activeNoteId ? 'active' : ''}`;
        li.dataset.id = note.id;
        li.innerHTML = `
                <div class="note-item-content">
                    <i class="fas fa-file-alt note-icon"></i>
                    <div class="note-info-wrapper">
                        <div class="note-item-title">${note.title || '无标题文档'}</div>
                        <div class="note-item-date">${note.lastModified}</div>
                    </div>
                </div>
            `;
        li.addEventListener('click', () => selectNote(note.id));
        li.addEventListener('contextmenu', (e) => showContextMenu(e, note.id));
        noteListEl.appendChild(li);
      });
      return;
    }

    // Helper to render tree
    function renderTree(list, container) {
      // Sort by last modified
      list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

      list.forEach(note => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'note-tree-item';

        const li = document.createElement('div');
        li.className = `note-item ${activeNoteId && note.id === activeNoteId ? 'active' : ''}`;
        li.dataset.id = note.id;

        const hasChildren = note.children && note.children.length > 0;
        const isExpanded = expandedNoteIds.has(note.id);

        let iconHtml = '';
        if (hasChildren) {
          iconHtml = `<i class="fas fa-caret-right toggle-icon ${isExpanded ? 'expanded' : ''}" data-id="${note.id}"></i>`;
        } else {
          iconHtml = `<i class="fas fa-file-alt note-icon"></i>`;
        }

        li.innerHTML = `
            <div class="note-item-content">
                ${iconHtml}
                <div class="note-info-wrapper">
                    <div class="note-item-title">${note.title || '无标题文档'}</div>
                    <div class="note-item-date">${note.lastModified}</div>
                </div>
            </div>
         `;

        // Click handler for toggle
        const toggleIcon = li.querySelector('.toggle-icon');
        if (toggleIcon) {
          toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent selecting note
            if (expandedNoteIds.has(note.id)) {
              expandedNoteIds.delete(note.id);
            } else {
              expandedNoteIds.add(note.id);
            }
            renderNoteList(searchInput.value);
          });
        }

        // Click handler for select
        li.addEventListener('click', (e) => {
          // If user clicked directly on toggle icon, event propagation is stopped.
          // But if user clicked on row (not icon), we select note.
          selectNote(note.id);
        });

        li.addEventListener('contextmenu', (e) => showContextMenu(e, note.id));

        itemContainer.appendChild(li);
        container.appendChild(itemContainer);

        // Render Children
        if (hasChildren && isExpanded) {
          const childrenContainer = document.createElement('div');
          childrenContainer.className = 'note-children expanded';
          itemContainer.appendChild(childrenContainer);
          renderTree(note.children, childrenContainer);
        }
      });
    }

    renderTree(notes, noteListEl);
  }

  // 选择文档
  function selectNote(id) {
    // 如果当前是新文档且未保存，提示用户
    if (!activeNoteId && noteTitleInput.value && !confirm('当前新文档未保存，确定要切换吗？')) {
      return;
    }

    activeNoteId = id;
    const note = findNoteById(id);

    if (!note) return;

    // Expand path to note in tree view
    expandPathToNote(id, notes);

    // 显示阅读模式，隐藏编辑模式和空状态
    viewContainer.style.display = 'flex';
    editorContainer.style.display = 'none';
    emptyState.style.display = 'none';

    // 渲染内容到阅读区
    viewTitle.textContent = note.title;
    viewDate.textContent = `最后修改时间: ${note.lastModified}`;

    // 使用 marked 渲染 Markdown
    marked.setOptions({
      headerIds: true,
      gfm: true,
      breaks: true
    });
    viewContent.innerHTML = marked.parse(note.content);

    // 生成阅读模式的目录
    generateViewTOC();

    // 更新列表选中状态
    renderNoteList(searchInput.value);

    // 添加选中高亮动画 (仅当是现有文档时)
    if (activeNoteId) {
      const activeNoteEl = noteListEl.querySelector(`.note-item[data-id="${id}"]`);
      if (activeNoteEl) {
        // 先移除可能存在的类以重置动画
        activeNoteEl.classList.remove('highlight-anim');
        // 强制重绘
        void activeNoteEl.offsetWidth;
        // 添加动画类
        activeNoteEl.classList.add('highlight-anim');

        // 动画结束后移除
        setTimeout(() => {
          if (activeNoteEl) activeNoteEl.classList.remove('highlight-anim');
        }, 2000);
      }
    }
  }

  // 切换到编辑模式
  function switchToEditorMode() {

    const note = findNoteById(activeNoteId);
    if (!note) return;

    viewContainer.style.display = 'none';
    editorContainer.style.display = 'flex';

    noteTitleInput.value = note.title;
    noteContentInput.value = note.content;
    lastModifiedEl.textContent = `最后修改时间: ${note.lastModified}`;
  }

  // 更新文档内容 (已移除自动更新，改为手动提交)
  function updateNote() {
    // 仅更新最后修改时间显示，不保存
    lastModifiedEl.textContent = `最后修改时间: 现在 (未保存)`;
  }

  // 保存当前文档
  function saveCurrentNote() {
    const title = noteTitleInput.value.trim() || '无标题文档';
    const content = noteContentInput.value;
    const now = new Date().toLocaleString();

    let noteIdToSelect = null;

    if (activeNoteId) {
      // 更新现有文档
      const note = findNoteById(activeNoteId);
      if (note) {
        note.title = title;
        note.content = content;
        note.lastModified = now;
        noteIdToSelect = note.id;
      }
    } else {
      // 创建新文档 (Default to root if activeNoteId is null and not sub-note flow)
      // Note: activeNoteId is null only for NEW ROOT notes. 
      // Sub-notes are created via createSubNote which sets activeNoteId immediately.
      const newNote = {
        id: Date.now(),
        title: title,
        content: content,
        lastModified: now,
        children: []
      };
      notes.push(newNote);
      noteIdToSelect = newNote.id;
    }

    saveNotes();

    // 保存后，选中该文档
    selectNote(noteIdToSelect);
  }

  // 保存到 LocalStorage
  function saveNotes() {
    localStorage.setItem('shanlic_notes', JSON.stringify(notes));
  }

  // 删除文档
  function deleteNote(id) {
    if (confirm('确定要删除这个文档及其子文档吗？')) {
      deleteNoteById(id);
      saveNotes();

      if (activeNoteId === id) {
        activeNoteId = null;
        editorContainer.style.display = 'none';
        emptyState.style.display = 'flex';
      }

      renderNoteList(searchInput.value);
    }
  }

  // 显示右键菜单
  function showContextMenu(e, id) {
    e.preventDefault();
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.dataset.noteId = id;
  }

  // 更新预览和目录
  function updatePreview(markdown) {
    // 配置 marked 选项
    marked.setOptions({
      headerIds: true,
      gfm: true,
      breaks: true
    });

    // 生成 HTML
    const html = marked.parse(markdown);
    previewEl.innerHTML = html;

    // 生成目录
    generateTOC(markdown);
  }

  // 生成目录 (基于 Markdown 源码的简单解析，或者基于渲染后的 DOM)
  // 这里我们基于 Markdown 源码解析，更直接
  function generateTOC(markdown) {
    tocListEl.innerHTML = '';
    const lines = markdown.split('\n');
    const headers = [];

    // 正则匹配标题
    const headerRegex = /^(#{1,6})\s+(.+)$/;

    lines.forEach((line, index) => {
      const match = line.match(headerRegex);
      if (match) {
        headers.push({
          level: match[1].length,
          text: match[2],
          id: `header-${index}` // 简单生成 ID
        });
      }
    });

    // 为预览区的标题添加 ID 以便跳转 (这里需要重新处理 previewEl 的 DOM)
    // 更简单的做法是：解析 Markdown 后，遍历 previewEl 中的 H 标签
    // 这样可以确保 ID 与 TOC 对应

    // 清空之前的 TOC
    tocListEl.innerHTML = '';

    // 获取预览区的所有标题元素
    const headings = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading, index) => {
      const id = `heading-${index}`;
      heading.id = id;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.textContent = heading.textContent;
      a.className = `toc-h${heading.tagName.substring(1)}`; // toc-h1, toc-h2...

      // 点击平滑滚动
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
      });

      li.appendChild(a);
      tocListEl.appendChild(li);
    });
  }
});
