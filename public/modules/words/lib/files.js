export function supportsFileSystemAccess() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
}

export function isUserCancelledFilePicker(error) {
  return Boolean(error && (error.name === "AbortError" || error.name === "SecurityError"));
}

export function resolveDesktopBridge() {
  if (window.shanlicDesktop?.isElectron) {
    return window.shanlicDesktop;
  }

  try {
    if (window.parent && window.parent !== window && window.parent.shanlicDesktop?.isElectron) {
      return window.parent.shanlicDesktop;
    }
  } catch {
    return null;
  }

  return null;
}

export async function ensureFileHandlePermission(fileHandle) {
  if (typeof fileHandle.queryPermission === "function") {
    const current = await fileHandle.queryPermission({ mode: "readwrite" });
    if (current === "granted") {
      return true;
    }
  }

  if (typeof fileHandle.requestPermission === "function") {
    const requested = await fileHandle.requestPermission({ mode: "readwrite" });
    return requested === "granted";
  }

  return true;
}

export async function saveTextToPickedFile(fileHandle, text, pickerOptions) {
  let nextFileHandle = fileHandle;

  if (!nextFileHandle) {
    nextFileHandle = await window.showSaveFilePicker(pickerOptions);
  }

  const permission = await ensureFileHandlePermission(nextFileHandle);
  if (!permission) {
    throw new Error("File write permission was not granted.");
  }

  const writable = await nextFileHandle.createWritable();
  await writable.write(text);
  await writable.close();

  return nextFileHandle;
}

export function downloadTextFile(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
