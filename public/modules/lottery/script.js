const wheelCanvas = document.getElementById("wheel");
const wheelShell = document.getElementById("wheelShell");
const spinButton = document.getElementById("spinButton");
const resultText = document.getElementById("resultText");
const itemInput = document.getElementById("itemInput");
const addItemButton = document.getElementById("addItemButton");
const clearItemsButton = document.getElementById("clearItemsButton");
const resetItemsButton = document.getElementById("resetItemsButton");
const itemsList = document.getElementById("itemsList");
const segmentsMeta = document.getElementById("segmentsMeta");
const ctx = wheelCanvas.getContext("2d");

const TAU = Math.PI * 2;
const center = wheelCanvas.width / 2;
const radius = center - 12;
const defaultLabels = ["10", "x2", "50", "x1", "100", "x2", "300", "think"];
const palette = ["#ff7fae", "#ffb45c", "#ffe26d", "#8fe46a", "#64dfff", "#8a87ff", "#c681ff", "#ff82d6"];

let rotation = 0;
let isSpinning = false;
let isEntering = true;
let items = buildItems(defaultLabels);

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  isEntering = false;
}

function drawWheel(angle = rotation) {
  if (items.length === 0) {
    drawEmptyWheel();
    return;
  }

  const segmentAngle = TAU / items.length;
  ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(angle - Math.PI / 2);

  items.forEach((item, index) => {
    const start = index * segmentAngle;
    const end = start + segmentAngle;
    drawSegment(start, end, item, segmentAngle);
  });

  ctx.restore();
  drawCenterCap();
}

function drawSegment(start, end, item, segmentAngle) {
  ctx.save();

  const segmentGradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
  segmentGradient.addColorStop(0, brighten(item.color, 0.28));
  segmentGradient.addColorStop(1, darken(item.color, 0.08));

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, start, end);
  ctx.closePath();
  ctx.fillStyle = segmentGradient;
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.stroke();

  const mid = (start + end) / 2;
  drawSegmentBadge(mid, item, segmentAngle);
  drawPrizeLabel(mid, item, segmentAngle);
  ctx.restore();
}

function drawSegmentBadge(angle, item, segmentAngle) {
  const badgeDistance = radius * 0.62;
  const x = Math.cos(angle) * badgeDistance;
  const y = Math.sin(angle) * badgeDistance;
  const badgeRadius = Math.max(radius * 0.078, Math.min(radius * 0.12, radius * (segmentAngle / 5.4)));

  const badgeGradient = ctx.createRadialGradient(
    x - badgeRadius * 0.28,
    y - badgeRadius * 0.36,
    badgeRadius * 0.15,
    x,
    y,
    badgeRadius
  );
  badgeGradient.addColorStop(0, "#fff5bd");
  badgeGradient.addColorStop(0.55, "#ffd448");
  badgeGradient.addColorStop(1, "#f0a800");

  ctx.beginPath();
  ctx.arc(x, y, badgeRadius, 0, TAU);
  ctx.fillStyle = badgeGradient;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(161, 112, 0, 0.42)";
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = "#8f5e00";
  ctx.font = `800 ${badgeRadius * 0.82}px "Arial Rounded MT Bold", "Trebuchet MS", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.badge, 0, badgeRadius * 0.06);
  ctx.restore();
}

function drawPrizeLabel(angle, item, segmentAngle) {
  const textDistance = radius * 0.38;
  const x = Math.cos(angle) * textDistance;
  const y = Math.sin(angle) * textDistance;
  const fontSize = getLabelFontSize(item.label, segmentAngle);
  const maxChars = getMaxCharsPerLine(segmentAngle, item.label);
  const lines = wrapLabel(item.label, maxChars);
  const lineHeight = fontSize * 0.92;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.fillStyle = item.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 10;
  ctx.font = `800 ${fontSize}px "Arial Rounded MT Bold", "Trebuchet MS", "Microsoft YaHei", sans-serif`;

  lines.forEach((line, index) => {
    const offset = (index - (lines.length - 1) / 2) * lineHeight;
    ctx.fillText(line, 0, offset);
  });

  ctx.restore();
}

function drawCenterCap() {
  const capRadius = radius * 0.2;
  const capGradient = ctx.createRadialGradient(
    center - capRadius * 0.4,
    center - capRadius * 0.45,
    capRadius * 0.18,
    center,
    center,
    capRadius
  );
  capGradient.addColorStop(0, "#ffbed6");
  capGradient.addColorStop(0.55, "#ff6da8");
  capGradient.addColorStop(1, "#d93f7a");

  ctx.beginPath();
  ctx.arc(center, center, capRadius, 0, TAU);
  ctx.fillStyle = capGradient;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#fff6fc";
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = "#fff7fb";
  ctx.font = `800 ${radius * 0.1}px "Arial Rounded MT Bold", "Trebuchet MS", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Prize", center, center + 4);

  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(center + capRadius * 0.24, center + capRadius * 0.42, capRadius * 0.2, capRadius * 0.11, Math.PI / 6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawEmptyWheel() {
  ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

  const emptyGradient = ctx.createRadialGradient(
    center - radius * 0.2,
    center - radius * 0.25,
    radius * 0.12,
    center,
    center,
    radius
  );
  emptyGradient.addColorStop(0, "rgba(255, 238, 245, 0.95)");
  emptyGradient.addColorStop(0.22, "rgba(255, 192, 222, 0.95)");
  emptyGradient.addColorStop(0.44, "rgba(255, 232, 134, 0.92)");
  emptyGradient.addColorStop(0.66, "rgba(124, 229, 183, 0.92)");
  emptyGradient.addColorStop(0.84, "rgba(117, 219, 255, 0.92)");
  emptyGradient.addColorStop(1, "rgba(191, 155, 255, 0.95)");

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, TAU);
  ctx.fillStyle = emptyGradient;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.stroke();

  drawCenterCap();
}

function spin() {
  if (isSpinning || isEntering || items.length === 0) {
    return;
  }

  isSpinning = true;
  syncControls();
  resultText.textContent = "转动中...";

  const selectedIndex = Math.floor(Math.random() * items.length);
  const targetRotation = getTargetRotation(selectedIndex);
  const startRotation = rotation;
  const delta = targetRotation - startRotation;
  const duration = 5200;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutQuint(progress);
    rotation = startRotation + delta * eased;
    drawWheel(rotation);

    if (progress < 1) {
      requestAnimationFrame(animate);
      return;
    }

    rotation = normalizeRotation(targetRotation);
    drawWheel(rotation);
    const winningIndex = getWinningIndex(rotation);
    const winningPrize = items[winningIndex];
    resultText.textContent = winningPrize ? `恭喜获得 ${winningPrize.label}` : "等待开始";
    isSpinning = false;
    syncControls();
  }

  requestAnimationFrame(animate);
}

