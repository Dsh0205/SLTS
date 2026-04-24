import {
  BOX_MIN_HEIGHT,
  BOX_MIN_WIDTH,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  TIMELINE_HEIGHT,
  TIMELINE_MIN_WIDTH,
  TIMELINE_MIN_Y,
  WORLD_MIN_HEIGHT,
  WORLD_MIN_WIDTH,
  WORLD_PADDING,
  clamp,
} from "./board-state.js";
import { buildBoxShapeModel, getBoxShapeAnchorKind } from "./board-shapes.js";

export const TIMELINE_INSET_X = 18;
export const TIMELINE_TITLE_WIDTH = 148;
export const TIMELINE_TRACK_GAP = 16;
export const TIMELINE_TRACK_RIGHT_PADDING = 24;
export const TIMELINE_TRACK_TOP = 24;
export const TIMELINE_TRACK_HEIGHT = 30;

const SVG_NS = "http://www.w3.org/2000/svg";
const OUTLINE_SAMPLE_DISTANCE = 6;
const OUTLINE_SAMPLE_MIN_POINTS = 64;
const OUTLINE_SAMPLE_MAX_POINTS = 280;
const SHAPE_OUTLINE_POINT_CACHE = new Map();

export function computeWorldSize(state, viewport, zoom) {
  const minWidth = Math.max(WORLD_MIN_WIDTH, Math.ceil(viewport.clientWidth / zoom));
  const minHeight = Math.max(WORLD_MIN_HEIGHT, Math.ceil(viewport.clientHeight / zoom));

  let maxX = minWidth - WORLD_PADDING;
  let maxY = minHeight - WORLD_PADDING;

  state.notes.forEach((note) => {
    maxX = Math.max(maxX, note.x + note.width);
    maxY = Math.max(maxY, note.y + note.height);
  });

  state.boxes.forEach((box) => {
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  state.timelines.forEach((timeline) => {
    maxX = Math.max(maxX, timeline.x + timeline.width);
    maxY = Math.max(maxY, timeline.y + TIMELINE_HEIGHT);
  });

  return {
    width: Math.max(minWidth, Math.ceil(maxX + WORLD_PADDING)),
    height: Math.max(minHeight, Math.ceil(maxY + WORLD_PADDING)),
  };
}

export function constrainStateToWorld(state, worldSize) {
  state.timelines.forEach((timeline) => {
    timeline.width = Math.max(timeline.width, TIMELINE_MIN_WIDTH);
    timeline.x = clamp(
      timeline.x,
      WORLD_PADDING,
      Math.max(WORLD_PADDING, worldSize.width - timeline.width - WORLD_PADDING),
    );
    timeline.y = clamp(
      timeline.y,
      TIMELINE_MIN_Y,
      Math.max(TIMELINE_MIN_Y, worldSize.height - TIMELINE_HEIGHT - WORLD_PADDING),
    );
  });

  state.notes.forEach((note) => {
    note.width = Math.max(note.width, NOTE_MIN_WIDTH);
    note.height = Math.max(note.height, NOTE_MIN_HEIGHT);
    note.x = clamp(
      note.x,
      WORLD_PADDING,
      Math.max(WORLD_PADDING, worldSize.width - note.width - WORLD_PADDING),
    );
    note.y = clamp(
      note.y,
      WORLD_PADDING,
      Math.max(WORLD_PADDING, worldSize.height - note.height - WORLD_PADDING),
    );
  });

  state.boxes.forEach((box) => {
    box.width = Math.max(box.width, BOX_MIN_WIDTH);
    box.height = Math.max(box.height, BOX_MIN_HEIGHT);
    box.x = clamp(
      box.x,
      WORLD_PADDING,
      Math.max(WORLD_PADDING, worldSize.width - box.width - WORLD_PADDING),
    );
    box.y = clamp(
      box.y,
      WORLD_PADDING,
      Math.max(WORLD_PADDING, worldSize.height - box.height - WORLD_PADDING),
    );
  });
}

export function getTimelineTrackBounds(timeline) {
  const left = timeline.x + TIMELINE_INSET_X + TIMELINE_TITLE_WIDTH + TIMELINE_TRACK_GAP;
  const width = Math.max(
    80,
    timeline.width - TIMELINE_INSET_X - TIMELINE_TITLE_WIDTH - TIMELINE_TRACK_GAP - TIMELINE_TRACK_RIGHT_PADDING,
  );
  const top = timeline.y + TIMELINE_TRACK_TOP;
  return {
    left,
    right: left + width,
    top,
    bottom: top + TIMELINE_TRACK_HEIGHT,
    width,
    height: TIMELINE_TRACK_HEIGHT,
    centerY: top + TIMELINE_TRACK_HEIGHT / 2,
  };
}

export function getWorldPoint(world, zoom, clientX, clientY) {
  const rect = world.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
  };
}

export function getRectCenter(item) {
  return {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  };
}

export function getRectAnchor(item, towardX, towardY) {
  const center = getRectCenter(item);
  const halfWidth = item.width / 2 - 12;
  const halfHeight = item.height / 2 - 12;
  const dx = towardX - center.x;
  const dy = towardY - center.y;

  if (!dx && !dy) {
    return center;
  }

  const scale = 1 / Math.max(Math.abs(dx) / Math.max(halfWidth, 1), Math.abs(dy) / Math.max(halfHeight, 1));
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function getEllipseAnchor(item, towardX, towardY) {
  const center = getRectCenter(item);
  const rx = Math.max(item.width / 2 - 6, 1);
  const ry = Math.max(item.height / 2 - 6, 1);
  const dx = towardX - center.x;
  const dy = towardY - center.y;
  if (!dx && !dy) return center;

  const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function getDiamondAnchor(item, towardX, towardY) {
  const center = getRectCenter(item);
  const rx = Math.max(item.width / 2, 1);
  const ry = Math.max(item.height / 2, 1);
  const dx = towardX - center.x;
  const dy = towardY - center.y;
  if (!dx && !dy) return center;

  const scale = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function crossProduct(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function dotProduct(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

function getShapeOutlinePoints(item) {
  if (typeof document === "undefined") {
    return null;
  }

  const model = buildBoxShapeModel(item.shape, item.width, item.height);
  const cacheKey = `${model.id}:${item.width.toFixed(2)}:${item.height.toFixed(2)}`;

  if (SHAPE_OUTLINE_POINT_CACHE.has(cacheKey)) {
    return SHAPE_OUTLINE_POINT_CACHE.get(cacheKey);
  }

  try {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", model.outlineD);

    const totalLength = path.getTotalLength();
    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      SHAPE_OUTLINE_POINT_CACHE.set(cacheKey, null);
      return null;
    }

    const sampleCount = clamp(
      Math.ceil(totalLength / OUTLINE_SAMPLE_DISTANCE),
      OUTLINE_SAMPLE_MIN_POINTS,
      OUTLINE_SAMPLE_MAX_POINTS,
    );
    const points = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const point = path.getPointAtLength((index / sampleCount) * totalLength);
      points.push({ x: point.x, y: point.y });
    }

    if (!points.length) {
      SHAPE_OUTLINE_POINT_CACHE.set(cacheKey, null);
      return null;
    }

    const first = points[0];
    const last = points[points.length - 1];
    if (Math.abs(first.x - last.x) > 0.1 || Math.abs(first.y - last.y) > 0.1) {
      points.push({ ...first });
    }

    SHAPE_OUTLINE_POINT_CACHE.set(cacheKey, points);
    return points;
  } catch {
    SHAPE_OUTLINE_POINT_CACHE.set(cacheKey, null);
    return null;
  }
}

function getRaySegmentIntersection(origin, direction, start, end) {
  const rayX = direction.x;
  const rayY = direction.y;
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const offsetX = start.x - origin.x;
  const offsetY = start.y - origin.y;
  const cross = crossProduct(rayX, rayY, segmentX, segmentY);
  const offsetCrossRay = crossProduct(offsetX, offsetY, rayX, rayY);
  const epsilon = 1e-6;

  if (Math.abs(cross) < epsilon) {
    if (Math.abs(offsetCrossRay) >= epsilon) {
      return null;
    }

    const rayLengthSquared = dotProduct(rayX, rayY, rayX, rayY);
    if (!rayLengthSquared) {
      return null;
    }

    const startT = dotProduct(start.x - origin.x, start.y - origin.y, rayX, rayY) / rayLengthSquared;
    const endT = dotProduct(end.x - origin.x, end.y - origin.y, rayX, rayY) / rayLengthSquared;
    const candidateT = [startT, endT].filter((value) => value >= 0);

    if (!candidateT.length) {
      return null;
    }

    const t = Math.min(...candidateT);
    return {
      t,
      point: {
        x: origin.x + rayX * t,
        y: origin.y + rayY * t,
      },
    };
  }

  const t = crossProduct(offsetX, offsetY, segmentX, segmentY) / cross;
  const u = offsetCrossRay / cross;

  if (t < 0 || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return {
    t,
    point: {
      x: origin.x + rayX * t,
      y: origin.y + rayY * t,
    },
  };
}

function getNearestOutlinePointOnRay(origin, direction, points) {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (!directionLength) {
    return null;
  }

  let best = null;

  points.forEach((point) => {
    const vectorX = point.x - origin.x;
    const vectorY = point.y - origin.y;
    const projection = dotProduct(vectorX, vectorY, direction.x, direction.y) / directionLength;

    if (projection <= 0) {
      return;
    }

    const distanceToRay = Math.abs(crossProduct(vectorX, vectorY, direction.x, direction.y)) / directionLength;
    if (!best || distanceToRay < best.distance - 0.5 || (
      Math.abs(distanceToRay - best.distance) <= 0.5
      && projection > best.projection
    )) {
      best = {
        point,
        distance: distanceToRay,
        projection,
      };
    }
  });

  return best?.point || null;
}

function getOutlineAnchor(item, towardX, towardY) {
  const points = getShapeOutlinePoints(item);
  if (!points?.length) {
    return null;
  }

  const localCenter = {
    x: item.width / 2,
    y: item.height / 2,
  };
  const direction = {
    x: towardX - (item.x + localCenter.x),
    y: towardY - (item.y + localCenter.y),
  };

  if (!direction.x && !direction.y) {
    return getRectCenter(item);
  }

  let bestIntersection = null;

  for (let index = 1; index < points.length; index += 1) {
    const intersection = getRaySegmentIntersection(localCenter, direction, points[index - 1], points[index]);
    if (!intersection) {
      continue;
    }

    if (!bestIntersection || intersection.t < bestIntersection.t) {
      bestIntersection = intersection;
    }
  }

  const localPoint = bestIntersection?.point || getNearestOutlinePointOnRay(localCenter, direction, points);
  if (!localPoint) {
    return null;
  }

  return {
    x: item.x + localPoint.x,
    y: item.y + localPoint.y,
  };
}

function getShapeAnchor(item, towardX, towardY) {
  const outlineAnchor = getOutlineAnchor(item, towardX, towardY);
  if (outlineAnchor) {
    return outlineAnchor;
  }

  switch (getBoxShapeAnchorKind(item.shape)) {
    case "ellipse":
      return getEllipseAnchor(item, towardX, towardY);
    case "diamond":
      return getDiamondAnchor(item, towardX, towardY);
    default:
      return getRectAnchor(item, towardX, towardY);
  }
}

function getPrimaryLinkDirection(fromBox, toBox) {
  return getPrimaryDirectionBetweenPoints(getRectCenter(fromBox), getRectCenter(toBox));
}

function getPrimaryDirectionBetweenPoints(fromPoint, toPoint) {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "down" : "up";
}

function getOppositeDirection(direction) {
  switch (direction) {
    case "right":
      return "left";
    case "left":
      return "right";
    case "down":
      return "up";
    case "up":
      return "down";
    default:
      return direction;
  }
}

function getDirectionalAnchor(item, direction) {
  const center = getRectCenter(item);

  switch (direction) {
    case "right":
      return getShapeAnchor(item, item.x + item.width + 160, center.y);
    case "left":
      return getShapeAnchor(item, item.x - 160, center.y);
    case "down":
      return getShapeAnchor(item, center.x, item.y + item.height + 160);
    case "up":
      return getShapeAnchor(item, center.x, item.y - 160);
    default:
      return center;
  }
}

function buildOrthogonalGeometry(start, end, direction) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return geometryFromPoints([start, end], start);
  }

  if (direction === "right" || direction === "left") {
    const midX = start.x + dx / 2;
    return geometryFromPoints([
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ], start);
  }

  const midY = start.y + dy / 2;
  return geometryFromPoints([
    start,
    { x: start.x, y: midY },
    { x: end.x, y: midY },
    end,
  ], start);
}

function collapseLinkPoints(points) {
  return points.filter((point, index) => {
    if (!index) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 0.5 || Math.abs(point.y - previous.y) > 0.5;
  });
}

function geometryFromPoints(points, fallbackStart) {
  const collapsedPoints = collapseLinkPoints(points);
  const start = collapsedPoints[0] || fallbackStart;
  const d = collapsedPoints
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  const arrowFrom = collapsedPoints.length > 1 ? collapsedPoints[collapsedPoints.length - 2] : start;

  return {
    start,
    end: collapsedPoints[collapsedPoints.length - 1] || start,
    points: collapsedPoints,
    arrowFrom,
    d,
  };
}

function getSharedRunOffset(distances) {
  const positive = distances.filter((distance) => Number.isFinite(distance) && distance > 1);
  if (!positive.length) {
    return 28;
  }

  return clamp(Math.min(...positive) * 0.34, 20, 84);
}

function buildBundledGeometry(entry, direction, sharedCoordinate) {
  const start = getDirectionalAnchor(entry.fromBox, direction);
  const end = getDirectionalAnchor(entry.toBox, getOppositeDirection(direction));

  if (direction === "right" || direction === "left") {
    return geometryFromPoints([
      start,
      { x: sharedCoordinate, y: start.y },
      { x: sharedCoordinate, y: end.y },
      end,
    ], start);
  }

  return geometryFromPoints([
    start,
    { x: start.x, y: sharedCoordinate },
    { x: end.x, y: sharedCoordinate },
    end,
  ], start);
}

export function buildResolvedLinkGeometry(fromBox, toBox) {
  const direction = getPrimaryLinkDirection(fromBox, toBox);
  const start = getDirectionalAnchor(fromBox, direction);
  const end = getDirectionalAnchor(toBox, getOppositeDirection(direction));
  return buildOrthogonalGeometry(start, end, direction);
}

export function buildPreviewLinkGeometry(fromBox, targetPoint) {
  const direction = getPrimaryDirectionBetweenPoints(getRectCenter(fromBox), targetPoint);
  const start = getDirectionalAnchor(fromBox, direction);
  return buildOrthogonalGeometry(start, targetPoint, direction);
}

export function buildResolvedLinkGeometries(links, boxes) {
  const boxById = new Map(Array.isArray(boxes) ? boxes.map((box) => [box.id, box]) : []);
  const prepared = (Array.isArray(links) ? links : [])
    .map((link) => {
      const fromBox = boxById.get(link.fromId);
      const toBox = boxById.get(link.toId);
      if (!fromBox || !toBox) {
        return null;
      }

      return {
        link,
        fromBox,
        toBox,
        direction: getPrimaryLinkDirection(fromBox, toBox),
      };
    })
    .filter(Boolean);

  const groups = new Map();
  prepared.forEach((entry) => {
    const key = `${entry.link.fromId}:${entry.direction}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  });

  const geometryById = new Map();

  groups.forEach((groupEntries) => {
    if (groupEntries.length === 1) {
      const [entry] = groupEntries;
      geometryById.set(entry.link.id, buildResolvedLinkGeometry(entry.fromBox, entry.toBox));
      return;
    }

    const direction = groupEntries[0].direction;
    const sharedStart = getDirectionalAnchor(groupEntries[0].fromBox, direction);
    const distances = groupEntries.map((entry) => {
      const end = getDirectionalAnchor(entry.toBox, getOppositeDirection(direction));

      switch (direction) {
        case "right":
          return end.x - sharedStart.x;
        case "left":
          return sharedStart.x - end.x;
        case "down":
          return end.y - sharedStart.y;
        case "up":
          return sharedStart.y - end.y;
        default:
          return 0;
      }
    });

    const sharedOffset = getSharedRunOffset(distances);
    const sharedCoordinate = direction === "right"
      ? sharedStart.x + sharedOffset
      : direction === "left"
        ? sharedStart.x - sharedOffset
        : direction === "down"
          ? sharedStart.y + sharedOffset
          : sharedStart.y - sharedOffset;

    groupEntries.forEach((entry) => {
      geometryById.set(entry.link.id, buildBundledGeometry(entry, direction, sharedCoordinate));
    });
  });

  return geometryById;
}

export function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
