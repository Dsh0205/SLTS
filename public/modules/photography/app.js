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
const ANCHOR_ICON_PATH = "../words/img/Icons8/icons8-\u5730\u56fe\u9488-50.png";
const EMBEDDED_GALLERY_URL = "./gallery.html?embedded=1";
const EMBEDDED_GALLERY_URL_PREFIX = `${EMBEDDED_GALLERY_URL}&anchor=`;
const GALLERY_OPEN_MESSAGE_TYPE = "shanlic:open-photography-gallery";
const GALLERY_CLOSE_MESSAGE_TYPE = "shanlic:close-photography-gallery";
const GALLERY_SHELL_ENTER_CLASS = "is-enter-active";
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const MAP_PADDING = 42;
const IDENTITY_MAP_TRANSFORM = { scale: 1, translateX: 0, translateY: 0 };
const MIN_MAP_SCALE = 1;
const MAX_MAP_SCALE = 4;
const MAP_PAN_THRESHOLD = 6;
const MAP_CLICK_SUPPRESSION_MS = 240;
const SPECIAL_PROVINCE_LABELS = [
  { provinceId: "province_810000", label: "\u9999\u6e2f", offsetX: 112, offsetY: -18 },
  { provinceId: "province_820000", label: "\u6fb3\u95e8", offsetX: 112, offsetY: 40 },
];
const TEXT = {
  addAnchor: "\u5df2\u521b\u5efa\u65b0\u7684\u6444\u5f71\u5730\u70b9",
  saveError: "\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5",
  mapLoadError: "\u5730\u56fe\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u540e\u91cd\u8bd5",
  focusHint: "\u70b9\u51fb\u653e\u5927\u7684\u7701\u4efd\u5730\u56fe\u5373\u53ef\u8fdb\u5165\u76f8\u518c\uff0c\u4e5f\u53ef\u4ee5\u5148\u70b9\u201c\u624b\u52a8\u653e\u7f6e\u201d\u521b\u5efa\u5730\u70b9\u3002",
  focusSubtitle: "\u70b9\u51fb\u7701\u4efd\u7a7a\u767d\u533a\u57df\u521b\u5efa\u5730\u70b9\uff0c\u70b9\u51fb\u5df2\u6709\u5730\u70b9\u8fdb\u5165\u76f8\u518c\u9875\u9762\u3002",
};
const FOCUS_HINT_TEXT = "\u70b9\u51fb\u653e\u5927\u7684\u7701\u4efd\u5730\u56fe\u5373\u53ef\u8fdb\u5165\u76f8\u518c\uff0c\u4e5f\u53ef\u4ee5\u5148\u70b9\u201c\u624b\u52a8\u653e\u7f6e\u201d\u521b\u5efa\u5730\u70b9\u3002";
const FOCUS_PLACEMENT_HINT_TEXT = "\u5df2\u8fdb\u5165\u653e\u7f6e\u6a21\u5f0f\uff0c\u8bf7\u5728\u653e\u5927\u5730\u56fe\u91cc\u70b9\u51fb\u4f60\u8981\u521b\u5efa\u5730\u70b9\u7684\u4f4d\u7f6e\u3002";
const FOCUS_SUBTITLE_TEXT = "\u70b9\u51fb\u7701\u4efd\u7a7a\u767d\u533a\u57df\u521b\u5efa\u5730\u70b9\uff0c\u70b9\u51fb\u5df2\u6709\u5730\u70b9\u8fdb\u5165\u76f8\u518c\u9875\u9762\u3002";
const FOCUS_PLACEMENT_READY_TEXT = "\u5df2\u8fdb\u5165\u521b\u5efa\u6a21\u5f0f\uff0c\u8bf7\u5728\u653e\u5927\u5730\u56fe\u4e2d\u70b9\u51fb\u4f4d\u7f6e";
const FOCUS_PLACEMENT_CANCELED_TEXT = "\u5df2\u53d6\u6d88\u5730\u70b9\u653e\u7f6e";
const desktopBridge = window.shanlicDesktop || null;

const mapView = document.getElementById("mapView");
const chinaMap = document.getElementById("chinaMap");
const mapViewport = document.getElementById("mapViewport");
const provinceShapeLayer = document.getElementById("provinceShapeLayer");
const provinceSelectionLayer = document.getElementById("provinceSelectionLayer");
const provinceLabelLayer = document.getElementById("provinceLabelLayer");
const anchorLayer = document.getElementById("anchorLayer");
const toast = document.getElementById("toast");
const mapStageRail = document.getElementById("mapStageRail");
const mapActiveProvinceName = document.getElementById("mapActiveProvinceName");
const provinceFocusBackdrop = document.getElementById("provinceFocusBackdrop");
const closeProvinceFocusBtn = document.getElementById("closeProvinceFocusBtn");
const focusProvinceName = document.getElementById("focusProvinceName");
const focusProvinceHint = document.getElementById("focusProvinceHint");
const focusProvinceAlbumCount = document.getElementById("focusProvinceAlbumCount");
const focusProvinceList = document.getElementById("focusProvinceList");
const focusEnterGalleryBtn = document.getElementById("focusEnterGalleryBtn");
const focusCreateAnchorBtn = document.getElementById("focusCreateAnchorBtn");
const anchorNameDialog = document.getElementById("anchorNameDialog");
const anchorNameInput = document.getElementById("anchorNameInput");
const anchorGalleryModal = document.getElementById("anchorGalleryModal");
const anchorGalleryTitle = document.getElementById("anchorGalleryTitle");
const anchorGalleryMeta = document.getElementById("anchorGalleryMeta");
const anchorGalleryFrame = document.getElementById("anchorGalleryFrame");
const closeAnchorGalleryBtn = document.getElementById("closeAnchorGalleryBtn");

