import { CHINA_PROVINCES_GEOJSON } from "./china-provinces.js";
import {
  PHOTOGRAPHY_STORAGE_VERSION,
  normalizePhotoList,
  serializePhotoEntry,
} from "./photo-storage.js";

const STORAGE_KEY = "shanlic-photography-map-v1";
const STORAGE_VERSION = PHOTOGRAPHY_STORAGE_VERSION;
const ANCHOR_POSITION_STORAGE_VERSION = 6;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const MAP_PADDING = 42;
const FOCUS_VIEWBOX_WIDTH = 1000;
const FOCUS_VIEWBOX_HEIGHT = 700;
const FOCUS_PADDING_X = 120;
const FOCUS_PADDING_Y = 108;
const ANCHOR_ICON_PATH = "../words/img/Icons8/icons8-地图针-50.png";
const TEXT = {
  addAnchor: "已创建新的摄影展示页",
  saveError: "保存失败，请稍后再试",
  mapLoadError: "地图数据加载失败，请刷新页面后重试",
  focusHint: "点击省份后会单独放大，右键省份内部即可创建摄影展示页。",
  focusSubtitle: "右键省份内部任意位置，可创建摄影锚点",
};
const desktopBridge = window.shanlicDesktop || null;

const chinaMap = document.getElementById("chinaMap");
const provinceShapeLayer = document.getElementById("provinceShapeLayer");
const provinceSelectionLayer = document.getElementById("provinceSelectionLayer");
const anchorLayer = document.getElementById("anchorLayer");
const toast = document.getElementById("toast");
const provinceFocusBackdrop = document.getElementById("provinceFocusBackdrop");
const closeProvinceFocusBtn = document.getElementById("closeProvinceFocusBtn");
const focusProvinceName = document.getElementById("focusProvinceName");
const focusProvinceHint = document.getElementById("focusProvinceHint");
const provinceFocusMap = document.getElementById("provinceFocusMap");
const focusProvinceLayer = document.getElementById("focusProvinceLayer");
const focusAnchorLayer = document.getElementById("focusAnchorLayer");
const focusLabelLayer = document.getElementById("focusLabelLayer");

let provinces = [];
let provinceById = new Map();
let provinceByName = new Map();
let provinceNodes = new Map();
let state = createDefaultState();
let selectedProvinceId = null;
let focusProvinceId = null;
let focusTransform = null;
let toastTimer = 0;
let lastAnchorAnimationKey = "";

bindEvents();
bootstrap();

function bindEvents() {
  chinaMap?.addEventListener("contextmenu", (event) => event.preventDefault());
  closeProvinceFocusBtn?.addEventListener("click", closeProvinceFocus);
  provinceFocusBackdrop?.addEventListener("click", (event) => {
    if (event.target === provinceFocusBackdrop) closeProvinceFocus();
  });
  provinceFocusMap?.addEventListener("contextmenu", handleFocusContextMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && focusProvinceId) closeProvinceFocus();
  });
  window.addEventListener("storage", handleStorageSync);
  desktopBridge?.onMirroredStorageChanged?.((moduleId) => {
    if (moduleId !== "photography") return;
    desktopBridge.reloadMirroredStorage?.();
    state = loadState();
    syncSelectionWithState();
    render();
  });
}

function bootstrap() {
  try {
    provinces = buildProvinceModels(CHINA_PROVINCES_GEOJSON);
    provinceById = new Map(provinces.map((province) => [province.id, province]));
    provinceByName = new Map();
    provinces.forEach((province) => {
      provinceByName.set(normalizeProvinceName(province.name), province);
      provinceByName.set(normalizeProvinceName(province.shortName), province);
      provinceByName.set(normalizeProvinceName(province.sourceName), province);
      provinceByName.set(normalizeProvinceName(province.adcode), province);
    });
    renderProvinceMap();
    state = loadState();
    syncSelectionWithState();
    render();
  } catch (error) {
    console.error(error);
    showToast(TEXT.mapLoadError);
  }
}

