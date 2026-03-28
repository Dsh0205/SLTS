const STORAGE_KEY = "word-practice-data-v2";
const DEFAULT_GROUP_NAME = "默认分组";
const IMPORTED_GROUP_NAME = "导入分组";
const ROUND_SIZE = 20;
const CELEBRATION_EFFECTS = ["fireworks", "champagne", "confetti"];

const wordBanks = {
  english: { label: "英语", locale: "en", groups: [] },
  russian: { label: "俄语", locale: "ru", groups: [] }
};

const wrongRecords = new Map();

let currentMode = "english";
let practiceEntries = [];
let currentQuizEntries = [];
let currentRoundPendingEntries = [];
let currentQuestionEntry = null;
let currentRoundSize = 0;
let currentSelectedGroupIds = [];
let sessionActive = false;
let transitionLock = false;
let lastQuestionKey = "";
let toastTimer = null;
let answeredCountValue = 0;
let correctCountValue = 0;
let wrongCountValue = 0;
let activeWordFileHandle = null;
let activeWordFilePath = "";
let roundCelebrationVisible = false;
let pendingGroupMode = "english";
let pendingGroupSelection = new Set();
let masteredEntryKeys = new Set();
let carryOverWrongKeys = new Set();

const activeLibraryGroupIds = {
  english: "",
  russian: ""
};

const app = document.getElementById("app");
const toast = document.getElementById("toast");

const homeView = document.getElementById("homeView");
const modeSelectView = document.getElementById("modeSelectView");
const quizView = document.getElementById("quizView");
const resultView = document.getElementById("resultView");
const libraryView = document.getElementById("libraryView");
const wordsView = document.getElementById("wordsView");

const homeStartBtn = document.getElementById("homeStartBtn");
const homeLibraryBtn = document.getElementById("homeLibraryBtn");
const englishModeBtn = document.getElementById("englishModeBtn");
const russianModeBtn = document.getElementById("russianModeBtn");
const libraryHomeBtn = document.getElementById("libraryHomeBtn");
const resultRestartBtn = document.getElementById("resultRestartBtn");
const resultHomeBtn = document.getElementById("resultHomeBtn");
const wordsBackBtn = document.getElementById("wordsBackBtn");
const wordsHomeBtn = document.getElementById("wordsHomeBtn");
const homeRevealItems = Array.from(document.querySelectorAll(".hero-reveal"));
const modeRevealItems = Array.from(document.querySelectorAll(".mode-reveal"));

const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");
const viewWordsBtn = document.getElementById("viewWordsBtn");
const clearBtn = document.getElementById("clearBtn");
const importFileInput = document.getElementById("importFileInput");
const englishEntryInput = document.getElementById("englishEntryInput");
const russianEntryInput = document.getElementById("russianEntryInput");
const russianKeyboard = document.getElementById("russianKeyboard");
const englishAddBtn = document.getElementById("englishAddBtn");
const russianAddBtn = document.getElementById("russianAddBtn");
const englishGroupNameInput = document.getElementById("englishGroupNameInput");
const russianGroupNameInput = document.getElementById("russianGroupNameInput");
const englishCreateGroupBtn = document.getElementById("englishCreateGroupBtn");
const russianCreateGroupBtn = document.getElementById("russianCreateGroupBtn");
const englishGroupSelect = document.getElementById("englishGroupSelect");
const russianGroupSelect = document.getElementById("russianGroupSelect");
const englishGroupsPreview = document.getElementById("englishGroupsPreview");
const russianGroupsPreview = document.getElementById("russianGroupsPreview");

const wrongList = document.getElementById("wrongList");
const wrongEmptyState = document.getElementById("wrongEmptyState");
const answeredCount = document.getElementById("answeredCount");
const correctCount = document.getElementById("correctCount");
const wrongCount = document.getElementById("wrongCount");
const resultTitle = document.getElementById("resultTitle");

const englishWordsList = document.getElementById("englishWordsList");
const russianWordsList = document.getElementById("russianWordsList");
const englishWordsEmpty = document.getElementById("englishWordsEmpty");
const russianWordsEmpty = document.getElementById("russianWordsEmpty");

const exitBtn = document.getElementById("exitBtn");
const questionWord = document.getElementById("questionWord");
const options = document.getElementById("options");
const questionCard = document.querySelector(".simple-question-card");
const roundProgress = document.getElementById("roundProgress");
const roundCompleteOverlay = document.getElementById("roundCompleteOverlay");
const celebrationScene = document.getElementById("celebrationScene");
const roundCompleteTitle = document.getElementById("roundCompleteTitle");
const roundCorrectLine = document.getElementById("roundCorrectLine");
const roundWrongLine = document.getElementById("roundWrongLine");
const roundAccuracyLine = document.getElementById("roundAccuracyLine");
const roundContinuePrompt = document.getElementById("roundContinuePrompt");
const roundActions = document.getElementById("roundActions");
const roundContinueBtn = document.getElementById("roundContinueBtn");
const roundStopBtn = document.getElementById("roundStopBtn");

const groupSelectorOverlay = document.getElementById("groupSelectorOverlay");
const groupSelectorTitle = document.getElementById("groupSelectorTitle");
const groupSelectorHint = document.getElementById("groupSelectorHint");
const groupSelectorStatus = document.getElementById("groupSelectorStatus");
const groupSelectorList = document.getElementById("groupSelectorList");
const groupSelectAllBtn = document.getElementById("groupSelectAllBtn");
const groupClearAllBtn = document.getElementById("groupClearAllBtn");
const groupSelectorCancelBtn = document.getElementById("groupSelectorCancelBtn");
const groupSelectorConfirmBtn = document.getElementById("groupSelectorConfirmBtn");

const JSON_FILE_PICKER_OPTIONS = {
  types: [{
    description: "JSON Files",
    accept: {
      "application/json": [".json"]
    }
  }],
  excludeAcceptAllOption: true,
  multiple: false
};

const RUSSIAN_KEYBOARD_LAYOUT = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "ё"],
  [
    { label: "Space", value: " ", className: "space" },
    { label: "/", value: "/" },
    { label: "-", value: "-" },
    { label: "Enter", value: "\n", className: "wide" },
    { label: "Backspace", action: "backspace", className: "wide" }
  ]
];

