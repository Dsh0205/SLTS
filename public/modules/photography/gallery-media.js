import { createId, sanitizePhotoName } from "./gallery-state.js";

const MAX_IMAGE_SIDE = 1800;
const desktopBridge = window.shanlicDesktop || null;

export async function serializePhotoFile(file) {
  const name = sanitizePhotoName(file.name, "未命名照片");
  const dataUrl = file.type === "image/svg+xml" || file.type === "image/gif"
    ? await readAsDataUrl(file)
    : await optimizeRasterPhoto(file);

  const createdAt = new Date().toISOString();

  if (desktopBridge?.savePhotographyPhoto) {
    const saved = await desktopBridge.savePhotographyPhoto({
      dataUrl,
      originalName: file.name,
      displayName: name,
      mimeType: file.type,
      createdAt,
    });

    if (saved?.filePath) {
      return {
        id: createId("photo"),
        name,
        assetFileName: saved.fileName,
        filePath: saved.filePath,
        createdAt,
      };
    }
  }

  return {
    id: createId("photo"),
    name,
    dataUrl,
    createdAt,
  };
}

async function optimizeRasterPhoto(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return readAsDataUrl(file);
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.86);
    });

    return blob ? readAsDataUrl(blob) : readAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