function buildProvinceModels(geojson) {
  const features = Array.isArray(geojson?.features)
    ? geojson.features.filter((feature) => feature?.properties?.adcode && feature?.geometry)
    : [];
  const projector = createProjector(features);

  return features.map((feature, index) => {
    const adcode = String(feature.properties.adcode);
    const name = String(feature.properties.name || adcode);
    const polygons = geometryToPolygons(feature.geometry);
    const bounds = computeScreenBounds(polygons, projector);
    const centerPoint = projector(pickCenterCoordinate(feature, polygons));
    const palette = createPalette(index);

    return {
      id: `province_${adcode}`,
      adcode,
      name,
      shortName: shortProvinceName(name),
      sourceName: name,
      bounds,
      centerPoint,
      palette,
      pathData: polygons.map((polygon) => polygonToPath(polygon, projector)),
    };
  }).sort((left, right) => {
    const leftArea = (left.bounds.maxX - left.bounds.minX) * (left.bounds.maxY - left.bounds.minY);
    const rightArea = (right.bounds.maxX - right.bounds.minX) * (right.bounds.maxY - right.bounds.minY);
    return rightArea - leftArea;
  });
}

function createProjector(features) {
  const points = [];
  features.forEach((feature) => {
    geometryToPolygons(feature.geometry).forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coordinate) => points.push(projectMercator(coordinate)));
      });
    });
  });

  if (points.length === 0) throw new Error("Failed to project province geometry");

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / Math.max(1, maxX - minX),
    (MAP_HEIGHT - MAP_PADDING * 2) / Math.max(1, maxY - minY),
  );
  const extraX = (MAP_WIDTH - MAP_PADDING * 2 - (maxX - minX) * scale) / 2;
  const extraY = (MAP_HEIGHT - MAP_PADDING * 2 - (maxY - minY) * scale) / 2;

  return (coordinate) => {
    const point = projectMercator(coordinate);
    return {
      x: MAP_PADDING + extraX + (point.x - minX) * scale,
      y: MAP_PADDING + extraY + (maxY - point.y) * scale,
    };
  };
}

function projectMercator([longitude, latitude]) {
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  return {
    x: (longitude * Math.PI) / 180,
    y: Math.log(Math.tan(Math.PI / 4 + (safeLatitude * Math.PI) / 360)),
  };
}

