export const DEFAULT_BOX_SHAPE = "rounded-rectangle";

export const BOX_SHAPES = [
  { id: "rectangle", gojsName: "Rectangle", label: "\u77e9\u5f62", group: "basic" },
  { id: "rounded-rectangle", gojsName: "RoundedRectangle", label: "\u5706\u89d2\u77e9\u5f62", group: "basic" },
  { id: "capsule", gojsName: "Capsule", label: "\u80f6\u56ca", group: "basic" },
  { id: "ellipse", gojsName: "Ellipse", label: "\u692d\u5706", group: "basic" },
  { id: "diamond", gojsName: "Diamond", label: "\u83f1\u5f62", group: "basic" },
  { id: "hexagon", gojsName: "Hexagon", label: "\u516d\u8fb9\u5f62", group: "basic" },
  { id: "parallelogram", gojsName: "Parallelogram", label: "\u5e73\u884c\u56db\u8fb9\u5f62", group: "basic" },
  { id: "trapezoid", gojsName: "Trapezoid", label: "\u68af\u5f62", group: "basic" },
  { id: "cloud", gojsName: "Cloud", label: "\u4e91", group: "basic" },
  { id: "procedure", gojsName: "Procedure", label: "\u5b50\u7a0b\u5e8f", group: "flow" },
  { id: "document", gojsName: "Document", label: "\u6587\u6863", group: "flow" },
  { id: "database", gojsName: "Database", label: "\u6570\u636e\u5e93", group: "flow" },
  { id: "manual-input", gojsName: "ManualInput", label: "\u624b\u52a8\u8f93\u5165", group: "flow" },
  { id: "off-page-connector", gojsName: "OffPageConnector", label: "\u8de8\u9875\u8fde\u63a5\u7b26", group: "flow" },
  { id: "delay", gojsName: "Delay", label: "\u5ef6\u8fdf", group: "flow" },
  { id: "display", gojsName: "Display", label: "\u663e\u793a", group: "flow" },
];

const SHAPE_GROUP_LABELS = {
  basic: "GoJS \u57fa\u7840\u56fe\u5f62",
  flow: "GoJS \u6d41\u7a0b\u56fe\u5f62",
};

const SHAPE_META_BY_ID = new Map(BOX_SHAPES.map((shape) => [shape.id, shape]));
const SHAPE_KEY_TO_ID = new Map();

BOX_SHAPES.forEach((shape) => {
  SHAPE_KEY_TO_ID.set(toShapeKey(shape.id), shape.id);
  SHAPE_KEY_TO_ID.set(toShapeKey(shape.gojsName), shape.id);
});

[
  ["process", "rectangle"],
  ["terminator", "capsule"],
  ["connector", "ellipse"],
  ["or", "ellipse"],
  ["summing-junction", "ellipse"],
  ["decision", "diamond"],
  ["input-output", "parallelogram"],
  ["comment", "cloud"],
  ["paper-tape", "document"],
  ["predefined-process", "procedure"],
  ["internal-storage", "database"],
  ["stored-data", "database"],
  ["hard-disk", "database"],
  ["manual-operation", "trapezoid"],
  ["merge", "diamond"],
  ["multiple-documents", "document"],
  ["preparation", "hexagon"],
  ["subprocess", "procedure"],
  ["subflow", "procedure"],
].forEach(([alias, target]) => {
  SHAPE_KEY_TO_ID.set(toShapeKey(alias), target);
});