initRussianKeyboard();
loadSavedWords();
syncLibrarySelectors();
refreshAllDisplays();
showView("home");

homeStartBtn.addEventListener("click", () => showView("mode"));
homeLibraryBtn.addEventListener("click", () => showView("library"));
englishModeBtn.addEventListener("click", () => openGroupSelector("english"));
russianModeBtn.addEventListener("click", () => openGroupSelector("russian"));
libraryHomeBtn.addEventListener("click", () => showView("home"));
resultRestartBtn.addEventListener("click", () => showView("mode"));
resultHomeBtn.addEventListener("click", () => showView("home"));
wordsBackBtn.addEventListener("click", () => showView("library"));
wordsHomeBtn.addEventListener("click", () => showView("home"));

importBtn.addEventListener("click", openImportPicker);
exportBtn.addEventListener("click", exportWordsToFile);
viewWordsBtn.addEventListener("click", () => {
  renderWordsView();
  showView("words");
});
clearBtn.addEventListener("click", clearWords);
importFileInput.addEventListener("change", handleImportFile);
englishAddBtn.addEventListener("click", () => addManualEntries("english"));
russianAddBtn.addEventListener("click", () => addManualEntries("russian"));
englishCreateGroupBtn.addEventListener("click", () => createGroupFromInput("english"));
russianCreateGroupBtn.addEventListener("click", () => createGroupFromInput("russian"));
englishGroupSelect.addEventListener("change", () => setActiveLibraryGroup("english", englishGroupSelect.value));
russianGroupSelect.addEventListener("change", () => setActiveLibraryGroup("russian", russianGroupSelect.value));

exitBtn.addEventListener("click", exitQuiz);
roundContinueBtn.addEventListener("click", continueNextRound);
roundStopBtn.addEventListener("click", finishPracticeLoop);

groupSelectAllBtn.addEventListener("click", selectAllGroupsForPendingMode);
groupClearAllBtn.addEventListener("click", clearPendingGroupSelection);
groupSelectorCancelBtn.addEventListener("click", hideGroupSelector);
groupSelectorConfirmBtn.addEventListener("click", confirmGroupSelection);
groupSelectorOverlay.addEventListener("click", (event) => {
  if (event.target === groupSelectorOverlay) {
    hideGroupSelector();
  }
});

function showView(viewName) {
  homeView.classList.toggle("active", viewName === "home");
  modeSelectView.classList.toggle("active", viewName === "mode");
  quizView.classList.toggle("active", viewName === "quiz");
  resultView.classList.toggle("active", viewName === "result");
  libraryView.classList.toggle("active", viewName === "library");
  wordsView.classList.toggle("active", viewName === "words");

  if (viewName !== "mode") {
    hideGroupSelector();
  }

  if (viewName === "home") {
    playHomeReveal();
  }

  if (viewName === "mode") {
    playModeReveal();
  }
}

function initRussianKeyboard() {
  if (!russianKeyboard) {
    return;
  }

  russianKeyboard.innerHTML = "";

  RUSSIAN_KEYBOARD_LAYOUT.forEach((rowItems) => {
    const row = document.createElement("div");
    row.className = "keyboard-row";

    rowItems.forEach((item) => {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "keyboard-key";

      if (typeof item === "string") {
        key.textContent = item;
        key.dataset.value = item;
        key.setAttribute("aria-label", "Input " + item);
      } else {
        key.textContent = item.label;
        if (item.value !== undefined) {
          key.dataset.value = item.value;
        }
        if (item.action) {
          key.dataset.action = item.action;
        }
        if (item.className) {
          key.classList.add(item.className);
        }
      }

      key.addEventListener("click", () => handleRussianKeyboardKey(key));
      row.appendChild(key);
    });

    russianKeyboard.appendChild(row);
  });
}

function handleRussianKeyboardKey(key) {
  if (russianEntryInput.disabled) {
    return;
  }

  russianEntryInput.focus();

  if (key.dataset.action === "backspace") {
    deleteTextAtCursor(russianEntryInput);
    return;
  }

  insertTextAtCursor(russianEntryInput, key.dataset.value || "");
}

function playHomeReveal() {
  homeRevealItems.forEach((item) => item.classList.remove("play"));
  void homeView.offsetWidth;
  homeRevealItems.forEach((item) => item.classList.add("play"));
}

function playModeReveal() {
  modeRevealItems.forEach((item) => item.classList.remove("play"));
  void modeSelectView.offsetWidth;
  modeRevealItems.forEach((item) => item.classList.add("play"));
}

function refreshAllDisplays() {
  syncLibrarySelectors();
  renderGroupPreview("english", englishGroupsPreview);
  renderGroupPreview("russian", russianGroupsPreview);
  renderWrongRecords();
  renderResultStats();
  renderRoundProgress();
  renderWordsView();
}

function openGroupSelector(mode) {
  const groups = getGroups(mode);
  const availableGroups = groups.filter((group) => group.entries.length > 0);

  if (groups.length === 0) {
    showToast("Please create a group in the " + wordBanks[mode].label + " library first.", "error");
    showView("library");
    return;
  }

  if (availableGroups.length === 0) {
    showToast("There is no group available for testing yet. Add some words first.", "error");
    showView("library");
    return;
  }

  pendingGroupMode = mode;
  pendingGroupSelection = new Set(availableGroups.map((group) => group.id));
  setGroupSelectorStatus();
  renderGroupSelector();
  groupSelectorOverlay.hidden = false;
}

function hideGroupSelector() {
  groupSelectorOverlay.hidden = true;
  setGroupSelectorStatus();
}