function geometryToPolygons(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pickCenterCoordinate(feature, polygons) {
  if (isCoordinate(feature?.properties?.centroid)) return feature.properties.centroid;
  if (isCoordinate(feature?.properties?.center)) return feature.properties.center;
  return averageCoordinate(polygons);
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function averageCoordinate(polygons) {
  const coordinates = [];
  polygons.forEach((polygon) => {
    polygon.forEach((ring) => ring.forEach((coordinate) => coordinates.push(coordinate)));
  });
  const total = coordinates.reduce((sum, [longitude, latitude]) => ({
    longitude: sum.longitude + longitude,
    latitude: sum.latitude + latitude,
  }), { longitude: 0, latitude: 0 });
  return [
    total.longitude / Math.max(1, coordinates.length),
    total.latitude / Math.max(1, coordinates.length),
  ];
}

function polygonToPath(polygon, projector) {
  return polygon.map((ring) => ring
    .map((coordinate, index) => {
      const point = projector(coordinate);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .concat("Z")
    .join(" ")).join(" ");
}

function computeScreenBounds(polygons, projector) {
  const points = [];
  polygons.forEach((polygon) => {
    polygon.forEach((ring) => ring.forEach((coordinate) => points.push(projector(coordinate))));
  });
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function createPalette(index) {
  const hue = (18 + index * 137.508) % 360;
  return {
    fill: `hsl(${hue} 58% 72%)`,
    stroke: `hsl(${hue} 68% 34%)`,
    activeFill: `hsl(${hue} 66% 82%)`,
    activeStroke: `hsl(${hue} 78% 24%)`,
    hoverFill: `hsl(${hue} 64% 78%)`,
    hoverStroke: `hsl(${hue} 72% 28%)`,
    selectionFill: `hsl(${hue} 70% 48% / 0.22)`,
    selectionStroke: `hsl(${hue} 80% 22% / 0.84)`,
    focusFill: `hsl(${hue} 48% 84%)`,
    focusOutlineFill: `hsl(${hue} 60% 50% / 0.12)`,
    focusOutlineStroke: `hsl(${hue} 65% 30% / 0.36)`,
    focusShadow: `hsl(${hue} 80% 22% / 0.24)`,
  };
}

function applyPalette(node, palette) {
  Object.entries({
    "--province-fill": palette.fill,
    "--province-stroke": palette.stroke,
    "--province-hover-fill": palette.hoverFill,
    "--province-hover-stroke": palette.hoverStroke,
    "--province-active-fill": palette.activeFill,
    "--province-active-stroke": palette.activeStroke,
    "--province-selection-fill": palette.selectionFill,
    "--province-selection-stroke": palette.selectionStroke,
    "--province-focus-fill": palette.focusFill,
    "--province-focus-outline-fill": palette.focusOutlineFill,
    "--province-focus-outline-stroke": palette.focusOutlineStroke,
    "--province-focus-shadow": palette.focusShadow,
  }).forEach(([key, value]) => node.style.setProperty(key, value));
}

function renderProvinceMap() {
  provinceShapeLayer.replaceChildren();
  provinceSelectionLayer.replaceChildren();
  provinceNodes = new Map();

  provinces.forEach((province) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.provinceId = province.id;
    applyPalette(group, province.palette);

    const paths = province.pathData.map((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.classList.add("province-fill");
      path.dataset.provinceId = province.id;
      path.setAttribute("d", d);
      return path;
    });

    group.append(...paths);
    group.addEventListener("click", () => openProvinceFocus(province.id));
    provinceShapeLayer.appendChild(group);
    provinceNodes.set(province.id, { group, paths, province });
  });
}

function createDefaultState() {
  return { version: STORAGE_VERSION, anchors: [], activeAnchorId: null };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createDefaultState();
    const anchors = normalizeAnchors(parsed.anchors, Number(parsed.version) || 1);
    return {
      version: STORAGE_VERSION,
      anchors,
      activeAnchorId: anchors.some((anchor) => anchor.id === parsed.activeAnchorId)
        ? parsed.activeAnchorId
        : anchors[0]?.id || null,
    };
  } catch {
    return createDefaultState();
  }
}

function normalizeAnchors(list, version) {
  if (!Array.isArray(list)) return [];
  const provinceOffsets = new Map();
  return list.filter((item) => item && typeof item.id === "string").map((item, index) => {
    const province = resolveProvince(item);
    if (!province) return null;
    const offsetIndex = provinceOffsets.get(province.id) || 0;
    provinceOffsets.set(province.id, offsetIndex + 1);
    const fallbackPoint = migratedAnchorPoint(province, offsetIndex);
    const keepOriginalPoint = version >= ANCHOR_POSITION_STORAGE_VERSION
      && Number.isFinite(Number(item.x))
      && Number.isFinite(Number(item.y));
    const legacyPhotos = normalizePhotos(item.photos);
    const albums = normalizeAlbums(item.albums, legacyPhotos, item.createdAt);

    return {
      id: item.id,
      name: typeof item.name === "string" && item.name.trim()
        ? item.name.trim().slice(0, 32)
        : buildAnchorName(province.name, index + 1),
      provinceId: province.id,
      provinceName: province.name,
      x: keepOriginalPoint ? clampNumber(item.x, 20, MAP_WIDTH - 20, fallbackPoint.x) : fallbackPoint.x,
      y: keepOriginalPoint ? clampNumber(item.y, 20, MAP_HEIGHT - 20, fallbackPoint.y) : fallbackPoint.y,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      activeAlbumId: albums.some((album) => album.id === item.activeAlbumId) ? item.activeAlbumId : albums[0]?.id || null,
      albums,
    };
  }).filter(Boolean);
}

function resolveProvince(item) {
  if (typeof item.provinceId === "string" && provinceById.has(item.provinceId)) {
    return provinceById.get(item.provinceId);
  }
  if (typeof item.provinceName === "string") {
    const byName = provinceByName.get(normalizeProvinceName(item.provinceName));
    if (byName) return byName;
  }
  if (Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y))) {
    return nearestProvince(Number(item.x), Number(item.y));
  }
  return provinces[0] || null;
}

function migratedAnchorPoint(province, index) {
  const offset = [
    { x: 0, y: 0 },
    { x: 18, y: -12 },
    { x: -18, y: 12 },
    { x: 24, y: 16 },
    { x: -24, y: -16 },
    { x: 30, y: 0 },
    { x: -30, y: 0 },
  ][index % 7];
  return {
    x: clampNumber(province.centerPoint.x + offset.x, 20, MAP_WIDTH - 20, province.centerPoint.x),
    y: clampNumber(province.centerPoint.y + offset.y, 20, MAP_HEIGHT - 20, province.centerPoint.y),
  };
}

function normalizeProvinceName(name) {
  return String(name || "").replace(/\s+/g, "").trim();
}

function normalizePhotos(list) {
  return normalizePhotoList(list, "未命名照片");
}

function normalizeAlbums(list, legacyPhotos, fallbackCreatedAt) {
  const albums = Array.isArray(list)
    ? list.filter((item) => item && typeof item.id === "string").map((item, index) => ({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 40) : `相册 ${index + 1}`,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : fallbackCreatedAt || new Date().toISOString(),
      coverPhotoId: typeof item.coverPhotoId === "string" ? item.coverPhotoId : null,
      photos: normalizePhotos(item.photos),
    }))
    : [];

  const normalized = albums.length > 0 ? albums : legacyPhotos.length > 0 ? [{
    id: createId("album"),
    name: "默认相册",
    createdAt: fallbackCreatedAt || new Date().toISOString(),
    coverPhotoId: legacyPhotos[0]?.id || null,
    photos: legacyPhotos,
  }] : [];

  normalized.forEach((album) => {
    if (!album.photos.some((photo) => photo.id === album.coverPhotoId)) {
      album.coverPhotoId = album.photos[0]?.id || null;
    }
  });

  return normalized;
}

