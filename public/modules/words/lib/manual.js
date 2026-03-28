export function parseManualEntries(text, label) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => parseManualLine(line, index, label));
}

export function parseManualLine(line, index, label) {
  const parts = line.split(/\s*(?:\/|\uFF0F)\s*/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    return {
      word: parts[0],
      meaning: parts[1],
    };
  }

  throw new Error(label + "第 " + (index + 1) + " 行无法识别，请按“单词 / 中文”的格式输入。");
}
