import { addEntriesToGroup, collectEntriesFromGroups as collectEntriesFromGroupsInGroups, createNamedGroup, cloneGroup as cloneGroupFromLibrary, ensureValidActiveGroupId, findEntryInGroup, findGroup as findGroupInGroups, removeEntryFromGroup, removeGroup } from "./library.js";
import { deleteTextAtCursor as deleteTextAtCursorInInput, insertTextAtCursor as insertTextAtCursorInInput } from "./input.js";
import { parseManualEntries as parseManualEntriesFromManual } from "./manual.js";
import { buildOptionItems as buildOptionItemsFromQuiz, buildRoundEntries as buildRoundEntriesForRound, getEntryKey as getEntryKeyFromQuiz, getRemainingPracticeEntries as getRemainingPracticeEntriesForPractice, getWrongRecordKey as getWrongRecordKeyFromQuiz, hasNextRoundAvailable as hasNextRoundAvailableForPractice, hasSufficientQuizEntries as hasSufficientQuizEntriesFromQuiz, pickQuestionEntry as pickQuestionEntryForQuiz, shuffleArray as shuffleArrayFromQuiz } from "./quiz.js";
import { hideRoundCelebrationUI, playRoundCompletionRevealUI, renderCelebrationEffectUI, renderGroupSelectorUI, renderQuizOptionsUI, renderResultStatsUI, renderRoundProgressUI, renderWordColumnUI, renderWrongRecordsUI, syncGroupSelectOptions } from "./render.js";
import { applyAnswerState, createClearedPracticeState, createExitedSessionState, createPreparedRoundState, createRoundMetricsResetState, createStartedSessionState } from "./session.js";
import { playFinishPracticeSound, playRoundCompleteSound, playWrongAnswerSound } from "./sound.js";
import { buildWordLibraryPayload as buildWordLibraryPayloadFromStorage, loadWordBanksFromStorage, saveWordBanksToStorage } from "./storage.js";
import { exportWordsPayload, importWordsFromText as importWordsFromTransfer, openWordImportPicker } from "./transfer.js";

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

function applySessionState(nextState) {
  if ("currentMode" in nextState) currentMode = nextState.currentMode;
  if ("practiceEntries" in nextState) practiceEntries = nextState.practiceEntries;
  if ("currentQuizEntries" in nextState) currentQuizEntries = nextState.currentQuizEntries;
  if ("currentRoundPendingEntries" in nextState) currentRoundPendingEntries = nextState.currentRoundPendingEntries;
  if ("currentQuestionEntry" in nextState) currentQuestionEntry = nextState.currentQuestionEntry;
  if ("currentRoundSize" in nextState) currentRoundSize = nextState.currentRoundSize;
  if ("currentSelectedGroupIds" in nextState) currentSelectedGroupIds = nextState.currentSelectedGroupIds;
  if ("sessionActive" in nextState) sessionActive = nextState.sessionActive;
  if ("transitionLock" in nextState) transitionLock = nextState.transitionLock;
  if ("lastQuestionKey" in nextState) lastQuestionKey = nextState.lastQuestionKey;
  if ("answeredCountValue" in nextState) answeredCountValue = nextState.answeredCountValue;
  if ("correctCountValue" in nextState) correctCountValue = nextState.correctCountValue;
  if ("wrongCountValue" in nextState) wrongCountValue = nextState.wrongCountValue;
  if ("roundCelebrationVisible" in nextState) roundCelebrationVisible = nextState.roundCelebrationVisible;
  if ("masteredEntryKeys" in nextState) masteredEntryKeys = nextState.masteredEntryKeys;
  if ("carryOverWrongKeys" in nextState) carryOverWrongKeys = nextState.carryOverWrongKeys;
}

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