let provinces = [];
let provinceById = new Map();
let provinceByName = new Map();
let provinceNodes = new Map();
let provinceLabelNodes = new Map();
let mapAnchorNodes = new Map();
let provincePanelCardNodes = new Map();
let state = createDefaultState();
let selectedProvinceId = null;
let focusProvinceId = null;
let toastTimer = 0;
let lastAnchorAnimationKey = "";
let focusAnchorPromptPending = false;
let isFocusAnchorPlacementMode = false;
let currentMapTransform = { ...IDENTITY_MAP_TRANSFORM };
let mapTransformAnimationFrame = 0;
let lastMapViewportKey = "__initial__";
let lastProvinceSelectionKey = "__initial__";
let lastAnchorRenderKey = "__initial__";
let lastAnchorStateKey = "__initial__";
let lastProvincePanelRenderKey = "__initial__";
let suppressMapClickUntil = 0;
let mapPanState = null;
let galleryFrameLoaded = false;
let pendingGalleryOpenMessage = null;
let galleryShellEnterFrame = 0;

bindEvents();
bootstrap();

function bindEvents() {
  chinaMap?.addEventListener("pointerdown", handleChinaMapPointerDown);
  chinaMap?.addEventListener("pointermove", handleChinaMapPointerMove);
  chinaMap?.addEventListener("pointerup", handleChinaMapPointerUp);
  chinaMap?.addEventListener("pointercancel", handleChinaMapPointerUp);
  chinaMap?.addEventListener("lostpointercapture", handleChinaMapPointerUp);
  chinaMap?.addEventListener("wheel", handleChinaMapWheel, { passive: false });
  chinaMap?.addEventListener("contextmenu", handleChinaMapContextMenu);
  closeProvinceFocusBtn?.addEventListener("click", closeProvinceFocus);
  focusEnterGalleryBtn?.addEventListener("click", handleFocusEnterGalleryButtonClick);
  focusCreateAnchorBtn?.addEventListener("click", handleFocusCreateAnchorButtonClick);
  closeAnchorGalleryBtn?.addEventListener("click", () => closeGalleryModal());
  provinceFocusBackdrop?.addEventListener("click", (event) => {
    if (event.target === provinceFocusBackdrop) closeProvinceFocus();
  });
  anchorGalleryModal?.addEventListener("click", (event) => {
    if (event.target === anchorGalleryModal) closeGalleryModal();
  });
  anchorGalleryFrame?.addEventListener("load", handleGalleryFrameLoad);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isGalleryModalOpen()) {
      closeGalleryModal();
      return;
    }
    if (focusProvinceId && !anchorNameDialog?.open) closeProvinceFocus();
  });
  window.addEventListener("resize", handleViewportResize);
  window.addEventListener("storage", handleStorageSync);
  window.addEventListener("message", handleGalleryFrameMessage);
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
    scheduleInteractionWarmup();
  } catch (error) {
    console.error(error);
    showToast(TEXT.mapLoadError);
  }
}

function scheduleInteractionWarmup() {
  const runWarmup = () => {
    warmAnchorIconAsset();
    warmOverlayLayers();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => runWarmup(), { timeout: 900 });
    return;
  }

  window.setTimeout(runWarmup, 240);
}

function warmAnchorIconAsset() {
  if (typeof Image !== "function") return;

  const icon = new Image();
  icon.decoding = "async";
  icon.src = ANCHOR_ICON_PATH;
  icon.decode?.().catch(() => {});
}

