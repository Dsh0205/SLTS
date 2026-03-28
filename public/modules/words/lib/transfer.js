import { parseImportedWordsText } from "./library.js";
import { downloadTextFile, isUserCancelledFilePicker, resolveDesktopBridge, saveTextToPickedFile, supportsFileSystemAccess } from "./files.js";

export async function importWordsFromText(rawText, sourceInfo, options) {
  const {
    importedGroupName,
    englishLabel,
    russianLabel,
    replaceWordLibrary,
    setFileContext,
    showToast,
  } = options;

  try {
    const imported = parseImportedWordsText(String(rawText || ""), {
      importedGroupName,
      englishLabel,
      russianLabel,
    });
    replaceWordLibrary(imported);
    setFileContext({
      fileHandle: sourceInfo?.fileHandle || null,
      filePath: sourceInfo?.filePath || "",
    });
    showToast("Import successful.", "success");
  } catch (error) {
    showToast(error.message || "Import failed. Please check the JSON format.", "error");
  }
}

export async function openWordImportPicker(options) {
  const {
    pickerOptions,
    fileInput,
    onImportText,
  } = options;
  const desktopBridge = resolveDesktopBridge();

  if (desktopBridge?.openJsonFile) {
    try {
      const result = await desktopBridge.openJsonFile({
        title: "瀵煎叆璇嶅簱 JSON",
      });
      if (!result || result.canceled) {
        return;
      }

      await onImportText(String(result.text || ""), {
        filePath: result.filePath || "",
      });
      return;
    } catch (error) {
      console.warn("Electron import failed, falling back to browser import:", error);
    }
  }

  if (supportsFileSystemAccess()) {
    try {
      const [fileHandle] = await window.showOpenFilePicker(pickerOptions);
      const file = await fileHandle.getFile();
      await onImportText(await file.text(), {
        fileHandle,
      });
      return;
    } catch (error) {
      if (isUserCancelledFilePicker(error)) {
        return;
      }
      console.warn("File picker unavailable, falling back to basic import:", error);
    }
  }

  fileInput.value = "";
  fileInput.click();
}

export async function exportWordsPayload(payload, options) {
  const {
    pickerOptions,
    activeFileHandle,
    activeFilePath,
    setFileContext,
    showToast,
  } = options;

  if (payload.english.groups.length === 0 && payload.russian.groups.length === 0) {
    showToast("The library is empty, nothing to export.", "error");
    return;
  }

  const jsonText = JSON.stringify(payload, null, 2);
  const desktopBridge = resolveDesktopBridge();

  if (desktopBridge?.saveJsonFile) {
    try {
      const result = await desktopBridge.saveJsonFile({
        title: "瀵煎嚭璇嶅簱 JSON",
        suggestedName: "words.json",
        filePath: activeFilePath,
        text: jsonText,
      });

      if (!result || result.canceled) {
        return;
      }

      setFileContext({
        fileHandle: activeFileHandle,
        filePath: result.filePath || "",
      });
      showToast("Saved to a local JSON file.", "success");
      return;
    } catch (error) {
      console.warn("Electron export failed, falling back to browser export:", error);
    }
  }

  if (supportsFileSystemAccess()) {
    try {
      const fileHandle = await saveTextToPickedFile(activeFileHandle, jsonText, {
        ...pickerOptions,
        suggestedName: "words.json",
      });
      setFileContext({
        fileHandle,
        filePath: activeFilePath,
      });
      showToast("Saved to the selected JSON file.", "success");
      return;
    } catch (error) {
      if (isUserCancelledFilePicker(error)) {
        return;
      }
      console.warn("Direct file save failed, falling back to download:", error);
    }
  }

  downloadTextFile(jsonText, "words.json", "application/json;charset=utf-8");
  showToast("Exported as words.json.", "success");
}