const SHAPE_MODEL_BUILDERS = {
  rectangle: (width, height) => ({
    outlineD: roundedRectPath(width, height, 6),
    accents: [],
    textPadding: padding(18, 14, 18, 14),
    anchor: "rect",
  }),
  "rounded-rectangle": (width, height) => ({
    outlineD: roundedRectPath(width, height, 16),
    accents: [],
    textPadding: padding(20, 16, 20, 16),
    anchor: "rect",
  }),
  capsule: (width, height) => ({
    outlineD: roundedRectPath(width, height, Math.min(height / 2, width / 2)),
    accents: [],
    textPadding: padding(28, 16, 28, 16),
    anchor: "rect",
  }),
  ellipse: (width, height) => ({
    outlineD: ellipsePath(width, height),
    accents: [],
    textPadding: padding(width * 0.22, height * 0.22, width * 0.22, height * 0.22),
    anchor: "ellipse",
  }),
  diamond: (width, height) => ({
    outlineD: polygonPath([
      [width / 2, 0],
      [width, height / 2],
      [width / 2, height],
      [0, height / 2],
    ]),
    accents: [],
    textPadding: padding(width * 0.23, height * 0.24, width * 0.23, height * 0.24),
    anchor: "diamond",
  }),
  hexagon: (width, height) => ({
    outlineD: polygonPath([
      [width * 0.18, 0],
      [width * 0.82, 0],
      [width, height * 0.5],
      [width * 0.82, height],
      [width * 0.18, height],
      [0, height * 0.5],
    ]),
    accents: [],
    textPadding: padding(34, 18, 34, 18),
    anchor: "rect",
  }),
  parallelogram: (width, height) => ({
    outlineD: polygonPath([
      [width * 0.14, 0],
      [width, 0],
      [width * 0.86, height],
      [0, height],
    ]),
    accents: [],
    textPadding: padding(34, 16, 34, 16),
    anchor: "rect",
  }),
  trapezoid: (width, height) => ({
    outlineD: polygonPath([
      [width * 0.14, 0],
      [width * 0.86, 0],
      [width, height],
      [0, height],
    ]),
    accents: [],
    textPadding: padding(28, 18, 28, 18),
    anchor: "rect",
  }),
  cloud: (width, height) => ({
    outlineD: cloudPath(width, height),
    accents: [],
    textPadding: padding(26, 20, 26, 20),
    anchor: "ellipse",
  }),
  procedure: (width, height) => ({
    outlineD: roundedRectPath(width, height, 10),
    accents: [
      linePath(width * 0.14, 14, width * 0.14, height - 14),
      linePath(width * 0.86, 14, width * 0.86, height - 14),
    ].map((d) => ({ d })),
    textPadding: padding(40, 16, 40, 16),
    anchor: "rect",
  }),
  document: (width, height) => {
    const wave = Math.min(18, height * 0.24);
    return {
      outlineD: [
        "M 12 0",
        `L ${width - 12} 0`,
        `Q ${width} 0 ${width} 12`,
        `L ${width} ${height - wave}`,
        `Q ${width * 0.8} ${height - wave * 0.1} ${width * 0.52} ${height - 2}`,
        `Q ${width * 0.28} ${height - wave * 0.55} 0 ${height - wave * 0.12}`,
        "L 0 12",
        "Q 0 0 12 0 Z",
      ].join(" "),
      accents: [],
      textPadding: padding(18, 14, 18, 26),
      anchor: "rect",
    };
  },
  database: (width, height) => {
    const rim = Math.min(16, height * 0.18);
    return {
      outlineD: [
        `M 0 ${rim}`,
        `C 0 ${rim * 0.28} ${width * 0.18} 0 ${width / 2} 0`,
        `C ${width * 0.82} 0 ${width} ${rim * 0.28} ${width} ${rim}`,
        `L ${width} ${height - rim}`,
        `C ${width} ${height - rim * 0.28} ${width * 0.82} ${height} ${width / 2} ${height}`,
        `C ${width * 0.18} ${height} 0 ${height - rim * 0.28} 0 ${height - rim} Z`,
      ].join(" "),
      accents: [
        {
          d: [
            `M 0 ${rim}`,
            `C 0 ${rim * 0.28} ${width * 0.18} 0 ${width / 2} 0`,
            `C ${width * 0.82} 0 ${width} ${rim * 0.28} ${width} ${rim}`,
          ].join(" "),
        },
        {
          d: [
            `M 0 ${height - rim}`,
            `C 0 ${height - rim * 0.28} ${width * 0.18} ${height} ${width / 2} ${height}`,
            `C ${width * 0.82} ${height} ${width} ${height - rim * 0.28} ${width} ${height - rim}`,
          ].join(" "),
          opacity: 0.48,
        },
      ],
      textPadding: padding(24, 24, 24, 22),
      anchor: "rect",
    };
  },
  "manual-input": (width, height) => ({
    outlineD: polygonPath([
      [0, height * 0.18],
      [width, 0],
      [width, height],
      [0, height],
    ]),
    accents: [],
    textPadding: padding(18, 22, 18, 16),
    anchor: "rect",
  }),
  "off-page-connector": (width, height) => ({
    outlineD: polygonPath([
      [width * 0.1, 0],
      [width * 0.9, 0],
      [width * 0.9, height * 0.64],
      [width * 0.5, height],
      [width * 0.1, height * 0.64],
    ]),
    accents: [],
    textPadding: padding(18, 14, 18, 30),
    anchor: "rect",
  }),
  delay: (width, height) => {
    const left = 8;
    const arcInset = Math.min(height / 2, width * 0.24);
    return {
      outlineD: [
        `M ${left} 0`,
        `L ${width - arcInset} 0`,
        `Q ${width} ${height / 2} ${width - arcInset} ${height}`,
        `L ${left} ${height}`,
        "Z",
      ].join(" "),
      accents: [],
      textPadding: padding(28, 18, 32, 18),
      anchor: "rect",
    };
  },
  display: (width, height) => ({
    outlineD: polygonPath([
      [0, height * 0.14],
      [width * 0.78, height * 0.14],
      [width, height * 0.5],
      [width * 0.78, height * 0.86],
      [0, height * 0.86],
      [width * 0.08, height * 0.5],
    ]),
    accents: [],
    textPadding: padding(28, 18, 34, 18),
    anchor: "rect",
  }),
};