function getTargetRotation(index) {
  const segmentAngle = TAU / items.length;
  const segmentCenter = index * segmentAngle + segmentAngle / 2;
  const extraSpins = 6 + Math.random() * 1.8;
  return rotation + extraSpins * TAU - segmentCenter;
}

function normalizeRotation(value) {
  const normalized = value % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function getWinningIndex(rotationValue) {
  if (items.length === 0) {
    return -1;
  }

  const segmentAngle = TAU / items.length;
  const pointerAngle = normalizeRotation(-rotationValue);
  return Math.floor(pointerAngle / segmentAngle) % items.length;
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

function brighten(hex, amount) {
  return shade(hex, amount);
}

function darken(hex, amount) {
  return shade(hex, -amount);
}

function shade(hex, amount) {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const delta = Math.round(255 * amount);
  const r = clamp((num >> 16) + delta, 0, 255);
  const g = clamp(((num >> 8) & 0x00ff) + delta, 0, 255);
  const b = clamp((num & 0x0000ff) + delta, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildItems(labels) {
  return labels.map((label, index) => ({
    label,
    badge: String(index + 1),
    color: palette[index % palette.length],
    textColor: "#fff9f5"
  }));
}

function applyItems(labels) {
  items = buildItems(labels);
  rotation = normalizeRotation(rotation);
  renderItemsList();
  updateWheelState();
}

function addItem() {
  const value = itemInput.value.trim();
  if (!value) {
    itemInput.focus();
    return;
  }

  const labels = items.map((item) => item.label);
  labels.push(value);
  applyItems(labels);
  itemInput.value = "";
  itemInput.focus();
}

function clearItems() {
  applyItems([]);
}

function removeItem(index) {
  const labels = items
    .filter((_, itemIndex) => itemIndex !== index)
    .map((item) => item.label);
  applyItems(labels);
}

function renderItemsList() {
  itemsList.innerHTML = "";

  if (items.length === 0) {
    return;
  }

  items.forEach((item, index) => {
    const chip = document.createElement("div");
    chip.className = "item-chip";

    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${item.label}`;

    const removeButton = document.createElement("button");
    removeButton.className = "chip-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `删除 ${item.label}`);
    removeButton.addEventListener("click", () => removeItem(index));

    chip.appendChild(label);
    chip.appendChild(removeButton);
    itemsList.appendChild(chip);
  });
}

function updateWheelState() {
  if (items.length === 0) {
    segmentsMeta.textContent = "当前 0 项";
    resultText.textContent = "请先添加内容";
  } else {
    segmentsMeta.textContent = `当前 ${items.length} 项`;
    if (!isSpinning) {
      resultText.textContent = "等待开始";
    }
  }

  syncControls();
  drawWheel(rotation);
}

function getLabelFontSize(label, segmentAngle) {
  const density = Math.max(12, Math.min(42, segmentAngle * 160));
  const lengthPenalty = Math.min(14, Math.max(0, label.length - 2) * 2.2);
  return Math.max(20, density - lengthPenalty);
}

function getMaxCharsPerLine(segmentAngle, label) {
  const wide = segmentAngle > 0.82 ? 5 : segmentAngle > 0.58 ? 4 : 3;
  return label.length <= wide ? label.length : wide;
}

function wrapLabel(label, maxChars) {
  if (!label) {
    return [""];
  }

  if (label.includes(" ")) {
    return wrapByWords(label, maxChars).slice(0, 3);
  }

  const lines = [];
  for (let index = 0; index < label.length; index += maxChars) {
    lines.push(label.slice(index, index + maxChars));
  }
  return lines.slice(0, 3);
}

function wrapByWords(label, maxChars) {
  const words = label.split(/\s+/);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function syncControls() {
  const disabled = isSpinning || isEntering;
  spinButton.disabled = disabled || items.length === 0;
  addItemButton.disabled = disabled;
  clearItemsButton.disabled = disabled;
  resetItemsButton.disabled = disabled;
  itemInput.disabled = disabled;
}

wheelShell.addEventListener("animationend", () => {
  isEntering = false;
  syncControls();
});

window.setTimeout(() => {
  if (isEntering) {
    isEntering = false;
    syncControls();
  }
}, 1800);

spinButton.addEventListener("click", spin);
addItemButton.addEventListener("click", addItem);
clearItemsButton.addEventListener("click", clearItems);
resetItemsButton.addEventListener("click", () => applyItems(defaultLabels));
itemInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addItem();
  }
});

applyItems(defaultLabels);