function renderGroupSelector() {
  const groups = getGroups(pendingGroupMode);
  groupSelectorTitle.textContent = wordBanks[pendingGroupMode].label + "测试分组";
  groupSelectorHint.textContent = "You can select multiple groups. Empty groups will not be used in tests.";
  groupSelectorList.innerHTML = "";

  groups.forEach((group) => {
    const option = document.createElement("label");
    option.className = "group-picker-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    checkbox.checked = pendingGroupSelection.has(group.id);
    checkbox.disabled = group.entries.length === 0;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        pendingGroupSelection.add(group.id);
      } else {
        pendingGroupSelection.delete(group.id);
      }

      if (pendingGroupSelection.size > 0) {
        setGroupSelectorStatus();
      }
    });

    const meta = document.createElement("div");
    meta.className = "group-picker-meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(group.name) + "</strong>" +
      "<span>" + group.entries.length + " entries</span>";

    option.appendChild(checkbox);
    option.appendChild(meta);
    groupSelectorList.appendChild(option);
  });
}

function selectAllGroupsForPendingMode() {
  pendingGroupSelection = new Set(
    getGroups(pendingGroupMode)
      .filter((group) => group.entries.length > 0)
      .map((group) => group.id)
  );
  setGroupSelectorStatus();
  renderGroupSelector();
}

function clearPendingGroupSelection() {
  pendingGroupSelection = new Set();
  setGroupSelectorStatus("Please select at least one group that contains words.", "error");
  renderGroupSelector();
}

function confirmGroupSelection() {
  const selectedGroupIds = Array.from(pendingGroupSelection);
  const entries = collectEntriesFromGroups(pendingGroupMode, selectedGroupIds);

  if (selectedGroupIds.length === 0) {
    setGroupSelectorStatus("Please select at least one group that contains words.", "error");
    showToast("Please select at least one group.", "error");
    return;
  }

  if (!hasSufficientQuizEntries(entries)) {
    setGroupSelectorStatus("Selected groups need at least 2 entries with 2 different meanings.", "error");
    showToast("Selected groups need at least 2 entries with 2 different meanings.", "error");
    return;
  }

  currentMode = pendingGroupMode;
  currentSelectedGroupIds = selectedGroupIds.slice();
  practiceEntries = shuffleArray(entries.slice());
  currentQuizEntries = [];
  currentRoundPendingEntries = [];
  currentQuestionEntry = null;
  currentRoundSize = 0;
  masteredEntryKeys = new Set();
  carryOverWrongKeys = new Set();
  sessionActive = true;
  roundCelebrationVisible = false;
  setLibraryActionsDisabled(true);
  setGroupSelectorStatus();
  hideGroupSelector();
  showView("quiz");

  if (!prepareNextRound()) {
    exitQuiz();
    showToast("There are not enough words left to start a test.", "error");
    return;
  }

  nextQuestion();
}

function exitQuiz() {
  sessionActive = false;
  transitionLock = false;
  roundCelebrationVisible = false;
  hideRoundCelebration();
  setLibraryActionsDisabled(false);
  renderWrongRecords();
  renderResultStats();
  renderRoundProgress();
  showView("result");
}

function prepareNextRound() {
  const availableEntries = getRemainingPracticeEntries();
  currentQuizEntries = [];
  currentRoundPendingEntries = [];
  currentQuestionEntry = null;
  currentRoundSize = 0;

  if (!hasSufficientQuizEntries(availableEntries)) {
    resetRoundSession();
    return false;
  }

  currentQuizEntries = buildRoundEntries(availableEntries);
  currentRoundPendingEntries = currentQuizEntries.slice();
  currentRoundSize = currentRoundPendingEntries.length;
  resetRoundSession();
  return hasSufficientQuizEntries(currentQuizEntries);
}

function resetRoundSession() {
  wrongRecords.clear();
  currentQuestionEntry = null;
  lastQuestionKey = "";
  transitionLock = false;
  answeredCountValue = 0;
  correctCountValue = 0;
  wrongCountValue = 0;
  options.innerHTML = "";
  renderWrongRecords();
  renderResultStats();
  renderRoundProgress();
}

function nextQuestion() {
  if (
    !sessionActive ||
    roundCelebrationVisible ||
    currentRoundPendingEntries.length === 0 ||
    !hasSufficientQuizEntries(currentQuizEntries)
  ) {
    return;
  }

  options.innerHTML = "";
  playQuestionReveal();
  currentQuestionEntry = pickQuestionEntry(currentRoundPendingEntries);
  lastQuestionKey = getEntryKey(currentQuestionEntry);
  questionWord.textContent = currentQuestionEntry.word;

  const optionItems = buildOptionItems(currentQuizEntries, currentQuestionEntry);
  optionItems.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-btn option-enter";
    button.style.animationDelay = String(0.08 + index * 0.08) + "s";
    button.textContent = item.meaning;
    button.dataset.correct = String(item.correct);
    button.addEventListener("click", () => handleOptionClick(button, item.correct));
    options.appendChild(button);
  });
}

function pickQuestionEntry(entries) {
  let index = Math.floor(Math.random() * entries.length);
  let entry = entries[index];

  while (entries.length > 1 && getEntryKey(entry) === lastQuestionKey) {
    index = Math.floor(Math.random() * entries.length);
    entry = entries[index];
  }

  return entry;
}

function buildOptionItems(entries, correctEntry) {
  const targetOptionCount = Math.max(2, Math.min(4, getUniqueMeaningCountFromEntries(entries)));
  const optionItems = [{
    meaning: correctEntry.meaning,
    correct: true
  }];
  const usedMeanings = new Set([correctEntry.meaning]);

  while (optionItems.length < targetOptionCount) {
    const randomIndex = Math.floor(Math.random() * entries.length);
    const meaning = entries[randomIndex].meaning;
    if (usedMeanings.has(meaning)) {
      continue;
    }

    usedMeanings.add(meaning);
    optionItems.push({
      meaning,
      correct: false
    });
  }

  return shuffleArray(optionItems);
}

