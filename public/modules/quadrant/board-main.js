import {
  buildResolvedLinkGeometries,
  computeWorldSize,
  constrainStateToWorld,
  getDistance,
  getTimelineTrackBounds,
  getWorldPoint,
} from "./board-geometry.js";
import { exportBoardAsPng } from "./board-export.js";
import {
  BOX_DEFAULT_HEIGHT,
  BOX_DEFAULT_WIDTH,
  BOX_MIN_HEIGHT,
  BOX_MIN_WIDTH,
  DEFAULT_BOX_SHAPE,
  FLOWCHART_SHAPES,
  LEGACY_NOTE_KEY,
  MAX_ZOOM,
  MIN_ZOOM,
  NOTE_DEFAULT_HEIGHT,
  NOTE_DEFAULT_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  TIMELINE_DEFAULT_WIDTH,
  TIMELINE_HEIGHT,
  TIMELINE_MIN_WIDTH,
  TIMELINE_MIN_Y,
  TIMELINE_START_HOUR,
  TIMELINE_END_HOUR,
  WORLD_PADDING,
  clamp,
  createId,
  formatHour,
  formatMinutes,
  getBoxById,
  getBoxShapeGroupLabel,
  getBoxShapeLabel,
  getDefaultStatus,
  getNoteById,
  getTimelineById,
  getTimelineMarks,
  loadState,
  normalizeBoxShape,
  saveState,
} from "./board-state.js";

const DRAG_THRESHOLD = 4;
const CLICK_SUPPRESS_MS = 140;
const DOUBLE_CLICK_MS = 280;
const EDITOR_CHROME_HEIGHT = 24;