function warmOverlayLayers() {
  window.requestAnimationFrame(() => {
    provinceFocusBackdrop?.getBoundingClientRect?.();
    anchorGalleryModal?.getBoundingClientRect?.();
  });
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
  const hue = 132 + (index % 6) * 4;
  const lightness = 24 + (index % 4) * 3;
  return {
    fill: `hsl(${hue} 26% ${lightness}%)`,
    stroke: `hsl(${hue} 30% 46%)`,
    activeFill: `hsl(${hue} 42% 38%)`,
    activeStroke: `hsl(${hue} 58% 80%)`,
    hoverFill: `hsl(${hue} 34% 32%)`,
    hoverStroke: `hsl(${hue} 50% 70%)`,
    selectionFill: `hsl(${hue} 58% 54% / 0.16)`,
    selectionStroke: `hsl(${hue} 68% 78% / 0.9)`,
    focusFill: `hsl(${hue} 38% 68%)`,
    focusOutlineFill: `hsl(${hue} 56% 56% / 0.12)`,
    focusOutlineStroke: `hsl(${hue} 62% 76% / 0.26)`,
    focusShadow: `hsl(${hue} 44% 10% / 0.42)`,
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
    group.addEventListener("click", (event) => handleProvinceShapeClick(event, province.id));
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
  return normalizePhotoList(list, "\u672a\u547d\u540d\u7167\u7247");
}

function normalizeAlbums(list, legacyPhotos, fallbackCreatedAt) {
  const albums = Array.isArray(list)
    ? list.filter((item) => item && typeof item.id === "string").map((item, index) => ({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 40) : `\u76f8\u518c ${index + 1}`,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : fallbackCreatedAt || new Date().toISOString(),
      coverPhotoId: typeof item.coverPhotoId === "string" ? item.coverPhotoId : null,
      photos: normalizePhotos(item.photos),
    }))
    : [];

  const normalized = albums.length > 0 ? albums : legacyPhotos.length > 0 ? [{
    id: createId("album"),
    name: "\u9ed8\u8ba4\u76f8\u518c",
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
  if (!provinceById.has(focusProvinceId)) focusProvinceId = null;
}

function render(options = {}) {
  const {
    forceViewport = false,
    forceProvinceLabels = false,
    forceAnchors = false,
  } = options;
  mapView?.classList.toggle("is-province-panel-open", Boolean(focusProvinceId));
  mapView?.classList.toggle("is-anchor-placement", isFocusAnchorPlacementMode);
  renderMapStageMeta();
  renderMapViewport(forceViewport);
  renderProvinceSelection();
  renderProvinceLabels(forceProvinceLabels);
  renderAnchors(forceAnchors);
  renderFocusOverlay();
}

function renderMapViewport(force = false) {
  const viewportKey = getMapViewportKey();
  if (!force && viewportKey === lastMapViewportKey) {
    return;
  }

  lastMapViewportKey = viewportKey;
  const province = provinceById.get(focusProvinceId || selectedProvinceId) || null;
  const targetTransform = province
    ? createMapViewportTransform(province.bounds)
    : IDENTITY_MAP_TRANSFORM;
  animateMapViewport(targetTransform);
}

function setMapViewportAnimating(isAnimating) {
  mapView?.classList.toggle("is-map-animating", Boolean(isAnimating));
}

function createMapViewportTransform(bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const isDesktop = window.innerWidth >= 1024;
  const availableWidth = isDesktop ? MAP_WIDTH * 0.54 : MAP_WIDTH - 132;
  const availableHeight = isDesktop ? MAP_HEIGHT - 152 : MAP_HEIGHT - 220;
  const scale = Math.max(1, Math.min(
    isDesktop ? 2.55 : 2.15,
    availableWidth / width,
    availableHeight / height,
  ));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const targetCenterX = isDesktop ? 360 : MAP_WIDTH / 2;
  const targetCenterY = isDesktop ? MAP_HEIGHT * 0.53 : MAP_HEIGHT * 0.39;

  return {
    scale,
    translateX: targetCenterX - centerX * scale,
    translateY: targetCenterY - centerY * scale,
  };
}

function animateMapViewport(targetTransform) {
  if (!mapViewport) return;

  const deltaScale = Math.abs(targetTransform.scale - currentMapTransform.scale);
  const deltaX = Math.abs(targetTransform.translateX - currentMapTransform.translateX);
  const deltaY = Math.abs(targetTransform.translateY - currentMapTransform.translateY);
  if (deltaScale < 0.001 && deltaX < 0.5 && deltaY < 0.5) {
    currentMapTransform = { ...targetTransform };
    applyMapViewportTransform(currentMapTransform);
    mapTransformAnimationFrame = 0;
    setMapViewportAnimating(false);
    return;
  }

  window.cancelAnimationFrame(mapTransformAnimationFrame);
  setMapViewportAnimating(true);
  const startTransform = { ...currentMapTransform };
  const startedAt = window.performance.now();
  const duration = 760;

  const frame = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) ** 3;
    currentMapTransform = {
      scale: startTransform.scale + (targetTransform.scale - startTransform.scale) * eased,
      translateX: startTransform.translateX + (targetTransform.translateX - startTransform.translateX) * eased,
      translateY: startTransform.translateY + (targetTransform.translateY - startTransform.translateY) * eased,
    };
    applyMapViewportTransform(currentMapTransform);
    if (progress < 1) {
      mapTransformAnimationFrame = window.requestAnimationFrame(frame);
      return;
    }

    mapTransformAnimationFrame = 0;
    setMapViewportAnimating(false);
  };

  mapTransformAnimationFrame = window.requestAnimationFrame(frame);
}

function applyMapViewportTransform(transform) {
  mapViewport?.setAttribute(
    "transform",
    `translate(${transform.translateX.toFixed(2)} ${transform.translateY.toFixed(2)}) scale(${transform.scale.toFixed(4)})`,
  );
}

function stopMapViewportAnimation() {
  window.cancelAnimationFrame(mapTransformAnimationFrame);
  mapTransformAnimationFrame = 0;
  setMapViewportAnimating(false);
}

function getMapViewportKey() {
  return focusProvinceId || selectedProvinceId || "identity";
}

function setMapPanning(isPanning) {
  mapView?.classList.toggle("is-map-panning", Boolean(isPanning));
  chinaMap?.classList.toggle("is-panning", Boolean(isPanning));
}

function suppressMapClick() {
  suppressMapClickUntil = window.performance.now() + MAP_CLICK_SUPPRESSION_MS;
}

function shouldSuppressMapClick() {
  return window.performance.now() < suppressMapClickUntil;
}

function renderMapStageMeta() {
  const activeProvince = provinceById.get(focusProvinceId || selectedProvinceId) || null;
  mapStageRail?.toggleAttribute("hidden", !activeProvince);
  if (mapActiveProvinceName) {
    mapActiveProvinceName.textContent = activeProvince ? activeProvince.name : "";
  }
}

function openProvinceFocus(provinceId) {
  selectedProvinceId = provinceId;
  focusProvinceId = provinceId;
  setFocusAnchorPlacementMode(false);
  render();
}