function handleOptionClick(button, isCorrect) {
  if (!sessionActive || transitionLock || !currentQuestionEntry) {
    return;
  }

  transitionLock = true;
  const optionButtons = Array.from(document.querySelectorAll(".option-btn"));
  optionButtons.forEach((btn) => {
    btn.disabled = true;
  });

  const correctButton = optionButtons.find((btn) => btn.dataset.correct === "true");
  const entry = currentQuestionEntry;
  const entryKey = getEntryKey(entry);
  answeredCountValue += 1;

  if (isCorrect) {
    correctCountValue += 1;
    masteredEntryKeys.add(entryKey);
    carryOverWrongKeys.delete(entryKey);
    button.classList.add("correct");
    triggerFlash("flash-success");
  } else {
    wrongCountValue += 1;
    carryOverWrongKeys.add(entryKey);
    button.classList.add("incorrect");
    if (correctButton) {
      correctButton.classList.add("correct");
    }
    recordWrongWord(entry);
    renderWrongRecords();
    triggerFlash("flash-error");
  }

  currentRoundPendingEntries = currentRoundPendingEntries.filter((item) => getEntryKey(item) !== entryKey);
  currentQuestionEntry = null;
  renderResultStats();
  renderRoundProgress();

  window.setTimeout(() => {
    transitionLock = false;
    if (!sessionActive) {
      return;
    }

    if (currentRoundPendingEntries.length === 0) {
      showRoundCompletion();
      return;
    }

    nextQuestion();
  }, 900);
}

function getEntryKey(entry) {
  return entry.word + "\u0000" + entry.meaning;
}

function getWrongRecordKey(entry) {
  return getEntryKey(entry);
}

function recordWrongWord(entry) {
  const key = getWrongRecordKey(entry);
  const previous = wrongRecords.get(key);

  if (previous) {
    previous.count += 1;
    return;
  }

  wrongRecords.set(key, {
    word: entry.word,
    meaning: entry.meaning,
    count: 1
  });
}

function renderWrongRecords() {
  wrongList.innerHTML = "";
  if (wrongRecords.size === 0) {
    wrongList.hidden = true;
    wrongEmptyState.hidden = false;
    return;
  }

  wrongEmptyState.hidden = true;
  wrongList.hidden = false;

  wrongRecords.forEach((value) => {
    const item = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "word-meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(value.word) + "</strong>" +
      "<span>" + escapeHtml(value.meaning) + "</span>";
    item.appendChild(meta);
    wrongList.appendChild(item);
  });
}

function renderResultStats() {
  answeredCount.textContent = String(answeredCountValue);
  correctCount.textContent = String(correctCountValue);
  wrongCount.textContent = String(wrongCountValue);
  resultTitle.textContent = wordBanks[currentMode].label + "测试结果";
}

function renderRoundProgress() {
  const total = Math.max(currentRoundSize, answeredCountValue, 0);

  if (total === 0) {
    roundProgress.textContent = "Round 0 / 0";
    return;
  }

  const current = sessionActive && !roundCelebrationVisible
    ? Math.min(answeredCountValue + 1, total)
    : Math.min(answeredCountValue, total);
  const displayValue = roundCelebrationVisible ? total : current;
  roundProgress.textContent = "Round " + displayValue + " / " + total;
}

function showRoundCompletion() {
  roundCelebrationVisible = true;
  transitionLock = true;
  renderRoundProgress();

  const accuracy = answeredCountValue === 0
    ? 0
    : Math.round((correctCountValue / answeredCountValue) * 100);

  roundCompleteTitle.textContent = "Round complete";
  roundCorrectLine.textContent = "Correct: " + correctCountValue;
  roundWrongLine.textContent = "Wrong: " + wrongCountValue;
  roundAccuracyLine.textContent = "准确率：" + accuracy + "%";
  roundContinuePrompt.textContent = "是否继续完成下一组？";

  const hasNextRound = hasNextRoundAvailable();
  roundContinueBtn.hidden = !hasNextRound;
  if (!hasNextRound) {
    roundContinuePrompt.textContent = "Current practice words are finished.";
  }

  renderCelebrationEffect();
  roundCompleteOverlay.hidden = false;
  playRoundCompletionReveal();
}

function hideRoundCelebration() {
  roundCompleteOverlay.hidden = true;
  roundCompleteOverlay.classList.remove("play");
  celebrationScene.className = "celebration-scene";
  celebrationScene.innerHTML = "";
}

function continueNextRound() {
  if (!sessionActive) {
    return;
  }

  roundCelebrationVisible = false;
  hideRoundCelebration();

  if (!prepareNextRound()) {
    finishPracticeLoop();
    return;
  }

  nextQuestion();
}

function finishPracticeLoop() {
  roundCelebrationVisible = false;
  hideRoundCelebration();
  exitQuiz();
}

function playRoundCompletionReveal() {
  const revealItems = [
    roundCompleteTitle,
    roundCorrectLine,
    roundWrongLine,
    roundAccuracyLine,
    roundContinuePrompt,
    roundActions
  ];

  roundCompleteOverlay.classList.remove("play");
  revealItems.forEach((item, index) => {
    item.style.setProperty("--delay", String(0.12 + index * 0.18) + "s");
  });

  void roundCompleteOverlay.offsetWidth;
  roundCompleteOverlay.classList.add("play");
}

function renderCelebrationEffect() {
  const effect = CELEBRATION_EFFECTS[Math.floor(Math.random() * CELEBRATION_EFFECTS.length)];
  celebrationScene.className = "celebration-scene effect-" + effect;
  celebrationScene.innerHTML = "";

  if (effect === "fireworks") {
    renderFireworksEffect();
    return;
  }

  if (effect === "champagne") {
    renderChampagneEffect();
    return;
  }

  renderConfettiEffect();
}

function renderFireworksEffect() {
  const bursts = [
    { x: "18%", y: "58%", delay: "0s", color: "#f59e0b" },
    { x: "50%", y: "30%", delay: "0.25s", color: "#ef4444" },
    { x: "80%", y: "54%", delay: "0.5s", color: "#3b82f6" }
  ];

  bursts.forEach((burst) => {
    const core = document.createElement("span");
    core.className = "firework-core";
    core.style.setProperty("--x", burst.x);
    core.style.setProperty("--y", burst.y);
    core.style.setProperty("--delay", burst.delay);
    celebrationScene.appendChild(core);

    for (let i = 0; i < 10; i += 1) {
      const ray = document.createElement("span");
      ray.className = "firework-ray";
      ray.style.setProperty("--x", burst.x);
      ray.style.setProperty("--y", burst.y);
      ray.style.setProperty("--delay", burst.delay);
      ray.style.setProperty("--color", burst.color);
      ray.style.setProperty("--angle", String(i * 36) + "deg");
      celebrationScene.appendChild(ray);
    }
  });
}

