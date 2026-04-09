import { buildResolvedLinkGeometries, getTimelineTrackBounds } from "./board-geometry.js";
import {
  DEFAULT_BOX_SHAPE,
  TIMELINE_HEIGHT,
  formatHour,
  getBoxById,
  getTimelineMarks,
} from "./board-state.js";

const MONO_TEXT = "rgba(255,255,255,0.92)";
const MONO_MUTED = "rgba(255,255,255,0.58)";
const MONO_STROKE = "rgba(255,255,255,0.42)";
const MONO_STROKE_STRONG = "rgba(255,255,255,0.92)";
const MONO_SURFACE = "rgba(8,8,10,0.96)";
const MONO_SURFACE_SOFT = "rgba(8,8,10,0.88)";

export async function exportBoardAsPng({ state, worldSize }) {
  const width = Math.round(worldSize.width);
  const height = Math.round(worldSize.height);
  if (!width || !height) {
    throw new Error("invalid-board-size");
  }

  const scale = Math.min(window.devicePixelRatio > 1 ? 2 : 1.5, 2);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas-context-unavailable");
  }

  context.scale(scale, scale);
  drawBackground(context, width, height);
  drawLinks(context, state);
  state.timelines.forEach((timeline) => drawTimeline(context, timeline));
  state.notes.forEach((note) => drawNote(context, note));
  state.boxes.forEach((box) => drawBox(context, box));

  const fileName = `quick-board-${new Date().toISOString().slice(0, 10)}.png`;
  if (canvas.toBlob) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) {
      downloadBlob(blob, fileName);
      return fileName;
    }
  }

  const anchor = document.createElement("a");
  anchor.href = canvas.toDataURL("image/png");
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return fileName;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawBackground(context, width, height) {
  context.fillStyle = "#040404";
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#111114");
  gradient.addColorStop(1, "#040404");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.04)";
  context.lineWidth = 1;
  for (let x = 48; x < width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 48; y < height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawLinks(context, state) {
  const geometryById = buildResolvedLinkGeometries(state.links, state.boxes);

  state.links.forEach((link) => {
    const fromBox = getBoxById(state, link.fromId);
    const toBox = getBoxById(state, link.toId);
    if (!fromBox || !toBox) return;

    const geometry = geometryById.get(link.id);
    if (!geometry) return;
    context.strokeStyle = MONO_STROKE_STRONG;
    context.lineWidth = 2.6;
    context.lineCap = "round";
    context.lineJoin = "miter";
    context.beginPath();
    geometry.points.forEach((point, index) => {
      if (!index) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.stroke();
    drawArrowHead(context, geometry.end, geometry.arrowFrom);
  });
}

function drawArrowHead(context, tip, control) {
  const angle = Math.atan2(tip.y - control.y, tip.x - control.x);
  const size = 11;
  const spread = Math.PI / 7.2;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - Math.cos(angle - spread) * size, tip.y - Math.sin(angle - spread) * size);
  context.lineTo(tip.x - Math.cos(angle + spread) * size, tip.y - Math.sin(angle + spread) * size);
  context.closePath();
  context.fillStyle = MONO_STROKE_STRONG;
  context.fill();
}

function drawTimeline(context, timeline) {
  const left = timeline.x;
  const top = timeline.y;
  const track = getTimelineTrackBounds(timeline);
  const marks = getTimelineMarks(timeline.startHour, timeline.endHour);
  const span = Math.max(timeline.endHour - timeline.startHour, 1);

  drawRoundedRect(
    context,
    left,
    top,
    timeline.width,
    TIMELINE_HEIGHT,
    16,
    MONO_SURFACE_SOFT,
    "rgba(255,255,255,0.12)",
  );
  drawRoundedRect(
    context,
    left + 18,
    top + 12,
    148,
    34,
    10,
    "rgba(0,0,0,0.46)",
    "rgba(255,255,255,0.2)",
  );

  context.fillStyle = MONO_TEXT;
  context.font = '14px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(timeline.label || "时间线", left + 30, top + 29);

  const lineGradient = context.createLinearGradient(track.left, track.centerY, track.right, track.centerY);
  lineGradient.addColorStop(0, "rgba(255,255,255,0.2)");
  lineGradient.addColorStop(0.5, "rgba(255,255,255,0.86)");
  lineGradient.addColorStop(1, "rgba(255,255,255,0.2)");

  context.strokeStyle = lineGradient;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(track.left, track.centerY);
  context.lineTo(track.right, track.centerY);
  context.stroke();

  context.font = '11px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = MONO_MUTED;

  marks.forEach((hour, index) => {
    const x = track.left + ((hour - timeline.startHour) / span) * track.width;
    const major = index === 0 || index === marks.length - 1 || hour % 4 === 0;
    context.strokeStyle = major ? "rgba(255,255,255,0.56)" : "rgba(255,255,255,0.34)";
    context.lineWidth = major ? 2 : 1;
    context.beginPath();
    context.moveTo(x, track.centerY - 10);
    context.lineTo(x, track.centerY + 7);
    context.stroke();

    context.beginPath();
    context.arc(x, track.centerY, major ? 3.5 : 2.5, 0, Math.PI * 2);
    context.fillStyle = major ? MONO_STROKE_STRONG : "rgba(255,255,255,0.64)";
    context.fill();

    context.fillStyle = MONO_MUTED;
    context.fillText(formatHour(hour), x, track.centerY + 12);
  });
}

function drawNote(context, note) {
  context.save();
  context.shadowColor = "rgba(0,0,0,0.22)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  drawRoundedRect(context, note.x, note.y, note.width, note.height, 10, MONO_SURFACE, "rgba(255,255,255,0.28)");
  context.restore();

  drawTextBlock(
    context,
    note.text,
    note.x + 12,
    note.y + 10,
    note.width - 24,
    note.height - 20,
    MONO_TEXT,
    "双击输入文本",
    18,
    13,
  );
}

function drawBox(context, box) {
  context.save();
  context.shadowColor = "rgba(0,0,0,0.28)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 10;
  drawFlowchartShape(context, box, MONO_SURFACE, MONO_STROKE);
  context.restore();

  const textBounds = getBoxTextBounds(box);
  drawTextBlock(
    context,
    box.text,
    textBounds.x,
    textBounds.y,
    textBounds.width,
    textBounds.height,
    MONO_TEXT,
    "双击输入节点",
    20,
    14,
  );
}

function drawFlowchartShape(context, box, fillStyle, strokeStyle) {
  const shape = box.shape || DEFAULT_BOX_SHAPE;

  switch (shape) {
    case "terminator":
      drawRoundedRect(context, box.x, box.y, box.width, box.height, Math.min(box.height / 2, box.width / 2), fillStyle, strokeStyle);
      break;
    case "document":
      drawDocument(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "decision":
      drawPolygon(context, diamondPoints(box.x, box.y, box.width, box.height), fillStyle, strokeStyle);
      break;
    case "connector":
      drawCircle(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "off-page-connector":
      drawPolygon(context, [
        [box.x + box.width * 0.1, box.y],
        [box.x + box.width * 0.9, box.y],
        [box.x + box.width * 0.9, box.y + box.height * 0.64],
        [box.x + box.width * 0.5, box.y + box.height],
        [box.x + box.width * 0.1, box.y + box.height * 0.64],
      ], fillStyle, strokeStyle);
      break;
    case "input-output":
      drawPolygon(context, [
        [box.x + 18, box.y],
        [box.x + box.width, box.y],
        [box.x + box.width - 18, box.y + box.height],
        [box.x, box.y + box.height],
      ], fillStyle, strokeStyle);
      break;
    case "comment":
      drawComment(context, box.x, box.y, box.width, box.height, strokeStyle);
      break;
    case "database":
      drawDatabase(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "paper-tape":
      drawPaperTape(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "summing-junction":
      drawCircle(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      drawXMark(context, box.x, box.y, box.width, box.height, MONO_STROKE_STRONG);
      break;
    case "predefined-process":
      drawRoundedRect(context, box.x, box.y, box.width, box.height, 12, fillStyle, strokeStyle);
      drawVerticalMarkers(context, box.x, box.y, box.width, box.height, strokeStyle);
      break;
    case "internal-storage":
      drawRoundedRect(context, box.x, box.y, box.width, box.height, 12, fillStyle, strokeStyle);
      drawInternalStorageMarkers(context, box.x, box.y, box.width, box.height, strokeStyle);
      break;
    case "manual-input":
      drawPolygon(context, [
        [box.x, box.y + box.height * 0.18],
        [box.x + box.width, box.y],
        [box.x + box.width, box.y + box.height],
        [box.x, box.y + box.height],
      ], fillStyle, strokeStyle);
      break;
    case "manual-operation":
      drawPolygon(context, [
        [box.x + box.width * 0.1, box.y],
        [box.x + box.width * 0.9, box.y],
        [box.x + box.width, box.y + box.height],
        [box.x, box.y + box.height],
      ], fillStyle, strokeStyle);
      break;
    case "merge":
      drawPolygon(context, [
        [box.x + box.width * 0.5, box.y + box.height],
        [box.x + box.width, box.y],
        [box.x, box.y],
      ], fillStyle, strokeStyle);
      break;
    case "multiple-documents":
      drawDocument(context, box.x + 10, box.y - 8, box.width, box.height, "rgba(8,8,10,0.42)", "rgba(255,255,255,0.18)");
      drawDocument(context, box.x + 5, box.y - 4, box.width, box.height, "rgba(8,8,10,0.54)", "rgba(255,255,255,0.24)");
      drawDocument(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "preparation":
      drawPolygon(context, [
        [box.x + box.width * 0.14, box.y],
        [box.x + box.width * 0.86, box.y],
        [box.x + box.width, box.y + box.height * 0.5],
        [box.x + box.width * 0.86, box.y + box.height],
        [box.x + box.width * 0.14, box.y + box.height],
        [box.x, box.y + box.height * 0.5],
      ], fillStyle, strokeStyle);
      break;
    case "stored-data":
      drawPolygon(context, [
        [box.x + box.width * 0.14, box.y],
        [box.x + box.width, box.y],
        [box.x + box.width * 0.86, box.y + box.height * 0.5],
        [box.x + box.width, box.y + box.height],
        [box.x + box.width * 0.14, box.y + box.height],
        [box.x, box.y + box.height * 0.5],
      ], fillStyle, strokeStyle);
      break;
    case "delay":
      drawDelay(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      break;
    case "or":
      drawCircle(context, box.x, box.y, box.width, box.height, fillStyle, strokeStyle);
      drawPlusMark(context, box.x, box.y, box.width, box.height, MONO_STROKE_STRONG);
      break;
    case "display":
      drawPolygon(context, [
        [box.x, box.y + box.height * 0.14],
        [box.x + box.width * 0.78, box.y + box.height * 0.14],
        [box.x + box.width, box.y + box.height * 0.5],
        [box.x + box.width * 0.78, box.y + box.height * 0.86],
        [box.x, box.y + box.height * 0.86],
        [box.x + box.width * 0.08, box.y + box.height * 0.5],
      ], fillStyle, strokeStyle);
      break;
    case "hard-disk":
      drawRoundedRect(context, box.x, box.y, box.width, box.height, Math.min(box.height / 2, box.width / 2), fillStyle, strokeStyle);
      drawHardDiskLines(context, box.x, box.y, box.width, box.height, strokeStyle);
      break;
    case "process":
    default:
      drawRoundedRect(context, box.x, box.y, box.width, box.height, 12, fillStyle, strokeStyle);
      break;
  }
}

function drawComment(context, x, y, width, height, strokeStyle) {
  context.strokeStyle = strokeStyle;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 16, y + 12);
  context.lineTo(x + 16, y + height - 12);
  context.moveTo(x + 16, y + 12);
  context.lineTo(x + 40, y + 12);
  context.moveTo(x + 16, y + height - 12);
  context.lineTo(x + 40, y + height - 12);
  context.stroke();
}

function drawDatabase(context, x, y, width, height, fillStyle, strokeStyle) {
  const ellipseHeight = Math.min(16, height * 0.18);

  context.beginPath();
  context.moveTo(x, y + ellipseHeight);
  context.bezierCurveTo(x, y + ellipseHeight * 0.28, x + width * 0.18, y, x + width / 2, y);
  context.bezierCurveTo(x + width * 0.82, y, x + width, y + ellipseHeight * 0.28, x + width, y + ellipseHeight);
  context.lineTo(x + width, y + height - ellipseHeight);
  context.bezierCurveTo(x + width, y + height - ellipseHeight * 0.28, x + width * 0.82, y + height, x + width / 2, y + height);
  context.bezierCurveTo(x + width * 0.18, y + height, x, y + height - ellipseHeight * 0.28, x, y + height - ellipseHeight);
  context.closePath();
  fillAndStroke(context, fillStyle, strokeStyle);

  context.beginPath();
  context.ellipse(x + width / 2, y + ellipseHeight, width / 2, ellipseHeight, 0, Math.PI, 0, true);
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.ellipse(x + width / 2, y + height - ellipseHeight, width / 2, ellipseHeight, 0, 0, Math.PI);
  context.strokeStyle = "rgba(255,255,255,0.24)";
  context.lineWidth = 1;
  context.stroke();
}

function drawPaperTape(context, x, y, width, height, fillStyle, strokeStyle) {
  drawRoundedRect(context, x, y, width, height, 18, fillStyle, strokeStyle);
  context.strokeStyle = "rgba(255,255,255,0.3)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x + width / 2, y + 16, width / 2 - 12, 0.95 * Math.PI, 0.05 * Math.PI, true);
  context.stroke();
  context.beginPath();
  context.arc(x + width / 2, y + height - 16, width / 2 - 12, 0.95 * Math.PI, 0.05 * Math.PI, false);
  context.stroke();
}

function drawDelay(context, x, y, width, height, fillStyle, strokeStyle) {
  const left = x + 8;
  context.beginPath();
  context.moveTo(left, y);
  context.lineTo(x + width - height / 2, y);
  context.quadraticCurveTo(x + width, y + height / 2, x + width - height / 2, y + height);
  context.lineTo(left, y + height);
  context.closePath();
  fillAndStroke(context, fillStyle, strokeStyle);
}

function drawHardDiskLines(context, x, y, width, height, strokeStyle) {
  context.strokeStyle = strokeStyle;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 18, y + height * 0.3);
  context.lineTo(x + width - 18, y + height * 0.3);
  context.moveTo(x + 18, y + height * 0.7);
  context.lineTo(x + width - 18, y + height * 0.7);
  context.stroke();
}

function drawDocument(context, x, y, width, height, fillStyle, strokeStyle) {
  const wave = Math.min(18, height * 0.24);
  context.beginPath();
  context.moveTo(x + 12, y);
  context.lineTo(x + width - 12, y);
  context.quadraticCurveTo(x + width, y, x + width, y + 12);
  context.lineTo(x + width, y + height - wave);
  context.quadraticCurveTo(x + width * 0.78, y + height + wave * 0.6, x + width * 0.52, y + height - 2);
  context.quadraticCurveTo(x + width * 0.28, y + height - wave * 0.8, x, y + height - wave * 0.2);
  context.lineTo(x, y + 12);
  context.quadraticCurveTo(x, y, x + 12, y);
  context.closePath();
  fillAndStroke(context, fillStyle, strokeStyle);
}

function drawCircle(context, x, y, width, height, fillStyle, strokeStyle) {
  context.beginPath();
  context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  fillAndStroke(context, fillStyle, strokeStyle);
}

function drawPolygon(context, points, fillStyle, strokeStyle) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index][0], points[index][1]);
  }
  context.closePath();
  fillAndStroke(context, fillStyle, strokeStyle);
}

function drawRoundedRect(context, x, y, width, height, radius, fillStyle, strokeStyle = "", lineWidth = 1) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  fillAndStroke(context, fillStyle, strokeStyle, lineWidth);
}

function fillAndStroke(context, fillStyle, strokeStyle, lineWidth = 1) {
  if (fillStyle) {
    context.fillStyle = fillStyle;
    context.fill();
  }
  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function drawVerticalMarkers(context, x, y, width, height, strokeStyle) {
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x + 18, y + 14);
  context.lineTo(x + 18, y + height - 14);
  context.moveTo(x + width - 18, y + 14);
  context.lineTo(x + width - 18, y + height - 14);
  context.stroke();
}

function drawInternalStorageMarkers(context, x, y, width, height, strokeStyle) {
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x + 18, y + 10);
  context.lineTo(x + 18, y + height - 10);
  context.moveTo(x + 10, y + 16);
  context.lineTo(x + width - 10, y + 16);
  context.stroke();
}

function drawXMark(context, x, y, width, height, color) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + width * 0.25, y + height * 0.25);
  context.lineTo(x + width * 0.75, y + height * 0.75);
  context.moveTo(x + width * 0.75, y + height * 0.25);
  context.lineTo(x + width * 0.25, y + height * 0.75);
  context.stroke();
}

