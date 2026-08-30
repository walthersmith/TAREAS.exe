// ===== ESTADO =====
const STORAGE_KEY = "todo-app:tasks";
const TIMER_KEY = "todo-app:timer";
const SETTINGS_KEY = "todo-app:settings";
const SESSIONS_KEY = "todo-app:sessions";
const LOG_KEY = "todo-app:log-open";
const ROM_KEY = "todo-app:rom";
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

const DEFAULT_SETTINGS = { focus: 25, short: 5, long: 15, cycles: 4 };
const MAX_CYCLES = 12;
const POMO_VISIBLE_MAX = 5;

// Cada ROM define los 4 slots semánticos del tema.
// El CSS mapea cada slot a un uso concreto (FOCUS=primary, SHORT=accent, LONG=tertiary, highlight=focus-task).
const ROMS = {
  default: {
    name: "DEFAULT",
    primary: [0, 245, 255],     // cyan
    accent:  [255, 42, 109],    // pink
    tertiary:[176, 38, 255],    // purple
    highlight:[249, 248, 113],  // yellow
  },
  blade: {
    name: "BLADE",
    primary: [255, 157, 0],     // amber
    accent:  [255, 0, 60],      // red
    tertiary:[255, 242, 0],     // yellow
    highlight:[255, 217, 102],  // warm yellow
  },
  matrix: {
    name: "MATRIX",
    primary: [0, 255, 65],      // green
    accent:  [255, 0, 51],      // red
    tertiary:[57, 255, 20],     // bright green
    highlight:[173, 255, 47],   // lime
  },
  cdproject: {
    name: "CDPROJECT",
    primary: [252, 238, 10],    // yellow
    accent:  [0, 240, 255],     // cyan
    tertiary:[255, 0, 60],      // red
    highlight:[255, 242, 0],    // warm yellow
  },
  akira: {
    name: "AKIRA",
    primary: [255, 0, 51],      // red
    accent:  [255, 215, 0],     // gold
    tertiary:[255, 85, 0],      // orange
    highlight:[255, 235, 59],   // bright yellow
  },
};

const MODES = {
  focus: { label: "FOCUS", next: "short", duration: 25 * 60 },
  short: { label: "BREAK", next: "focus", duration: 5 * 60  },
  long:  { label: "LONG",  next: "focus", duration: 15 * 60 },
};

let tasks = loadTasks();
let timer = loadTimer();
let sessions = loadSessions();
let activeTaskId = null;
let editingTaskId = null;

// ===== ELEMENTOS =====
const form = document.getElementById("form");
const input = document.getElementById("input");
const list = document.getElementById("list");
const counter = document.getElementById("counter");
const clearBtn = document.getElementById("clear-completed");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const empty = document.getElementById("empty");

const timerEl = document.getElementById("timer");
const timeEl = document.getElementById("time");
const labelEl = document.getElementById("timer-label");
const announceEl = document.getElementById("timer-announce");
const ringEl = document.getElementById("ring");
const toggleBtn = document.getElementById("toggle");
const resetBtn = document.getElementById("reset");
const modeBtns = document.querySelectorAll(".timer__mode");
const cyclesEl = document.getElementById("cycles");
const activeTaskEl = document.getElementById("active-task");

const cfgBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings");
const setFocusInput = document.getElementById("set-focus");
const setShortInput = document.getElementById("set-short");
const setLongInput = document.getElementById("set-long");
const setCyclesInput = document.getElementById("set-cycles");
const settingsSaveBtn = document.getElementById("settings-save");
const settingsCancelBtn = document.getElementById("settings-cancel");

const logEl = document.getElementById("log");
const logToggle = document.getElementById("log-toggle");
const logBody = document.getElementById("log-body");
const logTodayEl = document.getElementById("log-today");
const logTodayMinEl = document.getElementById("log-today-min");
const logStreakEl = document.getElementById("log-streak");
const logTotalEl = document.getElementById("log-total");
const logTotalMinEl = document.getElementById("log-total-min");
const logBestEl = document.getElementById("log-best");
const logBestDateEl = document.getElementById("log-best-date");
const logChartEl = document.getElementById("log-chart");
const logTasksEl = document.getElementById("log-tasks");
const logTasksBlock = document.getElementById("log-tasks-block");