function renderChampagneEffect() {
  const bottle = document.createElement("span");
  bottle.className = "champagne-bottle";
  celebrationScene.appendChild(bottle);

  const glass = document.createElement("span");
  glass.className = "champagne-glass";
  celebrationScene.appendChild(glass);

  for (let i = 0; i < 18; i += 1) {
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    bubble.style.setProperty("--size", String(8 + (i % 4) * 4) + "px");
    bubble.style.setProperty("--left", String(210 + (i * 22) % 190) + "px");
    bubble.style.setProperty("--duration", String(1.8 + (i % 5) * 0.22) + "s");
    bubble.style.setProperty("--delay", String((i % 6) * 0.18) + "s");
    celebrationScene.appendChild(bubble);
  }
}

function renderConfettiEffect() {
  const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#f97316"];

  for (let i = 0; i < 26; i += 1) {
    const piece = document.createElement("span");
    piece.className = i % 4 === 0 ? "confetti-ribbon" : "confetti-piece";
    piece.style.setProperty("--left", String(4 + (i * 3.6)) + "%");
    piece.style.setProperty("--rotate", String((i * 17) % 180) + "deg");
    piece.style.setProperty("--duration", String(2.8 + (i % 5) * 0.28) + "s");
    piece.style.setProperty("--delay", String((i % 7) * 0.14) + "s");
    piece.style.setProperty("--color", colors[i % colors.length]);
    celebrationScene.appendChild(piece);
  }
}

function parseImportedWords(rawText) {
  const parsed = JSON.parse(rawText);

  if (Array.isArray(parsed)) {
    return {
      english: normalizeImportedModePayload(parsed, "英语", IMPORTED_GROUP_NAME),
      russian: []
    };
  }

  if (parsed.wordBanks) {
    return {
      english: normalizeImportedModePayload(parsed.wordBanks.english, "英语", IMPORTED_GROUP_NAME),
      russian: normalizeImportedModePayload(parsed.wordBanks.russian, "俄语", IMPORTED_GROUP_NAME)
    };
  }

  if (parsed.english || parsed.russian) {
    return {
      english: normalizeImportedModePayload(parsed.english, "英语", IMPORTED_GROUP_NAME),
      russian: normalizeImportedModePayload(parsed.russian, "俄语", IMPORTED_GROUP_NAME)
    };
  }

  const englishWords = Array.isArray(parsed.englishWords) ? parsed.englishWords : null;
  const chineseMeanings = Array.isArray(parsed.chineseMeanings) ? parsed.chineseMeanings : null;

  if (!englishWords || !chineseMeanings || englishWords.length !== chineseMeanings.length) {
    throw new Error("Invalid JSON format. Use grouped data or englishWords/chineseMeanings.");
  }

  return {
    english: [{
      id: generateId("group"),
      name: IMPORTED_GROUP_NAME,
      entries: englishWords.map((word, index) => ({
        id: generateId("entry"),
        word: String(word || "").trim(),
        meaning: String(chineseMeanings[index] || "").trim()
      })).filter((entry) => entry.word && entry.meaning)
    }],
    russian: []
  };
}

function createGroupFromInput(mode) {
  if (sessionActive) {
    showToast("Please exit the current test before editing the library.", "error");
    return;
  }

  const input = getGroupNameInput(mode);
  const name = String(input.value || "").trim();

  if (!name) {
    showToast("Please enter a group name first.", "error");
    return;
  }

  const duplicate = getGroups(mode).some((group) => group.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showToast("This group name already exists.", "error");
    return;
  }

  getGroups(mode).push({
    id: generateId("group"),
    name,
    entries: []
  });

  activeLibraryGroupIds[mode] = getGroups(mode)[getGroups(mode).length - 1].id;
  input.value = "";
  saveWords();
  refreshAllDisplays();
  showToast("Created " + wordBanks[mode].label + " group: " + name, "success");
}

function addManualEntries(mode) {
  if (sessionActive) {
    showToast("Please exit the current test before editing the library.", "error");
    return;
  }

  const groupId = activeLibraryGroupIds[mode];
  const group = findGroup(mode, groupId);
  if (!group) {
    showToast("Please create and select a " + wordBanks[mode].label + " group first.", "error");
    return;
  }

  const input = mode === "english" ? englishEntryInput : russianEntryInput;
  let entries = [];

  try {
    entries = parseManualEntries(input.value, mode, wordBanks[mode].label);
  } catch (error) {
    showToast(error.message || "Invalid word format. Please check and try again.", "error");
    return;
  }

  if (entries.length === 0) {
    showToast("Please enter " + wordBanks[mode].label + " words and meanings.", "error");
    return;
  }

  let addedCount = 0;
  entries.forEach((entry) => {
    if (pushEntryToGroup(mode, group.id, entry)) {
      addedCount += 1;
    }
  });

  input.value = "";
  saveWords();
  refreshAllDisplays();

  if (addedCount === 0) {
    showToast("These entries already exist in the current group.", "error");
    return;
  }

  showToast("Added " + addedCount + " " + wordBanks[mode].label + " entries.", "success");
}

function parseManualEntries(text, mode, label) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => parseManualLine(line, index, mode, label));
}

function parseManualLine(line, index, mode, label) {
  void mode;
  const parts = line.split(/\s*(?:\/|\uFF0F)\s*/u).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    return {
      word: parts[0],
      meaning: parts[1]
    };
  }

  throw new Error(label + "第 " + (index + 1) + " 行无法识别，请按“单词/中文”的格式输入。");
}

function clearWords() {
  if (sessionActive) {
    showToast("Please exit the current test before clearing the library.", "error");
    return;
  }

  resetBank("english");
  resetBank("russian");
  wrongRecords.clear();
  practiceEntries = [];
  currentQuizEntries = [];
  currentRoundPendingEntries = [];
  currentQuestionEntry = null;
  currentRoundSize = 0;
  currentSelectedGroupIds = [];
  masteredEntryKeys = new Set();
  carryOverWrongKeys = new Set();
  activeLibraryGroupIds.english = "";
  activeLibraryGroupIds.russian = "";
  saveWords();
  refreshAllDisplays();
  showToast("English and Russian libraries have been cleared.", "success");
}

