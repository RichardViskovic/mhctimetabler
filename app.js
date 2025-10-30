const STORAGE_KEY = "mhc-timetabler-schedule-v1";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const DAY_BLOCKS = [
  { id: "period1", label: "Period 1", start: "08:45", end: "09:45", type: "class" },
  { id: "period2", label: "Period 2", start: "09:45", end: "10:45", type: "class" },
  { id: "break1", label: "Break 1", start: "10:45", end: "11:15", type: "break" },
  { id: "period3", label: "Period 3", start: "11:15", end: "12:15", type: "class" },
  { id: "break2", label: "Break 2", start: "12:15", end: "12:40", type: "break" },
  { id: "period4", label: "Period 4", start: "12:40", end: "13:40", type: "class" },
  { id: "break3", label: "Break 3", start: "13:40", end: "14:00", type: "break" },
  { id: "period5", label: "Period 5", start: "14:00", end: "15:00", type: "class" }
];

const defaultSchedule = {
  Monday: {
    period1: "English",
    period2: "Mathematics",
    period3: "Science",
    period4: "Music",
    period5: "Sport"
  },
  Tuesday: {
    period1: "Geography",
    period2: "Mathematics",
    period3: "Engineering",
    period4: "Science Lab",
    period5: "Drama"
  },
  Wednesday: {
    period1: "History",
    period2: "Mathematics",
    period3: "Physical Education",
    period4: "English",
    period5: "Art"
  },
  Thursday: {
    period1: "Science",
    period2: "Mathematics",
    period3: "English",
    period4: "Languages",
    period5: "Computing"
  },
  Friday: {
    period1: "Assembly",
    period2: "Mathematics",
    period3: "Community Project",
    period4: "Health",
    period5: "Clubs"
  }
};

const editorBody = document.querySelector("#editorBody");
const daySelect = document.querySelector("#daySelect");
const dayEvents = document.querySelector("#dayEvents");
const currentTimeDisplay = document.querySelector("#currentTime");
const progressBar = document.querySelector(".progress-bar");
const progressFill = document.querySelector("#progressFill");
const installButton = document.querySelector("#installButton");
const installHint = document.querySelector("#installHint");
const editorDialog = document.querySelector("#editorDialog");

const inputRefs = new Map();
const LONG_PRESS_DELAY = 600;

let schedule = loadSchedule();
let selectedDay = getInitialDay();
let deferredPrompt = null;

renderEditor();
populateDaySelector();
renderDayView();
startTicker();
setupInstallPrompt();
registerServiceWorker();
editorDialog?.addEventListener("close", () => highlightEditorRow(null));

function loadSchedule() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSchedule, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn("Could not load stored schedule", error);
  }
  return JSON.parse(JSON.stringify(defaultSchedule));
}

function saveSchedule() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

function getInitialDay() {
  const today = new Date();
  const dayIndex = today.getDay(); // Sunday = 0
  if (dayIndex >= 1 && dayIndex <= 5) {
    return DAYS[dayIndex - 1];
  }
  return "Monday";
}

function renderEditor() {
  editorBody.innerHTML = "";
  inputRefs.clear();
  DAY_BLOCKS.filter(block => block.type === "class").forEach(block => {
    const row = document.createElement("tr");
    row.dataset.blockId = block.id;

    const periodHeader = document.createElement("th");
    periodHeader.scope = "row";
    periodHeader.textContent = `${block.label} (${block.start} - ${block.end})`;
    row.appendChild(periodHeader);

    DAYS.forEach(day => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "period-input";
      input.name = `${day}-${block.id}`;
      input.value = schedule[day]?.[block.id] ?? "";
      input.placeholder = "Add class";
      input.addEventListener("input", event => {
        schedule[day] = schedule[day] ?? {};
        schedule[day][block.id] = event.target.value.trim();
        saveSchedule();
        if (day === selectedDay) {
          renderDayView();
        }
      });
      cell.appendChild(input);
      row.appendChild(cell);
      inputRefs.set(input.name, input);
    });

    editorBody.appendChild(row);
  });
}

function populateDaySelector() {
  daySelect.innerHTML = "";
  DAYS.forEach(day => {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    if (day === selectedDay) {
      option.selected = true;
    }
    daySelect.appendChild(option);
  });

  daySelect.addEventListener("change", event => {
    selectedDay = event.target.value;
    renderDayView();
  });
}

