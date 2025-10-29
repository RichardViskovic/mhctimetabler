const storageKey = "mhTimetable:v1";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const scheduleTemplate = [
  { id: "period1", label: "Period 1", type: "class", start: "08:45", end: "09:45" },
  { id: "period2", label: "Period 2", type: "class", start: "09:45", end: "10:45" },
  { id: "break1", label: "Break 1", type: "break", start: "10:45", end: "11:15" },
  { id: "period3", label: "Period 3", type: "class", start: "11:15", end: "12:15" },
  { id: "break2", label: "Break 2", type: "break", start: "12:15", end: "12:40" },
  { id: "period4", label: "Period 4", type: "class", start: "12:40", end: "13:40" },
  { id: "break3", label: "Break 3", type: "break", start: "13:40", end: "14:00" },
  { id: "period5", label: "Period 5", type: "class", start: "14:00", end: "15:00" },
];

const periodOnlyIds = scheduleTemplate.filter((block) => block.type === "class").map((block) => block.id);

const elements = {
  dayName: document.getElementById("dayName"),
  daySelector: document.getElementById("daySelector"),
  dayProgressFill: document.getElementById("dayProgressFill"),
  dayProgressLabel: document.getElementById("dayProgressLabel"),
  timeline: document.getElementById("timeline"),
  editorBody: document.querySelector("#editorTable tbody"),
  dayView: document.getElementById("dayView"),
  editView: document.getElementById("editView"),
  dayViewBtn: document.getElementById("dayViewBtn"),
  editViewBtn: document.getElementById("editViewBtn"),
  installButton: document.getElementById("installButton"),
};

let installPromptEvent = null;
let timetable = loadTimetable();
let autosaveTimeout = null;

init();

function init() {
  populateDaySelector();
  buildEditor();
  setupViewToggle();
  renderDayView();
  setupAutoRefresh();
  setupInstallPrompt();
  registerServiceWorker();
}

function getDefaultTimetable() {
  const template = {};
  days.forEach((day) => {
    template[day] = {};
    periodOnlyIds.forEach((id) => {
      template[day][id] = "";
    });
  });
  return template;
}

function loadTimetable() {
  const existing = localStorage.getItem(storageKey);
  if (!existing) {
    return getDefaultTimetable();
  }

  try {
    const parsed = JSON.parse(existing);
    days.forEach((day) => {
      if (!parsed[day]) {
        parsed[day] = {};
      }
      periodOnlyIds.forEach((id) => {
        if (typeof parsed[day][id] !== "string") {
          parsed[day][id] = "";
        }
      });
    });
    return parsed;
  } catch (error) {
    console.warn("Failed to parse stored timetable, resetting.", error);
    return getDefaultTimetable();
  }
}

function saveTimetable() {
  localStorage.setItem(storageKey, JSON.stringify(timetable));
}

function populateDaySelector() {
  days.forEach((day) => {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    elements.daySelector.appendChild(option);
  });

  const todayIndex = new Date().getDay(); // 0 = Sun
  const defaultDay = days[todayIndex - 1] || "Monday";
  elements.daySelector.value = defaultDay;
  elements.daySelector.addEventListener("change", renderDayView);
}

function buildEditor() {
  elements.editorBody.innerHTML = "";
  periodOnlyIds.forEach((periodId) => {
    const periodInfo = scheduleTemplate.find((item) => item.id === periodId);
    const row = document.createElement("tr");

    const periodCell = document.createElement("th");
    periodCell.scope = "row";
    periodCell.textContent = periodInfo.label;
    row.appendChild(periodCell);

    days.forEach((day) => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Add class";
      input.value = timetable[day][periodId];
      input.addEventListener("input", () => handleInputChange(day, periodId, input.value));
      cell.appendChild(input);
      row.appendChild(cell);
    });

    elements.editorBody.appendChild(row);
  });
}

function handleInputChange(day, periodId, value) {
  timetable[day][periodId] = value.trim();
  window.clearTimeout(autosaveTimeout);
  autosaveTimeout = window.setTimeout(() => {
    saveTimetable();
    renderDayView();
  }, 250);
}