function handleProvinceShapeClick(event, provinceId) {
  if (shouldSuppressMapClick()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (isFocusAnchorPlacementMode && focusProvinceId === provinceId) {
    event.preventDefault();
    event.stopPropagation();
    void createAnchorFromSelectedProvinceClick(event, provinceId);
    return;
  }

  openProvinceFocus(provinceId);
}

function openOrCreateGalleryForProvince(provinceId) {
  const province = provinceById.get(provinceId);
  if (!province) return false;

  selectedProvinceId = provinceId;

  const existingAnchor = findPreferredAnchorForProvince(provinceId);
  if (existingAnchor) {
    openGalleryForAnchor(existingAnchor.id);
    return true;
  }

  void createAnchorForProvince(province, province.centerPoint, {
    requestName: false,
    navigateToGallery: true,
  });
  return true;
}

function findPreferredAnchorForProvince(provinceId) {
  if (!provinceId) return null;

  const activeAnchor = state.anchors.find((anchor) => anchor.id === state.activeAnchorId);
  if (activeAnchor?.provinceId === provinceId) {
    return activeAnchor;
  }

  return state.anchors.find((anchor) => anchor.provinceId === provinceId) || null;
}

function handleFocusCreateAnchorButtonClick() {
  if (!focusProvinceId) return;
  const nextState = !isFocusAnchorPlacementMode;
  setFocusAnchorPlacementMode(nextState);
  showToast(nextState ? FOCUS_PLACEMENT_READY_TEXT : FOCUS_PLACEMENT_CANCELED_TEXT);
}

function handleFocusEnterGalleryButtonClick() {
  if (!focusProvinceId) return;
  setFocusAnchorPlacementMode(false);
  openOrCreateGalleryForProvince(focusProvinceId);
}

function setFocusAnchorPlacementMode(enabled) {
  isFocusAnchorPlacementMode = Boolean(enabled) && Boolean(focusProvinceId);
  syncFocusAnchorPlacementUi();
}

function syncFocusAnchorPlacementUi() {
  if (focusProvinceHint && isFocusAnchorPlacementMode) {
    focusProvinceHint.textContent = FOCUS_PLACEMENT_HINT_TEXT;
  } else if (focusProvinceHint && !focusProvinceId) {
    focusProvinceHint.textContent = FOCUS_HINT_TEXT;
  }

  if (focusCreateAnchorBtn) {
    focusCreateAnchorBtn.classList.toggle("is-active", isFocusAnchorPlacementMode);
    focusCreateAnchorBtn.textContent = isFocusAnchorPlacementMode ? "\u53d6\u6d88\u653e\u7f6e" : "\u624b\u52a8\u653e\u7f6e";
  }

  mapView?.classList.toggle("is-anchor-placement", isFocusAnchorPlacementMode);
}

function renderProvinceSelection() {
  provinceNodes.forEach(({ paths, province }) => {
    const isActive = province.id === selectedProvinceId;
    const hasSelection = Boolean(selectedProvinceId);
    paths.forEach((path) => {
      path.classList.toggle("is-active", isActive);
      path.classList.toggle("is-dimmed", hasSelection && !isActive);
    });
  });

  if (selectedProvinceId === lastProvinceSelectionKey) {
    return;
  }

  lastProvinceSelectionKey = selectedProvinceId || "__none__";
  provinceSelectionLayer.replaceChildren();
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

function renderProvinceLabels(force = false) {
  if (!provinceLabelLayer) {
    return;
  }

  if (force || provinceLabelNodes.size === 0) {
    provinceLabelLayer.replaceChildren();
    provinceLabelNodes = new Map();
    SPECIAL_PROVINCE_LABELS.forEach((item) => {
      const group = createProvinceLabelNode(item);
      if (group) {
        provinceLabelLayer.appendChild(group);
      }
    });
  }

  provinceLabelNodes.forEach((group, provinceId) => {
    group.classList.toggle("is-active", provinceId === selectedProvinceId || provinceId === focusProvinceId);
  });
}

function renderAnchors(force = false) {
  const anchorRenderKey = state.anchors
    .map((anchor) => `${anchor.id}:${Math.round(anchor.x)}:${Math.round(anchor.y)}:${anchor.name}`)
    .join("|");
  const anchorStateKey = `${selectedProvinceId || ""}:${state.activeAnchorId || ""}`;
  const shouldRebuild = force || anchorRenderKey !== lastAnchorRenderKey;

  if (shouldRebuild) {
    anchorLayer.replaceChildren();
    mapAnchorNodes = new Map();
    const shouldAnimateEntry = anchorRenderKey !== lastAnchorAnimationKey;
    state.anchors.forEach((anchor, index) => {
      const group = createMapAnchorNode(anchor, index, shouldAnimateEntry);
      anchorLayer.appendChild(group);
      mapAnchorNodes.set(anchor.id, group);
    });
    lastAnchorAnimationKey = anchorRenderKey;
    lastAnchorRenderKey = anchorRenderKey;
  }

  if (!shouldRebuild && anchorStateKey === lastAnchorStateKey) {
    return;
  }

  const hasActiveProvinceSelection = Boolean(selectedProvinceId);
  state.anchors.forEach((anchor) => {
    const group = mapAnchorNodes.get(anchor.id);
    if (!group) {
      return;
    }
    group.classList.toggle("is-muted", hasActiveProvinceSelection && anchor.provinceId !== selectedProvinceId);
    group.classList.toggle("is-active", anchor.id === state.activeAnchorId);
  });

  lastAnchorStateKey = anchorStateKey;
}

function createProvinceLabelNode(item) {
  const province = provinceById.get(item.provinceId);
  if (!province) {
    return null;
  }

  const sourceX = province.centerPoint.x;
  const sourceY = province.centerPoint.y;
  const targetX = clampNumber(sourceX + item.offsetX, 72, MAP_WIDTH - 72, sourceX);
  const targetY = clampNumber(sourceY + item.offsetY, 44, MAP_HEIGHT - 44, sourceY);
  const badgeWidth = 58;
  const badgeHeight = 24;
  const badgeX = targetX - badgeWidth / 2;
  const badgeY = targetY - badgeHeight / 2;
  const connectorX = badgeX + 8;
  const elbowX = connectorX - 22;

  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("province-label-group");
  group.dataset.provinceId = province.id;
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `${item.label}, open province panel`);

  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("class", "province-label-dot");
  dot.setAttribute("cx", sourceX.toFixed(2));
  dot.setAttribute("cy", sourceY.toFixed(2));
  dot.setAttribute("r", "3.8");

  const callout = document.createElementNS(SVG_NS, "path");
  callout.setAttribute("class", "province-label-callout");
  callout.setAttribute(
    "d",
    `M${sourceX.toFixed(2)} ${sourceY.toFixed(2)} L${elbowX.toFixed(2)} ${sourceY.toFixed(2)} L${connectorX.toFixed(2)} ${targetY.toFixed(2)}`,
  );

  const badge = document.createElementNS(SVG_NS, "rect");
  badge.setAttribute("class", "province-label-badge");
  badge.setAttribute("x", badgeX.toFixed(2));
  badge.setAttribute("y", badgeY.toFixed(2));
  badge.setAttribute("width", String(badgeWidth));
  badge.setAttribute("height", String(badgeHeight));
  badge.setAttribute("rx", "12");
  badge.setAttribute("ry", "12");

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("class", "province-label");
  text.setAttribute("x", targetX.toFixed(2));
  text.setAttribute("y", targetY.toFixed(2));
  text.textContent = item.label;

  const hotspot = document.createElementNS(SVG_NS, "rect");
  hotspot.setAttribute("class", "province-label-hotspot");
  hotspot.setAttribute("x", (badgeX - 10).toFixed(2));
  hotspot.setAttribute("y", (badgeY - 10).toFixed(2));
  hotspot.setAttribute("width", String(badgeWidth + 20));
  hotspot.setAttribute("height", String(badgeHeight + 20));
  hotspot.setAttribute("rx", "16");
  hotspot.setAttribute("ry", "16");

  group.append(callout, dot, badge, text, hotspot);
  group.addEventListener("click", (event) => {
    if (shouldSuppressMapClick()) {
      event.preventDefault();
      return;
    }
    openProvinceFocus(province.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProvinceFocus(province.id);
    }
  });

  provinceLabelNodes.set(province.id, group);
  return group;
}

function createMapAnchorNode(anchor, index, shouldAnimateEntry) {
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("map-anchor");
  group.dataset.anchorId = anchor.id;
  group.setAttribute("transform", `translate(${anchor.x} ${anchor.y})`);
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "button");
  group.setAttribute("aria-label", `${anchor.name}, open gallery`);

  const visual = createAnchorVisual(anchor.name, { iconWidth: 24, iconHeight: 24, iconX: -12, iconY: -24, pulseRadius: 8, pulseCy: 4, labelY: -28 });
  if (shouldAnimateEntry) {
    visual.classList.add("module-pop-stagger", "is-bounce");
    visual.style.setProperty("--module-pop-index", String(index));
  }
  group.append(visual);
  group.addEventListener("click", (event) => {
    if (shouldSuppressMapClick()) {
      event.preventDefault();
      return;
    }
    openGalleryForAnchor(anchor.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGalleryForAnchor(anchor.id);
    }
  });
  return group;
}