function drawPlusMark(context, x, y, width, height, color) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + width * 0.5, y + height * 0.24);
  context.lineTo(x + width * 0.5, y + height * 0.76);
  context.moveTo(x + width * 0.24, y + height * 0.5);
  context.lineTo(x + width * 0.76, y + height * 0.5);
  context.stroke();
}

function diamondPoints(x, y, width, height) {
  return [
    [x + width / 2, y],
    [x + width, y + height / 2],
    [x + width / 2, y + height],
    [x, y + height / 2],
  ];
}

function getBoxTextBounds(box) {
  const shape = box.shape || DEFAULT_BOX_SHAPE;

  switch (shape) {
    case "terminator":
      return bounds(box, 26, 16, 26, 16);
    case "document":
      return bounds(box, 18, 14, 18, 34);
    case "decision":
      return {
        x: box.x + box.width * 0.23,
        y: box.y + box.height * 0.24,
        width: box.width * 0.54,
        height: box.height * 0.5,
      };
    case "connector":
    case "or":
    case "summing-junction":
      return {
        x: box.x + box.width * 0.22,
        y: box.y + box.height * 0.22,
        width: box.width * 0.56,
        height: box.height * 0.56,
      };
    case "off-page-connector":
      return bounds(box, 18, 14, 18, 34);
    case "input-output":
      return bounds(box, 28, 16, 28, 16);
    case "comment":
      return bounds(box, 48, 18, 16, 18);
    case "database":
      return bounds(box, 24, 24, 24, 22);
    case "paper-tape":
      return bounds(box, 18, 18, 18, 18);
    case "predefined-process":
      return bounds(box, 34, 16, 34, 16);
    case "internal-storage":
      return bounds(box, 34, 24, 16, 16);
    case "manual-input":
      return bounds(box, 18, 22, 18, 16);
    case "manual-operation":
      return bounds(box, 24, 18, 24, 16);
    case "merge":
      return {
        x: box.x + box.width * 0.23,
        y: box.y + box.height * 0.12,
        width: box.width * 0.54,
        height: box.height * 0.42,
      };
    case "multiple-documents":
      return bounds(box, 18, 14, 18, 34);
    case "preparation":
      return bounds(box, 34, 18, 34, 16);
    case "stored-data":
      return bounds(box, 36, 18, 24, 16);
    case "delay":
      return bounds(box, 28, 18, 30, 16);
    case "display":
      return bounds(box, 28, 18, 34, 16);
    case "hard-disk":
      return bounds(box, 24, 18, 24, 18);
    case "process":
    default:
      return bounds(box, 18, 14, 18, 14);
  }
}

function bounds(box, left, top, right, bottom) {
  return {
    x: box.x + left,
    y: box.y + top,
    width: box.width - left - right,
    height: box.height - top - bottom,
  };
}

function drawTextBlock(context, text, x, y, maxWidth, maxHeight, color, emptyLabel, lineHeight = 20, fontSize = 14) {
  context.fillStyle = color;
  context.font = `${fontSize}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "top";

  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = wrapTextLines(context, text, maxWidth);
  const visible = lines.slice(0, maxLines);

  if (!visible.length || (visible.length === 1 && visible[0] === "")) {
    context.fillText(emptyLabel, x, y);
    return;
  }

  visible.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function wrapTextLines(context, text, maxWidth) {
  const lines = [];
  String(text || "").split("\n").forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let current = "";
    for (const character of paragraph) {
      const next = current + character;
      if (context.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = character;
      } else {
        current = next;
      }
    }

    if (current) {
      lines.push(current);
    }
  });
  return lines;
}