function renderWordsView() {
  renderWordColumn("english", englishWordsList, englishWordsEmpty);
  renderWordColumn("russian", russianWordsList, russianWordsEmpty);
}

function renderWordColumn(mode, listElement, emptyElement) {
  const groups = getGroups(mode).slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  listElement.innerHTML = "";

  if (groups.length === 0) {
    listElement.hidden = true;
    emptyElement.hidden = false;
    return;
  }

  emptyElement.hidden = true;
  listElement.hidden = false;

  groups.forEach((group) => {
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
        .sort((a, b) => a.word.localeCompare(b.word, wordBanks[mode].locale))
        .forEach((entry) => {
          const entryItem = document.createElement("div");
          entryItem.className = "group-word-entry";
          entryItem.title = "右键删除这个词条";
          entryItem.innerHTML =
            "<strong>" + escapeHtml(entry.word) + "</strong>" +
            "<span>" + escapeHtml(entry.meaning) + "</span>";
          entryItem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            deleteWordEntry(mode, group.id, entry.id);
          });
          entriesWrap.appendChild(entryItem);
        });
    }

    item.appendChild(header);
    item.appendChild(entriesWrap);
    listElement.appendChild(item);
  });
}

function deleteWordEntry(mode, groupId, entryId) {
  if (sessionActive) {
    showToast("Please exit the current test before editing the library.", "error");
    return;
  }

  const group = findGroup(mode, groupId);
  if (!group) {
    showToast("Target group not found.", "error");
    return;
  }

  const index = group.entries.findIndex((entry) => entry.id === entryId);
  if (index === -1) {
    showToast("Entry to delete was not found.", "error");
    return;
  }

  const entry = group.entries[index];
  const confirmed = window.confirm("要删除这条单词吗？\n\n" + entry.word + " - " + entry.meaning);
  if (!confirmed) {
    return;
  }

  group.entries.splice(index, 1);
  wrongRecords.delete(getWrongRecordKey(entry));
  saveWords();
  refreshAllDisplays();
  showToast("Deleted 1 " + wordBanks[mode].label + " entry.", "success");
}

function deleteGroup(mode, groupId) {
  if (sessionActive) {
    showToast("Please exit the current test before editing the library.", "error");
    return;
  }

  const groups = getGroups(mode);
  const index = groups.findIndex((group) => group.id === groupId);
  if (index === -1) {
    return;
  }

  const group = groups[index];
  const confirmed = window.confirm("Delete this group?\n\n" + group.name + "\n\nAll words in this group will also be deleted.");
  if (!confirmed) {
    return;
  }

  groups.splice(index, 1);
  ensureValidActiveGroup(mode);
  saveWords();
  refreshAllDisplays();
  showToast("已删除分组：" + group.name, "success");
}

function loadSavedWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);

    if (parsed.wordBanks) {
      hydrateBank("english", parsed.wordBanks.english);
      hydrateBank("russian", parsed.wordBanks.russian);
      return;
    }

    if (Array.isArray(parsed.englishWords) && Array.isArray(parsed.chineseMeanings)) {
      const defaultGroup = createEmptyGroup(DEFAULT_GROUP_NAME);
      parsed.englishWords.forEach((word, index) => {
        const meaning = parsed.chineseMeanings[index];
        if (word && meaning) {
          defaultGroup.entries.push({
            id: generateId("entry"),
            word: String(word).trim(),
            meaning: String(meaning).trim()
          });
        }
      });
      if (defaultGroup.entries.length > 0) {
        wordBanks.english.groups.push(defaultGroup);
      }
    }
  } catch (error) {
    console.warn("Failed to load word library:", error);
  } finally {
    ensureValidActiveGroup("english");
    ensureValidActiveGroup("russian");
  }
}

function hydrateBank(mode, payload) {
  resetBank(mode);
  if (!payload) {
    return;
  }

  if (Array.isArray(payload.groups)) {
    wordBanks[mode].groups = normalizeGroupArray(payload.groups, wordBanks[mode].label).map(cloneGroup);
    ensureValidActiveGroup(mode);
    return;
  }

  const words = Array.isArray(payload.words) ? payload.words : [];
  const meanings = Array.isArray(payload.meanings) ? payload.meanings : [];
  const total = Math.min(words.length, meanings.length);
  if (total === 0) {
    ensureValidActiveGroup(mode);
    return;
  }

  const group = createEmptyGroup(DEFAULT_GROUP_NAME);
  for (let i = 0; i < total; i += 1) {
    const word = String(words[i] || "").trim();
    const meaning = String(meanings[i] || "").trim();
    if (word && meaning) {
      group.entries.push({
        id: generateId("entry"),
        word,
        meaning
      });
    }
  }

  if (group.entries.length > 0) {
    wordBanks[mode].groups.push(group);
  }
  ensureValidActiveGroup(mode);
}

function saveWords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    wordBanks: {
      english: { groups: exportGroups("english") },
      russian: { groups: exportGroups("russian") }
    }
  }));
}

function syncLibrarySelectors() {
  syncGroupSelect("english", englishGroupSelect);
  syncGroupSelect("russian", russianGroupSelect);
}