function renderFocusOverlay() {
  const activeProvince = provinceById.get(focusProvinceId);
  if (!activeProvince || !provinceFocusBackdrop) {
    provinceFocusBackdrop?.classList.remove("is-open");
    provinceFocusBackdrop?.setAttribute("aria-hidden", "true");
    if (focusProvinceList instanceof HTMLElement) {
      focusProvinceList.hidden = true;
    }
    lastProvincePanelRenderKey = "__hidden__";
    isFocusAnchorPlacementMode = false;
    syncFocusAnchorPlacementUi();
    return;
  }

  provinceFocusBackdrop.classList.add("is-open");
  provinceFocusBackdrop.setAttribute("aria-hidden", "false");
  const provinceAnchors = state.anchors
    .filter((anchor) => anchor.provinceId === activeProvince.id)
    .sort((left, right) => {
      if (left.id === state.activeAnchorId) return -1;
      if (right.id === state.activeAnchorId) return 1;
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
  const provinceAlbumTotal = provinceAnchors.reduce((total, anchor) => total + getAnchorAlbumCount(anchor), 0);

  focusProvinceName.textContent = activeProvince.name;
  if (focusProvinceAlbumCount) {
    focusProvinceAlbumCount.textContent = `${provinceAlbumTotal} albums`;
  }

  renderProvincePanelList(provinceAnchors);
  syncFocusAnchorPlacementUi();
}

function renderProvincePanelList(anchors) {
  if (!(focusProvinceList instanceof HTMLElement)) {
    return;
  }

  const hasEntries = anchors.length > 0;
  focusProvinceList.hidden = !hasEntries;

  if (!hasEntries) {
    lastProvincePanelRenderKey = "__empty__";
    return;
  }

  const renderKey = anchors
    .map((anchor) => `${anchor.id}:${anchor.name}:${getAnchorAlbumCount(anchor)}:${anchor.id === state.activeAnchorId ? 1 : 0}`)
    .join("|");

  if (renderKey === lastProvincePanelRenderKey) {
    return;
  }

  const nextIds = new Set(anchors.map((anchor) => anchor.id));
  provincePanelCardNodes.forEach((card, anchorId) => {
    if (nextIds.has(anchorId)) {
      return;
    }
    card.remove();
    provincePanelCardNodes.delete(anchorId);
  });

  anchors.forEach((anchor, index) => {
    let card = provincePanelCardNodes.get(anchor.id);
    if (!card) {
      card = createProvincePanelCard(anchor);
      provincePanelCardNodes.set(anchor.id, card);
    }

    updateProvincePanelCard(card, anchor, index);
    focusProvinceList.appendChild(card);
  });

  lastProvincePanelRenderKey = renderKey;
}

function createProvincePanelCard(anchor) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "province-entry-card";
  card.dataset.anchorId = anchor.id;
  card.addEventListener("click", () => openGalleryForAnchor(anchor.id));

  const head = document.createElement("div");
  head.className = "province-entry-card-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "province-entry-card-copy";

  const title = document.createElement("strong");
  const subtitle = document.createElement("span");

  titleWrap.append(title, subtitle);
  head.append(titleWrap);
  card.append(head);
  return card;
}

function updateProvincePanelCard(card, anchor, index) {
  const title = card.querySelector("strong");
  const subtitle = card.querySelector(".province-entry-card-copy span");
  const albumTotal = getAnchorAlbumCount(anchor);

  card.classList.toggle("is-active", anchor.id === state.activeAnchorId);
  card.style.setProperty("--module-pop-index", String(index));
  card.setAttribute("aria-label", `${anchor.name}, open gallery`);

  if (title) {
    title.textContent = anchor.name;
  }
  if (subtitle) {
    subtitle.textContent = `${albumTotal} albums`;
  }
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
  icon.setAttributeNS("http://www.w3.org/1999/xlink", "href", ANCHOR_ICON_PATH);

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("class", "anchor-label");
  label.setAttribute("x", "0");
  label.setAttribute("y", String(options.labelY));
  label.textContent = labelText;

  visual.append(pulse, icon, label);
  return visual;
}

function handleChinaMapPointerDown(event) {
  if (event.button === 2) {
    createAnchorFromMainMapEvent(event);
    return;
  }

  if (event.button !== 0 || !chinaMap || event.pointerType === "mouse") return;

  stopMapViewportAnimation();
  mapPanState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startTranslateX: currentMapTransform.translateX,
    startTranslateY: currentMapTransform.translateY,
    didPan: false,
  };
}