const romPicker = document.getElementById("rom-picker");
const romCurrent = document.getElementById("rom-current");
const romNameEl = document.getElementById("rom-name");
const romMenu = document.getElementById("rom-menu");

// ===== PERSISTENCIA =====
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((t) => ({
      id: t.id,
      text: t.text,
      done: !!t.done,
      pomodoros: Number.isFinite(t.pomodoros) ? t.pomodoros : 0,
    })) : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return defaultTimer();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultTimer();
    const endAt = typeof parsed.endAt === "number" ? parsed.endAt : null;
    return {
      mode: ["focus", "short", "long"].includes(parsed.mode) ? parsed.mode : "focus",
      remaining: typeof parsed.remaining === "number" ? parsed.remaining : MODES.focus.duration,
      cycles: typeof parsed.cycles === "number" ? parsed.cycles : 0,
      // Una sesión en curso sobrevive a la recarga: sólo se restaura como
      // "running" si además hay una marca de fin con la que reconstruirla.
      running: parsed.running === true && endAt !== null,
      endAt,
    };
  } catch {
    return defaultTimer();
  }
}

function defaultTimer() {
  return { mode: "focus", remaining: MODES.focus.duration, cycles: 0, running: false, endAt: null };
}

function saveTimer() {
  localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function loadLogOpen() {
  return localStorage.getItem(LOG_KEY) === "1";
}

function saveLogOpen(open) {
  localStorage.setItem(LOG_KEY, open ? "1" : "0");
}

// ===== SETTINGS =====
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const clamp = (v, fb, max = 999) => {
      const n = parseInt(v);
      return Number.isFinite(n) && n >= 1 && n <= max ? n : fb;
    };
    return {
      focus: clamp(parsed.focus, DEFAULT_SETTINGS.focus),
      short: clamp(parsed.short, DEFAULT_SETTINGS.short),
      long:  clamp(parsed.long,  DEFAULT_SETTINGS.long),
      cycles: clamp(parsed.cycles, DEFAULT_SETTINGS.cycles, MAX_CYCLES),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();

function applySettings() {
  MODES.focus.duration = settings.focus * 60;
  MODES.short.duration = settings.short * 60;
  MODES.long.duration  = settings.long  * 60;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettings();
  if (!timer.running) {
    timer.remaining = MODES[timer.mode].duration;
  }
  renderTimer();
}

function openSettings() {
  pause();
  cfgBtn.classList.add("timer__cfg--active");
  settingsPanel.hidden = false;
  setFocusInput.value = settings.focus;
  setShortInput.value = settings.short;
  setLongInput.value  = settings.long;
  setCyclesInput.value = settings.cycles;
  setFocusInput.focus();
  setFocusInput.select();
}

function closeSettings() {
  cfgBtn.classList.remove("timer__cfg--active");
  settingsPanel.hidden = true;
}

function commitSettings() {
  const clamp = (input, fallback, max = 999) => {
    const n = parseInt(input.value);
    return Number.isFinite(n) && n >= 1 && n <= max ? n : fallback;
  };
  settings = {
    focus: clamp(setFocusInput, settings.focus),
    short: clamp(setShortInput, settings.short),
    long:  clamp(setLongInput,  settings.long),
    cycles: clamp(setCyclesInput, settings.cycles, MAX_CYCLES),
  };
  saveSettings();
  closeSettings();
}

// ===== ROM (theme) =====
function loadRom() {
  const saved = localStorage.getItem(ROM_KEY);
  return ROMS[saved] ? saved : "default";
}

let currentRom = loadRom();

// ROMS es la única fuente de verdad de los colores: applyRom() escribe las
// variables CSS. El :root del stylesheet sólo conserva la paleta por defecto,
// para que la app se vea bien en el instante previo a que corra este script.
function applyRom(romKey) {
  const rom = ROMS[romKey];
  if (!rom) return;
  currentRom = romKey;
  localStorage.setItem(ROM_KEY, romKey);

  const root = document.documentElement;
  root.setAttribute("data-rom", romKey);
  // Se escriben como componentes RGB sueltos ("0, 245, 255") porque el CSS
  // los reutiliza con alfa variable vía rgba(var(--c-cyan), 0.35).
  root.style.setProperty("--c-cyan", rom.primary.join(", "));
  root.style.setProperty("--c-pink", rom.accent.join(", "));
  root.style.setProperty("--c-purple", rom.tertiary.join(", "));
  root.style.setProperty("--c-yellow", rom.highlight.join(", "));

  romNameEl.textContent = rom.name;
  romMenu.querySelectorAll(".rom-option").forEach((opt) => {
    opt.classList.toggle("rom-option--active", opt.dataset.rom === romKey);
  });
}

function renderRomMenu() {
  romMenu.innerHTML = "";
  for (const [key, rom] of Object.entries(ROMS)) {
    const li = document.createElement("li");
    li.className = "rom-option" + (key === currentRom ? " rom-option--active" : "");
    li.dataset.rom = key;
    li.setAttribute("role", "option");

    const swatches = document.createElement("span");
    swatches.className = "rom-option__swatches";
    [rom.primary, rom.accent, rom.tertiary].forEach((rgb) => {
      const s = document.createElement("span");
      s.style.background = `rgb(${rgb.join(",")})`;
      swatches.appendChild(s);
    });

    const name = document.createElement("span");
    name.className = "rom-option__name";
    name.textContent = rom.name;

    const check = document.createElement("span");
    check.className = "rom-option__check";
    check.textContent = "✓";

    li.append(swatches, name, check);
    li.addEventListener("click", () => {
      applyRom(key);
      closeRomMenu();
    });
    romMenu.appendChild(li);
  }
}

function openRomMenu() {
  romMenu.hidden = false;
  romPicker.classList.add("rom-picker--open");
  romCurrent.setAttribute("aria-expanded", "true");
}

function closeRomMenu() {
  romMenu.hidden = true;
  romPicker.classList.remove("rom-picker--open");
  romCurrent.setAttribute("aria-expanded", "false");
}

function toggleRomMenu() {
  if (romMenu.hidden) openRomMenu();
  else closeRomMenu();
}

// ===== TASKS =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildPomodoroBar(count) {
  const bar = document.createElement("div");
  bar.className = "item__pomodoros";
  bar.setAttribute("aria-label", `${count} pomodoro${count === 1 ? "" : "s"}`);

  const shown = Math.min(count, POMO_VISIBLE_MAX);
  for (let i = 0; i < shown; i++) {
    const cell = document.createElement("span");
    cell.className = "pomo-cell pomo-cell--on";
    bar.appendChild(cell);
  }
  if (count > POMO_VISIBLE_MAX) {
    const over = document.createElement("span");
    over.className = "pomo-overflow";
    over.textContent = `+${count - POMO_VISIBLE_MAX}`;
    bar.appendChild(over);
  }
  return bar;
}

function renderTasks() {
  list.innerHTML = "";
  let toFocus = null;

  for (const task of tasks) {
    const li = document.createElement("li");
    li.className =
      "item" +
      (task.done ? " item--done" : "") +
      (task.id === activeTaskId && !task.done ? " item--focus" : "");
    li.dataset.id = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "item__checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", "Marcar como completada");
    checkbox.addEventListener("change", () => toggle(task.id));

    let body;
    if (task.id === editingTaskId) {
      body = buildEditInput(task);
      toFocus = body;
    } else {
      body = document.createElement("span");
      body.className = "item__text";
      body.textContent = task.text;
      body.title = "Doble clic para editar";
      body.addEventListener("dblclick", () => startEditing(task.id));
    }

    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "item__focus";
    focusBtn.setAttribute("aria-label", "Marcar como tarea activa");
    focusBtn.title = "Seleccionar como target del pomodoro";
    focusBtn.textContent = "◎";
    focusBtn.addEventListener("click", () => setActiveTask(task.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "item__delete";
    del.setAttribute("aria-label", "Eliminar tarea");
    del.textContent = "×";
    del.addEventListener("click", () => removeTask(task.id));

    li.append(checkbox, body);
    if (task.pomodoros > 0) {
      li.appendChild(buildPomodoroBar(task.pomodoros));
    }
    li.append(focusBtn, del);
    list.appendChild(li);
  }

  if (toFocus) {
    toFocus.focus();
    toFocus.select();
  }

  const pending = tasks.filter((t) => !t.done).length;
  counter.textContent = pending === 1 ? "1 pendiente" : `${pending} pendientes`;

  const hasCompleted = tasks.some((t) => t.done);
  clearBtn.disabled = !hasCompleted;

  empty.hidden = tasks.length > 0;

  renderActiveTask();
}

// ===== EDICIÓN EN LÍNEA =====
// Enter guarda, Escape descarta, perder el foco guarda. El flag `settled`
// evita que el blur provocado por el propio re-render vuelva a disparar el
// guardado después de cancelar.
function buildEditInput(task) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "item__edit";
  input.value = task.text;
  input.maxLength = 200;
  input.setAttribute("aria-label", "Editar tarea");

  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    finishEditing(input.value);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    finishEditing(null);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  });
  input.addEventListener("blur", commit);
  return input;
}