function syncGroupSelect(mode, selectElement) {
  const groups = getGroups(mode);
  ensureValidActiveGroup(mode);
  selectElement.innerHTML = "";

  if (groups.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请先创建分组";
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

  selectElement.value = activeLibraryGroupIds[mode];
}

function renderGroupPreview(mode, container) {
  container.innerHTML = "";
  const groups = getGroups(mode);

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
    if (activeLibraryGroupIds[mode] === group.id) {
      item.classList.add("active");
    }

    const meta = document.createElement("button");
    meta.type = "button";
    meta.className = "group-preview-meta";
    meta.innerHTML =
      "<strong>" + escapeHtml(group.name) + "</strong>" +
      "<small>" + group.entries.length + " entries</small>";
    meta.addEventListener("click", () => {
      setActiveLibraryGroup(mode, group.id);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tiny-btn";
    removeBtn.textContent = "删除";
    removeBtn.addEventListener("click", () => {
      deleteGroup(mode, group.id);
    });

    item.appendChild(meta);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

function setLibraryActionsDisabled(disabled) {
  [
    importBtn,
    exportBtn,
    viewWordsBtn,
    clearBtn,
    englishAddBtn,
    russianAddBtn,
    englishCreateGroupBtn,
    russianCreateGroupBtn,
    englishEntryInput,
    russianEntryInput,
    englishGroupNameInput,
    russianGroupNameInput,
    englishGroupSelect,
    russianGroupSelect
  ].forEach((element) => {
    element.disabled = disabled;
  });

  Array.from(russianKeyboard.querySelectorAll("button")).forEach((button) => {
    button.disabled = disabled;
  });
}

function resetBank(mode) {
  wordBanks[mode].groups = [];
}

function pushEntryToGroup(mode, groupId, entry) {
  const group = findGroup(mode, groupId);
  if (!group) {
    return false;
  }

  const exists = group.entries.some((item) => item.word === entry.word && item.meaning === entry.meaning);
  if (exists) {
    return false;
  }

  group.entries.push({
    id: generateId("entry"),
    word: entry.word,
    meaning: entry.meaning
  });
  return true;
}

function collectEntriesFromGroups(mode, groupIds) {
  const uniqueEntries = new Map();

  groupIds.forEach((groupId) => {
    const group = findGroup(mode, groupId);
    if (!group) {
      return;
    }

    group.entries.forEach((entry) => {
      const key = entry.word + "\u0000" + entry.meaning;
      if (!uniqueEntries.has(key)) {
        uniqueEntries.set(key, {
          id: entry.id,
          groupId: group.id,
          groupName: group.name,
          word: entry.word,
          meaning: entry.meaning
        });
      }
    });
  });

  return Array.from(uniqueEntries.values());
}

function getGroups(mode) {
  return wordBanks[mode].groups;
}

function findGroup(mode, groupId) {
  return getGroups(mode).find((group) => group.id === groupId) || null;
}

function setActiveLibraryGroup(mode, groupId) {
  activeLibraryGroupIds[mode] = groupId;
  refreshAllDisplays();
}

function ensureValidActiveGroup(mode) {
  const groups = getGroups(mode);
  if (groups.length === 0) {
    activeLibraryGroupIds[mode] = "";
    return;
  }

  const hasCurrent = groups.some((group) => group.id === activeLibraryGroupIds[mode]);
  if (!hasCurrent) {
    activeLibraryGroupIds[mode] = groups[0].id;
  }
}

function replaceWordLibrary(payload) {
  resetBank("english");
  resetBank("russian");
  wrongRecords.clear();
  practiceEntries = [];
  currentQuizEntries = [];
  currentRoundPendingEntries = [];
  currentQuestionEntry = null;
  currentRoundSize = 0;
  currentSelectedGroupIds = [];
  masteredEntryKeys = new Set();
  carryOverWrongKeys = new Set();

  wordBanks.english.groups = payload.english.map(cloneGroup);
  wordBanks.russian.groups = payload.russian.map(cloneGroup);

  ensureValidActiveGroup("english");
  ensureValidActiveGroup("russian");
  saveWords();
  refreshAllDisplays();
}

function normalizeImportedModePayload(payload, label, fallbackGroupName) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return [{
      id: generateId("group"),
      name: fallbackGroupName,
      entries: normalizeEntryArray(payload, label)
    }];
  }

  if (Array.isArray(payload.groups)) {
    return normalizeGroupArray(payload.groups, label);
  }

  const words = Array.isArray(payload.words) ? payload.words : [];
  const meanings = Array.isArray(payload.meanings) ? payload.meanings : [];
  const total = Math.min(words.length, meanings.length);
  if (total === 0) {
    return [];
  }

  return [{
    id: generateId("group"),
    name: fallbackGroupName,
    entries: Array.from({ length: total }, (_, index) => ({
      id: generateId("entry"),
      word: String(words[index] || "").trim(),
      meaning: String(meanings[index] || "").trim()
    })).filter((entry) => entry.word && entry.meaning)
  }];
}

function normalizeGroupArray(groups, label) {
  return groups.map((group, index) => {
    if (!group || typeof group !== "object") {
      throw new Error(label + " group item " + (index + 1) + " is invalid.");
    }

    const name = String(group.name || "").trim();
    if (!name) {
      throw new Error(label + " group item " + (index + 1) + " is missing a name.");
    }

    return {
      id: String(group.id || generateId("group")),
      name,
      entries: normalizeEntryArray(group.entries || [], label)
    };
  });
}

function normalizeEntryArray(entries, label) {
  return entries.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(label + " entry " + (index + 1) + " is invalid.");
    }

    const word = String(item.word || "").trim();
    const meaning = String(item.meaning || "").trim();
    if (!word || !meaning) {
      throw new Error(label + " entry " + (index + 1) + " is missing word or meaning.");
    }

    return {
      id: String(item.id || generateId("entry")),
      word,
      meaning
    };
  });
}

function exportGroups(mode) {
  return getGroups(mode).map((group) => ({
    id: group.id,
    name: group.name,
    entries: group.entries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      meaning: entry.meaning
    }))
  }));
}

function createEmptyGroup(name) {
  return {
    id: generateId("group"),
    name,
    entries: []
  };
}

function cloneGroup(group) {
  return {
    id: group.id,
    name: group.name,
    entries: group.entries.map((entry) => ({
      id: entry.id,
      word: entry.word,
      meaning: entry.meaning
    }))
  };
}

function getGroupNameInput(mode) {
  return mode === "english" ? englishGroupNameInput : russianGroupNameInput;
}

function playQuestionReveal() {
  questionCard.classList.remove("question-enter");
  void questionCard.offsetWidth;
  questionCard.classList.add("question-enter");
}

function getUniqueMeaningCountFromEntries(entries) {
  return new Set(entries.map((entry) => entry.meaning)).size;
}

function hasSufficientQuizEntries(entries) {
  return entries.length >= 2 && getUniqueMeaningCountFromEntries(entries) >= 2;
}