function renderDayView() {
  dayEvents.innerHTML = "";
  DAY_BLOCKS.forEach(block => {
    const listItem = document.createElement("li");
    listItem.className = `day-event ${block.type}`;
    listItem.dataset.blockId = block.id;

    const timeRange = document.createElement("time");
    timeRange.setAttribute("datetime", `${block.start}-${block.end}`);
    timeRange.textContent = `${block.start} – ${block.end}`;

    const details = document.createElement("div");
    details.className = "event-details";

    const title = document.createElement("span");
    title.className = "event-title";
    const displayTitle =
      block.type === "class"
        ? schedule[selectedDay]?.[block.id] || "Free Study"
        : block.label;
    title.textContent = displayTitle;

    const subtitle = document.createElement("span");
    subtitle.className = "event-subtitle";
    subtitle.textContent =
      block.type === "class" ? block.label : "Recharge and reset";

    details.append(title, subtitle);

    const progressOverlay = document.createElement("span");
    progressOverlay.className = "event-progress";

    listItem.append(progressOverlay, timeRange, details);

    const state = getBlockState(block);
    listItem.classList.add(state);

    const progress = getBlockProgress(block);
    progressOverlay.style.width = `${progress}%`;

    if (block.type === "class") {
      listItem.tabIndex = 0;
      listItem.setAttribute(
        "aria-label",
        `Edit ${displayTitle} for ${selectedDay} (${block.label})`
      );
      listItem.setAttribute("role", "button");
      setupInteraction(listItem, block);
    }

    dayEvents.appendChild(listItem);
  });
}

function getBlockState(block) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(block.start);
  const endMinutes = toMinutes(block.end);
  if (currentMinutes >= endMinutes) {
    return "complete";
  }
  if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
    return "in-progress";
  }
  return "upcoming";
}

function getBlockProgress(block) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(block.start);
  const endMinutes = toMinutes(block.end);

  if (currentMinutes <= startMinutes) {
    return 0;
  }
  if (currentMinutes >= endMinutes) {
    return 100;
  }

  const elapsed = currentMinutes - startMinutes;
  const duration = endMinutes - startMinutes;
  return Math.min(100, Math.max(0, (elapsed / duration) * 100));
}

function setupInteraction(element, block) {
  setupLongPress(element, block);
  element.addEventListener("dblclick", () => openEditor(block));
  element.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      openEditor(block);
    }
  });
}

function setupLongPress(element, block) {
  let timerId = null;

  const startPress = event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    clearTimeout(timerId);
    if (typeof element.setPointerCapture === "function" && event.pointerId !== undefined) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    timerId = window.setTimeout(() => {
      openEditor(block);
      timerId = null;
    }, LONG_PRESS_DELAY);
  };

  const cancelPress = event => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (
      event &&
      typeof element.releasePointerCapture === "function" &&
      event.pointerId !== undefined &&
      element.hasPointerCapture?.(event.pointerId)
    ) {
      try {
        element.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture release failures.
      }
    }
  };

  element.addEventListener("pointerdown", startPress);
  element.addEventListener("pointerup", cancelPress);
  element.addEventListener("pointerleave", cancelPress);
  element.addEventListener("pointercancel", cancelPress);
  element.addEventListener("contextmenu", event => {
    event.preventDefault();
    cancelPress(event);
    openEditor(block);
  });
}

function openEditor(block) {
  if (!editorDialog) {
    return;
  }
  if (typeof editorDialog.showModal === "function" && !editorDialog.open) {
    editorDialog.showModal();
  } else if (!editorDialog.open) {
    editorDialog.setAttribute("open", "");
  }
  highlightEditorRow(block.id);
  requestAnimationFrame(() => focusEditorInput(block.id));
}

function highlightEditorRow(blockId) {
  if (!editorBody) {
    return;
  }
  editorBody.querySelectorAll("tr").forEach(row => {
    const isMatch = blockId && row.dataset.blockId === blockId;
    row.classList.toggle("editor-highlight", Boolean(isMatch));
  });
}

function focusEditorInput(blockId) {
  const key = `${selectedDay}-${blockId}`;
  const input = inputRefs.get(key);
  if (!input) {
    return;
  }
  try {
    input.focus({ preventScroll: false });
  } catch (error) {
    input.focus();
  }
  input.setSelectionRange(input.value.length, input.value.length);
  if (typeof input.scrollIntoView === "function") {
    try {
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (error) {
      input.scrollIntoView();
    }
  }
}

function startTicker() {
  updateClock();
  setInterval(() => {
    updateClock();
    renderDayView();
  }, 30 * 1000);
}

function updateClock() {
  const now = new Date();
  currentTimeDisplay.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  const percentage = getDayProgress(now);
  progressFill.style.width = `${percentage}%`;
  progressBar?.setAttribute("aria-valuenow", percentage.toFixed(0));
}

function getDayProgress(date) {
  const start = DAY_BLOCKS[0];
  const end = DAY_BLOCKS[DAY_BLOCKS.length - 1];

  const startMinutes = toMinutes(start.start);
  const endMinutes = toMinutes(end.end);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (currentMinutes <= startMinutes) {
    return 0;
  }
  if (currentMinutes >= endMinutes) {
    return 100;
  }

  const progress = ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100;
  return Math.min(100, Math.max(0, progress));
}

function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    installHint.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      installHint.hidden = true;
    }
    deferredPrompt = null;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("service-worker.js")
        .catch(error => console.warn("Service worker registration failed", error));
    });
  }
}
