export function insertTextAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const nextValue = before + text + after;
  const caret = start + text.length;

  input.value = nextValue;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function deleteTextAtCursor(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  if (start !== end) {
    insertTextAtCursor(input, "");
    return;
  }

  if (start === 0) {
    return;
  }

  input.setSelectionRange(start - 1, start);
  insertTextAtCursor(input, "");
}
