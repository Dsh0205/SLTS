export function renderGroupSelectorUI({
  groups,
  label,
  selection,
  titleElement,
  hintElement,
  listElement,
  onToggle,
  escapeHtml,
}) {
  titleElement.textContent = label + "测试分组";
  hintElement.textContent = "You can select multiple groups. Empty groups will not be used in tests.";
  listElement.innerHTML = "";

  groups.forEach((group) => {
    const option = document.createElement("label");
    option.className = "group-picker-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    checkbox.checked = selection.has(group.id);
    checkbox.disabled = group.entries.length === 0;
    checkbox.addEventListener("change", () => {
      onToggle(group.id, checkbox.checked);
    });

    const meta = document.createElement("div");
    meta.className = "group-picker-meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(group.name) + "</strong>" +
      "<span>" + group.entries.length + " entries</span>";

    option.appendChild(checkbox);
    option.appendChild(meta);
    listElement.appendChild(option);
  });
}

export function renderWrongRecordsUI({
  records,
  listElement,
  emptyElement,
  escapeHtml,
}) {
  listElement.innerHTML = "";
  if (records.size === 0) {
    listElement.hidden = true;
    emptyElement.hidden = false;
    return;
  }

  emptyElement.hidden = true;
  listElement.hidden = false;

  records.forEach((value) => {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "word-meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(value.word) + "</strong>" +
      "<span>" + escapeHtml(value.meaning) + "</span>";
    item.appendChild(meta);
    listElement.appendChild(item);
  });
}

export function renderResultStatsUI({
  answeredCountElement,
  correctCountElement,
  wrongCountElement,
  resultTitleElement,
  answeredCountValue,
  correctCountValue,
  wrongCountValue,
  resultLabel,
}) {
  answeredCountElement.textContent = String(answeredCountValue);
  correctCountElement.textContent = String(correctCountValue);
  wrongCountElement.textContent = String(wrongCountValue);
  resultTitleElement.textContent = resultLabel + "测试结果";
}

export function renderRoundProgressUI({
  roundProgressElement,
  currentRoundSize,
  answeredCountValue,
  sessionActive,
  roundCelebrationVisible,
}) {
  const total = Math.max(currentRoundSize, answeredCountValue, 0);

  if (total === 0) {
    roundProgressElement.textContent = "Round 0 / 0";
    return;
  }

  const current = sessionActive && !roundCelebrationVisible
    ? Math.min(answeredCountValue + 1, total)
    : Math.min(answeredCountValue, total);
  const displayValue = roundCelebrationVisible ? total : current;
  roundProgressElement.textContent = "Round " + displayValue + " / " + total;
}

export function renderQuizOptionsUI({
  container,
  optionItems,
  onSelect,
}) {
  container.innerHTML = "";

  optionItems.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-btn option-enter";
    button.style.animationDelay = String(0.08 + index * 0.08) + "s";
    button.textContent = item.meaning;
    button.dataset.correct = String(item.correct);
    button.addEventListener("click", () => onSelect(button, item.correct));
    container.appendChild(button);
  });
}

export function renderWordColumnUI({
  groups,
  locale,
  activeGroupId,
  listElement,
  emptyElement,
  onDeleteEntry,
  onSelectGroup,
  onDeleteGroup,
  renderPreview = false,
  container,
  escapeHtml,
}) {
  if (renderPreview) {
    container.innerHTML = "";

    if (groups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No groups yet. Create one first and then add words.";
      container.appendChild(empty);
      return;
    }

    groups.forEach((group) => {
      const item = document.createElement("div");
      item.className = "group-preview-item";
      if (activeGroupId === group.id) {
        item.classList.add("active");
      }

      const meta = document.createElement("button");
      meta.type = "button";
      meta.className = "group-preview-meta";
      meta.innerHTML =
        "<strong>" + escapeHtml(group.name) + "</strong>" +
        "<small>" + group.entries.length + " entries</small>";
      meta.addEventListener("click", () => {
        onSelectGroup(group.id);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tiny-btn";
      removeBtn.textContent = "删除";
      removeBtn.addEventListener("click", () => {
        onDeleteGroup(group.id);
      });

      item.appendChild(meta);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });

    return;
  }

  const sortedGroups = groups.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  listElement.innerHTML = "";

  if (sortedGroups.length === 0) {
    listElement.hidden = true;
    emptyElement.hidden = false;
    return;
  }

  emptyElement.hidden = true;
  listElement.hidden = false;

  sortedGroups.forEach((group) => {
    const item = document.createElement("li");
    item.className = "group-word-block";

    const header = document.createElement("div");
    header.className = "group-word-header";
    header.innerHTML =
      "<strong>" + escapeHtml(group.name) + "</strong>" +
      "<span class=\"pill\">" + group.entries.length + "</span>";

    const entriesWrap = document.createElement("div");
    entriesWrap.className = "group-word-entries";

    if (group.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "group-empty-note";
      empty.textContent = "This group is empty.";
      entriesWrap.appendChild(empty);
    } else {
      group.entries
        .slice()
        .sort((a, b) => a.word.localeCompare(b.word, locale))
        .forEach((entry) => {
          const entryItem = document.createElement("div");
          entryItem.className = "group-word-entry";
          entryItem.title = "右键删除这个词条";
          entryItem.innerHTML =
            "<strong>" + escapeHtml(entry.word) + "</strong>" +
            "<span>" + escapeHtml(entry.meaning) + "</span>";
          entryItem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            onDeleteEntry(group.id, entry.id);
          });
          entriesWrap.appendChild(entryItem);
        });
    }

    item.appendChild(header);
    item.appendChild(entriesWrap);
    listElement.appendChild(item);
  });
}

