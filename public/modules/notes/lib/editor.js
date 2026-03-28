export function replaceLinePrefix(input, prefix, matcher, onChange) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  const safeLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const lineText = value.slice(lineStart, safeLineEnd);
  const matchedPrefix = matcher ? lineText.match(matcher)?.[0] || '' : '';
  const nextLineText = matchedPrefix ? prefix + lineText.slice(matchedPrefix.length) : prefix + lineText;

  input.value = value.slice(0, lineStart) + nextLineText + value.slice(safeLineEnd);

  const selectionOffset = matcher && matchedPrefix
    ? Math.max(0, start - lineStart - matchedPrefix.length)
    : start - lineStart;
  const nextCursor = lineStart + prefix.length + selectionOffset;

  input.selectionStart = input.selectionEnd = nextCursor;
  input.focus();
  onChange?.();
}

export function insertAtLineStart(input, text, onChange) {
  replaceLinePrefix(input, text, null, onChange);
}

export function insertAtRange(input, text, start, end, onChange) {
  const value = input.value;
  input.value = value.slice(0, start) + text + value.slice(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
  onChange?.();
}

export function insertAtCursor(input, text, selectStartOffset = 0, selectEndOffset = 0, onChange) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;

  input.value = value.slice(0, start) + text + value.slice(end);

  if (selectStartOffset !== 0 || selectEndOffset !== 0) {
    input.selectionStart = start + selectStartOffset;
    input.selectionEnd = start + text.length + selectEndOffset;
  } else {
    input.selectionStart = input.selectionEnd = start + text.length;
  }

  input.focus();
  onChange?.();
}

export function applyHeadingLevel(input, level, onChange) {
  input.focus();
  replaceLinePrefix(input, `${'#'.repeat(level)} `, /^(#{1,6}\s+)/, onChange);
}

window.replaceLinePrefix = replaceLinePrefix;
window.insertAtLineStart = insertAtLineStart;
window.insertAtRange = insertAtRange;
window.insertAtCursor = insertAtCursor;
window.applyHeadingLevelToInput = applyHeadingLevel;