function saveState() {
  try {
    state.version = STORAGE_VERSION;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
    return true;
  } catch (error) {
    console.error(error);
    showToast(TEXT.saveError);
    return false;
  }
}

function serializeState() {
  return {
    version: STORAGE_VERSION,
    activeAnchorId: state.activeAnchorId,
    anchors: state.anchors.map((anchor) => ({
      id: anchor.id,
      name: anchor.name,
      provinceId: anchor.provinceId,
      provinceName: anchor.provinceName,
      x: anchor.x,
      y: anchor.y,
      createdAt: anchor.createdAt,
      activeAlbumId: anchor.activeAlbumId,
      albums: Array.isArray(anchor.albums) ? anchor.albums.map((album) => ({
        id: album.id,
        name: album.name,
        createdAt: album.createdAt,
        coverPhotoId: album.coverPhotoId,
        photos: Array.isArray(album.photos) ? album.photos.map((photo) => serializePhotoEntry(photo)) : [],
      })) : [],
    })),
  };
}

function syncSelectionWithState() {
  if (!provinceById.has(selectedProvinceId)) selectedProvinceId = null;
}

function render() {
  renderProvinceSelection();
  renderAnchors();
  renderFocusOverlay();
}

function openProvinceFocus(provinceId) {
  selectedProvinceId = provinceId;
  focusProvinceId = provinceId;
  render();
}

function renderProvinceSelection() {
  provinceSelectionLayer.replaceChildren();
  provinceNodes.forEach(({ paths, province }) => {
    const isActive = province.id === selectedProvinceId;
    const hasSelection = Boolean(selectedProvinceId);
    paths.forEach((path) => {
      path.classList.toggle("is-active", isActive);
      path.classList.toggle("is-dimmed", hasSelection && !isActive);
    });
  });

  const active = provinceById.get(selectedProvinceId);
  if (!active) return;
  active.pathData.forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "province-selection-path");
    path.setAttribute("d", d);
    applyPalette(path, active.palette);
    provinceSelectionLayer.appendChild(path);
  });
}

