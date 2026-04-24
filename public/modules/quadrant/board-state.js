import {
  BOX_SHAPES,
  DEFAULT_BOX_SHAPE,
  getBoxShapeGroupLabel,
  getBoxShapeLabel,
  normalizeBoxShape,
} from "./board-shapes.js";

export {
  BOX_SHAPES,
  DEFAULT_BOX_SHAPE,
  getBoxShapeGroupLabel,
  getBoxShapeLabel,
  normalizeBoxShape,
};

export const STORAGE_KEY = "shanlic-time-planner-v1";
export const LEGACY_NOTE_KEY = "quadrant-notes-v1";

export const WORLD_PADDING = 72;
export const WORLD_MIN_WIDTH = 1800;
export const WORLD_MIN_HEIGHT = 1200;

export const TIMELINE_HEIGHT = 78;
export const TIMELINE_MIN_Y = 112;
export const TIMELINE_DEFAULT_WIDTH = 1120;
export const TIMELINE_MIN_WIDTH = 420;
export const TIMELINE_START_HOUR = 8;
export const TIMELINE_END_HOUR = 22;
export const TIMELINE_STEP = 2;

export const NOTE_DEFAULT_WIDTH = 132;
export const NOTE_DEFAULT_HEIGHT = 56;
export const NOTE_MIN_WIDTH = 118;
export const NOTE_MIN_HEIGHT = 52;

export const BOX_DEFAULT_WIDTH = 260;
export const BOX_DEFAULT_HEIGHT = 108;
export const BOX_MIN_WIDTH = 240;
export const BOX_MIN_HEIGHT = 108;

export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 1.8;

export const DEFAULT_LINK_STROKE = "solid";
export const DEFAULT_LINK_MARKER = "arrow";

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function normalizeLinkStroke(value) {
  return value === "dashed" ? "dashed" : DEFAULT_LINK_STROKE;
}

export function normalizeLinkMarker(value) {
  return value === "none" ? "none" : DEFAULT_LINK_MARKER;
}

export function normalizeTimeline(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
  const startHour = clamp(Math.round(normalizeNumber(item.startHour, TIMELINE_START_HOUR)), 0, 23);
  const endHour = clamp(Math.round(normalizeNumber(item.endHour, TIMELINE_END_HOUR)), startHour + 1, 24);
  return {
    id: item.id,
    x: normalizeNumber(item.x, WORLD_PADDING + 24),
    y: normalizeNumber(item.y, 140),
    width: normalizeNumber(item.width, TIMELINE_DEFAULT_WIDTH),
    label: typeof item.label === "string" ? item.label : "\u65f6\u95f4\u7ebf",
    startHour,
    endHour,
  };
}

export function normalizeNote(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
  return {
    id: item.id,
    x: normalizeNumber(item.x, 120),
    y: normalizeNumber(item.y, 140),
    width: normalizeNumber(item.width, NOTE_DEFAULT_WIDTH),
    height: normalizeNumber(item.height, NOTE_DEFAULT_HEIGHT),
    text: typeof item.text === "string" ? item.text : "",
  };
}

export function normalizeBox(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
  return {
    id: item.id,
    x: normalizeNumber(item.x, 180),
    y: normalizeNumber(item.y, 220),
    width: normalizeNumber(item.width, BOX_DEFAULT_WIDTH),
    height: normalizeNumber(item.height, BOX_DEFAULT_HEIGHT),
    shape: normalizeBoxShape(item.shape),
    text: typeof item.text === "string" ? item.text : "",
  };
}

export function normalizeLink(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") return null;
  if (typeof item.fromId !== "string" || typeof item.toId !== "string") return null;
  return {
    id: item.id,
    fromId: item.fromId,
    toId: item.toId,
    stroke: normalizeLinkStroke(item.stroke),
    marker: normalizeLinkMarker(item.marker),
  };
}

export function loadLegacyNotes() {
  try {
    const raw = localStorage.getItem(LEGACY_NOTE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeNote).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function sanitizeLinks(links, boxes) {
  const boxIds = new Set(boxes.map((box) => box.id));
  const seen = new Set();
  return links.filter((link) => {
    if (!boxIds.has(link.fromId) || !boxIds.has(link.toId) || link.fromId === link.toId) return false;
    const key = `${link.fromId}->${link.toId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeState(parsed);
  } catch {
    return normalizeState(null);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  localStorage.removeItem(LEGACY_NOTE_KEY);
}

export function normalizeState(parsed) {
  const timelines = Array.isArray(parsed?.timelines) ? parsed.timelines.map(normalizeTimeline).filter(Boolean) : [];
  const notes = Array.isArray(parsed?.notes) ? parsed.notes.map(normalizeNote).filter(Boolean) : loadLegacyNotes();
  const boxes = Array.isArray(parsed?.boxes) ? parsed.boxes.map(normalizeBox).filter(Boolean) : [];
  const links = Array.isArray(parsed?.links) ? parsed.links.map(normalizeLink).filter(Boolean) : [];

  return {
    timelines,
    notes,
    boxes,
    links: sanitizeLinks(links, boxes),
  };
}

export function serializeState(state) {
  const normalized = normalizeState(state);
  return {
    timelines: normalized.timelines.map((timeline) => ({ ...timeline })),
    notes: normalized.notes.map((note) => ({ ...note })),
    boxes: normalized.boxes.map((box) => ({ ...box })),
    links: normalized.links.map((link) => ({ ...link })),
  };
}

export function getTimelineById(state, id) {
  return state.timelines.find((item) => item.id === id) || null;
}

export function getNoteById(state, id) {
  return state.notes.find((item) => item.id === id) || null;
}

export function getBoxById(state, id) {
  return state.boxes.find((item) => item.id === id) || null;
}

export function getLinkById(state, id) {
  return state.links.find((item) => item.id === id) || null;
}

export function getTimelineMarks(startHour, endHour) {
  const marks = [];
  for (let hour = startHour; hour <= endHour; hour += TIMELINE_STEP) {
    marks.push(hour);
  }
  if (marks[marks.length - 1] !== endHour) {
    marks.push(endHour);
  }
  return marks;
}

export function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatMinutes(totalMinutes) {
  const rounded = Math.round(totalMinutes);
  const hour = Math.floor(rounded / 60);
  const minute = rounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getDefaultStatus(state) {
  if (!state.timelines.length && !state.notes.length && !state.boxes.length) {
    return "\u753b\u5e03\u5df2\u5c31\u7eea\u3002";
  }

  return `\u5df2\u521b\u5efa ${state.timelines.length} \u6761\u65f6\u95f4\u7ebf\u3001${state.boxes.length} \u4e2a\u56fe\u5f62\u8282\u70b9\u3001${state.notes.length} \u6761\u6587\u672c\u3002`;
}