function startEditing(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.done) return;
  editingTaskId = id;
  renderTasks();
}

// newText === null cancela. Un texto vacío también se descarta: borrar una
// tarea es cosa del botón ×, no un efecto lateral de vaciar el campo.
function finishEditing(newText) {
  const task = tasks.find((t) => t.id === editingTaskId);
  editingTaskId = null;
  if (task && newText !== null) {
    const trimmed = newText.trim();
    if (trimmed && trimmed !== task.text) {
      task.text = trimmed;
      saveTasks();
    }
  }
  renderTasks();
  renderActiveTask();
}

function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  tasks.push({ id: uid(), text: trimmed, done: false, pomodoros: 0 });
  saveTasks();
  renderTasks();
}

function toggle(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  if (task.done && activeTaskId === id) activeTaskId = null;
  saveTasks();
  renderTasks();
}

function removeTask(id) {
  if (activeTaskId === id) activeTaskId = null;
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  renderTasks();
}

function clearCompleted() {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  renderTasks();
}

function setActiveTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.done) {
    activeTaskId = null;
  } else {
    activeTaskId = activeTaskId === id ? null : id;
  }
  renderTasks();
}

function flashPomodoroCell(taskId) {
  requestAnimationFrame(() => {
    const li = list.querySelector(`[data-id="${taskId}"]`);
    if (!li) return;
    const cells = li.querySelectorAll(".pomo-cell--on");
    const last = cells[cells.length - 1];
    if (!last) return;
    last.classList.remove("pomo-cell--flash");
    void last.offsetWidth; // restart animation
    last.classList.add("pomo-cell--flash");
    setTimeout(() => last.classList.remove("pomo-cell--flash"), 800);
  });
}

