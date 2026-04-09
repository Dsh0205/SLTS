import {
  PHOTOGRAPHY_STORAGE_VERSION,
  normalizePhotoList,
  serializePhotoEntry,
} from "./photo-storage.js";

export const STORAGE_KEY = "shanlic-photography-map-v1";
export const STORAGE_VERSION = PHOTOGRAPHY_STORAGE_VERSION;

export const TEXT = {
  addPhotos: "照片已导入相册",
  createAlbum: "相册已创建",
  deleteAlbum: "相册已删除",
  deletePhoto: "照片已删除",
  deleteAnchor: "摄影地点已删除",
  renamePhoto: "照片名称已更新",
  setCover: "已设为相册封面",
  saveError: "保存失败，可能是本地存储空间不足",
  uploadError: "照片导入失败，请稍后再试",
  migrateSuccess: "历史照片已迁移到外部图片文件夹",
  migrateError: "历史照片迁移失败，请稍后再试",
  emptyShelf: "这里还没有任何相册",
  emptyAlbum: "这个相册里还没有照片",
  noAnchor: "没有找到对应的摄影地点，正在返回地图页",
  needAlbum: "请先新建一个相册",
  selectPhotoFirst: "请先选中一张照片，再按 F2 重命名",
  storageChanged: "保存目录已更新",
  storageReset: "已恢复默认保存目录",
  storageError: "修改保存目录失败，请稍后再试",
};

export function createDefaultState() {
  return {
    version: STORAGE_VERSION,
    anchors: [],
    activeAnchorId: null,
  };
}

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return createDefaultState();
    }

    const anchors = Array.isArray(parsed.anchors)
      ? parsed.anchors.map(normalizeAnchor).filter(Boolean)
      : [];
    const activeAnchorId = anchors.some((anchor) => anchor.id === parsed.activeAnchorId)
      ? parsed.activeAnchorId
      : anchors[0]?.id || null;

    return {
      version: STORAGE_VERSION,
      anchors,
      activeAnchorId,
    };
  } catch {
    return createDefaultState();
  }
}

export function saveState(state) {
  try {
    state.version = STORAGE_VERSION;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
    return true;
  } catch {
    return false;
  }
}

export function serializeState(state) {
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
      albums: anchor.albums.map((album) => ({
        id: album.id,
        name: album.name,
        createdAt: album.createdAt,
        coverPhotoId: album.coverPhotoId,
        photos: album.photos.map((photo) => serializePhotoEntry(photo)),
      })),
    })),
  };
}

export function normalizeAnchor(item) {
  if (!item || typeof item.id !== "string") {
    return null;
  }

  const legacyPhotos = normalizePhotos(item.photos);
  const albums = normalizeAlbums(item.albums, legacyPhotos, item.createdAt);
  const activeAlbumId = albums.some((album) => album.id === item.activeAlbumId)
    ? item.activeAlbumId
    : albums[0]?.id || null;

  return {
    id: item.id,
    name: typeof item.name === "string" && item.name.trim()
      ? item.name.trim().slice(0, 32)
      : "摄影地点",
    provinceId: typeof item.provinceId === "string" ? item.provinceId : "",
    provinceName: typeof item.provinceName === "string" && item.provinceName.trim()
      ? item.provinceName.trim()
      : "未命名省份",
    x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
    y: Number.isFinite(Number(item.y)) ? Number(item.y) : 0,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    activeAlbumId,
    albums,
  };
}

export function normalizeAlbums(list, legacyPhotos, fallbackCreatedAt) {
  const normalized = Array.isArray(list)
    ? list
      .filter((item) => item && typeof item.id === "string")
      .map((item, index) => ({
        id: item.id,
        name: typeof item.name === "string" && item.name.trim()
          ? item.name.trim().slice(0, 40)
          : `相册 ${index + 1}`,
        createdAt: typeof item.createdAt === "string"
          ? item.createdAt
          : fallbackCreatedAt || new Date().toISOString(),
        coverPhotoId: typeof item.coverPhotoId === "string" ? item.coverPhotoId : null,
        photos: normalizePhotos(item.photos),
      }))
    : [];

  const albums = normalized.length > 0
    ? normalized
    : legacyPhotos.length > 0
      ? [{
        id: createId("album"),
        name: "默认相册",
        createdAt: fallbackCreatedAt || new Date().toISOString(),
        coverPhotoId: legacyPhotos[0]?.id || null,
        photos: legacyPhotos,
      }]
      : [];

  albums.forEach((album) => {
    if (!album.photos.some((photo) => photo.id === album.coverPhotoId)) {
      album.coverPhotoId = album.photos[0]?.id || null;
    }
  });

  return albums;
}

export function normalizePhotos(list) {
  return normalizePhotoList(list, "未命名照片");
}

export function getActiveAnchor(state) {
  return state.anchors.find((anchor) => anchor.id === state.activeAnchorId) || null;
}

export function getActiveAlbum(state, anchor = getActiveAnchor(state)) {
  return anchor?.albums.find((album) => album.id === anchor.activeAlbumId) || null;
}

export function getAlbumById(anchor, albumId) {
  return anchor?.albums.find((album) => album.id === albumId) || null;
}

export function getPhotoById(album, photoId) {
  return album?.photos.find((photo) => photo.id === photoId) || null;
}

export function getPhotoCount(anchor) {
  return anchor.albums.reduce((count, album) => count + album.photos.length, 0);
}

export function sanitizePhotoName(value, fallback = "未命名照片") {
  const nextName = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return nextName || fallback;
}

export function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAlbumName(anchor) {
  let index = 1;
  let nextName = `${anchor.name || "摄影"}相册 ${index}`;
  while (anchor.albums.some((album) => album.name === nextName)) {
    index += 1;
    nextName = `${anchor.name || "摄影"}相册 ${index}`;
  }
  return nextName;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚保存";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (
      target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.isContentEditable
    );
}