function handleChinaMapContextMenu(event) {
  createAnchorFromMainMapEvent(event);
}

function handleChinaMapPointerMove(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) return;

  const deltaX = event.clientX - mapPanState.startClientX;
  const deltaY = event.clientY - mapPanState.startClientY;
  if (!mapPanState.didPan && Math.hypot(deltaX, deltaY) < MAP_PAN_THRESHOLD) {
    return;
  }

  if (!mapPanState.didPan) {
    mapPanState.didPan = true;
    setMapPanning(true);
    chinaMap?.setPointerCapture?.(event.pointerId);
  }

  currentMapTransform = {
    ...currentMapTransform,
    translateX: mapPanState.startTranslateX + deltaX,
    translateY: mapPanState.startTranslateY + deltaY,
  };
  applyMapViewportTransform(currentMapTransform);
  event.preventDefault();
}

function handleChinaMapPointerUp(event) {
  if (!mapPanState || event.pointerId !== mapPanState.pointerId) return;

  const didPan = mapPanState.didPan;
  mapPanState = null;
  setMapPanning(false);
  if (chinaMap?.hasPointerCapture?.(event.pointerId)) {
    chinaMap.releasePointerCapture(event.pointerId);
  }
  if (didPan) {
    suppressMapClick();
    event.preventDefault();
  }
}

function handleChinaMapWheel(event) {
  if (!chinaMap) return;

  event.preventDefault();
  stopMapViewportAnimation();

  const point = toSvgPoint(chinaMap, event.clientX, event.clientY);
  const worldPoint = toMapViewportPoint(point);
  const nextScale = clampNumber(
    currentMapTransform.scale * Math.exp(-event.deltaY * 0.0011),
    MIN_MAP_SCALE,
    MAX_MAP_SCALE,
    currentMapTransform.scale,
  );
  if (Math.abs(nextScale - currentMapTransform.scale) < 0.001) {
    return;
  }

  currentMapTransform = {
    scale: nextScale,
    translateX: point.x - worldPoint.x * nextScale,
    translateY: point.y - worldPoint.y * nextScale,
  };
  applyMapViewportTransform(currentMapTransform);
}

async function createAnchorFromMainMapEvent(event) {
  event.preventDefault();
  if (focusAnchorPromptPending) return;
  if (!(event.target instanceof Element) || event.target.closest("[data-anchor-id]")) return;

  const provinceId = event.target.closest("[data-province-id]")?.dataset?.provinceId;
  if (!provinceId) return;

  const province = provinceById.get(provinceId);
  if (!province) return;

  const mapPoint = toMapViewportPoint(toSvgPoint(chinaMap, event.clientX, event.clientY));
  await createAnchorForProvince(province, mapPoint, {
    openFocus: true,
    requestName: false,
  });
}

async function createAnchorFromSelectedProvinceClick(event, provinceId) {
  if (!(event.target instanceof Element)) return;
  const province = provinceById.get(provinceId);
  if (!province) return;

  const mapPoint = toMapViewportPoint(toSvgPoint(chinaMap, event.clientX, event.clientY));
  const created = await createAnchorForProvince(province, mapPoint, {
    openFocus: true,
    requestName: false,
  });

  if (created) {
    setFocusAnchorPlacementMode(false);
  }
}