// ===== TIMER =====
let intervalId = null;

function format(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function formatMinutes(m) {
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
}

function renderTimer() {
  const mode = MODES[timer.mode];
  timeEl.textContent = format(timer.remaining);
  labelEl.textContent = mode.label;

  timerEl.dataset.mode = timer.mode;
  timerEl.dataset.running = timer.running ? "true" : "false";

  const progress = 1 - timer.remaining / mode.duration;
  ringEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));

  toggleBtn.textContent = timer.running ? "PAUSE" : "START";

  modeBtns.forEach((b) => {
    const active = b.dataset.mode === timer.mode;
    b.classList.toggle("timer__mode--active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // Los puntos se generan según los ciclos configurados, no fijos a 4.
  const lit = timer.cycles % settings.cycles;
  if (cyclesEl.children.length !== settings.cycles) {
    cyclesEl.innerHTML = "";
    for (let i = 0; i < settings.cycles; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      cyclesEl.appendChild(dot);
    }
  }
  cyclesEl.setAttribute("aria-label", `${lit} de ${settings.cycles} focus hasta el descanso largo`);
  [...cyclesEl.children].forEach((d, i) => d.classList.toggle("dot--on", i < lit));

  updateDocumentTitle();
  saveTimer();
}

// La cuenta atrás en el título deja ver el tiempo restante sin volver a la
// pestaña; en reposo se restaura el título original.
const BASE_TITLE = document.title;

function updateDocumentTitle() {
  document.title = timer.running
    ? `${format(timer.remaining)} · ${MODES[timer.mode].label}`
    : BASE_TITLE;
}

function renderActiveTask() {
  const task = tasks.find((t) => t.id === activeTaskId);
  if (task) {
    const suffix = task.pomodoros > 0 ? ` ×${task.pomodoros}` : "";
    activeTaskEl.textContent = task.text + suffix;
    activeTaskEl.classList.remove("timer__task--none");
  } else {
    activeTaskEl.textContent = "// no target";
    activeTaskEl.classList.add("timer__task--none");
  }
}

// Segundos que faltan según el reloj real, no según cuántas veces corrió tick().
// Los navegadores estrangulan setInterval en pestañas ocultas, así que contar
// ticks haría que una sesión de 25 min en segundo plano durase mucho más.
// ceil (y no round) para que el último segundo se vea entero y la sesión
// termine exactamente al cumplirse la duración, no medio segundo antes.
function remainingFromClock() {
  if (!timer.running || timer.endAt === null) return timer.remaining;
  return Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
}

function start() {
  if (timer.running) return;
  ensureAudio();
  requestNotificationPermission();
  timer.running = true;
  timer.endAt = Date.now() + timer.remaining * 1000;
  intervalId = setInterval(tick, 250);
  renderTimer();
}

function pause() {
  if (!timer.running) return;
  timer.remaining = remainingFromClock();
  timer.running = false;
  timer.endAt = null;
  clearInterval(intervalId);
  intervalId = null;
  renderTimer();
}

function reset() {
  pause();
  timer.remaining = MODES[timer.mode].duration;
  renderTimer();
}

function tick() {
  const next = remainingFromClock();
  if (next <= 0) {
    timer.remaining = 0;
    pause();
    onComplete();
    return;
  }
  // Sin cambio de segundo no hay nada que repintar.
  if (next === timer.remaining) return;
  timer.remaining = next;
  renderTimer();
}

function setMode(mode) {
  pause();
  timer.mode = mode;
  timer.remaining = MODES[mode].duration;
  renderTimer();
}

function onComplete({ silent = false } = {}) {
  const finishedMode = timer.mode;
  const finishedMinutes = Math.round(MODES[finishedMode].duration / 60);

  if (!silent) {
    beep();
    flashTimer();
    announce(`${MODES[finishedMode].label} terminado.`);
  }

  // Log session. Se guarda también el texto de la tarea para que el historial
  // sobreviva a su borrado; los registros antiguos se resuelven por taskId.
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  sessions.push({
    ts: Date.now(),
    mode: finishedMode,
    minutes: finishedMinutes,
    taskId: finishedMode === "focus" ? activeTaskId : null,
    taskText: finishedMode === "focus" && activeTask ? activeTask.text : null,
  });
  saveSessions();

  // Contar pomodoro en la tarea activa si fue focus
  if (finishedMode === "focus" && activeTaskId) {
    const task = tasks.find((t) => t.id === activeTaskId);
    if (task && !task.done) {
      task.pomodoros = (task.pomodoros || 0) + 1;
      saveTasks();
      renderTasks();
      flashPomodoroCell(task.id);
    }
  }

  if (!silent && "Notification" in window && Notification.permission === "granted") {
    new Notification("Pomodoro", {
      body: `${MODES[finishedMode].label} terminado`,
      silent: false,
    });
  }

  if (finishedMode === "focus") {
    timer.cycles++;
    const nextMode = timer.cycles % settings.cycles === 0 ? "long" : "short";
    setMode(nextMode);
  } else {
    setMode("focus");
  }

  renderMissionLog();
}

function flashTimer() {
  timerEl.classList.add("timer--flash");
  setTimeout(() => timerEl.classList.remove("timer--flash"), 1800);
}

// Mensaje para lectores de pantalla. Se limpia antes de escribir para que dos
// avisos iguales seguidos se anuncien las dos veces.
function announce(message) {
  announceEl.textContent = "";
  setTimeout(() => {
    announceEl.textContent = message;
  }, 50);
}

// El AudioContext se crea una sola vez, durante un gesto del usuario (START).
// Creado más tarde —al completarse la sesión— nacería suspendido y el pitido
// se perdería en silencio.
let audioCtx = null;

function ensureAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

function beep() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const ctx = audioCtx;
    const doBeep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    doBeep(880, 0, 0.15);
    doBeep(1320, 0.2, 0.3);
  } catch {}
}

