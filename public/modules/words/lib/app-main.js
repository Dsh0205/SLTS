import { addEntriesToGroup, collectEntriesFromGroups as collectEntriesFromGroupsInGroups, createNamedGroup, cloneGroup as cloneGroupFromLibrary, ensureValidActiveGroupId, findEntryInGroup, findGroup as findGroupInGroups, removeEntryFromGroup, removeGroup } from "./library.js";
import { deleteTextAtCursor as deleteTextAtCursorInInput, insertTextAtCursor as insertTextAtCursorInInput } from "./input.js";
import { parseManualEntries as parseManualEntriesFromManual } from "./manual.js";
import { addEntryToNotebook, createEmptyWordNotebook, hasNotebookEntry, normalizeWordNotebook, pruneWordNotebook, removeNotebookEntry } from "./notebook.js";
import { buildGroupProgressMap, buildGroupProgressSummary, createEmptyWordProgress, getMasteredProgressKeys, getWrongProgressKeys, normalizeWordProgress, pruneWordProgress, updateWordProgress } from "./progress.js";
import { buildOptionItems as buildOptionItemsFromQuiz, buildRoundEntries as buildRoundEntriesForRound, getEntryKey as getEntryKeyFromQuiz, getRemainingPracticeEntries as getRemainingPracticeEntriesForPractice, getWrongRecordKey as getWrongRecordKeyFromQuiz, hasNextRoundAvailable as hasNextRoundAvailableForPractice, hasSufficientQuizEntries as hasSufficientQuizEntriesFromQuiz, pickQuestionEntry as pickQuestionEntryForQuiz, shuffleArray as shuffleArrayFromQuiz } from "./quiz.js";
import { hideRoundCelebrationUI, playRoundCompletionRevealUI, renderCelebrationEffectUI, renderGroupProgressPanelUI, renderGroupSelectorUI, renderNotebookEntriesUI, renderQuizOptionsUI, renderResultStatsUI, renderRoundProgressUI, renderWordColumnUI, renderWrongRecordsUI, syncGroupSelectOptions } from "./render.js";
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

let wordProgress = createEmptyWordProgress();
let wordNotebook = createEmptyWordNotebook();
const wrongRecords = new Map();

let currentMode = "english";
let practiceEntries = [];
let currentQuizEntries = [];
let currentRoundPendingEntries = [];
let currentQuestionEntry = null;
let visibleQuestionEntry = null;
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
let wordsSearchQuery = "";
let notebookSearchQuery = "";
let currentPracticeSource = "library";
let currentPracticeLabel = wordBanks.english.label;
let lastPracticeSource = "library";
let lastPracticeMode = "english";

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
  syncQuizDeleteButtonState();
}

const app = document.getElementById("app");
const toast = document.getElementById("toast");

const homeView = document.getElementById("homeView");
const modeSelectView = document.getElementById("modeSelectView");
const quizView = document.getElementById("quizView");
const resultView = document.getElementById("resultView");
const libraryView = document.getElementById("libraryView");
const notebookView = document.getElementById("notebookView");
const wordsView = document.getElementById("wordsView");

const homeStartBtn = document.getElementById("homeStartBtn");
const homeLibraryBtn = document.getElementById("homeLibraryBtn");
const homeNotebookBtn = document.getElementById("homeNotebookBtn");
const englishModeBtn = document.getElementById("englishModeBtn");
const russianModeBtn = document.getElementById("russianModeBtn");
const libraryHomeBtn = document.getElementById("libraryHomeBtn");
const notebookLibraryBtn = document.getElementById("notebookLibraryBtn");
const notebookHomeBtn = document.getElementById("notebookHomeBtn");
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
const englishProgressBody = document.getElementById("englishProgressBody");
const englishProgressEmpty = document.getElementById("englishProgressEmpty");
const englishProgressStats = document.getElementById("englishProgressStats");
const englishMasteredList = document.getElementById("englishMasteredList");
const englishMasteredEmpty = document.getElementById("englishMasteredEmpty");
const englishWrongProgressList = document.getElementById("englishWrongProgressList");
const englishWrongProgressEmpty = document.getElementById("englishWrongProgressEmpty");
const russianProgressBody = document.getElementById("russianProgressBody");
const russianProgressEmpty = document.getElementById("russianProgressEmpty");
const russianProgressStats = document.getElementById("russianProgressStats");
const russianMasteredList = document.getElementById("russianMasteredList");
const russianMasteredEmpty = document.getElementById("russianMasteredEmpty");
const russianWrongProgressList = document.getElementById("russianWrongProgressList");
const russianWrongProgressEmpty = document.getElementById("russianWrongProgressEmpty");

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
const wordsSearchInput = document.getElementById("wordsSearchInput");
const notebookSearchInput = document.getElementById("notebookSearchInput");
const englishNotebookInfo = document.getElementById("englishNotebookInfo");
const russianNotebookInfo = document.getElementById("russianNotebookInfo");
const englishNotebookList = document.getElementById("englishNotebookList");
const russianNotebookList = document.getElementById("russianNotebookList");
const englishNotebookEmpty = document.getElementById("englishNotebookEmpty");
const russianNotebookEmpty = document.getElementById("russianNotebookEmpty");
const englishNotebookStartBtn = document.getElementById("englishNotebookStartBtn");
const russianNotebookStartBtn = document.getElementById("russianNotebookStartBtn");

