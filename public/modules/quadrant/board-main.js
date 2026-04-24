import {
  buildPreviewLinkGeometry,
  buildResolvedLinkGeometry,
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
  BOX_SHAPES,
  BOX_MIN_HEIGHT,
  BOX_MIN_WIDTH,
  DEFAULT_BOX_SHAPE,
  DEFAULT_LINK_MARKER,
  DEFAULT_LINK_STROKE,
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
  getLinkById,
  getNoteById,
  getTimelineById,
  getTimelineMarks,
  loadState,
  normalizeLinkMarker,
  normalizeLinkStroke,
  normalizeState,
  normalizeBoxShape,
  serializeState,
  saveState,
} from "./board-state.js";
import { buildBoxShapeModel } from "./board-shapes.js";

const DRAG_THRESHOLD = 4;
const CLICK_SUPPRESS_MS = 140;
const DOUBLE_CLICK_MS = 280;
const EDITOR_CHROME_HEIGHT = 24;
const HISTORY_LIMIT = 120;

export function initBoard() {
  const dom = getDom();
  let state = loadState();
  let zoom = 1;
  let worldSize = { width: 1800, height: 1200 };
  let selection = null;
  let editing = null;
  let pointerState = null;
  let contextState = null;
  let focusRequest = null;
  let transientStatus = "";
  let statusTimer = 0;
  let resizeFrame = 0;
  let suppressClickUntil = 0;
  let lastClickInfo = null;
  let activeTool = "select";
  let isSpacePanning = false;
  let editSessionSnapshot = "";
  let history = [];
  let historyIndex = -1;
  let linkGeometryById = new Map();

  bindEvents();
  initializeHistory();
  render();

  function bindEvents() {
    populateShapeMenu();

    dom.toolSelectBtn.addEventListener("click", () => setActiveTool("select"));
    dom.toolHandBtn.addEventListener("click", () => setActiveTool("hand"));
    dom.toolArrowBtn.addEventListener("click", () => setActiveTool("arrow"));
    dom.createTimelineBtn.addEventListener("click", () => setActiveTool("timeline"));
    dom.createNoteBtn.addEventListener("click", () => setActiveTool("note"));
    dom.createBoxBtn.addEventListener("click", () => setActiveTool("box"));
    dom.undoBtn.addEventListener("click", undo);
    dom.redoBtn.addEventListener("click", redo);
    dom.importJsonBtn.addEventListener("click", () => dom.importJsonInput.click());
    dom.importJsonInput.addEventListener("change", importJson);
    dom.exportJsonBtn.addEventListener("click", exportJson);
    dom.zoomOutBtn.addEventListener("click", () => setZoom(zoom - 0.1));
    dom.zoomResetBtn.addEventListener("click", () => setZoom(1));
    dom.zoomInBtn.addEventListener("click", () => setZoom(zoom + 0.1));
    dom.exportPngBtn.addEventListener("click", exportPng);
    dom.clearAllBtn.addEventListener("click", clearAll);
    dom.linkStrokeSolidBtn.addEventListener("click", () => updateSelectedLinkStyle({ stroke: "solid" }));
    dom.linkStrokeDashedBtn.addEventListener("click", () => updateSelectedLinkStyle({ stroke: "dashed" }));
    dom.linkMarkerArrowBtn.addEventListener("click", () => updateSelectedLinkStyle({ marker: "arrow" }));
    dom.linkMarkerNoneBtn.addEventListener("click", () => updateSelectedLinkStyle({ marker: "none" }));

    dom.viewport.addEventListener("contextmenu", handleContextMenu);
    dom.contextMenu.addEventListener("click", handleMenuAction);
    dom.viewport.addEventListener("pointerdown", handleBackgroundPointerDown);
    dom.viewport.addEventListener("wheel", handleViewportWheel, { passive: false });
    dom.viewport.addEventListener("scroll", syncLinkToolbarPosition, { passive: true });

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", finishPointer);
    window.addEventListener("keyup", handleWindowKeyUp);
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
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        if (!isSpacePanning) {
          event.preventDefault();
          isSpacePanning = true;
          render();
        }
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redo();
          return;
        }
      }

      if (event.key === "Escape") {
        hideContextMenu();
        if (editing) {
          editing = null;
          finalizeEditSession();
          lastClickInfo = null;
          render();
          return;
        }
        if (pointerState?.mode === "create-link") {
          pointerState = null;
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

      const key = event.key.toLowerCase();
      if (key === "v") {
        setActiveTool("select");
        return;
      }
      if (key === "h") {
        setActiveTool("hand");
        return;
      }
      if (key === "a") {
        setActiveTool("arrow");
        return;
      }
      if (key === "l") {
        setActiveTool("timeline");
        return;
      }
      if (key === "n") {
        setActiveTool("note");
        return;
      }
      if (key === "b") {
        setActiveTool("box");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelection();
        return;
      }
    });
  }

  function populateShapeMenu() {
    dom.boxShapeMenu.replaceChildren();
    const groups = new Map();

    BOX_SHAPES.forEach((shape) => {
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
          title: `${shape.gojsName} · ${shape.label}`,
        });
        button.dataset.action = "set-box-shape";
        button.dataset.shape = shape.id;
        button.append(createShapePreview(shape.id), createShapeLabel(shape));
        grid.append(button);
      });

      section.append(grid);
      dom.boxShapeMenu.append(section);
    });
  }

  function initializeHistory() {
    history = [snapshotState()];
    historyIndex = 0;
  }

  function snapshotState() {
    return JSON.stringify(serializeState(state));
  }

  function persistState() {
    saveState(state);
  }

  function commitState() {
    persistState();
    const snapshot = snapshotState();
    if (history[historyIndex] === snapshot) {
      return;
    }

    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);

    if (history.length > HISTORY_LIMIT) {
      history.shift();
    } else {
      historyIndex += 1;
    }

    historyIndex = history.length - 1;
  }

  function restoreHistory(targetIndex) {
    if (targetIndex < 0 || targetIndex >= history.length) return;

    state = normalizeState(JSON.parse(history[targetIndex]));
    historyIndex = targetIndex;
    selection = null;
    editing = null;
    editSessionSnapshot = "";
    pointerState = null;
    focusRequest = null;
    lastClickInfo = null;
    hideContextMenu();
    persistState();
    render();
  }

  function undo() {
    if (historyIndex <= 0) return;
    restoreHistory(historyIndex - 1);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    restoreHistory(historyIndex + 1);
  }

  function setActiveTool(nextTool) {
    activeTool = nextTool;
    if (pointerState?.mode === "create-link") {
      pointerState = null;
    }
    hideContextMenu();
    render();
  }

  function shouldUseHandTool() {
    return activeTool === "hand" || isSpacePanning;
  }

  function shouldUseArrowTool() {
    return activeTool === "arrow";
  }

  function renderToolbarState() {
    const activeButtons = new Map([
      ["select", dom.toolSelectBtn],
      ["hand", dom.toolHandBtn],
      ["arrow", dom.toolArrowBtn],
      ["timeline", dom.createTimelineBtn],
      ["note", dom.createNoteBtn],
      ["box", dom.createBoxBtn],
    ]);

    activeButtons.forEach((button, tool) => {
      if (!(button instanceof HTMLButtonElement)) return;
      const active = activeTool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    dom.undoBtn.disabled = historyIndex <= 0;
    dom.redoBtn.disabled = historyIndex >= history.length - 1;
    dom.stage.classList.toggle("is-hand-mode", shouldUseHandTool());
    dom.stage.classList.toggle("is-arrow-mode", shouldUseArrowTool());
    dom.stage.classList.toggle("is-space-panning", isSpacePanning);
    dom.stage.classList.toggle("is-panning", Boolean(pointerState?.mode === "pan-viewport" && pointerState.dragging));
  }

  function render() {
    syncWorld();
    renderTimelines();
    renderNotes();
    renderBoxes();
    renderLinks();
    syncDraftConnectorState();
    renderToolbarState();
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
        beginEditSession();
        persistState();
      });
      input.addEventListener("focus", beginEditSession);
      input.addEventListener("blur", finalizeEditSession);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget?.blur?.();
        }
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
        className: noteCardClass("text-note", selection?.type === "note" && selection.id === note.id),
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
      const isConnectorSource = pointerState?.mode === "create-link" && pointerState.id === box.id;
      const isConnectorTarget = pointerState?.mode === "create-link" && pointerState.hoverTargetId === box.id;
      const item = create("article", {
        className: getBoxCardClass(
          selection?.type === "box" && selection.id === box.id,
          isConnectorSource,
          isConnectorTarget,
        ),
        title: `${getBoxShapeLabel(box.shape)}，拖动移动，右下角缩放，双击编辑`,
      });
      item.dataset.id = box.id;
      applyEntityGeometry(item, "box", box);

      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest(".node-resize-handle") || isTypingTarget(target)) return;
        if (shouldUseArrowTool()) {
          beginLinkCreation(event, box.id, item);
          return;
        }
        beginPointer(event, "move-box", box.id, item);
      });

      const shapeModel = buildBoxShapeModel(box.shape, box.width, box.height);
      const surface = createShapeSurface(box, shapeModel);
      const content = create("div", { className: "diagram-box-content" });
      applyBoxContentLayout(content, shapeModel);
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
    linkGeometryById = buildResolvedLinkGeometries(state.links, state.boxes);

    state.links.forEach((link) => {
      const geometry = linkGeometryById.get(link.id);
      if (!geometry) return;

      const path = createSvg("path");
      path.setAttribute("class", selection?.type === "link" && selection.id === link.id ? "link-path is-selected" : "link-path");
      path.dataset.id = link.id;
      path.setAttribute("d", geometry.d);
      applyLinkPathPresentation(path, link);
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

    if (pointerState?.mode === "create-link") {
      const sourceBox = getBoxById(state, pointerState.id);
      const targetBox = pointerState.hoverTargetId ? getBoxById(state, pointerState.hoverTargetId) : null;
      const geometry = sourceBox
        ? targetBox
          ? buildResolvedLinkGeometry(sourceBox, targetBox)
          : buildPreviewLinkGeometry(sourceBox, pointerState.currentPoint)
        : null;

      if (geometry) {
        const draftPath = createSvg("path");
        draftPath.setAttribute("class", "link-path link-path--draft");
        draftPath.setAttribute("d", geometry.d);
        draftPath.setAttribute("marker-end", "url(#arrow-head)");
        dom.linksPaths.append(draftPath);
      }
    }

    renderLinkToolbar();
  }

  function selectLink(id) {
    if (!state.links.some((link) => link.id === id)) return;
    selection = { type: "link", id };
    editing = null;
    lastClickInfo = null;
    render();
  }

  function applyLinkPathPresentation(path, link) {
    const stroke = normalizeLinkStroke(link.stroke);
    const marker = normalizeLinkMarker(link.marker);

    if (stroke === "dashed") {
      path.setAttribute("stroke-dasharray", "10 7");
    } else {
      path.removeAttribute("stroke-dasharray");
    }

    if (marker === "none") {
      path.removeAttribute("marker-end");
    } else {
      path.setAttribute("marker-end", "url(#arrow-head)");
    }
  }

  function updateSelectedLinkStyle(nextStyle) {
    if (selection?.type !== "link") return;
    const link = getLinkById(state, selection.id);
    if (!link) return;

    const nextStroke = "stroke" in nextStyle ? normalizeLinkStroke(nextStyle.stroke) : link.stroke;
    const nextMarker = "marker" in nextStyle ? normalizeLinkMarker(nextStyle.marker) : link.marker;
    if (link.stroke === nextStroke && link.marker === nextMarker) return;

    link.stroke = nextStroke;
    link.marker = nextMarker;
    commitState();
    render();
  }

  function renderLinkToolbar() {
    if (selection?.type !== "link") {
      hideLinkToolbar();
      return;
    }

    const link = getLinkById(state, selection.id);
    const geometry = linkGeometryById.get(selection.id);
    if (!link || !geometry) {
      hideLinkToolbar();
      return;
    }

    const stroke = normalizeLinkStroke(link.stroke);
    const marker = normalizeLinkMarker(link.marker);
    updateLinkToolbarButtonState(dom.linkStrokeSolidBtn, stroke === "solid");
    updateLinkToolbarButtonState(dom.linkStrokeDashedBtn, stroke === "dashed");
    updateLinkToolbarButtonState(dom.linkMarkerArrowBtn, marker === "arrow");
    updateLinkToolbarButtonState(dom.linkMarkerNoneBtn, marker === "none");

    dom.linkToolbar.hidden = false;
    syncLinkToolbarPosition();
  }

  function hideLinkToolbar() {
    dom.linkToolbar.hidden = true;
  }

  function syncLinkToolbarPosition() {
    if (selection?.type !== "link") return;

    const geometry = linkGeometryById.get(selection.id);
    if (!geometry) {
      hideLinkToolbar();
      return;
    }

    const stageRect = dom.stage.getBoundingClientRect();
    const worldRect = dom.world.getBoundingClientRect();
    const midpoint = getLinkMidpoint(geometry.points);
    const anchorX = worldRect.left - stageRect.left + midpoint.x * zoom;
    const anchorY = worldRect.top - stageRect.top + midpoint.y * zoom;

    if (
      anchorX < -32
      || anchorY < -32
      || anchorX > stageRect.width + 32
      || anchorY > stageRect.height + 32
    ) {
      hideLinkToolbar();
      return;
    }

    dom.linkToolbar.hidden = false;
    const toolbarWidth = dom.linkToolbar.offsetWidth || 180;
    const toolbarHeight = dom.linkToolbar.offsetHeight || 52;
    const padding = 12;
    const clampedLeft = clamp(anchorX, padding + toolbarWidth / 2, Math.max(padding + toolbarWidth / 2, stageRect.width - padding - toolbarWidth / 2));
    const clampedTop = clamp(anchorY, toolbarHeight + padding + 14, Math.max(toolbarHeight + padding + 14, stageRect.height - padding));
    dom.linkToolbar.style.left = `${clampedLeft}px`;
    dom.linkToolbar.style.top = `${clampedTop}px`;
  }

  function updateLinkToolbarButtonState(button, active) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function syncDraftConnectorState() {
    const boxes = dom.boxesLayer.querySelectorAll(".diagram-box");
    boxes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const id = node.dataset.id;
      const isConnectorSource = pointerState?.mode === "create-link" && pointerState.id === id;
      const isConnectorTarget = pointerState?.mode === "create-link" && pointerState.hoverTargetId === id;
      node.classList.toggle("is-connector-source", Boolean(isConnectorSource));
      node.classList.toggle("is-connector-target", Boolean(isConnectorTarget));
    });
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
      persistState();
    });

    editor.addEventListener("blur", () => {
      editing = null;
      finalizeEditSession();
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

  function beginEditSession() {
    if (!editSessionSnapshot) {
      editSessionSnapshot = snapshotState();
    }
  }

  function finalizeEditSession() {
    if (!editSessionSnapshot) return;

    const snapshot = snapshotState();
    if (snapshot !== editSessionSnapshot) {
      commitState();
    } else {
      persistState();
    }
    editSessionSnapshot = "";
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

  function beginLinkCreation(event, id, node) {
    if (event.button !== 0) return;
    const sourceBox = getBoxById(state, id);
    if (!sourceBox) return;

    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
    pointerState = {
      mode: "create-link",
      id,
      pointerId: event.pointerId,
      node,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentPoint: point,
      hoverTargetId: null,
      dragging: false,
    };

    selection = { type: "box", id };
    editing = null;
    lastClickInfo = null;
    hideContextMenu();
    node.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    renderLinks();
    syncDraftConnectorState();
  }

  function beginPointer(event, mode, id, node) {
    if (event.button !== 0) return;
    if (shouldUseHandTool()) {
      beginViewportPan(event);
      return;
    }
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
    hideContextMenu();
    node.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }

  function beginViewportPan(event, node = dom.viewport) {
    pointerState = {
      mode: "pan-viewport",
      pointerId: event.pointerId,
      node,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: dom.viewport.scrollLeft,
      startScrollTop: dom.viewport.scrollTop,
      dragging: false,
    };

    node.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleWindowKeyUp(event) {
    if (event.code !== "Space") return;
    if (!isSpacePanning) return;
    isSpacePanning = false;
    render();
  }

  function handleViewportWheel(event) {
    if (!Number.isFinite(event.deltaY) && !Number.isFinite(event.deltaX)) return;
    event.preventDefault();

    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!dominantDelta) return;

    const direction = dominantDelta < 0 ? 1 : -1;
    setZoom(zoom + direction * 0.08, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  async function importJson(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const [file] = input.files || [];
    if (!file) return;

    try {
      const raw = await file.text();
      state = normalizeState(JSON.parse(raw));
      selection = null;
      editing = null;
      editSessionSnapshot = "";
      pointerState = null;
      focusRequest = null;
      lastClickInfo = null;
      hideContextMenu();
      commitState();
      render();
      showStatus(`${file.name} 已导入`, 2200);
    } catch {
      showStatus("JSON 导入失败，请检查文件内容", 2600);
    } finally {
      input.value = "";
    }
  }

  function exportJson() {
    try {
      const payload = JSON.stringify(serializeState(state), null, 2);
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const fileName = `quadrant-board-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = create("a", {
        href: url,
        download: fileName,
      });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(`${fileName} 已导出`, 2200);
    } catch {
      showStatus("JSON 导出失败，请稍后再试", 2400);
    }
  }

  function handlePointerMove(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    if (!pointerState.dragging && getDistance(pointerState.startClientX, pointerState.startClientY, event.clientX, event.clientY) > DRAG_THRESHOLD) {
      pointerState.dragging = true;
      if (pointerState.mode === "pan-viewport") {
        dom.stage.classList.add("is-panning");
      }
    }
    if (!pointerState.dragging) return;

    if (pointerState.mode === "pan-viewport") {
      dom.viewport.scrollLeft = pointerState.startScrollLeft - (event.clientX - pointerState.startClientX);
      dom.viewport.scrollTop = pointerState.startScrollTop - (event.clientY - pointerState.startClientY);
      return;
    }

    if (pointerState.mode === "create-link") {
      pointerState.currentPoint = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      const target = hoveredElement instanceof Element ? hoveredElement.closest(".diagram-box") : null;
      const hoverTargetId = target?.dataset.id || null;
      pointerState.hoverTargetId = hoverTargetId && hoverTargetId !== pointerState.id ? hoverTargetId : null;
      renderLinks();
      syncDraftConnectorState();
      return;
    }

    const entity = pointerState.type === "timeline"
      ? getTimelineById(state, pointerState.id)
      : pointerState.type === "note"
        ? getNoteById(state, pointerState.id)
        : getBoxById(state, pointerState.id);
    if (!entity) return;

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
    dom.stage.classList.remove("is-panning");

    if (currentPointer.mode === "pan-viewport") {
      if (currentPointer.dragging) {
        suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
        lastClickInfo = null;
      }
      render();
      return;
    }

    if (currentPointer.mode === "create-link") {
      const targetId = currentPointer.hoverTargetId;
      lastClickInfo = null;
      if (targetId) {
        createLink(currentPointer.id, targetId);
      } else {
        showStatus("箭头工具：拖到另一个方框上即可创建连线。", 2000);
        render();
      }
      return;
    }

    if (currentPointer.dragging) {
      suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      lastClickInfo = null;
      commitState();
      render();
      return;
    }

    if (currentPointer.mode === "move-note") {
      if (consumeDoubleClick("note", currentPointer.id)) {
        enterEditing("note", currentPointer.id);
        return;
      }
      selection = { type: "note", id: currentPointer.id };
      render();
      return;
    }

    if (currentPointer.mode === "move-box") {
      if (consumeDoubleClick("box", currentPointer.id)) {
        enterEditing("box", currentPointer.id);
        return;
      }
      lastClickInfo = { type: "box", id: currentPointer.id, at: performance.now() };
      selection = { type: "box", id: currentPointer.id };
      render();
      return;
    }

    selection = { type: currentPointer.type, id: currentPointer.id };
    render();
  }

  function createLink(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const exists = state.links.some((link) => link.fromId === fromId && link.toId === toId);

    if (exists) {
      selection = { type: "box", id: fromId };
      showStatus("这些方框之间的连接已存在", 2200);
      render();
      return;
    }

    state.links.push({
      id: createId("link"),
      fromId,
      toId,
      stroke: DEFAULT_LINK_STROKE,
      marker: DEFAULT_LINK_MARKER,
    });
    selection = { type: "link", id: state.links[state.links.length - 1].id };
    showStatus("连接已创建", 1800);
    commitState();
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
    if (target.closest(".timeline-item, .text-note, .diagram-box, .link-path, .context-menu, .board-toolbar, .board-brand, .link-toolbar")) return;

    hideContextMenu();
    if (editing) {
      editing = null;
      finalizeEditSession();
    }

    if (shouldUseHandTool()) {
      selection = null;
      lastClickInfo = null;
      beginViewportPan(event);
      render();
      return;
    }

    const point = getWorldPoint(dom.world, zoom, event.clientX, event.clientY);
    if (activeTool === "timeline") {
      activeTool = "select";
      addTimeline(point.x, point.y);
      return;
    }
    if (activeTool === "note") {
      activeTool = "select";
      addNote(point.x, point.y);
      return;
    }
    if (activeTool === "box") {
      activeTool = "select";
      addBox(point.x, point.y);
      return;
    }
    if (activeTool === "arrow") {
      selection = null;
      lastClickInfo = null;
      showStatus("箭头工具：请从一个方框拖到另一个方框。", 2000);
      render();
      return;
    }

    selection = null;
    lastClickInfo = null;
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
      lastClickInfo = null;
      render();
    }

    const currentBox = contextState.type === "box" ? getBoxById(state, contextState.id) : null;
    const clearEnabled = contextState.type === "note" || contextState.type === "box";
    const deleteEnabled = Boolean(contextState.type && contextState.id);
    dom.clearTextMenuBtn.disabled = !clearEnabled;
    dom.deleteItemMenuBtn.disabled = !deleteEnabled;
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
    commitState();
    render();
  }

  function setBoxShape(id, shape) {
    const box = getBoxById(state, id);
    if (!box) return;
    box.shape = normalizeBoxShape(shape);
    selection = { type: "box", id };
    commitState();
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
    }
    if (type === "link") {
      state.links = state.links.filter((link) => link.id !== id);
    }
    if (selection?.id === id && selection?.type === type) selection = null;
    if (editing?.id === id && editing?.type === type) {
      editing = null;
      editSessionSnapshot = "";
    }
    commitState();
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
    beginEditSession();
    selection = { type, id };
    focusRequest = { type, id };
    render();
  }

  function addTimeline(x = centerPoint().x, y = centerPoint().y) {
    const timeline = {
      id: createId("timeline"),
      x: Math.max(WORLD_PADDING, x - TIMELINE_DEFAULT_WIDTH / 2),
      y: Math.max(TIMELINE_MIN_Y, y - TIMELINE_HEIGHT / 2),
      width: TIMELINE_DEFAULT_WIDTH,
      label: `时间线 ${state.timelines.length + 1}`,
      startHour: TIMELINE_START_HOUR,
      endHour: TIMELINE_END_HOUR,
    };

    state.timelines.push(timeline);
    selection = { type: "timeline", id: timeline.id };
    commitState();
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
    commitState();

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
    commitState();
    enterEditing("box", box.id);
  }

  function clearAll() {
    if (!state.timelines.length && !state.notes.length && !state.boxes.length) return;
    if (!window.confirm("确定清空当前画布中的时间线、文本、流程图节点和连接线吗？")) return;

    state = { timelines: [], notes: [], boxes: [], links: [] };
    selection = null;
    editing = null;
    editSessionSnapshot = "";
    pointerState = null;
    lastClickInfo = null;
    focusRequest = null;
    hideContextMenu();
    localStorage.removeItem(LEGACY_NOTE_KEY);
    commitState();
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

  function setZoom(nextZoom, options = {}) {
    const viewportRect = dom.viewport.getBoundingClientRect();
    const anchorClientX = options.clientX ?? viewportRect.left + viewportRect.width / 2;
    const anchorClientY = options.clientY ?? viewportRect.top + viewportRect.height / 2;
    const anchorPoint = getWorldPoint(dom.world, zoom, anchorClientX, anchorClientY);
    const clampedZoom = clamp(Number(nextZoom.toFixed(2)), MIN_ZOOM, MAX_ZOOM);

    if (clampedZoom === zoom) return;

    zoom = clampedZoom;
    render();
    dom.viewport.scrollLeft = Math.max(0, anchorPoint.x * zoom - (anchorClientX - viewportRect.left));
    dom.viewport.scrollTop = Math.max(0, anchorPoint.y * zoom - (anchorClientY - viewportRect.top));
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
    if (isSpacePanning) {
      return "空格手型已启用，拖动画布即可平移。";
    }
    if (activeTool === "hand") {
      return "手型工具已启用，拖动画布即可平移。";
    }
    if (activeTool === "arrow") {
      return "箭头工具已启用，从一个方框拖到另一个方框即可创建连线。";
    }
    if (activeTool === "timeline") {
      return "点击空白画布放置时间线。";
    }
    if (activeTool === "note") {
      return "点击空白画布放置文本卡片。";
    }
    if (activeTool === "box") {
      return "点击空白画布放置 GoJS 图形节点。";
    }
    if (selection?.type === "link") {
      return "当前已选中连接线，可用浮动工具条切换线型和箭头，按 Delete / Backspace 可删除。";
    }
    if (selection?.type === "box") {
      const current = getBoxById(state, selection.id);
      if (current) {
        return `当前节点：${getBoxShapeLabel(current.shape)}，右键可切换 GoJS Figures`;
      }
    }
    return getDefaultStatus(state);
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
    deleteItemMenuBtn: document.querySelector('[data-action="delete-item"]'),
    boxShapeDivider: document.getElementById("box-shape-divider"),
    boxShapeMenu: document.getElementById("box-shape-menu"),
    toolSelectBtn: document.getElementById("tool-select-btn"),
    toolHandBtn: document.getElementById("tool-hand-btn"),
    toolArrowBtn: document.getElementById("tool-arrow-btn"),
    createTimelineBtn: document.getElementById("create-timeline-btn"),
    createNoteBtn: document.getElementById("create-note-btn"),
    createBoxBtn: document.getElementById("create-box-btn"),
    undoBtn: document.getElementById("undo-btn"),
    redoBtn: document.getElementById("redo-btn"),
    importJsonBtn: document.getElementById("import-json-btn"),
    exportJsonBtn: document.getElementById("export-json-btn"),
    importJsonInput: document.getElementById("import-json-input"),
    zoomOutBtn: document.getElementById("zoom-out-btn"),
    zoomResetBtn: document.getElementById("zoom-reset-btn"),
    zoomInBtn: document.getElementById("zoom-in-btn"),
    exportPngBtn: document.getElementById("export-png-btn"),
    clearAllBtn: document.getElementById("clear-all-btn"),
    linkToolbar: document.getElementById("link-toolbar"),
    linkStrokeSolidBtn: document.getElementById("link-stroke-solid-btn"),
    linkStrokeDashedBtn: document.getElementById("link-stroke-dashed-btn"),
    linkMarkerArrowBtn: document.getElementById("link-marker-arrow-btn"),
    linkMarkerNoneBtn: document.getElementById("link-marker-none-btn"),
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

function noteCardClass(baseClass, isSelected) {
  const classes = [baseClass];
  if (isSelected) classes.push("is-selected");
  return classes.join(" ");
}

function getBoxCardClass(isSelected, isConnectorSource, isConnectorTarget) {
  const classes = noteCardClass("diagram-box", isSelected).split(" ");
  if (isConnectorSource) classes.push("is-connector-source");
  if (isConnectorTarget) classes.push("is-connector-target");
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

function createShapeSurface(box, model) {
  const svg = createSvg("svg");
  svg.setAttribute("class", "diagram-box-figure");
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  const outline = createSvg("path");
  outline.setAttribute("class", "diagram-box-outline");
  outline.setAttribute("d", model.outlineD);
  svg.append(outline);

  model.accents.forEach((accent) => {
    const path = createSvg("path");
    path.setAttribute("class", "diagram-box-accent");
    path.setAttribute("d", accent.d);
    if (Number.isFinite(accent.opacity)) {
      path.setAttribute("opacity", String(accent.opacity));
    }
    svg.append(path);
  });

  return svg;
}

function createShapePreview(shapeId) {
  const shape = { shape: shapeId, width: 52, height: 34 };
  const model = buildBoxShapeModel(shapeId, shape.width, shape.height);
  const svg = createShapeSurface(shape, model);
  svg.setAttribute("class", "context-menu-shape-icon");
  return svg;
}

function createShapeLabel(shape) {
  const label = create("span", { className: "context-menu-shape-copy" });
  const title = create("span", { className: "context-menu-shape-name" });
  title.textContent = shape.label;
  const meta = create("span", { className: "context-menu-shape-meta" });
  meta.textContent = shape.gojsName;
  label.append(title, meta);
  return label;
}

function applyBoxContentLayout(node, model) {
  const { left, top, right, bottom } = model.textPadding;
  node.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
}

function getLinkMidpoint(points) {
  if (!Array.isArray(points) || !points.length) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return points[0];
  }

  const segments = [];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({ start, end, length });
    totalLength += length;
  }

  if (!totalLength) {
    return points[Math.floor(points.length / 2)];
  }

  let remaining = totalLength / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length ? remaining / segment.length : 0;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }

  return points[points.length - 1];
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