// ===== MISSION LOG =====
function getStats() {
  const focusSessions = sessions.filter((s) => s.mode === "focus");

  // Agrupar por día (YYYY-MM-DD)
  const byDay = {};
  focusSessions.forEach((s) => {
    const key = dayKey(new Date(s.ts));
    byDay[key] = byDay[key] || { count: 0, minutes: 0 };
    byDay[key].count++;
    byDay[key].minutes += s.minutes;
  });

  const todayKey = dayKey(new Date());

  const todayCount = byDay[todayKey]?.count || 0;
  const todayMinutes = byDay[todayKey]?.minutes || 0;
  const totalCount = focusSessions.length;
  const totalMinutes = focusSessions.reduce((sum, s) => sum + s.minutes, 0);

  // Best day
  let bestDay = null;
  let bestCount = 0;
  for (const [key, info] of Object.entries(byDay)) {
    if (info.count > bestCount) {
      bestCount = info.count;
      bestDay = key;
    }
  }

  // Streak: cuenta días consecutivos con ≥ 1 sesión hacia atrás desde hoy.
  // Si hoy aún no tiene sesión, empieza a contar desde ayer.
  let streak = 0;
  const cursor = new Date();
  if (!byDay[todayKey]) cursor.setDate(cursor.getDate() - 1);
  while (byDay[dayKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Last 7 days (oldest → newest)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    last7.push({
      key,
      day: d.toLocaleDateString("en", { weekday: "short" }).toLowerCase(),
      isToday: key === todayKey,
      count: byDay[key]?.count || 0,
    });
  }

  // Reparto por tarea: agrupa las sesiones de focus que tenían un target.
  // El nombre sale del registro (taskText) y, si es antiguo, del taskId; una
  // tarea ya borrada se marca como eliminada en vez de desaparecer del total.
  const byTask = new Map();
  focusSessions.forEach((s) => {
    if (!s.taskId) return;
    const entry = byTask.get(s.taskId) || { id: s.taskId, name: null, count: 0, minutes: 0 };
    entry.count++;
    entry.minutes += s.minutes;
    if (s.taskText) entry.name = s.taskText;
    byTask.set(s.taskId, entry);
  });
  const topTasks = [...byTask.values()]
    .map((e) => {
      const live = tasks.find((t) => t.id === e.id);
      return {
        ...e,
        name: live ? live.text : e.name,
        gone: !live,
      };
    })
    .filter((e) => e.name)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  return { todayCount, todayMinutes, totalCount, totalMinutes, bestDay, bestCount, streak, last7, topTasks };
}

function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderMissionLog() {
  const stats = getStats();

  logTodayEl.textContent = stats.todayCount;
  logTodayMinEl.textContent = formatMinutes(stats.todayMinutes);
  logStreakEl.textContent = stats.streak;
  logTotalEl.textContent = stats.totalCount;
  logTotalMinEl.textContent = formatMinutes(stats.totalMinutes);
  logBestEl.textContent = stats.bestCount;
  logBestDateEl.textContent = stats.bestDay ? stats.bestDay.slice(5) : "—";

  // Chart
  logChartEl.innerHTML = "";
  const max = Math.max(1, ...stats.last7.map((d) => d.count));
  stats.last7.forEach((d) => {
    const row = document.createElement("div");
    row.className = "chart__row" + (d.isToday ? " chart__row--today" : "");

    const label = document.createElement("span");
    label.className = "chart__day";
    label.textContent = d.day;

    const track = document.createElement("div");
    track.className = "chart__track";
    const fill = document.createElement("div");
    fill.className = "chart__fill" + (d.count === 0 ? " chart__fill--empty" : "");
    const pct = d.count === 0 ? 0 : Math.max(8, (d.count / max) * 100);
    fill.style.width = `${pct}%`;
    track.appendChild(fill);

    const num = document.createElement("span");
    num.className = "chart__num" + (d.count === 0 ? " chart__num--zero" : "");
    num.textContent = d.count || "·";

    row.append(label, track, num);
    logChartEl.appendChild(row);
  });

  // Top tasks: mismo markup de fila que el gráfico, escalado por minutos.
  logTasksBlock.hidden = stats.topTasks.length === 0;
  logTasksEl.innerHTML = "";
  const maxMin = Math.max(1, ...stats.topTasks.map((t) => t.minutes));
  stats.topTasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "chart__row chart__row--task";

    const label = document.createElement("span");
    label.className = "chart__day chart__day--task";
    label.textContent = t.name;
    label.title = t.gone ? `${t.name} (eliminada)` : t.name;
    if (t.gone) label.classList.add("chart__day--gone");

    const track = document.createElement("div");
    track.className = "chart__track";
    const fill = document.createElement("div");
    fill.className = "chart__fill";
    fill.style.width = `${Math.max(8, (t.minutes / maxMin) * 100)}%`;
    track.appendChild(fill);

    const num = document.createElement("span");
    num.className = "chart__num";
    num.textContent = formatMinutes(t.minutes);

    row.append(label, track, num);
    logTasksEl.appendChild(row);
  });
}