const exitBtn = document.getElementById("exitBtn");
const favoriteCurrentWordBtn = document.getElementById("favoriteCurrentWordBtn");
const deleteCurrentWordBtn = document.getElementById("deleteCurrentWordBtn");
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
syncQuizDeleteButtonState();
syncResultRestartButton();
showView("home");

homeStartBtn.addEventListener("click", () => showView("mode"));
homeLibraryBtn.addEventListener("click", () => showView("library"));
homeNotebookBtn.addEventListener("click", () => showView("notebook"));
englishModeBtn.addEventListener("click", () => openGroupSelector("english"));
russianModeBtn.addEventListener("click", () => openGroupSelector("russian"));
libraryHomeBtn.addEventListener("click", () => showView("home"));
notebookLibraryBtn.addEventListener("click", () => showView("library"));
notebookHomeBtn.addEventListener("click", () => showView("home"));
resultRestartBtn.addEventListener("click", restartPracticeFromResult);
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
wordsSearchInput.addEventListener("input", () => updateWordsSearchQuery(wordsSearchInput.value));
notebookSearchInput.addEventListener("input", () => updateNotebookSearchQuery(notebookSearchInput.value));
englishNotebookStartBtn.addEventListener("click", () => startNotebookPractice("english"));
russianNotebookStartBtn.addEventListener("click", () => startNotebookPractice("russian"));

exitBtn.addEventListener("click", finishPracticeLoop);
favoriteCurrentWordBtn.addEventListener("click", addCurrentWordToNotebook);
deleteCurrentWordBtn.addEventListener("click", deleteCurrentQuestionEntry);
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
  notebookView.classList.toggle("active", viewName === "notebook");
  wordsView.classList.toggle("active", viewName === "words");

  if (viewName === "library" || viewName === "words" || viewName === "notebook") {
    refreshAllDisplays();
  }

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
  renderGroupProgressDetails("english");
  renderGroupProgressDetails("russian");
  renderWrongRecords();
  renderResultStats();
  renderRoundProgress();
  renderWordsView();
  renderNotebookView();
  syncResultRestartButton();
}

function setPracticeContext(source, mode) {
  currentPracticeSource = source;
  currentPracticeLabel = source === "notebook"
    ? wordBanks[mode].label + "生词本"
    : wordBanks[mode].label;
  lastPracticeSource = source;
  lastPracticeMode = mode;
  syncResultRestartButton();
}

function syncResultRestartButton() {
  resultRestartBtn.textContent = lastPracticeSource === "notebook" ? "再测生词本" : "再测一次";
}

function restartPracticeFromResult() {
  if (lastPracticeSource === "notebook") {
    if (!startNotebookPractice(lastPracticeMode)) {
      showView("notebook");
    }
    return;
  }

  showView("mode");
}

function startNotebookPractice(mode) {
  const entries = getNotebookEntries(mode);
  if (entries.length === 0) {
    showToast(wordBanks[mode].label + "生词本还是空的，先在测试里点星星收录单词。", "error");
    showView("notebook");
    return false;
  }

  if (!hasSufficientQuizEntriesFromQuiz(entries)) {
    showToast(wordBanks[mode].label + "生词本里的单词还不足以开始测试，至少需要 2 个不同释义。", "error");
    showView("notebook");
    return false;
  }

  setPracticeContext("notebook", mode);
  applySessionState(createStartedSessionState({
    mode,
    selectedGroupIds: [],
    entries,
    shuffleEntries: shuffleArrayFromQuiz,
    masteredEntryKeys: new Set(),
    carryOverWrongKeys: new Set(),
  }));
  setLibraryActionsDisabled(true);
  showView("quiz");

  if (!prepareNextRound()) {
    exitQuiz();
    showToast("生词本里可用于测试的单词不足。", "error");
    return false;
  }

  nextQuestion();
  return true;
}