export function initBoard() {
  const dom = getDom();
  let state = loadState();
  let zoom = 1;
  let worldSize = { width: 1800, height: 1200 };
  let selection = null;
  let editing = null;
  let linkSourceId = null;
  let isBatchLinkMode = false;
  let pointerState = null;
  let contextState = null;
  let focusRequest = null;
  let transientStatus = "";
  let statusTimer = 0;
  let resizeFrame = 0;
  let suppressClickUntil = 0;
  let lastClickInfo = null;

  bindEvents();
  render();

  function bindEvents() {
    populateShapeMenu();

    dom.createTimelineBtn.addEventListener("click", () => addTimeline());
    dom.createNoteBtn.addEventListener("click", () => addNote(centerPoint().x, centerPoint().y));
    dom.createBoxBtn.addEventListener("click", () => addBox(centerPoint().x, centerPoint().y));
    dom.zoomOutBtn.addEventListener("click", () => setZoom(zoom - 0.1));
    dom.zoomResetBtn.addEventListener("click", () => setZoom(1));
    dom.zoomInBtn.addEventListener("click", () => setZoom(zoom + 0.1));
    dom.exportPngBtn.addEventListener("click", exportPng);
    dom.clearAllBtn.addEventListener("click", clearAll);

    dom.viewport.addEventListener("contextmenu", handleContextMenu);
    dom.contextMenu.addEventListener("click", handleMenuAction);
    dom.viewport.addEventListener("pointerdown", handleBackgroundPointerDown);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => render());
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".context-menu")) {
        hideContextMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideContextMenu();
        if (editing) {
          editing = null;
          lastClickInfo = null;
          render();
          return;
        }
        if (linkSourceId) {
          linkSourceId = null;
          isBatchLinkMode = false;
          lastClickInfo = null;
          render();
          return;
        }
        selection = null;
        lastClickInfo = null;
        render();
        return;
      }

      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelection();
        return;
      }

      if (event.key === "t" || event.key === "T") addTimeline();
      if (event.key === "n" || event.key === "N") addNote(centerPoint().x, centerPoint().y);
      if (event.key === "b" || event.key === "B") addBox(centerPoint().x, centerPoint().y);
    });
  }

  function populateShapeMenu() {
    dom.boxShapeMenu.replaceChildren();
    const groups = new Map();

    FLOWCHART_SHAPES.forEach((shape) => {
      if (!groups.has(shape.group)) {
        groups.set(shape.group, []);
      }
      groups.get(shape.group).push(shape);
    });

    groups.forEach((items, groupKey) => {
      const section = create("section", { className: "context-menu-shape-group" });
      const title = create("div", { className: "context-menu-shape-title" });
      title.textContent = getBoxShapeGroupLabel(groupKey);
      section.append(title);

      const grid = create("div", { className: "context-menu-shape-grid" });
      items.forEach((shape) => {
        const button = create("button", {
          type: "button",
          className: "context-menu-btn context-menu-btn--shape",
        });
        button.dataset.action = "set-box-shape";
        button.dataset.shape = shape.id;
        button.textContent = shape.label;
        grid.append(button);
      });

      section.append(grid);
      dom.boxShapeMenu.append(section);
    });
  }

  function render() {
    syncWorld();
    renderTimelines();
    renderNotes();
    renderBoxes();
    renderLinks();
    dom.emptyState.classList.toggle("is-hidden", Boolean(state.timelines.length || state.notes.length || state.boxes.length));
    renderStatus();
    dom.zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;

    if (focusRequest) {
      const selector = focusRequest.type === "timeline"
        ? `.timeline-title-input[data-id="${focusRequest.id}"]`
        : `.node-editor[data-type="${focusRequest.type}"][data-id="${focusRequest.id}"]`;
      const target = dom.world.querySelector(selector);
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.focus();
        const length = target.value.length;
        target.setSelectionRange?.(length, length);
      }
      focusRequest = null;
    }
  }

  function syncWorld() {
    worldSize = computeWorldSize(state, dom.viewport, zoom);
    constrainStateToWorld(state, worldSize);
    worldSize = computeWorldSize(state, dom.viewport, zoom);

    dom.world.style.setProperty("--zoom", String(zoom));
    dom.world.style.width = `${worldSize.width}px`;
    dom.world.style.height = `${worldSize.height}px`;
    dom.worldSizer.style.width = `${Math.round(worldSize.width * zoom)}px`;
    dom.worldSizer.style.height = `${Math.round(worldSize.height * zoom)}px`;
  }

  function renderTimelines() {
    dom.timelinesLayer.replaceChildren();

    state.timelines.forEach((timeline) => {
      const item = create("article", {
        className: selection?.type === "timeline" && selection.id === timeline.id ? "timeline-item is-selected" : "timeline-item",
      });
      item.dataset.id = timeline.id;
      applyEntityGeometry(item, "timeline", timeline);

      const startHandle = create("span", {
        className: "timeline-resize-handle timeline-resize-handle--start",
        title: "调整时间线宽度",
      });
      const endHandle = create("span", {
        className: "timeline-resize-handle timeline-resize-handle--end",
        title: "调整时间线宽度",
      });
      startHandle.addEventListener("pointerdown", (event) => beginPointer(event, "resize-timeline-start", timeline.id, item));
      endHandle.addEventListener("pointerdown", (event) => beginPointer(event, "resize-timeline-end", timeline.id, item));
      item.append(startHandle, endHandle);

      const input = create("input", {
        className: "timeline-title-input",
        value: timeline.label,
        maxLength: 24,
        placeholder: "输入时间线名称",
      });
      input.dataset.id = timeline.id;
      input.addEventListener("input", (event) => {
        const target = event.target;
        const current = getTimelineById(state, timeline.id);
        if (!(target instanceof HTMLInputElement) || !current) return;
        current.label = target.value;
        save();
      });
      item.append(input);

      const track = create("div", { className: "timeline-track", title: "点击任意刻度位置创建文本" });
      track.append(create("span", { className: "track-line" }));

      const marks = getTimelineMarks(timeline.startHour, timeline.endHour);
      const span = Math.max(timeline.endHour - timeline.startHour, 1);
      marks.forEach((hour, index) => {
        const major = index === 0 || index === marks.length - 1 || hour % 4 === 0;
        const tick = create("span", { className: major ? "timeline-tick major" : "timeline-tick" });
        tick.style.left = `${((hour - timeline.startHour) / span) * 100}%`;
        tick.dataset.label = formatHour(hour);
        track.append(tick);
      });

      track.addEventListener("click", (event) => {
        if (performance.now() < suppressClickUntil) return;
        createNoteFromTimeline(event, timeline.id);
      });

      item.append(track);
      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".timeline-title-input, .timeline-track, .timeline-resize-handle")) return;
        beginPointer(event, "move-timeline", timeline.id, item);
      });

      dom.timelinesLayer.append(item);
    });
  }

  function renderNotes() {
    dom.notesLayer.replaceChildren();

    state.notes.forEach((note) => {
      const isEditing = editing?.type === "note" && editing.id === note.id;
      const item = create("article", {
        className: noteCardClass("text-note", selection?.type === "note" && selection.id === note.id, false),
        title: "拖动移动，右下角缩放，双击编辑",
      });
      item.dataset.id = note.id;
      applyEntityGeometry(item, "note", note);

      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest(".node-resize-handle") || isTypingTarget(target)) return;
        beginPointer(event, "move-note", note.id, item);
      });

      if (isEditing) {
        item.append(createEditor("note", note.id, note.text, NOTE_MIN_HEIGHT, "输入文本..."));
      } else {
        item.append(createBody(note.text, "双击输入文本"));
      }

      const handle = create("span", { className: "node-resize-handle", title: "调整文本大小" });
      handle.addEventListener("pointerdown", (event) => beginPointer(event, "resize-note", note.id, item));
      item.append(handle);
      dom.notesLayer.append(item);
    });
  }

  function renderBoxes() {
    dom.boxesLayer.replaceChildren();

    state.boxes.forEach((box) => {
      const isEditing = editing?.type === "box" && editing.id === box.id;
      const item = create("article", {
        className: getBoxCardClass(box, selection?.type === "box" && selection.id === box.id, linkSourceId === box.id),
        title: `${getBoxShapeLabel(box.shape)}，单击连接，拖动移动，右下角缩放，双击编辑`,
      });
      item.dataset.id = box.id;
      applyEntityGeometry(item, "box", box);

      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest(".node-resize-handle") || isTypingTarget(target)) return;
        beginPointer(event, "move-box", box.id, item);
      });

      const surface = create("span", { className: "diagram-box-surface", "aria-hidden": "true" });
      const content = create("div", { className: "diagram-box-content" });
      if (isEditing) {
        content.append(createEditor("box", box.id, box.text, BOX_MIN_HEIGHT, `输入${getBoxShapeLabel(box.shape)}内容...`));
      } else {
        content.append(createBody(box.text, "双击输入节点"));
      }

      const handle = create("span", { className: "node-resize-handle", title: "调整方框大小" });
      handle.addEventListener("pointerdown", (event) => beginPointer(event, "resize-box", box.id, item));

      item.append(surface, content, handle);
      dom.boxesLayer.append(item);
    });
  }

  function renderLinks() {
    dom.linksLayer.setAttribute("viewBox", `0 0 ${worldSize.width} ${worldSize.height}`);
    dom.linksPaths.replaceChildren();
    const geometryById = buildResolvedLinkGeometries(state.links, state.boxes);

    state.links.forEach((link) => {
      const geometry = geometryById.get(link.id);
      if (!geometry) return;

      const path = createSvg("path");
      path.setAttribute("class", selection?.type === "link" && selection.id === link.id ? "link-path is-selected" : "link-path");
      path.dataset.id = link.id;
      path.setAttribute("d", geometry.d);
      path.setAttribute("marker-end", "url(#arrow-head)");
      path.addEventListener("pointerdown", (event) => {
        if (event.button === 0) {
          event.stopPropagation();
        }
      });
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        selectLink(link.id);
      });
      dom.linksPaths.append(path);
    });
  }

  function selectLink(id) {
    if (!state.links.some((link) => link.id === id)) return;
    selection = { type: "link", id };
    editing = null;
    linkSourceId = null;
    isBatchLinkMode = false;
    lastClickInfo = null;
    render();
  }

  function toggleBatchLinkMode(id) {
    if (!getBoxById(state, id)) return;

    if (linkSourceId === id && isBatchLinkMode) {
      linkSourceId = null;
      isBatchLinkMode = false;
      selection = { type: "box", id };
      lastClickInfo = null;
      showStatus("批量连线已关闭", 1800);
      render();
      return;
    }

    linkSourceId = id;
    isBatchLinkMode = true;
    selection = { type: "box", id };
    editing = null;
    lastClickInfo = null;
    showStatus("批量连线已开启：点击方框继续连接，按 Esc 结束", 2600);
    render();
  }

  function createEditor(type, id, value, minHeight, placeholder) {
    const editor = create("textarea", {
      className: "node-editor",
      value,
      placeholder,
    });
    editor.dataset.type = type;
    editor.dataset.id = id;
    editor.spellcheck = false;

    editor.addEventListener("input", (event) => {
      const target = event.target;
      const entity = type === "note" ? getNoteById(state, id) : getBoxById(state, id);
      if (!(target instanceof HTMLTextAreaElement) || !entity) return;
      entity.text = target.value;
      resizeEditorCard(entity, target, minHeight);
      syncWorld();
      if (type === "box") {
        renderLinks();
      }
      save();
    });

    editor.addEventListener("blur", () => {
      editing = null;
      render();
    });

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        editor.blur();
      }
    });

    window.setTimeout(() => {
      const entity = type === "note" ? getNoteById(state, id) : getBoxById(state, id);
      if (entity) {
        resizeEditorCard(entity, editor, minHeight);
      }
    }, 0);

    return editor;
  }

  function resizeEditorCard(entity, editor, minHeight) {
    editor.style.height = "0px";
    const contentHeight = Math.ceil(editor.scrollHeight) + EDITOR_CHROME_HEIGHT;
    entity.height = Math.max(minHeight, entity.height, contentHeight);
    const card = editor.closest(".text-note, .diagram-box");
    if (card instanceof HTMLElement) {
      card.style.height = `${entity.height}px`;
    }
    editor.style.height = `${Math.max(24, entity.height - EDITOR_CHROME_HEIGHT)}px`;
  }

  function createBody(text, placeholder) {
    const body = create("div", { className: !text ? "node-body node-placeholder" : "node-body" });
    body.textContent = text || placeholder;
    return body;
  }

  function beginPointer(event, mode, id, node) {
    if (event.button !== 0) return;
    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
    const type = getTypeFromMode(mode);
    const entity = type === "timeline" ? getTimelineById(state, id) : type === "note" ? getNoteById(state, id) : getBoxById(state, id);
    if (!entity) return;

    pointerState = {
      mode,
      type,
      id,
      pointerId: event.pointerId,
      node,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: point,
      startEntity: {
        x: entity.x,
        y: entity.y,
        width: entity.width || 0,
        height: entity.height || 0,
      },
      offsetX: "x" in entity ? point.x - entity.x : 0,
      offsetY: point.y - entity.y,
      dragging: false,
    };

    selection = { type, id };
    if (type !== "box") {
      linkSourceId = null;
      isBatchLinkMode = false;
    }
    hideContextMenu();
    node.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function handlePointerMove(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    const entity = pointerState.type === "timeline"
      ? getTimelineById(state, pointerState.id)
      : pointerState.type === "note"
        ? getNoteById(state, pointerState.id)
        : getBoxById(state, pointerState.id);
    if (!entity) return;

    if (!pointerState.dragging && getDistance(pointerState.startClientX, pointerState.startClientY, event.clientX, event.clientY) > DRAG_THRESHOLD) {
      pointerState.dragging = true;
    }
    if (!pointerState.dragging) return;

    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
    const deltaX = point.x - pointerState.startPoint.x;
    const deltaY = point.y - pointerState.startPoint.y;

    switch (pointerState.mode) {
      case "move-timeline":
        entity.x = Math.max(WORLD_PADDING, point.x - pointerState.offsetX);
        entity.y = Math.max(TIMELINE_MIN_Y, point.y - pointerState.offsetY);
        break;
      case "resize-timeline-start": {
        const right = pointerState.startEntity.x + pointerState.startEntity.width;
        const nextX = clamp(point.x, WORLD_PADDING, right - TIMELINE_MIN_WIDTH);
        entity.x = nextX;
        entity.width = Math.max(TIMELINE_MIN_WIDTH, right - nextX);
        break;
      }
      case "resize-timeline-end":
        entity.width = Math.max(TIMELINE_MIN_WIDTH, pointerState.startEntity.width + deltaX);
        break;
      case "move-note":
      case "move-box":
        entity.x = Math.max(WORLD_PADDING, point.x - pointerState.offsetX);
        entity.y = Math.max(WORLD_PADDING, point.y - pointerState.offsetY);
        break;
      case "resize-note":
        entity.width = Math.max(NOTE_MIN_WIDTH, pointerState.startEntity.width + deltaX);
        entity.height = Math.max(NOTE_MIN_HEIGHT, pointerState.startEntity.height + deltaY);
        break;
      case "resize-box":
        entity.width = Math.max(BOX_MIN_WIDTH, pointerState.startEntity.width + deltaX);
        entity.height = Math.max(BOX_MIN_HEIGHT, pointerState.startEntity.height + deltaY);
        break;
      default:
        break;
    }

    syncWorld();
    applyEntityGeometry(pointerState.node, pointerState.type, entity);
    if (pointerState.type === "box") {
      renderLinks();
    }
  }

  function finishPointer(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    try {
      pointerState.node.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore release failures.
    }

    const currentPointer = pointerState;
    pointerState = null;

    if (currentPointer.dragging) {
      suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      lastClickInfo = null;
      save();
      render();
      return;
    }

    if (currentPointer.mode === "move-note") {
      if (consumeDoubleClick("note", currentPointer.id)) {
        enterEditing("note", currentPointer.id);
        return;
      }
      selection = { type: "note", id: currentPointer.id };
      linkSourceId = null;
      isBatchLinkMode = false;
      render();
      return;
    }

    if (currentPointer.mode === "move-box") {
      if (consumeDoubleClick("box", currentPointer.id)) {
        enterEditing("box", currentPointer.id);
        return;
      }
      handleBoxClick(currentPointer.id);
      return;
    }

    selection = { type: currentPointer.type, id: currentPointer.id };
    if (currentPointer.type !== "box") {
      linkSourceId = null;
      isBatchLinkMode = false;
    }
    render();
  }

  function handleBoxClick(id) {
    lastClickInfo = { type: "box", id, at: performance.now() };
    selection = { type: "box", id };
    if (linkSourceId === id) {
      linkSourceId = null;
      isBatchLinkMode = false;
      render();
      return;
    }
    if (!linkSourceId) {
      linkSourceId = id;
      isBatchLinkMode = false;
      render();
      return;
    }
    createLink(linkSourceId, id, { keepSource: isBatchLinkMode });
  }

  function createLink(fromId, toId, options = {}) {
    if (!fromId || !toId || fromId === toId) return;
    const keepSource = Boolean(options.keepSource);
    const exists = state.links.some((link) => link.fromId === fromId && link.toId === toId);

    if (exists) {
      if (keepSource) {
        selection = { type: "box", id: fromId };
      } else {
        linkSourceId = null;
      }
      showStatus("这些方框之间的连接已存在", 2200);
      render();
      return;
    }

    state.links.push({ id: createId("link"), fromId, toId });

    if (keepSource) {
      selection = { type: "box", id: fromId };
      showStatus("批量连线中：继续点击方框可持续连接", 2200);
    } else {
      linkSourceId = null;
      showStatus("连接已创建", 1800);
    }

    save();
    render();
  }

  function createNoteFromTimeline(event, id) {
    event.preventDefault();
    event.stopPropagation();
    const timeline = getTimelineById(state, id);
    if (!timeline) return;

    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
    const bounds = getTimelineTrackBounds(timeline);
    const ratio = clamp((point.x - bounds.left) / Math.max(bounds.width, 1), 0, 1);
    const totalMinutes = timeline.startHour * 60 + ratio * ((timeline.endHour - timeline.startHour) * 60);
    const label = formatMinutes(totalMinutes);

    addNote(bounds.left + ratio * bounds.width, timeline.y + TIMELINE_HEIGHT + 32, {
      text: label,
      autoEdit: true,
    });
    showStatus(`已在 ${label} 添加文本`, 1800);
  }

  function handleBackgroundPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Element) || event.button !== 0) return;
    if (target.closest(".timeline-item, .text-note, .diagram-box, .link-path, .context-menu, .board-toolbar")) return;
    selection = null;
    linkSourceId = null;
    isBatchLinkMode = false;
    lastClickInfo = null;
    if (editing) {
      editing = null;
    }
    render();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest(".link-path");
    const timeline = target.closest(".timeline-item");
    const note = target.closest(".text-note");
    const box = target.closest(".diagram-box");
    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);

    contextState = {
      x: point.x,
      y: point.y,
      type: link ? "link" : timeline ? "timeline" : note ? "note" : box ? "box" : null,
      id: link?.dataset.id || timeline?.dataset.id || note?.dataset.id || box?.dataset.id || null,
    };

    if (contextState.type === "link" && contextState.id) {
      selection = { type: "link", id: contextState.id };
      linkSourceId = null;
      isBatchLinkMode = false;
      lastClickInfo = null;
      render();
    }

    const currentBox = contextState.type === "box" ? getBoxById(state, contextState.id) : null;
    const clearEnabled = contextState.type === "note" || contextState.type === "box";
    const deleteEnabled = Boolean(contextState.type && contextState.id);
    dom.clearTextMenuBtn.disabled = !clearEnabled;
    dom.deleteItemMenuBtn.disabled = !deleteEnabled;
    if (dom.batchLinkMenuBtn) {
      dom.batchLinkMenuBtn.hidden = !currentBox;
      dom.batchLinkMenuBtn.disabled = !currentBox;
      dom.batchLinkMenuBtn.textContent = currentBox && linkSourceId === currentBox.id && isBatchLinkMode
        ? "结束批量连线"
        : "从这里批量连线";
      dom.batchLinkMenuBtn.classList.toggle("is-active", Boolean(currentBox && linkSourceId === currentBox.id && isBatchLinkMode));
      dom.batchLinkMenuBtn.setAttribute("aria-pressed", String(Boolean(currentBox && linkSourceId === currentBox.id && isBatchLinkMode)));
    }
    dom.boxShapeDivider.hidden = !currentBox;
    dom.boxShapeMenu.hidden = !currentBox;

    Array.from(dom.boxShapeMenu.querySelectorAll('[data-action="set-box-shape"]')).forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const active = Boolean(currentBox && button.dataset.shape === currentBox.shape);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    dom.contextMenu.hidden = false;

    const stageRect = dom.stage.getBoundingClientRect();
    const menuWidth = dom.contextMenu.offsetWidth || 220;
    const menuHeight = dom.contextMenu.offsetHeight || 220;
    dom.contextMenu.style.left = `${clamp(event.clientX - stageRect.left + 12, 12, Math.max(12, stageRect.width - menuWidth - 12))}px`;
    dom.contextMenu.style.top = `${clamp(event.clientY - stageRect.top + 12, 12, Math.max(12, stageRect.height - menuHeight - 12))}px`;
  }

  function handleMenuAction(event) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !contextState) return;

    if (target.dataset.action === "create-note") addNote(contextState.x, contextState.y);
    if (target.dataset.action === "clear-text" && contextState.type && contextState.id) clearText(contextState.type, contextState.id);
    if (target.dataset.action === "toggle-batch-link" && contextState.type === "box" && contextState.id) toggleBatchLinkMode(contextState.id);
    if (target.dataset.action === "delete-item" && contextState.type && contextState.id) deleteItem(contextState.type, contextState.id);
    if (target.dataset.action === "set-box-shape" && contextState.type === "box" && contextState.id) setBoxShape(contextState.id, target.dataset.shape);
    hideContextMenu();
  }

  function hideContextMenu() {
    dom.contextMenu.hidden = true;
    contextState = null;
  }

  function clearText(type, id) {
    if (type === "note") {
      const note = getNoteById(state, id);
      if (!note) return;
      note.text = "";
      note.height = NOTE_DEFAULT_HEIGHT;
    }
    if (type === "box") {
      const box = getBoxById(state, id);
      if (!box) return;
      box.text = "";
      box.height = BOX_DEFAULT_HEIGHT;
    }
    save();
    render();
  }

  function setBoxShape(id, shape) {
    const box = getBoxById(state, id);
    if (!box) return;
    box.shape = normalizeBoxShape(shape);
    selection = { type: "box", id };
    save();
    showStatus(`已切换为 ${getBoxShapeLabel(box.shape)}`, 1800);
    render();
  }

  function deleteItem(type, id) {
    if (type === "timeline") {
      state.timelines = state.timelines.filter((item) => item.id !== id);
    }
    if (type === "note") {
      state.notes = state.notes.filter((item) => item.id !== id);
    }
    if (type === "box") {
      state.boxes = state.boxes.filter((item) => item.id !== id);
      state.links = state.links.filter((link) => link.fromId !== id && link.toId !== id);
      if (linkSourceId === id) {
        linkSourceId = null;
        isBatchLinkMode = false;
      }
    }
    if (type === "link") {
      state.links = state.links.filter((link) => link.id !== id);
    }
    if (selection?.id === id && selection?.type === type) selection = null;
    if (editing?.id === id && editing?.type === type) editing = null;
    save();
    render();
  }

  function removeSelection() {
    if (!selection) return;
    lastClickInfo = null;
    deleteItem(selection.type, selection.id);
  }

  function enterEditing(type, id) {
    lastClickInfo = null;
    editing = { type, id };
    selection = { type, id };
    if (type === "box") {
      linkSourceId = null;
      isBatchLinkMode = false;
    }
    focusRequest = { type, id };
    render();
  }

  function addTimeline() {
    const center = centerPoint();
    const lastTimeline = state.timelines[state.timelines.length - 1];
    const timeline = {
      id: createId("timeline"),
      x: Math.max(WORLD_PADDING, center.x - TIMELINE_DEFAULT_WIDTH / 2),
      y: lastTimeline ? lastTimeline.y + 112 : Math.max(TIMELINE_MIN_Y, center.y - 90),
      width: TIMELINE_DEFAULT_WIDTH,
      label: `时间线 ${state.timelines.length + 1}`,
      startHour: TIMELINE_START_HOUR,
      endHour: TIMELINE_END_HOUR,
    };

    state.timelines.push(timeline);
    selection = { type: "timeline", id: timeline.id };
    linkSourceId = null;
    isBatchLinkMode = false;
    save();
    focusRequest = { type: "timeline", id: timeline.id };
    render();
  }

  function addNote(x, y, options = {}) {
    const { text = "", autoEdit = true } = options;
    const note = {
      id: createId("note"),
      x: Math.max(WORLD_PADDING, x - NOTE_DEFAULT_WIDTH / 2),
      y: Math.max(WORLD_PADDING, y - NOTE_DEFAULT_HEIGHT / 2),
      width: NOTE_DEFAULT_WIDTH,
      height: NOTE_DEFAULT_HEIGHT,
      text,
    };

    state.notes.push(note);
    save();

    if (autoEdit) {
      enterEditing("note", note.id);
      return;
    }

    selection = { type: "note", id: note.id };
    render();
  }

  function addBox(x, y) {
    const box = {
      id: createId("box"),
      x: Math.max(WORLD_PADDING, x - BOX_DEFAULT_WIDTH / 2),
      y: Math.max(WORLD_PADDING, y - BOX_DEFAULT_HEIGHT / 2),
      width: BOX_DEFAULT_WIDTH,
      height: BOX_DEFAULT_HEIGHT,
      shape: DEFAULT_BOX_SHAPE,
      text: "",
    };

    state.boxes.push(box);
    save();
    enterEditing("box", box.id);
  }

  function clearAll() {
    if (!state.timelines.length && !state.notes.length && !state.boxes.length) return;
    if (!window.confirm("确定清空当前画布中的时间线、文本、流程图节点和连接线吗？")) return;

    state = { timelines: [], notes: [], boxes: [], links: [] };
    selection = null;
    editing = null;
    linkSourceId = null;
    isBatchLinkMode = false;
    lastClickInfo = null;
    localStorage.removeItem(LEGACY_NOTE_KEY);
    save();
    render();
  }

  async function exportPng() {
    try {
      const fileName = await exportBoardAsPng({ state, worldSize });
      showStatus(`${fileName} 已导出`, 2200);
    } catch {
      showStatus("导出失败，请稍后再试", 2400);
    }
  }

  function setZoom(nextZoom) {
    zoom = clamp(Number(nextZoom.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    render();
  }

  function centerPoint() {
    return {
      x: dom.viewport.scrollLeft / zoom + dom.viewport.clientWidth / (2 * zoom),
      y: dom.viewport.scrollTop / zoom + dom.viewport.clientHeight / (2 * zoom),
    };
  }

  function renderStatus() {
    dom.statusText.textContent = transientStatus || getStatusMessage();
  }

  function getStatusMessage() {
    if (linkSourceId && isBatchLinkMode) {
      return "批量连线已开启，点击方框继续连接，按 Esc 结束。";
    }
    if (selection?.type === "link") {
      return "当前已选中连接线，按 Delete / Backspace 或右键删除元素即可删除。";
    }
    if (selection?.type === "box") {
      const current = getBoxById(state, selection.id);
      if (current) {
        return `当前节点：${getBoxShapeLabel(current.shape)}，右键可切换 Lucidchart Flowchart Symbols`;
      }
    }
    return getDefaultStatus(state, linkSourceId);
  }

  function showStatus(message, duration = 1600) {
    transientStatus = message;
    renderStatus();
    clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      transientStatus = "";
      renderStatus();
    }, duration);
  }

  function save() {
    saveState(state);
  }

  function consumeDoubleClick(type, id) {
    const now = performance.now();
    const isRepeat = Boolean(
      lastClickInfo
      && lastClickInfo.type === type
      && lastClickInfo.id === id
      && now - lastClickInfo.at <= DOUBLE_CLICK_MS,
    );

    lastClickInfo = isRepeat ? null : { type, id, at: now };
    return isRepeat;
  }
}