function openLog() {
  logEl.dataset.open = "true";
  logToggle.setAttribute("aria-expanded", "true");
  logBody.hidden = false;
  saveLogOpen(true);
}

function closeLog() {
  logEl.dataset.open = "false";
  logToggle.setAttribute("aria-expanded", "false");
  logBody.hidden = true;
  saveLogOpen(false);
}

function toggleLog() {
  if (logEl.dataset.open === "true") closeLog();
  else openLog();
}

// ===== EXPORTAR / IMPORTAR =====
// Todo el estado vive en localStorage: sin una copia, limpiar los datos del
// navegador borra el historial sin vuelta atrás.
const DATA_KEYS = [STORAGE_KEY, TIMER_KEY, SETTINGS_KEY, SESSIONS_KEY, LOG_KEY, ROM_KEY];

function exportData() {
  const data = {};
  DATA_KEYS.forEach((k) => {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  });

  const payload = {
    app: "tareas.exe",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tareas-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Se valida la forma entera ANTES de tocar nada: un archivo corrupto no debe
// dejar el estado a medio sobrescribir.
function parseBackup(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("no parece una copia de esta app");
  }
  const entries = Object.entries(parsed.data).filter(([k]) => DATA_KEYS.includes(k));
  if (entries.length === 0) throw new Error("no contiene datos reconocibles");
  for (const [k, v] of entries) {
    if (typeof v !== "string") throw new Error(`el campo ${k} está corrupto`);
  }
  // Las claves que guardan JSON deben poder parsearse.
  for (const [k, v] of entries) {
    if (k === LOG_KEY || k === ROM_KEY) continue;
    try {
      JSON.parse(v);
    } catch {
      throw new Error(`el campo ${k} no es JSON válido`);
    }
  }
  return entries;
}

function importData(raw) {
  let entries;
  try {
    entries = parseBackup(raw);
  } catch (e) {
    alert(`No se pudo importar: ${e.message}.\n\nNo se ha cambiado nada.`);
    return;
  }

  const summary = (() => {
    try {
      const t = entries.find(([k]) => k === STORAGE_KEY);
      const s = entries.find(([k]) => k === SESSIONS_KEY);
      const nT = t ? JSON.parse(t[1]).length : 0;
      const nS = s ? JSON.parse(s[1]).length : 0;
      return `${nT} tarea(s) y ${nS} sesión(es)`;
    } catch {
      return "los datos del archivo";
    }
  })();

  if (!confirm(`Se van a restaurar ${summary}.\n\nEsto SUSTITUYE tus tareas, sesiones y ajustes actuales y no se puede deshacer.\n\n¿Continuar?`)) {
    return;
  }

  pause();
  DATA_KEYS.forEach((k) => localStorage.removeItem(k));
  entries.forEach(([k, v]) => localStorage.setItem(k, v));
  // Recargar es la forma más segura de re-inicializar todo el estado a la vez.
  location.reload();
}

// ===== EVENTOS =====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(input.value);
  input.value = "";
  input.focus();
});