function openGroupSelector(mode) {
  const groups = getGroups(mode);
  const progressMap = getGroupProgressMapForMode(mode);
  const availableGroups = groups.filter((group) => isGroupReadyForPractice(group, progressMap[group.id]));

  if (groups.length === 0) {
    showToast("Please create a group in the " + wordBanks[mode].label + " library first.", "error");
    showView("library");
    return;
  }

  if (availableGroups.length === 0) {
    showToast("\u8fd9\u4e2a\u8bcd\u5e93\u91cc\u53ef\u7ee7\u7eed\u7ec3\u4e60\u7684\u672a\u80cc\u5355\u8bcd\u5df2\u7ecf\u4e0d\u8db3\u4e86\u3002", "error");
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
  const progressMap = getGroupProgressMapForMode(pendingGroupMode);
  renderGroupSelectorUI({
    groups: getGroups(pendingGroupMode),
    label: wordBanks[pendingGroupMode].label,
    selection: pendingGroupSelection,
    titleElement: groupSelectorTitle,
    hintElement: groupSelectorHint,
    listElement: groupSelectorList,
    escapeHtml,
    getGroupDescription(group) {
      const progress = progressMap[group.id];
      return "\u5f85\u80cc " + progress.remainingCount + " \u00b7 \u5df2\u80cc " + progress.masteredCount + " / " + progress.totalCount + " \u00b7 \u9519\u8bcd " + progress.wrongCount;
    },
    isGroupSelectable(group) {
      return isGroupReadyForPractice(group, progressMap[group.id]);
    },
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
  const progressMap = getGroupProgressMapForMode(pendingGroupMode);
  pendingGroupSelection = new Set(
    getGroups(pendingGroupMode)
      .filter((group) => isGroupReadyForPractice(group, progressMap[group.id]))
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
  const persistedMasteredKeys = getMasteredProgressKeys(wordProgress, pendingGroupMode, entries);
  const persistedWrongKeys = getWrongProgressKeys(wordProgress, pendingGroupMode, entries);
  const remainingEntries = getRemainingPracticeEntriesForPractice(entries, persistedMasteredKeys);

  if (selectedGroupIds.length === 0) {
    setGroupSelectorStatus("Please select at least one group that contains words.", "error");
    showToast("Please select at least one group.", "error");
    return;
  }

  if (!hasSufficientQuizEntriesFromQuiz(remainingEntries)) {
    setGroupSelectorStatus("\u6240\u9009\u5206\u7ec4\u91cc\u672a\u80cc\u5355\u8bcd\u4e0d\u8db3 2 \u4e2a\uff0c\u6216\u91ca\u4e49\u4e0d\u8db3\u4ee5\u51fa\u9898\u3002", "error");
    showToast("\u6240\u9009\u5206\u7ec4\u91cc\u672a\u80cc\u5355\u8bcd\u4e0d\u8db3 2 \u4e2a\uff0c\u8bf7\u5148\u6dfb\u52a0\u65b0\u8bcd\u6216\u66f4\u6362\u5206\u7ec4\u3002", "error");
    return;
  }

  setPracticeContext("library", pendingGroupMode);
  applySessionState(createStartedSessionState({
    mode: pendingGroupMode,
    selectedGroupIds,
    entries,
    shuffleEntries: shuffleArrayFromQuiz,
    masteredEntryKeys: persistedMasteredKeys,
    carryOverWrongKeys: persistedWrongKeys,
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
  visibleQuestionEntry = null;
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
  visibleQuestionEntry = null;
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
  visibleQuestionEntry = currentQuestionEntry;
  lastQuestionKey = getEntryKeyFromQuiz(currentQuestionEntry);
  questionWord.textContent = currentQuestionEntry.word;

  renderQuizOptionsUI({
    container: options,
    optionItems: buildOptionItemsFromQuiz(currentQuizEntries, currentQuestionEntry),
    onSelect(button, isCorrect) {
      handleOptionClick(button, isCorrect);
    },
  });
  syncQuizDeleteButtonState();
}

function handleOptionClick(button, isCorrect) {
  if (!sessionActive || transitionLock || !currentQuestionEntry) {
    return;
  }

  transitionLock = true;
  syncQuizDeleteButtonState();
  const optionButtons = Array.from(document.querySelectorAll(".option-btn"));
  optionButtons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add("show-word");
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
  wordProgress = updateWordProgress(wordProgress, currentMode, entry, isCorrect);
  persistLibraryState({ skipRefresh: true });

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
    syncQuizDeleteButtonState();
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
    resultLabel: currentPracticeLabel,
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
  syncQuizDeleteButtonState();
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
  syncQuizDeleteButtonState();
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
  syncQuizDeleteButtonState();
  playFinishPracticeSound();
  exitQuiz();
}

function getModeLabel(mode) { return wordBanks[mode].label; }

function getActiveGroup(mode) { return findGroupInGroups(getGroups(mode), activeLibraryGroupIds[mode]); }

function formatDuplicateEntriesMessage(mode, duplicateEntries) {
  if (!Array.isArray(duplicateEntries) || duplicateEntries.length === 0) {
    return "";
  }

  if (mode === "english") {
    const uniqueWords = Array.from(new Set(
      duplicateEntries
        .map((entry) => String(entry?.word || "").trim())
        .filter(Boolean)
    ));

    if (uniqueWords.length === 0) {
      return "当前分组里已有重复英文单词。";
    }

    const preview = uniqueWords.slice(0, 5).join("、");
    if (uniqueWords.length > 5) {
      return `重复英文单词：${preview} 等 ${uniqueWords.length} 个`;
    }

    return `重复英文单词：${preview}`;
  }

  return "这些词条已存在于当前分组。";
}

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

  const { addedCount, duplicateEntries } = addEntriesToGroup(getGroups(mode), group.id, entries, {
    matchWordOnly: mode === "english",
  });
  const duplicateMessage = formatDuplicateEntriesMessage(mode, duplicateEntries);

  if (addedCount > 0) {
    input.value = "";
    persistLibraryState();
  }

  if (addedCount === 0 && duplicateMessage) {
    showToast(duplicateMessage, "error");
    return;
  }

  if (duplicateMessage) {
    showToast(`已添加 ${addedCount} 个；${duplicateMessage}`, "error");
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
  wordProgress = createEmptyWordProgress();
  wordNotebook = createEmptyWordNotebook();
  wrongRecords.clear();
  visibleQuestionEntry = null;
  applySessionState(createClearedPracticeState());
  activeLibraryGroupIds.english = "";
  activeLibraryGroupIds.russian = "";
  persistLibraryState();
  showToast("English and Russian libraries have been cleared.", "success");
}

function renderWordsView() { renderWordColumn("english", englishWordsList, englishWordsEmpty); renderWordColumn("russian", russianWordsList, russianWordsEmpty); }

function renderNotebookView() {
  renderNotebookColumn("english", {
    infoElement: englishNotebookInfo,
    listElement: englishNotebookList,
    emptyElement: englishNotebookEmpty,
    startButton: englishNotebookStartBtn,
  });
  renderNotebookColumn("russian", {
    infoElement: russianNotebookInfo,
    listElement: russianNotebookList,
    emptyElement: russianNotebookEmpty,
    startButton: russianNotebookStartBtn,
  });
}

function renderNotebookColumn(mode, { infoElement, listElement, emptyElement, startButton }) {
  const entries = getFilteredNotebookEntries(mode);
  const totalEntries = getNotebookEntries(mode);
  const sortedEntries = entries
    .slice()
    .sort((left, right) => left.word.localeCompare(right.word, wordBanks[mode].locale));

  infoElement.textContent = getNotebookInfoText(mode, totalEntries);
  startButton.disabled = sessionActive || !hasSufficientQuizEntriesFromQuiz(totalEntries);

  renderNotebookEntriesUI({
    entries: sortedEntries,
    listElement,
    emptyElement,
    emptyText: getNotebookEmptyText(mode),
    escapeHtml,
    onDeleteEntry(entryId) {
      deleteNotebookEntry(mode, entryId);
    },
  });
}

function renderWordColumn(mode, listElement, emptyElement) {
  emptyElement.textContent = getWordsEmptyText(mode);
  renderWordColumnUI({
    groups: getFilteredGroupsForWordsView(mode),
    locale: wordBanks[mode].locale,
    listElement,
    emptyElement,
    escapeHtml,
    groupProgressMap: getGroupProgressMapForMode(mode),
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

function addCurrentWordToNotebook() {
  const entry = visibleQuestionEntry || currentQuestionEntry;
  if (!sessionActive || roundCelebrationVisible || !entry) {
    return;
  }

  if (hasNotebookEntry(wordNotebook, currentMode, entry)) {
    showToast("这个单词已经在生词本里了。", "error");
    return;
  }

  const result = addEntryToNotebook(wordNotebook, currentMode, entry);
  if (!result.added) {
    showToast("这个单词已经在生词本里了。", "error");
    return;
  }

  persistLibraryState({ skipRefresh: true });
  renderNotebookView();
  showToast("已加入" + getModeLabel(currentMode) + "生词本。", "success");
}

function deleteNotebookEntry(mode, entryId) {
  if (blockIfSessionActive("editing the notebook")) {
    return;
  }

  const targetEntry = getNotebookEntries(mode).find((entry) => entry.id === entryId);
  if (!targetEntry) {
    showToast("生词本里的这个单词没有找到。", "error");
    return;
  }

  const confirmed = window.confirm("要将这个单词移出生词本吗？\n\n" + targetEntry.word + " - " + targetEntry.meaning);
  if (!confirmed) {
    return;
  }

  const { removed } = removeNotebookEntry(wordNotebook, mode, entryId);
  if (!removed) {
    showToast("生词本里的这个单词没有找到。", "error");
    return;
  }

  persistLibraryState();
  showToast("已将单词移出生词本。", "success");
}

function deleteCurrentQuestionEntry() {
  if (!sessionActive || transitionLock || roundCelebrationVisible || !currentQuestionEntry) {
    return;
  }

  const entry = currentQuestionEntry;
  const confirmed = window.confirm(
    "\u786e\u5b9a\u8981\u4ece\u8bcd\u5e93\u5220\u9664\u8fd9\u4e2a\u5355\u8bcd\u5417\uff1f\n\n" +
    entry.word +
    " - " +
    entry.meaning
  );
  if (!confirmed) {
    return;
  }

  const removedCount = removeMatchingLibraryEntries(currentMode, entry);
  if (removedCount === 0) {
    showToast("\u8fd9\u4e2a\u5355\u8bcd\u5df2\u4e0d\u5728\u8bcd\u5e93\u91cc\u4e86\u3002", "error");
    return;
  }

  const entryKey = getEntryKeyFromQuiz(entry);
  const nextPracticeEntries = removeEntryKeyFromEntries(practiceEntries, entryKey);
  const nextCurrentQuizEntries = removeEntryKeyFromEntries(currentQuizEntries, entryKey);
  const nextCurrentRoundPendingEntries = removeEntryKeyFromEntries(currentRoundPendingEntries, entryKey);
  const nextMasteredEntryKeys = new Set(masteredEntryKeys);
  const nextCarryOverWrongKeys = new Set(carryOverWrongKeys);
  nextMasteredEntryKeys.delete(entryKey);
  nextCarryOverWrongKeys.delete(entryKey);
  wrongRecords.delete(getWrongRecordKeyFromQuiz(entry));
  visibleQuestionEntry = null;

  const canContinueCurrentRound =
    nextCurrentRoundPendingEntries.length > 0 &&
    hasSufficientQuizEntriesFromQuiz(nextCurrentQuizEntries);

  applySessionState({
    practiceEntries: nextPracticeEntries,
    currentQuizEntries: canContinueCurrentRound ? nextCurrentQuizEntries : [],
    currentRoundPendingEntries: canContinueCurrentRound ? nextCurrentRoundPendingEntries : [],
    currentQuestionEntry: null,
    currentRoundSize: canContinueCurrentRound ? nextCurrentQuizEntries.length : answeredCountValue,
    lastQuestionKey: "",
    masteredEntryKeys: nextMasteredEntryKeys,
    carryOverWrongKeys: nextCarryOverWrongKeys,
  });
  persistLibraryState({ skipRefresh: true });

  if (canContinueCurrentRound) {
    showToast("\u5df2\u4ece\u8bcd\u5e93\u5220\u9664\u5f53\u524d\u5355\u8bcd\u3002", "success");
    nextQuestion();
    return;
  }

  if (answeredCountValue === 0 && prepareNextRound()) {
    showToast("\u5df2\u5220\u9664\u5f53\u524d\u5355\u8bcd\uff0c\u5df2\u81ea\u52a8\u91cd\u65b0\u751f\u6210\u9898\u76ee\u3002", "success");
    nextQuestion();
    return;
  }

  if (hasNextRoundAvailableForPractice(practiceEntries, masteredEntryKeys)) {
    showToast("\u5df2\u5220\u9664\u5f53\u524d\u5355\u8bcd\uff0c\u8fd9\u4e00\u8f6e\u6d4b\u8bd5\u5df2\u81ea\u52a8\u7ed3\u675f\u3002", "success");
    showRoundCompletion();
    return;
  }

  showToast("\u5df2\u5220\u9664\u5f53\u524d\u5355\u8bcd\uff0c\u5269\u4f59\u5355\u8bcd\u4e0d\u8db3\u4ee5\u7ee7\u7eed\u6d4b\u8bd5\u3002", "success");
  finishPracticeLoop();
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
    wordProgress = pruneWordProgress(
      normalizeWordProgress(groupsByMode.progress),
      { english: groupsByMode.english, russian: groupsByMode.russian }
    );
    wordNotebook = pruneWordNotebook(
      normalizeWordNotebook(groupsByMode.notebook),
      { english: groupsByMode.english, russian: groupsByMode.russian }
    );
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
    groupProgressMap: getGroupProgressMapForMode(mode),
    onSelectGroup(groupId) {
      setActiveLibraryGroup(mode, groupId);
    },
    onDeleteGroup(groupId) {
      deleteGroup(mode, groupId);
    },
  });
}

function renderGroupProgressDetails(mode) {
  const group = getActiveGroup(mode);
  const summary = buildGroupProgressSummary(group, wordProgress, mode);
  const isEnglish = mode === "english";

  renderGroupProgressPanelUI({
    group,
    summary,
    bodyElement: isEnglish ? englishProgressBody : russianProgressBody,
    emptyElement: isEnglish ? englishProgressEmpty : russianProgressEmpty,
    statsElement: isEnglish ? englishProgressStats : russianProgressStats,
    masteredListElement: isEnglish ? englishMasteredList : russianMasteredList,
    masteredEmptyElement: isEnglish ? englishMasteredEmpty : russianMasteredEmpty,
    wrongListElement: isEnglish ? englishWrongProgressList : russianWrongProgressList,
    wrongEmptyElement: isEnglish ? englishWrongProgressEmpty : russianWrongProgressEmpty,
    escapeHtml,
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
    russianGroupSelect,
    englishNotebookStartBtn,
    russianNotebookStartBtn
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

function getNotebookEntries(mode) { return wordNotebook[mode]; }

function getGroupProgressMapForMode(mode) {
  return buildGroupProgressMap(getGroups(mode), wordProgress, mode);
}

function isGroupReadyForPractice(group, progress) {
  return group.entries.length > 0 && Boolean(progress) && progress.remainingCount > 0;
}

function getFilteredGroupsForWordsView(mode) {
  const groups = getGroups(mode);
  if (!wordsSearchQuery) {
    return groups;
  }

  return groups
    .map((group) => {
      const groupNameMatches = normalizeSearchQuery(group.name).includes(wordsSearchQuery);
      const entries = groupNameMatches
        ? group.entries.slice()
        : group.entries.filter((entry) => matchesWordsSearch(group, entry));

      if (entries.length === 0) {
        return null;
      }

      return {
        ...group,
        entries,
      };
    })
    .filter(Boolean);
}

function getFilteredNotebookEntries(mode) {
  const entries = getNotebookEntries(mode);
  if (!notebookSearchQuery) {
    return entries;
  }

  return entries.filter((entry) => (
    normalizeSearchQuery(entry.word).includes(notebookSearchQuery) ||
    normalizeSearchQuery(entry.meaning).includes(notebookSearchQuery)
  ));
}

function matchesWordsSearch(group, entry) {
  return (
    normalizeSearchQuery(group.name).includes(wordsSearchQuery) ||
    normalizeSearchQuery(entry.word).includes(wordsSearchQuery) ||
    normalizeSearchQuery(entry.meaning).includes(wordsSearchQuery)
  );
}

function getWordsEmptyText(mode) {
  if (wordsSearchQuery) {
    return getModeLabel(mode) + "\u8bcd\u5e93\u91cc\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u5355\u8bcd\u3002";
  }

  return mode === "english"
    ? "\u82f1\u8bed\u8bcd\u5e93\u8fd8\u662f\u7a7a\u7684\u3002"
    : "\u4fc4\u8bed\u8bcd\u5e93\u8fd8\u662f\u7a7a\u7684\u3002";
}

function getNotebookEmptyText(mode) {
  if (notebookSearchQuery) {
    return getModeLabel(mode) + "生词本里没有找到匹配的单词。";
  }

  return mode === "english"
    ? "还没有加入任何英语生词，测试时点星星就会收进来。"
    : "还没有加入任何俄语生词，测试时点星星就会收进来。";
}

function getNotebookInfoText(mode, entries) {
  if (entries.length === 0) {
    return "还没有加入任何" + getModeLabel(mode) + "生词。";
  }

  if (!hasSufficientQuizEntriesFromQuiz(entries)) {
    return "共 " + entries.length + " 个生词，还需要至少 2 个不同释义才能开始测试。";
  }

  return "共 " + entries.length + " 个生词，可以直接开始测试。";
}

function updateWordsSearchQuery(value) {
  wordsSearchQuery = normalizeSearchQuery(value);
  renderWordsView();
}

function updateNotebookSearchQuery(value) {
  notebookSearchQuery = normalizeSearchQuery(value);
  renderNotebookView();
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function syncQuizDeleteButtonState() {
  favoriteCurrentWordBtn.disabled =
    !sessionActive ||
    roundCelebrationVisible ||
    !(visibleQuestionEntry || currentQuestionEntry);
  deleteCurrentWordBtn.disabled =
    !sessionActive ||
    transitionLock ||
    roundCelebrationVisible ||
    !currentQuestionEntry;
}

function removeMatchingLibraryEntries(mode, targetEntry) {
  let removedCount = 0;
  const targetKey = getEntryKeyFromQuiz(targetEntry);

  getGroups(mode).forEach((group) => {
    const nextEntries = [];

    group.entries.forEach((entry) => {
      if (getEntryKeyFromQuiz(entry) === targetKey) {
        removedCount += 1;
        return;
      }

      nextEntries.push(entry);
    });

    group.entries = nextEntries;
  });

  return removedCount;
}

function removeEntryKeyFromEntries(entries, entryKey) {
  return entries.filter((entry) => getEntryKeyFromQuiz(entry) !== entryKey);
}

function setActiveLibraryGroup(mode, groupId) { activeLibraryGroupIds[mode] = groupId; refreshAllDisplays(); }

function ensureValidActiveGroup(mode) { activeLibraryGroupIds[mode] = ensureValidActiveGroupId(getGroups(mode), activeLibraryGroupIds[mode]); }

function replaceWordLibrary(payload) {
  resetBank("english");
  resetBank("russian");
  wrongRecords.clear();
  visibleQuestionEntry = null;
  applySessionState(createClearedPracticeState());

  wordBanks.english.groups = payload.english.map(cloneGroupFromLibrary);
  wordBanks.russian.groups = payload.russian.map(cloneGroupFromLibrary);
  wordProgress = pruneWordProgress(
    normalizeWordProgress(payload.progress),
    { english: wordBanks.english.groups, russian: wordBanks.russian.groups }
  );
  wordNotebook = pruneWordNotebook(
    normalizeWordNotebook(payload.notebook),
    { english: wordBanks.english.groups, russian: wordBanks.russian.groups }
  );

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
  }, wordProgress, wordNotebook);
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

function persistLibraryState(options = {}) {
  wordProgress = pruneWordProgress(wordProgress, {
    english: getGroups("english"),
    russian: getGroups("russian"),
  });
  wordNotebook = pruneWordNotebook(wordNotebook, {
    english: getGroups("english"),
    russian: getGroups("russian"),
  });
  saveWordBanksToStorage(STORAGE_KEY, {
    english: getGroups("english"),
    russian: getGroups("russian"),
  }, wordProgress, wordNotebook);

  if (!options.skipRefresh) {
    refreshAllDisplays();
  }
}