exitBtn.addEventListener("click", finishPracticeLoop);
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
    deleteTextAtCursorInInput(russianEntryInput);
    return;
  }

  insertTextAtCursorInInput(russianEntryInput, key.dataset.value || "");
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
  renderGroupSelectorUI({
    groups: getGroups(pendingGroupMode),
    label: wordBanks[pendingGroupMode].label,
    selection: pendingGroupSelection,
    titleElement: groupSelectorTitle,
    hintElement: groupSelectorHint,
    listElement: groupSelectorList,
    escapeHtml,
    onToggle(groupId, checked) {
      if (checked) {
        pendingGroupSelection.add(groupId);
      } else {
        pendingGroupSelection.delete(groupId);
      }

      if (pendingGroupSelection.size > 0) {
        setGroupSelectorStatus();
      }
    },
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

  if (!hasSufficientQuizEntriesFromQuiz(entries)) {
    setGroupSelectorStatus("Selected groups need at least 2 entries with 2 different meanings.", "error");
    showToast("Selected groups need at least 2 entries with 2 different meanings.", "error");
    return;
  }

  applySessionState(createStartedSessionState({
    mode: pendingGroupMode,
    selectedGroupIds,
    entries,
    shuffleEntries: shuffleArrayFromQuiz,
  }));
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
  applySessionState(createExitedSessionState());
  hideRoundCelebrationUI({
    overlayElement: roundCompleteOverlay,
    sceneElement: celebrationScene,
  });
  setLibraryActionsDisabled(false);
  renderWrongRecords();
  renderResultStats();
  renderRoundProgress();
  showView("result");
}

function prepareNextRound() {
  const nextRoundState = createPreparedRoundState({
    practiceEntries,
    masteredEntryKeys,
    carryOverWrongKeys,
    roundSize: ROUND_SIZE,
    getRemainingPracticeEntries: getRemainingPracticeEntriesForPractice,
    hasSufficientQuizEntries: hasSufficientQuizEntriesFromQuiz,
    buildRoundEntries: buildRoundEntriesForRound,
  });
  applySessionState(nextRoundState);

  if (!nextRoundState.canStart) {
    resetRoundSession();
    return false;
  }

  resetRoundSession();
  return nextRoundState.canStart;
}

function resetRoundSession() {
  wrongRecords.clear();
  applySessionState(createRoundMetricsResetState());
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
    !hasSufficientQuizEntriesFromQuiz(currentQuizEntries)
  ) {
    return;
  }

  playQuestionReveal();
  currentQuestionEntry = pickQuestionEntryForQuiz(currentRoundPendingEntries, lastQuestionKey);
  lastQuestionKey = getEntryKeyFromQuiz(currentQuestionEntry);
  questionWord.textContent = currentQuestionEntry.word;

  renderQuizOptionsUI({
    container: options,
    optionItems: buildOptionItemsFromQuiz(currentQuizEntries, currentQuestionEntry),
    onSelect(button, isCorrect) {
      handleOptionClick(button, isCorrect);
    },
  });
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
  const answerState = applyAnswerState({
    entry,
    isCorrect,
    currentRoundPendingEntries,
    answeredCountValue,
    correctCountValue,
    wrongCountValue,
    masteredEntryKeys,
    carryOverWrongKeys,
    getEntryKey: getEntryKeyFromQuiz,
  });

  if (isCorrect) {
    button.classList.add("correct");
    triggerFlash("flash-success");
  } else {
    button.classList.add("incorrect");
    if (correctButton) {
      correctButton.classList.add("correct");
    }
    recordWrongWord(entry);
    renderWrongRecords();
    triggerFlash("flash-error");
    playWrongAnswerSound();
  }

  applySessionState(answerState);
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

function recordWrongWord(entry) {
  const key = getWrongRecordKeyFromQuiz(entry);
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
  renderWrongRecordsUI({
    records: wrongRecords,
    listElement: wrongList,
    emptyElement: wrongEmptyState,
    escapeHtml,
  });
}

function renderResultStats() {
  renderResultStatsUI({
    answeredCountElement: answeredCount,
    correctCountElement: correctCount,
    wrongCountElement: wrongCount,
    resultTitleElement: resultTitle,
    answeredCountValue,
    correctCountValue,
    wrongCountValue,
    resultLabel: wordBanks[currentMode].label,
  });
}

function renderRoundProgress() {
  renderRoundProgressUI({
    roundProgressElement: roundProgress,
    currentRoundSize,
    answeredCountValue,
    sessionActive,
    roundCelebrationVisible,
  });
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

  const hasNextRound = hasNextRoundAvailableForPractice(practiceEntries, masteredEntryKeys);
  roundContinueBtn.hidden = !hasNextRound;
  if (!hasNextRound) {
    roundContinuePrompt.textContent = "Current practice words are finished.";
  }

  renderCelebrationEffectUI({
    sceneElement: celebrationScene,
    effects: CELEBRATION_EFFECTS,
  });
  roundCompleteOverlay.hidden = false;
  playRoundCompleteSound();
  playRoundCompletionRevealUI({
    overlayElement: roundCompleteOverlay,
    revealItems: [
      roundCompleteTitle,
      roundCorrectLine,
      roundWrongLine,
      roundAccuracyLine,
      roundContinuePrompt,
      roundActions,
    ],
  });
}

function continueNextRound() {
  if (!sessionActive) {
    return;
  }

  roundCelebrationVisible = false;
  hideRoundCelebrationUI({
    overlayElement: roundCompleteOverlay,
    sceneElement: celebrationScene,
  });

  if (!prepareNextRound()) {
    finishPracticeLoop();
    return;
  }

  nextQuestion();
}

function finishPracticeLoop() {
  roundCelebrationVisible = false;
  playFinishPracticeSound();
  exitQuiz();
}

function getModeLabel(mode) { return wordBanks[mode].label; }

function getActiveGroup(mode) { return findGroupInGroups(getGroups(mode), activeLibraryGroupIds[mode]); }

function createGroupFromInput(mode) {
  if (blockIfSessionActive("editing the library")) {
    return;
  }

  const input = getGroupNameInput(mode);
  const { error, group, name } = createNamedGroup(getGroups(mode), input.value);
  if (error === "empty") {
    showToast("Please enter a group name first.", "error");
    return;
  }
  if (error === "duplicate") {
    showToast("This group name already exists.", "error");
    return;
  }

  activeLibraryGroupIds[mode] = group.id;
  input.value = "";
  persistLibraryState();
  showToast("Created " + getModeLabel(mode) + " group: " + name, "success");
}

function addManualEntries(mode) {
  if (blockIfSessionActive("editing the library")) {
    return;
  }

  const group = getActiveGroup(mode);
  if (!group) {
    showToast("Please create and select a " + getModeLabel(mode) + " group first.", "error");
    return;
  }

  const input = getEntryInput(mode);
  let entries = [];

  try {
    entries = parseManualEntriesFromManual(input.value, getModeLabel(mode));
  } catch (error) {
    showToast(error.message || "Invalid word format. Please check and try again.", "error");
    return;
  }

  if (entries.length === 0) {
    showToast("Please enter " + getModeLabel(mode) + " words and meanings.", "error");
    return;
  }

  const addedCount = addEntriesToGroup(getGroups(mode), group.id, entries);

  input.value = "";
  persistLibraryState();

  if (addedCount === 0) {
    showToast("These entries already exist in the current group.", "error");
    return;
  }

  showToast("Added " + addedCount + " " + getModeLabel(mode) + " entries.", "success");
}

function clearWords() {
  if (blockIfSessionActive("clearing the library")) {
    return;
  }

  resetBank("english");
  resetBank("russian");
  wrongRecords.clear();
  applySessionState(createClearedPracticeState());
  activeLibraryGroupIds.english = "";
  activeLibraryGroupIds.russian = "";
  persistLibraryState();
  showToast("English and Russian libraries have been cleared.", "success");
}

function renderWordsView() { renderWordColumn("english", englishWordsList, englishWordsEmpty); renderWordColumn("russian", russianWordsList, russianWordsEmpty); }

function renderWordColumn(mode, listElement, emptyElement) {
  renderWordColumnUI({
    groups: getGroups(mode),
    locale: wordBanks[mode].locale,
    listElement,
    emptyElement,
    escapeHtml,
    onDeleteEntry(groupId, entryId) {
      deleteWordEntry(mode, groupId, entryId);
    },
  });
}

function deleteWordEntry(mode, groupId, entryId) {
  if (blockIfSessionActive("editing the library")) {
    return;
  }

  const { group, entry } = findEntryInGroup(getGroups(mode), groupId, entryId);
  if (!group) {
    showToast("Target group not found.", "error");
    return;
  }

  if (!entry) {
    showToast("Entry to delete was not found.", "error");
    return;
  }
  const confirmed = window.confirm("要删除这条单词吗？\n\n" + entry.word + " - " + entry.meaning);
  if (!confirmed) {
    return;
  }
  removeEntryFromGroup(getGroups(mode), groupId, entryId);
  wrongRecords.delete(getWrongRecordKeyFromQuiz(entry));
  persistLibraryState();
  showToast("Deleted 1 " + getModeLabel(mode) + " entry.", "success");
}

function deleteGroup(mode, groupId) {
  if (blockIfSessionActive("editing the library")) {
    return;
  }

  const groups = getGroups(mode);
  const group = findGroupInGroups(groups, groupId);
  if (!group) {
    return;
  }
  const confirmed = window.confirm("Delete this group?\n\n" + group.name + "\n\nAll words in this group will also be deleted.");
  if (!confirmed) {
    return;
  }
  removeGroup(groups, groupId);
  ensureValidActiveGroup(mode);
  persistLibraryState();
  showToast("已删除分组：" + group.name, "success");
}

function loadSavedWords() {
  try {
    const groupsByMode = loadWordBanksFromStorage(STORAGE_KEY, {
      defaultGroupName: DEFAULT_GROUP_NAME,
      englishLabel: wordBanks.english.label,
      russianLabel: wordBanks.russian.label,
    });
    if (!groupsByMode) {
      return;
    }

    wordBanks.english.groups = groupsByMode.english;
    wordBanks.russian.groups = groupsByMode.russian;
  } catch (error) {
    console.warn("Failed to load word library:", error);
  } finally {
    ensureValidActiveGroup("english");
    ensureValidActiveGroup("russian");
  }
}

function syncLibrarySelectors() { syncGroupSelect("english", englishGroupSelect); syncGroupSelect("russian", russianGroupSelect); }

function syncGroupSelect(mode, selectElement) {
  const groups = getGroups(mode);
  ensureValidActiveGroup(mode);
  syncGroupSelectOptions({
    groups,
    selectElement,
    currentGroupId: activeLibraryGroupIds[mode],
    emptyText: "请先创建分组",
  });
}

function renderGroupPreview(mode, container) {
  renderWordColumnUI({
    groups: getGroups(mode),
    activeGroupId: activeLibraryGroupIds[mode],
    container,
    renderPreview: true,
    escapeHtml,
    onSelectGroup(groupId) {
      setActiveLibraryGroup(mode, groupId);
    },
    onDeleteGroup(groupId) {
      deleteGroup(mode, groupId);
    },
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

function resetBank(mode) { wordBanks[mode].groups = []; }

function collectEntriesFromGroups(mode, groupIds) { return collectEntriesFromGroupsInGroups(getGroups(mode), groupIds); }

function getGroups(mode) { return wordBanks[mode].groups; }

function setActiveLibraryGroup(mode, groupId) { activeLibraryGroupIds[mode] = groupId; refreshAllDisplays(); }

function ensureValidActiveGroup(mode) { activeLibraryGroupIds[mode] = ensureValidActiveGroupId(getGroups(mode), activeLibraryGroupIds[mode]); }

function replaceWordLibrary(payload) {
  resetBank("english");
  resetBank("russian");
  wrongRecords.clear();
  applySessionState(createClearedPracticeState());

  wordBanks.english.groups = payload.english.map(cloneGroupFromLibrary);
  wordBanks.russian.groups = payload.russian.map(cloneGroupFromLibrary);

  ensureValidActiveGroup("english");
  ensureValidActiveGroup("russian");
  persistLibraryState();
}

function getGroupNameInput(mode) { return mode === "english" ? englishGroupNameInput : russianGroupNameInput; }

function getEntryInput(mode) { return mode === "english" ? englishEntryInput : russianEntryInput; }

function playQuestionReveal() {
  questionCard.classList.remove("question-enter");
  void questionCard.offsetWidth;
  questionCard.classList.add("question-enter");
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function importWordsFromText(rawText, sourceInfo) {
  await importWordsFromTransfer(rawText, sourceInfo, {
    importedGroupName: IMPORTED_GROUP_NAME,
    englishLabel: wordBanks.english.label,
    russianLabel: wordBanks.russian.label,
    replaceWordLibrary,
    setFileContext: updateWordFileContext,
    showToast,
  });
}

async function openImportPicker() {
  if (blockIfSessionActive("importing words")) {
    return;
  }

  await openWordImportPicker({
    pickerOptions: JSON_FILE_PICKER_OPTIONS,
    fileInput: importFileInput,
    onImportText: importWordsFromText,
  });
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  await importWordsFromText(await file.text(), {});
}

function buildCurrentLibraryPayload() {
  return buildWordLibraryPayloadFromStorage({
    english: getGroups("english"),
    russian: getGroups("russian"),
  });
}

async function exportWordsToFile() {
  await exportWordsPayload(buildCurrentLibraryPayload(), {
    pickerOptions: JSON_FILE_PICKER_OPTIONS,
    activeFileHandle: activeWordFileHandle,
    activeFilePath: activeWordFilePath,
    setFileContext: updateWordFileContext,
    showToast,
  });
}

function blockIfSessionActive(action) { if (!sessionActive) return false; showToast("Please exit the current test before " + action + ".", "error"); return true; }

function updateWordFileContext(context) { activeWordFileHandle = context.fileHandle ?? null; activeWordFilePath = context.filePath || ""; }

function persistLibraryState() { saveWordBanksToStorage(STORAGE_KEY, { english: getGroups("english"), russian: getGroups("russian") }); refreshAllDisplays(); }