clearBtn.addEventListener("click", clearCompleted);

exportBtn.addEventListener("click", exportData);

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importData(String(reader.result));
  reader.onerror = () => alert("No se pudo leer el archivo.");
  reader.readAsText(file);
  // Permite volver a elegir el mismo archivo si el intento anterior falló.
  importFile.value = "";
});

toggleBtn.addEventListener("click", () => {
  if (timer.running) pause();
  else start();
});

resetBtn.addEventListener("click", reset);

modeBtns.forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

cfgBtn.addEventListener("click", () => {
  if (settingsPanel.hidden) openSettings();
  else closeSettings();
});

settingsSaveBtn.addEventListener("click", commitSettings);
settingsCancelBtn.addEventListener("click", closeSettings);

[setFocusInput, setShortInput, setLongInput, setCyclesInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitSettings();
    if (e.key === "Escape") closeSettings();
  });
});

logToggle.addEventListener("click", toggleLog);

// Al volver a la pestaña el intervalo pudo haber estado estrangulado: se
// recalcula de inmediato en vez de esperar al siguiente tick.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timer.running) tick();
});

romCurrent.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleRomMenu();
});

// Click fuera del picker cierra el menú
document.addEventListener("click", (e) => {
  if (!romMenu.hidden && !romPicker.contains(e.target)) {
    closeRomMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!romMenu.hidden) { closeRomMenu(); return; }
    if (!settingsPanel.hidden) { closeSettings(); return; }
  }
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    if (timer.running) pause();
    else start();
  } else if (e.key === "r" || e.key === "R") {
    reset();
  } else if (e.key === "l" || e.key === "L") {
    toggleLog();
  }
});

// Se pide en el primer START, no al cargar: los navegadores penalizan (y Chrome
// puede autobloquear) los permisos solicitados sin interacción previa.
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// Registro del service worker. Guardado por protocolo: abriendo el archivo por
// file:// no hay service workers, y registrarlo lanzaría un error en consola.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ===== INIT =====
applySettings();
renderRomMenu();
applyRom(currentRom);

if (timer.running) {
  timer.remaining = remainingFromClock();
} else if (timer.remaining > MODES[timer.mode].duration) {
  // Los ajustes pudieron cambiar mientras el timer estaba parado.
  timer.remaining = MODES[timer.mode].duration;
}

renderTimer();
renderTasks();
renderMissionLog();

// Restaurar estado abierto/cerrado del log
if (loadLogOpen()) openLog();

// Retomar la sesión que quedó a medias al cerrar la página.
if (timer.running) {
  if (timer.remaining > 0) {
    intervalId = setInterval(tick, 250);
  } else {
    // Venció mientras la página estaba cerrada. Se registra UNA sola sesión,
    // por mucho tiempo que haya pasado, y sin pitido ni aviso tardíos.
    timer.running = false;
    timer.endAt = null;
    onComplete({ silent: true });
  }
}
