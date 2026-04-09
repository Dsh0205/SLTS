function createAudioAsset(relativePath) {
  const audio = new Audio(new URL(relativePath, import.meta.url).href);
  audio.preload = "auto";
  return audio;
}

const wrongAnswerAudio = createAudioAsset("../sound/wrong.mp3");
const roundCompleteAudio = createAudioAsset("../sound/true.mp3");
const finishPracticeAudio = createAudioAsset("../sound/一定要来-1.mp3");

const allAudios = [
  wrongAnswerAudio,
  roundCompleteAudio,
  finishPracticeAudio,
];

function stopAllAudio() {
  allAudios.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function playAudio(audio) {
  if (!audio) {
    return;
  }

  stopAllAudio();
  const playResult = audio.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {});
  }
}

export function playWrongAnswerSound() {
  playAudio(wrongAnswerAudio);
}

export function playRoundCompleteSound() {
  playAudio(roundCompleteAudio);
}

export function playFinishPracticeSound() {
  playAudio(finishPracticeAudio);
}
