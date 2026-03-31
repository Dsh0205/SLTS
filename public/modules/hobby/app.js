const STORAGE_KEY = "hobby-tracker-monthly-v1";
const STORAGE_VERSION = 2;

const TEXT = {
  month: "\u6708\u4efd",
  notes: "\u8bb0\u5f55",
  hobbyName: "\u7231\u597d\u540d\u79f0",
  deleteHobby: "\u5220\u9664\u7231\u597d",
  selectMonth: "\u9009\u62e9\u6708\u4efd",
  unnamedHobby: "\u672a\u547d\u540d\u7231\u597d",
  enterHobbyFirst: "\u5148\u8f93\u5165\u4e00\u4e2a\u7231\u597d\u540d\u79f0",
  addedHobby: "\u5df2\u65b0\u589e\u7231\u597d\u5217",
  removedHobby: "\u5df2\u5220\u9664\u7231\u597d\u5217",
  resetDone: "\u672c\u6708\u8bb0\u5f55\u5df2\u6e05\u7a7a",
};

const hobbyNameInput = document.getElementById("hobbyNameInput");
const addHobbyBtn = document.getElementById("addHobbyBtn");
const resetMonthBtn = document.getElementById("resetMonthBtn");
const trackerHead = document.getElementById("trackerHead");
const trackerBody = document.getElementById("trackerBody");
const hobbyCountValue = document.getElementById("hobbyCountValue");
const completedCountValue = document.getElementById("completedCountValue");
const toast = document.getElementById("toast");

const currentMonth = formatMonthKey(new Date());
const defaultState = {
  version: STORAGE_VERSION,
  selectedMonth: currentMonth,
  hobbies: [],
  months: {
    [currentMonth]: createEmptyRecords(currentMonth),
  },
};

let toastTimer = 0;
let state = loadState();

render();

addHobbyBtn.addEventListener("click", addHobbyFromInput);
hobbyNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addHobbyFromInput();
  }
});

resetMonthBtn.addEventListener("click", () => {
  const confirmed = window.confirm(
    `\u786e\u5b9a\u6e05\u7a7a ${formatMonthLabel(state.selectedMonth)} \u7684\u8bb0\u5f55\u548c\u6253\u5361\u5417\uff1f`,
  );

  if (!confirmed) {
    return;
  }

  state.months[state.selectedMonth] = createEmptyRecords(state.selectedMonth);
  saveState();
  render();
  showToast(TEXT.resetDone);
});

function createId() {
  return "hobby_" + Math.random().toString(36).slice(2, 10);
}

function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(value);
}

function getDaysInMonth(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 30;
  }

  return new Date(year, month, 0).getDate();
}

function createEmptyRecords(monthKey) {
  return Array.from({ length: getDaysInMonth(monthKey) }, () => ({
    note: "",
    checks: {},
  }));
}

function normalizeHobbies(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
    .map((item) => ({
      id: item.id,
      name: item.name.trim().slice(0, 24) || TEXT.unnamedHobby,
    }));
}

