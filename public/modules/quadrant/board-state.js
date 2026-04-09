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

export const DEFAULT_BOX_SHAPE = "process";

export const FLOWCHART_SHAPES = [
  { id: "process", label: "处理", group: "common" },
  { id: "terminator", label: "开始/结束", group: "common" },
  { id: "document", label: "文档", group: "common" },
  { id: "decision", label: "判断", group: "common" },
  { id: "connector", label: "连接符", group: "common" },
  { id: "off-page-connector", label: "跨页连接符", group: "common" },
  { id: "input-output", label: "输入输出", group: "common" },
  { id: "comment", label: "注释", group: "common" },
  { id: "database", label: "数据库", group: "additional" },
  { id: "paper-tape", label: "纸带", group: "additional" },
  { id: "summing-junction", label: "汇总连接", group: "additional" },
  { id: "predefined-process", label: "预定义流程", group: "additional" },
  { id: "internal-storage", label: "内部存储", group: "additional" },
  { id: "manual-input", label: "手动输入", group: "additional" },
  { id: "manual-operation", label: "手动操作", group: "additional" },
  { id: "merge", label: "合并", group: "additional" },
  { id: "multiple-documents", label: "多文档", group: "additional" },
  { id: "preparation", label: "准备", group: "additional" },
  { id: "stored-data", label: "存储数据", group: "additional" },
  { id: "delay", label: "延迟", group: "additional" },
  { id: "or", label: "或", group: "additional" },
  { id: "display", label: "显示", group: "additional" },
  { id: "hard-disk", label: "硬盘", group: "additional" },
];

const FLOWCHART_SHAPE_GROUP_LABELS = {
  common: "常见符号",
  additional: "附加符号",
};

const FLOWCHART_SHAPE_IDS = new Set(FLOWCHART_SHAPES.map((item) => item.id));

const FLOWCHART_SHAPE_ALIASES = {
  subprocess: "predefined-process",
  subflow: "predefined-process",
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function normalizeBoxShape(value) {
  const candidate = typeof value === "string" ? FLOWCHART_SHAPE_ALIASES[value] || value : "";
  return FLOWCHART_SHAPE_IDS.has(candidate) ? candidate : DEFAULT_BOX_SHAPE;
}

export function getBoxShapeLabel(shape) {
  const normalized = normalizeBoxShape(shape);
  return FLOWCHART_SHAPES.find((item) => item.id === normalized)?.label || "处理";
}

export function getBoxShapeGroupLabel(group) {
  return FLOWCHART_SHAPE_GROUP_LABELS[group] || group;
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
    label: typeof item.label === "string" ? item.label : "时间线",
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
  } catch {
    return {
      timelines: [],
      notes: loadLegacyNotes(),
      boxes: [],
      links: [],
    };
  }
}

export function saveState(state) {
  state.links = sanitizeLinks(state.links, state.boxes);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.removeItem(LEGACY_NOTE_KEY);
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

export function getDefaultStatus(state, linkSourceId) {
  if (linkSourceId) {
    return "已选中起点方框，再点一个方框即可连接。";
  }
  if (!state.timelines.length && !state.notes.length && !state.boxes.length) {
    return "画布已就绪。";
  }
  return `已创建 ${state.timelines.length} 条时间线、${state.boxes.length} 个流程图节点、${state.notes.length} 个文本。`;
}
