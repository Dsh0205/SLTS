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

export const TIMELINE_INSET_X = 18;
export const TIMELINE_TITLE_WIDTH = 148;
export const TIMELINE_TRACK_GAP = 16;
export const TIMELINE_TRACK_RIGHT_PADDING = 24;
export const TIMELINE_TRACK_TOP = 24;
export const TIMELINE_TRACK_HEIGHT = 30;

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

function getShapeAnchor(item, towardX, towardY) {
  switch (item.shape) {
    case "connector":
    case "or":
    case "summing-junction":
      return getEllipseAnchor(item, towardX, towardY);
    case "decision":
      return getDiamondAnchor(item, towardX, towardY);
    default:
      return getRectAnchor(item, towardX, towardY);
  }
}

function getPrimaryLinkDirection(fromBox, toBox) {
  const fromCenter = getRectCenter(fromBox);
  const toCenter = getRectCenter(toBox);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "down" : "up";
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
  const fromCenter = getRectCenter(entry.fromBox);
  const start = getDirectionalAnchor(entry.fromBox, direction);
  const end = getShapeAnchor(entry.toBox, fromCenter.x, fromCenter.y);

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
  const toCenter = getRectCenter(toBox);
  const fromCenter = getRectCenter(fromBox);
  const start = getShapeAnchor(fromBox, toCenter.x, toCenter.y);
  const end = getShapeAnchor(toBox, fromCenter.x, fromCenter.y);
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  let points;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    points = [start, end];
  } else if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = start.x + dx / 2;
    points = [
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ];
  } else {
    const midY = start.y + dy / 2;
    points = [
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end,
    ];
  }

  return geometryFromPoints(points, start);
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
      const fromCenter = getRectCenter(entry.fromBox);
      const end = getShapeAnchor(entry.toBox, fromCenter.x, fromCenter.y);

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