export function normalizeBoxShape(value) {
  const key = toShapeKey(value);
  return SHAPE_KEY_TO_ID.get(key) || DEFAULT_BOX_SHAPE;
}

export function getBoxShapeLabel(shape) {
  const normalized = normalizeBoxShape(shape);
  return SHAPE_META_BY_ID.get(normalized)?.label || "\u5706\u89d2\u77e9\u5f62";
}

export function getBoxShapeGroupLabel(group) {
  return SHAPE_GROUP_LABELS[group] || group;
}

export function getBoxShapeMeta(shape) {
  return SHAPE_META_BY_ID.get(normalizeBoxShape(shape)) || SHAPE_META_BY_ID.get(DEFAULT_BOX_SHAPE);
}

export function getBoxShapeAnchorKind(shape) {
  return buildBoxShapeModel(shape, 100, 100).anchor;
}

export function buildBoxShapeModel(shape, width, height) {
  const normalized = normalizeBoxShape(shape);
  const builder = SHAPE_MODEL_BUILDERS[normalized] || SHAPE_MODEL_BUILDERS[DEFAULT_BOX_SHAPE];
  const model = builder(Math.max(width, 1), Math.max(height, 1));
  return {
    id: normalized,
    meta: getBoxShapeMeta(normalized),
    outlineD: model.outlineD,
    accents: Array.isArray(model.accents) ? model.accents : [],
    textPadding: normalizePadding(model.textPadding),
    anchor: model.anchor || "rect",
  };
}

export function getBoxTextBounds(box) {
  const model = buildBoxShapeModel(box.shape, box.width, box.height);
  return {
    x: box.x + model.textPadding.left,
    y: box.y + model.textPadding.top,
    width: Math.max(24, box.width - model.textPadding.left - model.textPadding.right),
    height: Math.max(24, box.height - model.textPadding.top - model.textPadding.bottom),
  };
}

function toShapeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function padding(left, top, right, bottom) {
  return { left, top, right, bottom };
}

function normalizePadding(value) {
  const source = value || {};
  return {
    left: Math.max(8, Number(source.left) || 0),
    top: Math.max(8, Number(source.top) || 0),
    right: Math.max(8, Number(source.right) || 0),
    bottom: Math.max(8, Number(source.bottom) || 0),
  };
}

function roundedRectPath(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `Q ${width} 0 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `L ${r} ${height}`,
    `Q 0 ${height} 0 ${height - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0 Z`,
  ].join(" ");
}

function ellipsePath(width, height) {
  const rx = width / 2;
  const ry = height / 2;
  return [
    `M 0 ${ry}`,
    `A ${rx} ${ry} 0 1 0 ${width} ${ry}`,
    `A ${rx} ${ry} 0 1 0 0 ${ry}`,
    "Z",
  ].join(" ");
}

function polygonPath(points) {
  if (!Array.isArray(points) || !points.length) {
    return "";
  }
  const [firstX, firstY] = points[0];
  const segments = [`M ${firstX} ${firstY}`];
  for (let index = 1; index < points.length; index += 1) {
    const [x, y] = points[index];
    segments.push(`L ${x} ${y}`);
  }
  segments.push("Z");
  return segments.join(" ");
}

function linePath(startX, startY, endX, endY) {
  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

function cloudPath(width, height) {
  return [
    `M ${width * 0.22} ${height * 0.72}`,
    `C ${width * 0.08} ${height * 0.72} ${width * 0.04} ${height * 0.56} ${width * 0.14} ${height * 0.47}`,
    `C ${width * 0.08} ${height * 0.29} ${width * 0.24} ${height * 0.12} ${width * 0.42} ${height * 0.18}`,
    `C ${width * 0.48} ${height * 0.04} ${width * 0.68} ${height * 0.06} ${width * 0.74} ${height * 0.22}`,
    `C ${width * 0.9} ${height * 0.18} ${width * 0.98} ${height * 0.38} ${width * 0.88} ${height * 0.52}`,
    `C ${width * 0.96} ${height * 0.66} ${width * 0.84} ${height * 0.84} ${width * 0.64} ${height * 0.8}`,
    `C ${width * 0.56} ${height * 0.9} ${width * 0.34} ${height * 0.9} ${width * 0.28} ${height * 0.78}`,
    `C ${width * 0.26} ${height * 0.76} ${width * 0.24} ${height * 0.74} ${width * 0.22} ${height * 0.72}`,
    "Z",
  ].join(" ");
}