function renderDayView() {
  const selectedDay = elements.daySelector.value;
  const selectedIndex = Math.max(0, days.indexOf(selectedDay));
  const baseDate = getDateForDay(selectedIndex);
  const now = new Date();

  elements.dayName.textContent = selectedDay;
  elements.timeline.innerHTML = "";

  scheduleTemplate.forEach((block) => {
    const { startDate, endDate } = resolveBlockWindow(block, baseDate);
    const status = determineStatus(now, startDate, endDate);
    const card = document.createElement("article");
    card.classList.add("event-card", block.type, status);

    const title = document.createElement("h3");
    const className = timetable[selectedDay]?.[block.id];
    title.textContent = block.type === "class" ? className || block.label : block.label;

    const timeLabel = document.createElement("p");
    timeLabel.className = "event-time";
    timeLabel.textContent = `${formatTime(block.start)} – ${formatTime(block.end)}`;

    const tag = document.createElement("span");
    tag.className = "event-tag";
    tag.textContent = block.type === "break" ? "Break" : "Class";

    card.appendChild(tag);
    card.appendChild(title);
    card.appendChild(timeLabel);

    if (status === "in-progress" && block.type === "class") {
      const progress = document.createElement("div");
      progress.className = "event-progress";

      const fill = document.createElement("div");
      fill.className = "event-progress__fill";
      fill.style.width = `${getElapsedPercentage(now, startDate, endDate)}%`;
      progress.appendChild(fill);
      card.appendChild(progress);
    }

    elements.timeline.appendChild(card);
  });

  updateDayProgress(now, baseDate);
}

function determineStatus(now, startDate, endDate) {
  if (now < startDate) {
    return "upcoming";
  }
  if (now > endDate) {
    return "completed";
  }
  return "in-progress";
}

function updateDayProgress(now, baseDate) {
  const firstBlock = scheduleTemplate[0];
  const lastBlock = scheduleTemplate[scheduleTemplate.length - 1];
  const dayStart = resolveBlockWindow(firstBlock, baseDate).startDate;
  const dayEnd = resolveBlockWindow(lastBlock, baseDate).endDate;

  let progressPercent;
  let label;

  if (now <= dayStart) {
    progressPercent = 0;
    label = `Starts ${formatTime(firstBlock.start)}`;
  } else if (now >= dayEnd) {
    progressPercent = 100;
    label = "Day complete";
  } else {
    progressPercent = getElapsedPercentage(now, dayStart, dayEnd);
    label = `${progressPercent.toFixed(0)}%`;
  }

  elements.dayProgressFill.style.width = `${progressPercent}%`;
  elements.dayProgressLabel.textContent = label;
}

function setupAutoRefresh() {
  window.setInterval(renderDayView, 60_000);
}

function setupViewToggle() {
  elements.dayViewBtn.addEventListener("click", () => switchView("day"));
  elements.editViewBtn.addEventListener("click", () => switchView("edit"));
}

function switchView(target) {
  const isDay = target === "day";
  elements.dayView.classList.toggle("active", isDay);
  elements.editView.classList.toggle("active", !isDay);
  elements.dayViewBtn.classList.toggle("active", isDay);
  elements.editViewBtn.classList.toggle("active", !isDay);
}

function resolveBlockWindow(block, baseDate) {
  const startDate = sliceTime(baseDate, block.start);
  const endDate = sliceTime(baseDate, block.end);
  return { startDate, endDate };
}

function sliceTime(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  const sliced = new Date(date);
  sliced.setHours(hours, minutes, 0, 0);
  return sliced;
}

function getDateForDay(dayIndex) {
  const now = new Date();
  const currentDay = now.getDay(); // Sunday = 0
  const target = dayIndex + 1; // align Monday = 1
  const diff = target - currentDay;
  const date = new Date(now);
  date.setDate(now.getDate() + diff);
  return date;
}

function getElapsedPercentage(now, start, end) {
  const elapsed = now - start;
  const total = end - start;
  const ratio = Math.max(0, Math.min(1, elapsed / total));
  return ratio * 100;
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    elements.installButton.classList.remove("hidden");
  });

  elements.installButton.addEventListener("click", async () => {
    if (!installPromptEvent) {
      return;
    }

    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === "accepted") {
      elements.installButton.classList.add("hidden");
    }
    installPromptEvent = null;
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}