function renderAnchors() {
  anchorLayer.replaceChildren();
  const hasProvinceSelection = Boolean(selectedProvinceId);
  const animationKey = state.anchors.map((anchor) => `${anchor.id}:${Math.round(anchor.x)}:${Math.round(anchor.y)}`).join("|");
  const shouldAnimateEntry = animationKey !== lastAnchorAnimationKey;

  state.anchors.forEach((anchor, index) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("map-anchor");
    if (hasProvinceSelection && anchor.provinceId !== selectedProvinceId) group.classList.add("is-muted");
    if (hasProvinceSelection && anchor.provinceId === selectedProvinceId) group.classList.add("is-label-visible");
    if (anchor.id === state.activeAnchorId) group.classList.add("is-active");
    group.dataset.anchorId = anchor.id;
    group.setAttribute("transform", `translate(${anchor.x} ${anchor.y})`);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${anchor.name}，点击打开摄影展示页`);

    const visual = createAnchorVisual(anchor.name, { iconWidth: 24, iconHeight: 24, iconX: -12, iconY: -24, pulseRadius: 8, pulseCy: 4, labelY: -28 });
    if (shouldAnimateEntry) {
      visual.classList.add("module-pop-stagger", "is-bounce");
      visual.style.setProperty("--module-pop-index", String(index));
    }
    group.append(visual);
    group.addEventListener("click", () => openGalleryForAnchor(anchor.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openGalleryForAnchor(anchor.id);
      }
    });
    anchorLayer.appendChild(group);
  });

  lastAnchorAnimationKey = animationKey;
}

function renderFocusOverlay() {
  const province = provinceById.get(focusProvinceId);
  if (!province || !provinceFocusBackdrop) {
    provinceFocusBackdrop?.setAttribute("hidden", "");
    focusProvinceLayer?.replaceChildren();
    focusAnchorLayer?.replaceChildren();
    focusLabelLayer?.replaceChildren();
    focusTransform = null;
    return;
  }

  provinceFocusBackdrop.hidden = false;
  focusProvinceName.textContent = `${province.name} 摄影模块`;
  focusProvinceHint.textContent = TEXT.focusHint;
  focusTransform = createFocusTransform(province.bounds);
  renderFocusProvince(province);
  renderFocusAnchors(province);
}

function createFocusTransform(bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (FOCUS_VIEWBOX_WIDTH - FOCUS_PADDING_X * 2) / width,
    (FOCUS_VIEWBOX_HEIGHT - FOCUS_PADDING_Y * 2) / height,
  );
  return {
    scale,
    translateX: (FOCUS_VIEWBOX_WIDTH - width * scale) / 2 - bounds.minX * scale,
    translateY: (FOCUS_VIEWBOX_HEIGHT - height * scale) / 2 - bounds.minY * scale,
  };
}

function renderFocusProvince(province) {
  focusProvinceLayer.replaceChildren();
  focusLabelLayer.replaceChildren();

  const shell = document.createElementNS(SVG_NS, "g");
  shell.setAttribute("transform", `translate(${focusTransform.translateX} ${focusTransform.translateY}) scale(${focusTransform.scale})`);
  applyPalette(shell, province.palette);

  province.pathData.forEach((d) => {
    const shadow = document.createElementNS(SVG_NS, "path");
    shadow.setAttribute("class", "focus-province-shadow");
    shadow.setAttribute("d", d);
    shell.appendChild(shadow);
  });
  province.pathData.forEach((d) => {
    const outline = document.createElementNS(SVG_NS, "path");
    outline.setAttribute("class", "focus-province-outline");
    outline.setAttribute("d", d);
    shell.appendChild(outline);
  });
  province.pathData.forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", "focus-province-path");
    path.setAttribute("d", d);
    shell.appendChild(path);
  });
  province.pathData.forEach((d) => {
    const hitArea = document.createElementNS(SVG_NS, "path");
    hitArea.setAttribute("class", "focus-province-hitarea");
    hitArea.setAttribute("d", d);
    shell.appendChild(hitArea);
  });
  focusProvinceLayer.appendChild(shell);

  const center = applyFocusTransform(province.centerPoint);
  const title = document.createElementNS(SVG_NS, "text");
  title.setAttribute("class", "focus-label");
  title.setAttribute("x", String(center.x));
  title.setAttribute("y", String(center.y));
  title.textContent = province.shortName;
  const subtitle = document.createElementNS(SVG_NS, "text");
  subtitle.setAttribute("class", "focus-label-sub");
  subtitle.setAttribute("x", String(center.x));
  subtitle.setAttribute("y", String(center.y + 28));
  subtitle.textContent = TEXT.focusSubtitle;
  focusLabelLayer.append(title, subtitle);
}

function renderFocusAnchors(province) {
  focusAnchorLayer.replaceChildren();
  state.anchors.filter((anchor) => anchor.provinceId === province.id).forEach((anchor, index) => {
    const point = applyFocusTransform({ x: anchor.x, y: anchor.y });
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("focus-anchor");
    if (anchor.id === state.activeAnchorId) group.classList.add("is-active");
    group.dataset.anchorId = anchor.id;
    group.setAttribute("transform", `translate(${point.x} ${point.y})`);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${anchor.name}，点击打开摄影展示页`);
    const visual = createAnchorVisual(anchor.name, { iconWidth: 30, iconHeight: 30, iconX: -15, iconY: -30, pulseRadius: 10, pulseCy: 5, labelY: -34 });
    visual.classList.add("module-pop-stagger", "is-bounce");
    visual.style.setProperty("--module-pop-index", String(index));
    group.append(visual);
    group.addEventListener("click", () => openGalleryForAnchor(anchor.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openGalleryForAnchor(anchor.id);
      }
    });
    focusAnchorLayer.appendChild(group);
  });
}