function normalizeRecords(records, monthKey) {
  const totalDays = getDaysInMonth(monthKey);

  return Array.from({ length: totalDays }, (_, index) => {
    const record = Array.isArray(records) ? records[index] : null;
    return {
      note: typeof record?.note === "string" ? record.note : "",
      checks: record?.checks && typeof record.checks === "object" ? { ...record.checks } : {},
    };
  });
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return structuredClone(defaultState);
    }

    const hobbies = normalizeHobbies(parsed.hobbies);

    if (parsed.version === STORAGE_VERSION && parsed.months && typeof parsed.months === "object") {
      const selectedMonth = isValidMonthKey(parsed.selectedMonth) ? parsed.selectedMonth : currentMonth;
      const months = {};

      Object.entries(parsed.months).forEach(([monthKey, records]) => {
        if (isValidMonthKey(monthKey)) {
          months[monthKey] = normalizeRecords(records, monthKey);
        }
      });

      if (!months[selectedMonth]) {
        months[selectedMonth] = createEmptyRecords(selectedMonth);
      }

      return {
        version: STORAGE_VERSION,
        selectedMonth,
        hobbies,
        months,
      };
    }

    return {
      version: STORAGE_VERSION,
      selectedMonth: currentMonth,
      hobbies,
      months: {
        [currentMonth]: normalizeRecords(parsed.records, currentMonth),
      },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSelectedMonthRecords() {
  if (!state.months[state.selectedMonth]) {
    state.months[state.selectedMonth] = createEmptyRecords(state.selectedMonth);
  }

  return state.months[state.selectedMonth];
}

function setSelectedMonth(monthKey) {
  if (!isValidMonthKey(monthKey) || monthKey === state.selectedMonth) {
    return;
  }

  state.selectedMonth = monthKey;
  getSelectedMonthRecords();
  saveState();
  render();
}

function formatMonthLabel(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  return `${yearText} \u5e74 ${Number(monthText)} \u6708`;
}

function addHobbyFromInput() {
  const name = hobbyNameInput.value.trim();

  if (!name) {
    showToast(TEXT.enterHobbyFirst);
    hobbyNameInput.focus();
    return;
  }

  state.hobbies.push({
    id: createId(),
    name: name.slice(0, 24),
  });

  hobbyNameInput.value = "";
  saveState();
  render();
  showToast(TEXT.addedHobby);
}

function updateHobbyName(hobbyId, nextName) {
  const hobby = state.hobbies.find((item) => item.id === hobbyId);
  if (!hobby) {
    return;
  }

  hobby.name = nextName.trim().slice(0, 24) || TEXT.unnamedHobby;
  saveState();
  render();
}

function removeHobby(hobbyId) {
  const hobby = state.hobbies.find((item) => item.id === hobbyId);
  if (!hobby) {
    return;
  }

  const confirmed = window.confirm(
    `\u786e\u5b9a\u5220\u9664\u7231\u597d\u5217\u201c${hobby.name}\u201d\u5417\uff1f\u6240\u6709\u6708\u4efd\u91cc\u8fd9\u4e00\u5217\u7684\u6253\u5361\u4e5f\u4f1a\u4e00\u8d77\u79fb\u9664\u3002`,
  );

  if (!confirmed) {
    return;
  }

  state.hobbies = state.hobbies.filter((item) => item.id !== hobbyId);

  Object.values(state.months).forEach((records) => {
    records.forEach((record) => {
      delete record.checks[hobbyId];
    });
  });

  saveState();
  render();
  showToast(TEXT.removedHobby);
}

function updateNote(dayIndex, nextValue) {
  const records = getSelectedMonthRecords();
  records[dayIndex].note = nextValue;
  saveState();
}

function toggleCheck(dayIndex, hobbyId) {
  const records = getSelectedMonthRecords();
  const currentValue = Boolean(records[dayIndex].checks[hobbyId]);
  records[dayIndex].checks[hobbyId] = !currentValue;
  saveState();
  refreshSummary();
  renderBody();
}

function refreshSummary() {
  const records = getSelectedMonthRecords();
  hobbyCountValue.textContent = String(state.hobbies.length);

  const completedCount = records.reduce((count, record) => {
    return count + Object.values(record.checks).filter(Boolean).length;
  }, 0);

  completedCountValue.textContent = String(completedCount);
}

function render() {
  renderHead();
  renderBody();
  refreshSummary();
}

function renderHead() {
  trackerHead.innerHTML = "";

  const row = document.createElement("tr");
  row.appendChild(createMonthHeaderCell());
  row.appendChild(createHeaderCell(TEXT.notes));

  if (state.hobbies.length === 0) {
    row.appendChild(createHeaderCell(""));
  } else {
    state.hobbies.forEach((hobby) => {
      const th = createHeaderCell("");
      th.classList.add("hobby-column");

      const wrap = document.createElement("div");
      wrap.className = "hobby-header";

      const input = document.createElement("input");
      input.className = "hobby-name-input";
      input.type = "text";
      input.maxLength = 24;
      input.value = hobby.name;
      input.setAttribute("aria-label", TEXT.hobbyName);
      input.addEventListener("change", () => {
        updateHobbyName(hobby.id, input.value);
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-hobby-btn";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `${TEXT.deleteHobby} ${hobby.name}`);
      removeBtn.addEventListener("click", () => {
        removeHobby(hobby.id);
      });

      wrap.appendChild(input);
      wrap.appendChild(removeBtn);
      th.appendChild(wrap);
      row.appendChild(th);
    });
  }

  trackerHead.appendChild(row);
}

function createMonthHeaderCell() {
  const th = createHeaderCell("");
  th.className = "month-header-cell";

  const wrap = document.createElement("label");
  wrap.className = "month-picker";

  const text = document.createElement("span");
  text.className = "month-picker-label";
  text.textContent = TEXT.month;

  const input = document.createElement("input");
  input.type = "month";
  input.value = state.selectedMonth;
  input.setAttribute("aria-label", TEXT.selectMonth);
  input.addEventListener("change", () => {
    setSelectedMonth(input.value);
  });

  wrap.appendChild(text);
  wrap.appendChild(input);
  th.appendChild(wrap);

  return th;
}

function renderBody() {
  trackerBody.innerHTML = "";

  const records = getSelectedMonthRecords();

  for (let day = 1; day <= records.length; day += 1) {
    const row = document.createElement("tr");
    const record = records[day - 1];

    const dateCell = document.createElement("td");
    dateCell.className = "date-cell";
    dateCell.textContent = String(day).padStart(2, "0");
    row.appendChild(dateCell);

    const noteCell = document.createElement("td");
    noteCell.className = "note-cell";

    const textarea = document.createElement("textarea");
    textarea.className = "note-input";
    textarea.value = record.note;
    textarea.setAttribute("aria-label", `${formatMonthLabel(state.selectedMonth)} ${day} \u65e5\u8bb0\u5f55`);
    textarea.addEventListener("input", () => {
      updateNote(day - 1, textarea.value);
    });

    noteCell.appendChild(textarea);
    row.appendChild(noteCell);

    if (state.hobbies.length === 0) {
      const emptyCell = document.createElement("td");
      emptyCell.className = "check-cell check-cell--empty";
      row.appendChild(emptyCell);
    } else {
      state.hobbies.forEach((hobby) => {
        const cell = document.createElement("td");
        cell.className = "check-cell";

        const button = document.createElement("button");
        const checked = Boolean(record.checks[hobby.id]);
        button.type = "button";
        button.className = "check-toggle" + (checked ? " is-active" : "");
        button.setAttribute("aria-pressed", String(checked));
        button.setAttribute("aria-label", `${formatMonthLabel(state.selectedMonth)} ${day} \u65e5 ${hobby.name}`);
        button.addEventListener("click", () => {
          toggleCheck(day - 1, hobby.id);
        });

        cell.appendChild(button);
        row.appendChild(cell);
      });
    }

    trackerBody.appendChild(row);
  }
}

function createHeaderCell(text) {
  const th = document.createElement("th");
  th.scope = "col";

  if (text) {
    th.textContent = text;
  }

  return th;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}