export function syncGroupSelectOptions({
  groups,
  selectElement,
  currentGroupId,
  emptyText,
}) {
  selectElement.innerHTML = "";

  if (groups.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyText;
    selectElement.appendChild(option);
    selectElement.value = "";
    return;
  }

  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name + " (" + group.entries.length + ")";
    selectElement.appendChild(option);
  });

  selectElement.value = currentGroupId;
}

export function hideRoundCelebrationUI({
  overlayElement,
  sceneElement,
}) {
  overlayElement.hidden = true;
  overlayElement.classList.remove("play");
  sceneElement.className = "celebration-scene";
  sceneElement.innerHTML = "";
}

export function playRoundCompletionRevealUI({
  overlayElement,
  revealItems,
}) {
  overlayElement.classList.remove("play");
  revealItems.forEach((item, index) => {
    item.style.setProperty("--delay", String(0.12 + index * 0.18) + "s");
  });

  void overlayElement.offsetWidth;
  overlayElement.classList.add("play");
}

export function renderCelebrationEffectUI({
  sceneElement,
  effects,
}) {
  const effect = effects[Math.floor(Math.random() * effects.length)];
  sceneElement.className = "celebration-scene effect-" + effect;
  sceneElement.innerHTML = "";

  if (effect === "fireworks") {
    renderFireworksEffect(sceneElement);
    return;
  }

  if (effect === "champagne") {
    renderChampagneEffect(sceneElement);
    return;
  }

  renderConfettiEffect(sceneElement);
}

function renderFireworksEffect(sceneElement) {
  const bursts = [
    { x: "18%", y: "58%", delay: "0s", color: "#f59e0b" },
    { x: "50%", y: "30%", delay: "0.25s", color: "#ef4444" },
    { x: "80%", y: "54%", delay: "0.5s", color: "#3b82f6" },
  ];

  bursts.forEach((burst) => {
    const core = document.createElement("span");
    core.className = "firework-core";
    core.style.setProperty("--x", burst.x);
    core.style.setProperty("--y", burst.y);
    core.style.setProperty("--delay", burst.delay);
    sceneElement.appendChild(core);

    for (let index = 0; index < 10; index += 1) {
      const ray = document.createElement("span");
      ray.className = "firework-ray";
      ray.style.setProperty("--x", burst.x);
      ray.style.setProperty("--y", burst.y);
      ray.style.setProperty("--delay", burst.delay);
      ray.style.setProperty("--color", burst.color);
      ray.style.setProperty("--angle", String(index * 36) + "deg");
      sceneElement.appendChild(ray);
    }
  });
}

function renderChampagneEffect(sceneElement) {
  const bottle = document.createElement("span");
  bottle.className = "champagne-bottle";
  sceneElement.appendChild(bottle);

  const glass = document.createElement("span");
  glass.className = "champagne-glass";
  sceneElement.appendChild(glass);

  for (let index = 0; index < 18; index += 1) {
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    bubble.style.setProperty("--size", String(8 + (index % 4) * 4) + "px");
    bubble.style.setProperty("--left", String(210 + (index * 22) % 190) + "px");
    bubble.style.setProperty("--duration", String(1.8 + (index % 5) * 0.22) + "s");
    bubble.style.setProperty("--delay", String((index % 6) * 0.18) + "s");
    sceneElement.appendChild(bubble);
  }
}

function renderConfettiEffect(sceneElement) {
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#f97316"];

  for (let index = 0; index < 26; index += 1) {
    const piece = document.createElement("span");
    piece.className = index % 4 === 0 ? "confetti-ribbon" : "confetti-piece";
    piece.style.setProperty("--left", String(4 + (index * 3.6)) + "%");
    piece.style.setProperty("--rotate", String((index * 17) % 180) + "deg");
    piece.style.setProperty("--duration", String(2.8 + (index % 5) * 0.28) + "s");
    piece.style.setProperty("--delay", String((index % 7) * 0.14) + "s");
    piece.style.setProperty("--color", colors[index % colors.length]);
    sceneElement.appendChild(piece);
  }
}