function getRemainingPracticeEntries() {
  return practiceEntries.filter((entry) => !masteredEntryKeys.has(getEntryKey(entry)));
}

function hasNextRoundAvailable() {
  return hasSufficientQuizEntries(getRemainingPracticeEntries());
}

function buildRoundEntries(availableEntries) {
  const carryEntries = [];
  const freshEntries = [];

  availableEntries.forEach((entry) => {
    if (carryOverWrongKeys.has(getEntryKey(entry))) {
      carryEntries.push(entry);
      return;
    }

    freshEntries.push(entry);
  });

  shuffleArray(carryEntries);
  shuffleArray(freshEntries);

  const roundEntries = [];
  const selectedKeys = new Set();

  [carryEntries, freshEntries].forEach((collection) => {
    collection.forEach((entry) => {
      const key = getEntryKey(entry);
      if (roundEntries.length >= ROUND_SIZE || selectedKeys.has(key)) {
        return;
      }

      roundEntries.push(entry);
      selectedKeys.add(key);
    });
  });

  if (getUniqueMeaningCountFromEntries(roundEntries) >= 2 || roundEntries.length < 2) {
    return roundEntries;
  }

  const fallbackEntry = availableEntries.find((entry) => (
    !selectedKeys.has(getEntryKey(entry)) &&
    entry.meaning !== roundEntries[0].meaning
  ));

  if (!fallbackEntry) {
    return roundEntries;
  }

  if (roundEntries.length < ROUND_SIZE) {
    roundEntries.push(fallbackEntry);
    return roundEntries;
  }

  roundEntries[roundEntries.length - 1] = fallbackEntry;
  return roundEntries;
}

function setGroupSelectorStatus(message, type) {
  if (!groupSelectorStatus) {
    return;
  }

  if (!message) {
    groupSelectorStatus.hidden = true;
    groupSelectorStatus.textContent = "";
    groupSelectorStatus.dataset.type = "";
    return;
  }

  groupSelectorStatus.hidden = false;
  groupSelectorStatus.textContent = message;
  groupSelectorStatus.dataset.type = type || "";
}

function triggerFlash(className) {
  app.classList.remove("flash-success", "flash-error");
  void app.offsetWidth;
  app.classList.add(className);
}

function showToast(message, type) {
  toast.textContent = message;
  toast.className = "toast show " + (type || "");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.className = "toast";
  }, 2200);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function supportsFileSystemAccess() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
}

function isUserCancelledFilePicker(error) {
  return Boolean(error && (error.name === "AbortError" || error.name === "SecurityError"));
}

async function saveWordsToPickedFile(text) {
  if (!activeWordFileHandle) {
    activeWordFileHandle = await window.showSaveFilePicker({
      ...JSON_FILE_PICKER_OPTIONS,
      suggestedName: "words.json"
    });
  }

  const permission = await ensureFileHandlePermission(activeWordFileHandle);
  if (!permission) {
    throw new Error("File write permission was not granted.");
  }

  const writable = await activeWordFileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function ensureFileHandlePermission(fileHandle) {
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

function getDesktopBridge() {
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

async function importWordsFromText(rawText, sourceInfo) {
  try {
    const imported = parseImportedWords(String(rawText || ""));
    replaceWordLibrary(imported);
    activeWordFileHandle = sourceInfo?.fileHandle || null;
    activeWordFilePath = sourceInfo?.filePath || "";
    showToast("Import successful.", "success");
  } catch (error) {
    showToast(error.message || "Import failed. Please check the JSON format.", "error");
  }
}

async function openImportPicker() {
  if (sessionActive) {
    showToast("Please exit the current test before importing words.", "error");
    return;
  }

  const desktopBridge = getDesktopBridge();
  if (desktopBridge?.openJsonFile) {
    try {
      const result = await desktopBridge.openJsonFile({
        title: "导入词库 JSON"
      });
      if (!result || result.canceled) {
        return;
      }

      await importWordsFromText(String(result.text || ""), {
        filePath: result.filePath || ""
      });
      return;
    } catch (error) {
      console.warn("Electron import failed, falling back to browser import:", error);
    }
  }

  if (supportsFileSystemAccess()) {
    try {
      const [fileHandle] = await window.showOpenFilePicker(JSON_FILE_PICKER_OPTIONS);
      const file = await fileHandle.getFile();
      await importWordsFromText(await file.text(), {
        fileHandle
      });
      return;
    } catch (error) {
      if (isUserCancelledFilePicker(error)) {
        return;
      }
      console.warn("文件选择器不可用，改为普通导入：", error);
    }
  }

  importFileInput.value = "";
  importFileInput.click();
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  await importWordsFromText(await file.text(), {});
}

async function exportWordsToFile() {
  const payload = {
    english: { groups: exportGroups("english") },
    russian: { groups: exportGroups("russian") }
  };

  if (payload.english.groups.length === 0 && payload.russian.groups.length === 0) {
    showToast("The library is empty, nothing to export.", "error");
    return;
  }

  const jsonText = JSON.stringify(payload, null, 2);
  const desktopBridge = getDesktopBridge();

  if (desktopBridge?.saveJsonFile) {
    try {
      const result = await desktopBridge.saveJsonFile({
        title: "导出词库 JSON",
        suggestedName: "words.json",
        filePath: activeWordFilePath,
        text: jsonText
      });

      if (!result || result.canceled) {
        return;
      }

      activeWordFilePath = result.filePath || "";
      showToast("Saved to a local JSON file.", "success");
      return;
    } catch (error) {
      console.warn("Electron export failed, falling back to browser export:", error);
    }
  }

  if (supportsFileSystemAccess()) {
    try {
      await saveWordsToPickedFile(jsonText);
      showToast("Saved to the selected JSON file.", "success");
      return;
    } catch (error) {
      if (isUserCancelledFilePicker(error)) {
        return;
      }
      console.warn("直接写入文件失败，改为下载导出：", error);
    }
  }

  const blob = new Blob([jsonText], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "words.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("Exported as words.json.", "success");
}

function generateId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function insertTextAtCursor(input, text) {
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

function deleteTextAtCursor(input) {
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