function getDom() {
  return {
    stage: document.querySelector(".board-stage"),
    viewport: document.getElementById("viewport"),
    worldSizer: document.getElementById("world-sizer"),
    world: document.getElementById("world"),
    linksLayer: document.getElementById("links-layer"),
    linksPaths: document.getElementById("links-paths"),
    timelinesLayer: document.getElementById("timelines-layer"),
    notesLayer: document.getElementById("notes-layer"),
    boxesLayer: document.getElementById("boxes-layer"),
    emptyState: document.getElementById("empty-state"),
    statusText: document.getElementById("status-text"),
    contextMenu: document.getElementById("context-menu"),
    clearTextMenuBtn: document.querySelector('[data-action="clear-text"]'),
    batchLinkMenuBtn: document.getElementById("batch-link-menu-btn"),
    deleteItemMenuBtn: document.querySelector('[data-action="delete-item"]'),
    boxShapeDivider: document.getElementById("box-shape-divider"),
    boxShapeMenu: document.getElementById("box-shape-menu"),
    createTimelineBtn: document.getElementById("create-timeline-btn"),
    createNoteBtn: document.getElementById("create-note-btn"),
    createBoxBtn: document.getElementById("create-box-btn"),
    zoomOutBtn: document.getElementById("zoom-out-btn"),
    zoomResetBtn: document.getElementById("zoom-reset-btn"),
    zoomInBtn: document.getElementById("zoom-in-btn"),
    exportPngBtn: document.getElementById("export-png-btn"),
    clearAllBtn: document.getElementById("clear-all-btn"),
  };
}

function create(tagName, props = {}) {
  const node = document.createElement(tagName);
  Object.entries(props).forEach(([key, value]) => {
    if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  });
  return node;
}

function createSvg(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function noteCardClass(baseClass, isSelected, isLinkSource) {
  const classes = [baseClass];
  if (isSelected) classes.push("is-selected");
  if (isLinkSource) classes.push("is-link-source");
  return classes.join(" ");
}

function getBoxCardClass(box, isSelected, isLinkSource) {
  const classes = noteCardClass("diagram-box", isSelected, isLinkSource).split(" ");
  classes.push(`diagram-box--${box.shape || DEFAULT_BOX_SHAPE}`);
  return classes.join(" ");
}

function applyEntityGeometry(node, type, entity) {
  node.style.left = `${entity.x}px`;
  node.style.top = `${entity.y}px`;
  node.style.width = `${entity.width}px`;
  if (type !== "timeline") {
    node.style.height = `${entity.height}px`;
  }
}

function getTypeFromMode(mode) {
  if (mode.includes("timeline")) return "timeline";
  if (mode.includes("note")) return "note";
  return "box";
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}


