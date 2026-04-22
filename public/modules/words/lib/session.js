export function createStartedSessionState({
  mode,
  selectedGroupIds,
  entries,
  shuffleEntries,
  masteredEntryKeys = new Set(),
  carryOverWrongKeys = new Set(),
}) {
  return {
    currentMode: mode,
    currentSelectedGroupIds: selectedGroupIds.slice(),
    practiceEntries: shuffleEntries(entries.slice()),
    currentQuizEntries: [],
    currentRoundPendingEntries: [],
    currentQuestionEntry: null,
    currentRoundSize: 0,
    masteredEntryKeys: new Set(masteredEntryKeys),
    carryOverWrongKeys: new Set(carryOverWrongKeys),
    sessionActive: true,
    roundCelebrationVisible: false,
  };
}

export function createExitedSessionState() {
  return {
    sessionActive: false,
    transitionLock: false,
    roundCelebrationVisible: false,
  };
}

export function createPreparedRoundState({
  practiceEntries,
  masteredEntryKeys,
  carryOverWrongKeys,
  roundSize,
  getRemainingPracticeEntries,
  hasSufficientQuizEntries,
  buildRoundEntries,
}) {
  const availableEntries = getRemainingPracticeEntries(practiceEntries, masteredEntryKeys);
  const baseState = {
    currentQuizEntries: [],
    currentRoundPendingEntries: [],
    currentQuestionEntry: null,
    currentRoundSize: 0,
  };

  if (!hasSufficientQuizEntries(availableEntries)) {
    return {
      canStart: false,
      ...baseState,
    };
  }

  const currentQuizEntries = buildRoundEntries(availableEntries, carryOverWrongKeys, roundSize);
  return {
    canStart: hasSufficientQuizEntries(currentQuizEntries),
    currentQuizEntries,
    currentRoundPendingEntries: currentQuizEntries.slice(),
    currentQuestionEntry: null,
    currentRoundSize: currentQuizEntries.length,
  };
}

export function createRoundMetricsResetState() {
  return {
    currentQuestionEntry: null,
    lastQuestionKey: "",
    transitionLock: false,
    answeredCountValue: 0,
    correctCountValue: 0,
    wrongCountValue: 0,
  };
}

export function createClearedPracticeState() {
  return {
    practiceEntries: [],
    currentQuizEntries: [],
    currentRoundPendingEntries: [],
    currentQuestionEntry: null,
    currentRoundSize: 0,
    currentSelectedGroupIds: [],
    masteredEntryKeys: new Set(),
    carryOverWrongKeys: new Set(),
  };
}

export function applyAnswerState({
  entry,
  isCorrect,
  currentRoundPendingEntries,
  answeredCountValue,
  correctCountValue,
  wrongCountValue,
  masteredEntryKeys,
  carryOverWrongKeys,
  getEntryKey,
}) {
  const entryKey = getEntryKey(entry);
  const nextMasteredEntryKeys = new Set(masteredEntryKeys);
  const nextCarryOverWrongKeys = new Set(carryOverWrongKeys);

  if (isCorrect) {
    nextMasteredEntryKeys.add(entryKey);
    nextCarryOverWrongKeys.delete(entryKey);
  } else {
    nextCarryOverWrongKeys.add(entryKey);
  }

  return {
    entryKey,
    currentRoundPendingEntries: currentRoundPendingEntries.filter((item) => getEntryKey(item) !== entryKey),
    currentQuestionEntry: null,
    answeredCountValue: answeredCountValue + 1,
    correctCountValue: correctCountValue + (isCorrect ? 1 : 0),
    wrongCountValue: wrongCountValue + (isCorrect ? 0 : 1),
    masteredEntryKeys: nextMasteredEntryKeys,
    carryOverWrongKeys: nextCarryOverWrongKeys,
  };
}