async function createAnchorForProvince(province, mapPoint, options = {}) {
  if (!province || !mapPoint) return false;

  const defaultName = createAnchorName(province.name);
  const boundedPoint = clampAnchorPointToProvince(province, mapPoint);
  focusAnchorPromptPending = true;
  try {
    const customName = options.requestName === false
      ? defaultName
      : await requestAnchorName(defaultName);
    if (customName === null) return false;

    const nextAnchor = {
      id: createId("anchor"),
      name: customName.trim().slice(0, 32) || defaultName,
      provinceId: province.id,
      provinceName: province.name,
      x: boundedPoint.x,
      y: boundedPoint.y,
      createdAt: new Date().toISOString(),
      activeAlbumId: null,
      albums: [],
    };
    state.anchors.push(nextAnchor);
    state.activeAnchorId = nextAnchor.id;
    selectedProvinceId = province.id;
    focusProvinceId = options.openFocus ? province.id : focusProvinceId;
    const saved = saveState();
    if (saved) {
      if (options.navigateToGallery) {
        openGalleryForAnchor(nextAnchor.id);
        return true;
      }
      render();
      showToast(TEXT.addAnchor);
    }
    return saved;
  } finally {
    focusAnchorPromptPending = false;
  }
}

function clampAnchorPointToProvince(province, point) {
  return {
    x: clampNumber(point.x, province.bounds.minX, province.bounds.maxX, province.centerPoint.x),
    y: clampNumber(point.y, province.bounds.minY, province.bounds.maxY, province.centerPoint.y),
  };
}

function requestAnchorName(defaultName) {
  if (desktopBridge?.isElectron) {
    return requestAnchorNameWithDialog(defaultName);
  }

  if (typeof window.prompt === "function") {
    return Promise.resolve(window.prompt("\u8bf7\u8f93\u5165\u8fd9\u4e2a\u6444\u5f71\u5c55\u793a\u9875\u7684\u540d\u79f0\uff1a", defaultName));
  }

  return requestAnchorNameWithDialog(defaultName);
}

function requestAnchorNameWithDialog(defaultName) {
  if (!(anchorNameDialog instanceof HTMLDialogElement) || !(anchorNameInput instanceof HTMLInputElement)) {
    return Promise.resolve(
      typeof window.prompt === "function"
        ? window.prompt("\u8bf7\u8f93\u5165\u8fd9\u4e2a\u6444\u5f71\u5c55\u793a\u9875\u7684\u540d\u79f0\uff1a", defaultName)
        : defaultName,
    );
  }

  if (anchorNameDialog.open) {
    anchorNameDialog.close("cancel");
  }

  anchorNameInput.value = defaultName;

  return new Promise((resolve) => {
    const handleClose = () => {
      resolve(anchorNameDialog.returnValue === "confirm" ? anchorNameInput.value : null);
    };

    anchorNameDialog.addEventListener("close", handleClose, { once: true });

    try {
      anchorNameDialog.showModal();
      window.requestAnimationFrame(() => {
        anchorNameInput.focus();
        anchorNameInput.select();
      });
    } catch {
      anchorNameDialog.removeEventListener("close", handleClose);
      resolve(
        typeof window.prompt === "function"
          ? window.prompt("\u8bf7\u8f93\u5165\u8fd9\u4e2a\u6444\u5f71\u5c55\u793a\u9875\u7684\u540d\u79f0\uff1a", defaultName)
          : defaultName,
      );
    }
  });
}

function toSvgPoint(svg, clientX, clientY) {
  const viewBox = svg?.viewBox?.baseVal;
  const rect = typeof svg?.getBoundingClientRect === "function" ? svg.getBoundingClientRect() : null;
  if (
    rect
    && rect.width > 0
    && rect.height > 0
    && viewBox
    && Number.isFinite(viewBox.x)
    && Number.isFinite(viewBox.y)
    && Number.isFinite(viewBox.width)
    && Number.isFinite(viewBox.height)
    && viewBox.width > 0
    && viewBox.height > 0
  ) {
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
    };
  }

  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
}

function toMapViewportPoint(point) {
  return {
    x: (point.x - currentMapTransform.translateX) / currentMapTransform.scale,
    y: (point.y - currentMapTransform.translateY) / currentMapTransform.scale,
  };
}

function openGalleryForAnchor(anchorId) {
  const anchor = state.anchors.find((item) => item.id === anchorId);
  if (!anchor) return;
  state.activeAnchorId = anchorId;
  render();
  openGalleryModal(anchor);
}

function buildEmbeddedGalleryUrl(anchorId = "") {
  return anchorId
    ? `${EMBEDDED_GALLERY_URL_PREFIX}${encodeURIComponent(anchorId)}`
    : EMBEDDED_GALLERY_URL;
}

function isEmbeddedGalleryFrameSource(value) {
  return typeof value === "string"
    && (value === EMBEDDED_GALLERY_URL || value.startsWith(EMBEDDED_GALLERY_URL_PREFIX));
}

function ensureGalleryFrameReady(anchorId = "") {
  if (!(anchorGalleryFrame instanceof HTMLIFrameElement)) {
    return false;
  }

  const currentSrc = anchorGalleryFrame.getAttribute("src") || "";
  if (!galleryFrameLoaded) {
    const nextSrc = buildEmbeddedGalleryUrl(anchorId);
    if (currentSrc !== nextSrc) {
      galleryFrameLoaded = false;
      anchorGalleryFrame.setAttribute("src", nextSrc);
    }
    return true;
  }

  if (!isEmbeddedGalleryFrameSource(currentSrc)) {
    galleryFrameLoaded = false;
    anchorGalleryFrame.setAttribute("src", buildEmbeddedGalleryUrl(anchorId));
  }
  return true;
}

