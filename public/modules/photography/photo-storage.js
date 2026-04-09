export const PHOTOGRAPHY_STORAGE_VERSION = 7;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pathToFileUrl(filePath) {
  const normalized = normalizeString(filePath).replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }

  if (normalized.startsWith("//")) {
    return encodeURI(`file:${normalized}`);
  }

  return encodeURI(`file://${normalized.startsWith("/") ? "" : "/"}${normalized}`);
}

export function getPhotoAssetFileName(photo) {
  const explicitName = normalizeString(photo?.assetFileName);
  if (explicitName) {
    return explicitName.split(/[\\/]/).pop() || explicitName;
  }

  const filePath = normalizeString(photo?.filePath);
  if (!filePath) {
    return "";
  }

  return filePath.split(/[\\/]/).pop() || "";
}

export function normalizePhotoEntry(item, fallbackName = "未命名照片") {
  if (!item || typeof item.id !== "string") {
    return null;
  }

  const filePath = normalizeString(item.filePath);
  const assetFileName = getPhotoAssetFileName(item);
  const dataUrl = normalizeString(item.dataUrl);

  if (!filePath && !assetFileName && !dataUrl) {
    return null;
  }

  return {
    id: item.id,
    name: normalizeString(item.name).slice(0, 80) || fallbackName,
    filePath: filePath || "",
    assetFileName,
    dataUrl: dataUrl || "",
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

export function normalizePhotoList(list, fallbackName = "未命名照片") {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => normalizePhotoEntry(item, fallbackName))
    .filter(Boolean);
}

export function serializePhotoEntry(photo) {
  const nextPhoto = {
    id: photo.id,
    name: normalizeString(photo.name).slice(0, 80) || "未命名照片",
    createdAt: typeof photo.createdAt === "string" ? photo.createdAt : new Date().toISOString(),
  };

  const assetFileName = getPhotoAssetFileName(photo);
  if (assetFileName) {
    nextPhoto.assetFileName = assetFileName;
  }

  const filePath = normalizeString(photo.filePath);
  if (filePath) {
    nextPhoto.filePath = filePath;
  } else {
    const dataUrl = normalizeString(photo.dataUrl);
    if (dataUrl) {
      nextPhoto.dataUrl = dataUrl;
    }
  }

  return nextPhoto;
}

export function resolvePhotoSource(photo) {
  const filePath = normalizeString(photo?.filePath);
  if (filePath) {
    return pathToFileUrl(filePath);
  }

  return normalizeString(photo?.dataUrl);
}

export function photoNeedsExternalization(photo) {
  return Boolean(normalizeString(photo?.dataUrl)) && !normalizeString(photo?.filePath);
}

export function collectPhotoFilePaths(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .map((photo) => normalizeString(photo?.filePath))
    .filter(Boolean);
}