function applyFocusTransform(point) {
  return {
    x: point.x * focusTransform.scale + focusTransform.translateX,
    y: point.y * focusTransform.scale + focusTransform.translateY,
  };
}

function createAnchorVisual(labelText, options) {
  const visual = document.createElementNS(SVG_NS, "g");
  visual.setAttribute("class", "anchor-visual module-pop-svg");
  const pulse = document.createElementNS(SVG_NS, "circle");
  pulse.setAttribute("class", "anchor-pulse");
  pulse.setAttribute("r", String(options.pulseRadius));
  pulse.setAttribute("cy", String(options.pulseCy));
  const icon = document.createElementNS(SVG_NS, "image");
  icon.setAttribute("class", "anchor-icon");
  icon.setAttribute("x", String(options.iconX));
  icon.setAttribute("y", String(options.iconY));
  icon.setAttribute("width", String(options.iconWidth));
  icon.setAttribute("height", String(options.iconHeight));
  icon.setAttribute("preserveAspectRatio", "xMidYMid meet");
  icon.setAttribute("href", ANCHOR_ICON_PATH);
  icon.setAttributeNS(XLINK_NS, "href", ANCHOR_ICON_PATH);
  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("class", "anchor-label");
  label.setAttribute("x", "0");
  label.setAttribute("y", String(options.labelY));
  label.textContent = labelText;
  visual.append(pulse, icon, label);
  return visual;
}

function handleFocusContextMenu(event) {
  event.preventDefault();
  if (!(event.target instanceof Element) || !focusProvinceId || !focusTransform) return;
  if (event.target.closest("[data-anchor-id]")) return;
  if (!event.target.closest(".focus-province-hitarea, .focus-province-path, .focus-province-outline")) return;

  const province = provinceById.get(focusProvinceId);
  if (!province) return;

  const focusPoint = toSvgPoint(provinceFocusMap, event.clientX, event.clientY);
  const mapPoint = {
    x: (focusPoint.x - focusTransform.translateX) / focusTransform.scale,
    y: (focusPoint.y - focusTransform.translateY) / focusTransform.scale,
  };
  const defaultName = createAnchorName(province.name);
  const customName = window.prompt("请输入这个摄影展示页的名称：", defaultName);
  if (customName === null) return;

  state.anchors.push({
    id: createId("anchor"),
    name: customName.trim().slice(0, 32) || defaultName,
    provinceId: province.id,
    provinceName: province.name,
    x: clampNumber(mapPoint.x, 20, MAP_WIDTH - 20, province.centerPoint.x),
    y: clampNumber(mapPoint.y, 20, MAP_HEIGHT - 20, province.centerPoint.y),
    createdAt: new Date().toISOString(),
    activeAlbumId: null,
    albums: [],
  });
  state.activeAnchorId = state.anchors.at(-1)?.id || null;
  selectedProvinceId = province.id;
  if (saveState()) {
    render();
    showToast(TEXT.addAnchor);
  }
}

function toSvgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
}

function openGalleryForAnchor(anchorId) {
  state.activeAnchorId = anchorId;
  if (!saveState()) return;
  window.location.href = `./gallery.html?anchor=${encodeURIComponent(anchorId)}`;
}

function closeProvinceFocus() {
  focusProvinceId = null;
  renderFocusOverlay();
}

function nearestProvince(x, y) {
  let closest = provinces[0] || null;
  let distance = Number.POSITIVE_INFINITY;
  provinces.forEach((province) => {
    const nextDistance = Math.hypot(province.centerPoint.x - x, province.centerPoint.y - y);
    if (nextDistance < distance) {
      distance = nextDistance;
      closest = province;
    }
  });
  return closest;
}

function shortProvinceName(name) {
  return String(name || "")
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市)$/u, "")
    .slice(0, 2) || "省份";
}

function createAnchorName(provinceName) {
  let index = 1;
  let nextName = `${provinceName || "摄影"}摄影点 ${index}`;
  while (state.anchors.some((anchor) => anchor.name === nextName)) {
    index += 1;
    nextName = `${provinceName || "摄影"}摄影点 ${index}`;
  }
  return nextName;
}

function buildAnchorName(provinceName, index) {
  return `${provinceName || "摄影"}摄影点 ${index}`;
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  syncSelectionWithState();
  render();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1900);
}