function handleGalleryFrameLoad() {
  if (!(anchorGalleryFrame instanceof HTMLIFrameElement)) {
    return;
  }

  galleryFrameLoaded = isEmbeddedGalleryFrameSource(anchorGalleryFrame.getAttribute("src"));
  flushPendingGalleryOpenMessage();
}

function queueGalleryOpenMessage(anchorId) {
  if (!anchorId) {
    pendingGalleryOpenMessage = null;
    return;
  }

  pendingGalleryOpenMessage = {
    type: GALLERY_OPEN_MESSAGE_TYPE,
    anchorId,
    replayShell: true,
    replayContent: true,
  };
  flushPendingGalleryOpenMessage();
}

function flushPendingGalleryOpenMessage() {
  if (!pendingGalleryOpenMessage || !galleryFrameLoaded || !anchorGalleryFrame?.contentWindow) {
    return false;
  }

  anchorGalleryFrame.contentWindow.postMessage(pendingGalleryOpenMessage, "*");
  pendingGalleryOpenMessage = null;
  return true;
}

function replayGalleryModalShellEnter() {
  if (!(anchorGalleryModal instanceof HTMLElement)) {
    return;
  }

  window.cancelAnimationFrame(galleryShellEnterFrame);
  anchorGalleryModal.classList.remove(GALLERY_SHELL_ENTER_CLASS);
  galleryShellEnterFrame = window.requestAnimationFrame(() => {
    anchorGalleryModal?.classList.add(GALLERY_SHELL_ENTER_CLASS);
  });
}

function openGalleryModal(anchor) {
  if (!anchor?.id) return;

  const targetUrl = buildEmbeddedGalleryUrl(anchor.id);
  if (!(anchorGalleryModal instanceof HTMLElement) || !(anchorGalleryFrame instanceof HTMLIFrameElement)) {
    window.location.href = targetUrl;
    return;
  }

  const albumTotal = getAnchorAlbumCount(anchor);
  if (anchorGalleryTitle) {
    anchorGalleryTitle.textContent = anchor.name || "Gallery";
  }
  if (anchorGalleryMeta) {
    anchorGalleryMeta.textContent = albumTotal > 0 ? `${albumTotal} albums` : "";
  }

  ensureGalleryFrameReady(anchor.id);
  anchorGalleryModal.classList.add("is-open");
  anchorGalleryModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-gallery-modal-open");
  replayGalleryModalShellEnter();
  queueGalleryOpenMessage(anchor.id);
}

function closeGalleryModal(options = {}) {
  if (!(anchorGalleryModal instanceof HTMLElement)) {
    return;
  }

  pendingGalleryOpenMessage = null;
  window.cancelAnimationFrame(galleryShellEnterFrame);
  anchorGalleryModal.classList.remove("is-open");
  anchorGalleryModal.classList.remove(GALLERY_SHELL_ENTER_CLASS);
  anchorGalleryModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-gallery-modal-open");

  if (!(anchorGalleryFrame instanceof HTMLIFrameElement)) {
    return;
  }

  const shouldClearFrame = options.clearFrame === true;
  if (!shouldClearFrame) {
    return;
  }

  galleryFrameLoaded = false;
  anchorGalleryFrame.setAttribute("src", "about:blank");
}

function isGalleryModalOpen() {
  return anchorGalleryModal?.classList.contains("is-open");
}

function handleGalleryFrameMessage(event) {
  if (!event?.data || typeof event.data !== "object") {
    return;
  }

  if (anchorGalleryFrame?.contentWindow && event.source !== anchorGalleryFrame.contentWindow) {
    return;
  }

  if (event.data.type === GALLERY_CLOSE_MESSAGE_TYPE) {
    closeGalleryModal();
  }
}

function closeProvinceFocus() {
  if (anchorNameDialog?.open) {
    anchorNameDialog.close("cancel");
  }
  selectedProvinceId = null;
  focusProvinceId = null;
  setFocusAnchorPlacementMode(false);
  render();
}

function handleViewportResize() {
  stopMapViewportAnimation();
  setMapPanning(false);
  mapPanState = null;
  render({ forceViewport: true });
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
    .replace(/(\u58ee\u65cf\u81ea\u6cbb\u533a|\u56de\u65cf\u81ea\u6cbb\u533a|\u7ef4\u543e\u5c14\u81ea\u6cbb\u533a|\u7279\u522b\u884c\u653f\u533a|\u81ea\u6cbb\u533a|\u7701|\u5e02)$/u, "")
    .slice(0, 2) || "\u7701\u4efd";
}

function createAnchorName(provinceName) {
  let index = 1;
  let nextName = `${provinceName || "\u6444\u5f71"}\u6444\u5f71\u70b9 ${index}`;
  while (state.anchors.some((anchor) => anchor.name === nextName)) {
    index += 1;
    nextName = `${provinceName || "\u6444\u5f71"}\u6444\u5f71\u70b9 ${index}`;
  }
  return nextName;
}

function getAnchorAlbumCount(anchor) {
  return Array.isArray(anchor?.albums) ? anchor.albums.length : 0;
}

function getAnchorPhotoCount(anchor) {
  if (!Array.isArray(anchor?.albums)) return 0;
  return anchor.albums.reduce((total, album) => total + (Array.isArray(album.photos) ? album.photos.length : 0), 0);
}

function formatAnchorDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "\u521a\u521a\u521b\u5efa";
  }
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

function buildAnchorName(provinceName, index) {
  return `${provinceName || "\u6444\u5f71"}\u6444\u5f71\u70b9 ${index}`;
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
