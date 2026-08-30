// ===== ESTADO =====
const STORAGE_KEY = "todo-app:tasks";
const TIMER_KEY = "todo-app:timer";
const SETTINGS_KEY = "todo-app:settings";
const SESSIONS_KEY = "todo-app:sessions";
const LOG_KEY = "todo-app:log-open";
const ROM_KEY = "todo-app:rom";
const SOUND_KEY = "todo-app:sound";
const CUSTOM_ROM_KEY = "todo-app:custom-roms";
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

const DEFAULT_SETTINGS = { focus: 25, short: 5, long: 15, cycles: 4, notePrompt: true };
const DEFAULT_SOUND = { enabled: true, volume: 0.5, customFile: null }; // customFile: {name, dataUrl, mime, size} | null
const MAX_CYCLES = 12;
const POMO_VISIBLE_MAX = 5;
const MAX_TAGS_PER_TASK = 5;
const SESSION_NOTE_TIMEOUT_MS = 30_000;
const TOAST_TTL_MS = 4000;
const HEATMAP_Q1 = 15; // minutos para el primer cuartil
const HEATMAP_Q2 = 45;
const HEATMAP_Q3 = 90;
const HEATMAP_Q4 = 150;

// Normaliza un tag: minúsculas, sin #, sin espacios al borde. Vacío → "".
function normalizeTag(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

// Separa el texto en {text, tags}. Los #palabra sueltos al final se vuelven
// tags; el resto del texto queda como task.text sin los #tokens.
function parseTextAndTags(raw) {
  const tagRe = /(?:^|\s)#([a-z0-9_\-áéíóúñü]+)/gi;
  const tags = [];
  const text = String(raw || "").replace(tagRe, (_, m) => {
    tags.push(normalizeTag(m));
    return "";
  }).replace(/\s+/g, " ").trim();
  return { text, tags: [...new Set(tags)].slice(0, MAX_TAGS_PER_TASK) };
}

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
let activeTagFilter = null; // string | null — no persistido

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

const helpBtn = document.getElementById("help-btn");
const helpEl = document.getElementById("help");
const helpBody = document.getElementById("help-body");
const helpClose = document.getElementById("help-close");

const statsBtn = document.getElementById("stats-btn");
const statsModalEl = document.getElementById("stats-modal");
const statsModalBody = document.getElementById("stats-modal-body");
const statsModalClose = document.getElementById("stats-modal-close");

const setNotePromptToggle = document.getElementById("set-note-prompt");

const setSoundToggle = document.getElementById("set-sound");
const setVolumeInput = document.getElementById("set-volume");
const setVolumeVal = document.getElementById("set-volume-val");
const setSoundPickBtn = document.getElementById("set-sound-pick");
const setSoundClearBtn = document.getElementById("set-sound-clear");
const setSoundNameEl = document.getElementById("set-sound-name");
const setSoundFile = document.getElementById("set-sound-file");

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
const logTagsBlock = document.getElementById("log-tags-block");
const logTagsEl = document.getElementById("log-tags");
const heatmapWrap = document.getElementById("heatmap-wrap");
const heatmapYearEl = document.getElementById("heatmap-year");
const heatmapTotalEl = document.getElementById("heatmap-total");

const tagFilterEl = document.getElementById("tag-filter");
const tagFilterName = document.getElementById("tag-filter-name");
const tagFilterClear = document.getElementById("tag-filter-clear");

const sessionNoteEl = document.getElementById("session-note");
const sessionNoteInput = document.getElementById("session-note-input");
const sessionNoteSave = document.getElementById("session-note-save");
const sessionNoteSkip = document.getElementById("session-note-skip");
const sessionNoteAnnounce = document.getElementById("session-note-announce");

const toastsEl = document.getElementById("toasts");

const paletteEl = document.getElementById("palette");
const paletteInput = document.getElementById("palette-input");
const paletteList = document.getElementById("palette-list");

const romPicker = document.getElementById("rom-picker");
const romCurrent = document.getElementById("rom-current");
const romNameEl = document.getElementById("rom-name");
const romMenu = document.getElementById("rom-menu");

const customRomEl = document.getElementById("custom-rom");
const customRomClose = document.getElementById("custom-rom-close");
const customRomCancel = document.getElementById("custom-rom-cancel");
const customRomSave = document.getElementById("custom-rom-save");
const customRomNameInput = document.getElementById("custom-rom-name");
const customRomPrimaryInput = document.getElementById("custom-rom-primary");
const customRomAccentInput = document.getElementById("custom-rom-accent");
const customRomTertiaryInput = document.getElementById("custom-rom-tertiary");
const customRomHighlightInput = document.getElementById("custom-rom-highlight");
const customRomPreview = document.getElementById("custom-rom-preview");

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
      tags: Array.isArray(t.tags)
        ? [...new Set(t.tags.filter((x) => typeof x === "string" && x.trim()).map((x) => normalizeTag(x)))]
            .slice(0, 5)
        : [],
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
      // Boolean aditivo: si falta en entries viejos, default = true.
      notePrompt: typeof parsed.notePrompt === "boolean" ? parsed.notePrompt : DEFAULT_SETTINGS.notePrompt,
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
  // Reflejar las preferencias de sonido en los controles al abrir.
  updateSoundToggleUI();
  updateVolumeUI();
  updateSoundFileUI();
  updateNotePromptUI();
  setFocusInput.focus();
  setFocusInput.select();
  playSound("settingsOpen");
}

function updateNotePromptUI() {
  if (!setNotePromptToggle) return;
  setNotePromptToggle.setAttribute("aria-pressed", settings.notePrompt ? "true" : "false");
  setNotePromptToggle.textContent = settings.notePrompt ? "NOTA AL TERMINAR" : "NOTA OFF";
  setNotePromptToggle.classList.toggle("setting__toggle--off", !settings.notePrompt);
}

// reason: "close" (escape, click fuera) | "save" (commit) | "cancel" (botón CANCEL)
function closeSettings(reason = "close") {
  cfgBtn.classList.remove("timer__cfg--active");
  settingsPanel.hidden = true;
  if (reason === "save") {
    playSound("settingsSave");
  } else if (reason === "cancel") {
    playSound("settingsCancel");
  } else {
    playSound("settingsClose");
  }
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
    notePrompt: settings.notePrompt,
  };
  saveSettings();
  closeSettings("save");
}

// ===== ROM (theme) =====
function loadCustomRoms() {
  try {
    const raw = localStorage.getItem(CUSTOM_ROM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r) => isValidRom(r)) : [];
  } catch {
    return [];
  }
}

function saveCustomRoms() {
  localStorage.setItem(CUSTOM_ROM_KEY, JSON.stringify(customRoms));
}

function isValidRom(r) {
  return r
    && typeof r.id === "string"
    && typeof r.name === "string"
    && Array.isArray(r.primary) && r.primary.length === 3
    && Array.isArray(r.accent) && r.accent.length === 3
    && Array.isArray(r.tertiary) && r.tertiary.length === 3
    && Array.isArray(r.highlight) && r.highlight.length === 3
    && r.primary.every(Number.isFinite)
    && r.accent.every(Number.isFinite)
    && r.tertiary.every(Number.isFinite)
    && r.highlight.every(Number.isFinite);
}

function findRom(key) {
  if (ROMS[key]) return { rom: ROMS[key], isCustom: false };
  const custom = customRoms.find((r) => r.id === key);
  if (custom) return { rom: custom, isCustom: true };
  return null;
}

function loadRom() {
  const saved = localStorage.getItem(ROM_KEY);
  if (!saved) return "default";
  if (ROMS[saved]) return saved;
  // Custom ROM guardada puede haber sido borrada: caemos al default.
  const found = customRoms.find((r) => r.id === saved);
  return found ? saved : "default";
}

let customRoms = loadCustomRoms();
let currentRom = loadRom();

// Convierte "#rrggbb" a [r, g, b]. Acepta hex con o sin '#'.
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

// ROMS es la única fuente de verdad de los colores: applyRom() escribe las
// variables CSS. El :root del stylesheet sólo conserva la paleta por defecto,
// para que la app se vea bien en el instante previo a que corra este script.
// `silent` suprime sonido + toast: lo usa INIT para no anunciar el ROM al
// cargar la página.
function applyRom(romKey, { silent = false } = {}) {
  const found = findRom(romKey);
  if (!found) return;
  const { rom } = found;
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
  if (!silent) {
    playSound("romSwitch", romKey);
    toast(`ROM: ${rom.name}`);
  }
}

function renderRomMenu() {
  romMenu.innerHTML = "";

  const buildOption = (key, rom, isCustom) => {
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
    name.title = isCustom ? "Click para activar · click × para borrar" : "";

    const check = document.createElement("span");
    check.className = "rom-option__check";
    check.textContent = "✓";

    li.append(swatches, name, check);
    li.addEventListener("click", (e) => {
      // Si el click fue en el botón de borrar (sólo en custom), no activar.
      if (e.target.classList.contains("rom-option__delete")) return;
      applyRom(key);
      closeRomMenu();
    });

    if (isCustom) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "rom-option__delete";
      del.setAttribute("aria-label", `Borrar ROM ${rom.name}`);
      del.title = "Borrar este ROM";
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCustomRom(key);
      });
      li.appendChild(del);
    }

    return li;
  };

  for (const [key, rom] of Object.entries(ROMS)) {
    romMenu.appendChild(buildOption(key, rom, false));
  }

  if (customRoms.length > 0) {
    const sep = document.createElement("li");
    sep.className = "rom-option__separator";
    sep.setAttribute("role", "separator");
    romMenu.appendChild(sep);
    for (const rom of customRoms) {
      romMenu.appendChild(buildOption(rom.id, rom, true));
    }
  }

  // Botón "+ NEW" al final del menú
  const addBtn = document.createElement("li");
  addBtn.className = "rom-option rom-option--add";
  addBtn.setAttribute("role", "option");
  addBtn.textContent = "+ NEW ROM";
  addBtn.title = "Crear un ROM personalizado";
  addBtn.addEventListener("click", () => {
    closeRomMenu();
    openCustomRomModal();
  });
  romMenu.appendChild(addBtn);
}

function deleteCustomRom(id) {
  customRoms = customRoms.filter((r) => r.id !== id);
  saveCustomRoms();
  if (currentRom === id) {
    applyRom("default");
  }
  renderRomMenu();
  toast(`ROM borrado`);
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

// --- Modal de creación de ROM custom ---
// Pre-rellena con los colores del ROM actual para que sea fácil "forkear".
function openCustomRomModal() {
  const current = findRom(currentRom);
  const seed = current ? current.rom : ROMS.default;
  customRomNameInput.value = "";
  customRomPrimaryInput.value = rgbToHex(seed.primary);
  customRomAccentInput.value = rgbToHex(seed.accent);
  customRomTertiaryInput.value = rgbToHex(seed.tertiary);
  customRomHighlightInput.value = rgbToHex(seed.highlight);
  customRomEl.hidden = false;
  updateCustomRomPreview();
  setTimeout(() => customRomNameInput.focus(), 30);
}

function closeCustomRomModal() {
  if (customRomEl.hidden) return;
  customRomEl.hidden = true;
}

function updateCustomRomPreview() {
  if (!customRomPreview) return;
  const slots = ["primary", "accent", "tertiary", "highlight"];
  slots.forEach((slot) => {
    const sw = customRomPreview.querySelector(`[data-slot="${slot}"]`);
    if (!sw) return;
    const input = document.getElementById(`custom-rom-${slot}`);
    sw.style.background = input.value;
  });
}

function saveCustomRomFromForm() {
  const name = (customRomNameInput.value || "").trim();
  if (!name) {
    customRomNameInput.focus();
    return;
  }
  const primary = hexToRgb(customRomPrimaryInput.value);
  const accent = hexToRgb(customRomAccentInput.value);
  const tertiary = hexToRgb(customRomTertiaryInput.value);
  const highlight = hexToRgb(customRomHighlightInput.value);
  if (!primary || !accent || !tertiary || !highlight) return;

  const id = "custom-" + uid();
  const rom = { id, name: name.toUpperCase().slice(0, 20), primary, accent, tertiary, highlight };
  customRoms.push(rom);
  saveCustomRoms();
  renderRomMenu();
  applyRom(id);
  closeCustomRomModal();
  toast(`ROM guardado: ${rom.name}`);
}

customRomPrimaryInput && customRomPrimaryInput.addEventListener("input", updateCustomRomPreview);
customRomAccentInput && customRomAccentInput.addEventListener("input", updateCustomRomPreview);
customRomTertiaryInput && customRomTertiaryInput.addEventListener("input", updateCustomRomPreview);
customRomHighlightInput && customRomHighlightInput.addEventListener("input", updateCustomRomPreview);
customRomClose && customRomClose.addEventListener("click", closeCustomRomModal);
customRomCancel && customRomCancel.addEventListener("click", closeCustomRomModal);
customRomSave && customRomSave.addEventListener("click", saveCustomRomFromForm);
// Enter en el form (nombre) guarda; Esc cierra.
customRomNameInput && customRomNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveCustomRomFromForm(); }
  else if (e.key === "Escape") { e.preventDefault(); closeCustomRomModal(); }
});
// Click en el backdrop cierra; click en el panel no.
customRomEl && customRomEl.addEventListener("click", (e) => {
  if (e.target === customRomEl) closeCustomRomModal();
});

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

  // Aplica el filtro de tag (no persistido). El orden de tasks[] se mantiene;
  // el filtro sólo afecta a lo que se renderiza y al contador.
  const visible = activeTagFilter
    ? tasks.filter((t) => (t.tags || []).includes(activeTagFilter))
    : tasks;

  for (const task of visible) {
    const li = document.createElement("li");
    li.className =
      "item" +
      (task.done ? " item--done" : "") +
      (task.id === activeTaskId && !task.done ? " item--focus" : "");
    li.dataset.id = task.id;
    li.draggable = true;

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

    const drag = document.createElement("span");
    drag.className = "item__drag";
    drag.setAttribute("aria-hidden", "true");
    drag.title = "Arrastra para reordenar";
    drag.textContent = "⠿";

    li.append(checkbox, body);
    if (task.tags && task.tags.length > 0) {
      li.appendChild(buildTagsRow(task.tags));
    }
    if (task.pomodoros > 0) {
      li.appendChild(buildPomodoroBar(task.pomodoros));
    }
    li.append(focusBtn, drag, del);
    attachDragHandlers(li, task.id);
    list.appendChild(li);
  }

  if (toFocus) {
    toFocus.focus();
    toFocus.select();
  }

  // El contador refleja el total real, no el filtrado: el filtro es
  // cosmética y no debe engañar sobre cuántas tareas quedan pendientes.
  const pending = tasks.filter((t) => !t.done).length;
  counter.textContent = pending === 1 ? "1 pendiente" : `${pending} pendientes`;

  const hasCompleted = tasks.some((t) => t.done);
  clearBtn.disabled = !hasCompleted;

  // Empty sólo cuando no hay tareas en absoluto; si hay pero el filtro las
  // oculta, mostramos un mensaje específico.
  const noResults = visible.length === 0 && activeTagFilter !== null;
  empty.hidden = tasks.length > 0;
  if (noResults) {
    const note = document.createElement("li");
    note.className = "item item--empty-filter";
    note.textContent = `// ninguna tarea con #${activeTagFilter}`;
    list.appendChild(note);
  }

  renderTagFilter();
  renderActiveTask();
}

function buildTagsRow(tags) {
  const wrap = document.createElement("span");
  wrap.className = "item__tags";
  for (const tag of tags) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (tag === activeTagFilter ? " chip--active" : "");
    chip.dataset.tag = tag;
    chip.textContent = `#${tag}`;
    chip.title = `Filtrar por #${tag}`;
    chip.setAttribute("aria-label", `Filtrar por etiqueta ${tag}`);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      setTagFilter(tag === activeTagFilter ? null : tag);
    });
    wrap.appendChild(chip);
  }
  return wrap;
}

function setTagFilter(tag) {
  activeTagFilter = tag;
  renderTasks();
  renderMissionLog();
}

function renderTagFilter() {
  if (!tagFilterEl) return;
  if (activeTagFilter) {
    tagFilterEl.hidden = false;
    tagFilterName.textContent = `#${activeTagFilter}`;
  } else {
    tagFilterEl.hidden = true;
  }
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
    finishEditing(input.value, "save");
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    finishEditing(null, "cancel");
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
function finishEditing(newText, kind) {
  const task = tasks.find((t) => t.id === editingTaskId);
  editingTaskId = null;
  if (task && newText !== null) {
    const parsed = parseTextAndTags(newText);
    if (parsed.text) {
      let changed = parsed.text !== task.text;
      const newTags = parsed.tags;
      const oldTags = task.tags || [];
      if (newTags.length !== oldTags.length || newTags.some((t, i) => t !== oldTags[i])) {
        changed = true;
      }
      if (changed) {
        task.text = parsed.text;
        task.tags = newTags;
        saveTasks();
      }
    }
  }
  renderTasks();
  renderActiveTask();
  playSound(kind === "save" ? "editSave" : "editCancel");
}

function addTask(text) {
  const parsed = parseTextAndTags(text);
  if (!parsed.text) return;
  tasks.push({ id: uid(), text: parsed.text, done: false, pomodoros: 0, tags: parsed.tags });
  saveTasks();
  renderTasks();
  playSound("add");
}

function toggle(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  if (task.done && activeTaskId === id) activeTaskId = null;
  saveTasks();
  renderTasks();
  playSound("complete");
  if (task.done) toast("Tarea completada");
}

function removeTask(id) {
  if (activeTaskId === id) activeTaskId = null;
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  renderTasks();
  playSound("delete");
}

function clearCompleted() {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  renderTasks();
  playSound("deleteBulk");
}

function setActiveTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || task.done) {
    activeTaskId = null;
  } else {
    activeTaskId = activeTaskId === id ? null : id;
  }
  renderTasks();
  playSound("targetLock");
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

// --- Drag & drop reorder ---
let dragId = null;

function attachDragHandlers(li, id) {
  li.addEventListener("dragstart", (e) => {
    // No arrastrar si el filtro está activo: el orden visible no representa
    // el array y el drop confundiría.
    if (activeTagFilter) { e.preventDefault(); return; }
    if (editingTaskId) { e.preventDefault(); return; }
    dragId = id;
    li.classList.add("item--dragging");
    e.dataTransfer.effectAllowed = "move";
    // dataTransfer necesita algo para que Firefox dispare el drag.
    try { e.dataTransfer.setData("text/plain", id); } catch {}
  });
  li.addEventListener("dragend", () => {
    dragId = null;
    list.querySelectorAll(".item--drop-target").forEach((n) => n.classList.remove("item--drop-target"));
  });
  li.addEventListener("dragover", (e) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    li.classList.toggle("item--drop-target-before", before);
    li.classList.toggle("item--drop-target-after", !before);
  });
  li.addEventListener("dragleave", () => {
    li.classList.remove("item--drop-target-before", "item--drop-target-after");
  });
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    const rect = li.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    reorderTasks(dragId, id, before);
  });
}

function reorderTasks(srcId, dstId, before) {
  const srcIdx = tasks.findIndex((t) => t.id === srcId);
  const dstIdx = tasks.findIndex((t) => t.id === dstId);
  if (srcIdx < 0 || dstIdx < 0 || srcIdx === dstIdx) return;
  const [moved] = tasks.splice(srcIdx, 1);
  // Re-indexar el destino después de sacar el source
  const newDst = tasks.findIndex((t) => t.id === dstId);
  tasks.splice(before ? newDst : newDst + 1, 0, moved);
  saveTasks();
  renderTasks();
  announce(`Tarea movida a la posición ${tasks.indexOf(moved) + 1}.`);
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
  playSound("timerStart");
}

function pause() {
  if (!timer.running) return;
  timer.remaining = remainingFromClock();
  timer.running = false;
  timer.endAt = null;
  clearInterval(intervalId);
  intervalId = null;
  renderTimer();
  playSound("timerPause");
}

function reset() {
  pause();
  timer.remaining = MODES[timer.mode].duration;
  modeStash[timer.mode] = null;
  renderTimer();
  playSound("timerReset");
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

// Stash del remaining de cada modo cuando el usuario cambia manualmente.
// Al volver al modo, se restaura en vez de empezar de cero. El auto-advance
// desde onComplete() no usa este stash (sus sesiones se completaron completas).
// No persistido: al recargar la página se pierde. Suficiente para la sesión.
const modeStash = { focus: null, short: null, long: null };

function setMode(mode, { fromUser = false } = {}) {
  // Si el usuario cambia de modo manualmente (no auto-advance), guarda el
  // remaining del modo actual para restaurarlo al volver.
  if (fromUser && timer.mode !== mode) {
    modeStash[timer.mode] = timer.running ? remainingFromClock() : timer.remaining;
  }
  pause();
  timer.mode = mode;
  // Restaura del stash si hay algo; si no, duración completa.
  const stashed = modeStash[mode];
  timer.remaining = stashed != null ? stashed : MODES[mode].duration;
  // Consumir el stash del modo al que entramos: ya no representa "lo que
  // dejamos pendiente en otro lado".
  modeStash[mode] = null;
  renderTimer();
  const soundKey = mode === "focus" ? "modeFocus" : mode === "short" ? "modeShort" : "modeLong";
  playSound(soundKey);
}

function onComplete({ silent = false } = {}) {
  const finishedMode = timer.mode;
  const finishedMinutes = Math.round(MODES[finishedMode].duration / 60);

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

  // Feedback audible/visible para que el usuario sepa que pasó algo.
  if (!silent) {
    playSound("sessionComplete", finishedMode);
    flashTimer();
    announce(`${MODES[finishedMode].label} terminado.`);
  }

  // En breaks y con la pestaña oculta, sólo Notification API.
  // En focus con la pestaña visible, mostramos un toast rápido + el modal
  // de nota es opcional (configurable). El sonido ya disparó arriba.
  if (!silent && finishedMode === "focus" && document.visibilityState === "visible" && settings.notePrompt) {
    promptForSessionNote();
    toast(`${MODES[finishedMode].label} terminado`);
  } else if (!silent) {
    toast(`${MODES[finishedMode].label} terminado`);
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

// --- Modal de nota de sesión ---
// Aparece al terminar un focus (sólo si la pestaña tiene foco). Enter guarda,
// Esc omite, timeout 30s omite. La nota se guarda en el último session log.
function promptForSessionNote() {
  // Si ya hay un modal abierto (caso patológico de doble onComplete), no abrir otro.
  if (!sessionNoteEl.hidden) return;
  const targetIdx = sessions.length - 1;
  sessionNoteInput.value = "";
  sessionNoteEl.hidden = false;

  let settled = false;
  let timeoutId = null;
  const close = () => {
    sessionNoteEl.hidden = true;
    sessionNoteInput.removeEventListener("keydown", onKey);
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  };
  const finish = (skip) => {
    if (settled) return;
    settled = true;
    if (!skip) {
      const text = sessionNoteInput.value.trim();
      if (text && targetIdx >= 0 && sessions[targetIdx]) {
        sessions[targetIdx].note = text;
        saveSessions();
        renderMissionLog();
      }
    }
    close();
  };
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(true);
    }
  };
  sessionNoteInput.addEventListener("keydown", onKey);
  sessionNoteSave.addEventListener("click", () => finish(false), { once: true });
  sessionNoteSkip.addEventListener("click", () => finish(true), { once: true });

  timeoutId = setTimeout(() => finish(true), SESSION_NOTE_TIMEOUT_MS);

  // Autofocus con un tick de delay: el modal ya está visible pero el foco
  // todavía está donde estaba antes de onComplete.
  setTimeout(() => sessionNoteInput.focus(), 30);
  // Anuncio para lectores de pantalla.
  sessionNoteAnnounce.textContent = "";
  setTimeout(() => {
    sessionNoteAnnounce.textContent = "Sesión completa. Puedes anotar qué hiciste.";
  }, 80);
}

// --- Toasts ---
// Feedback visible en la esquina inferior derecha. Hasta 3 apilados, fade-out.
function toast(message) {
  if (!toastsEl) return;
  while (toastsEl.children.length >= 3) {
    toastsEl.firstElementChild.remove();
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  el.setAttribute("role", "status");
  const dismiss = () => {
    if (!el.parentNode) return;
    el.classList.add("toast--leaving");
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener("click", dismiss);
  el._ttl = setTimeout(dismiss, TOAST_TTL_MS);
  toastsEl.appendChild(el);
}

// --- Command palette (Ctrl/Cmd+K) ---
// Overlay con fuzzy-substring sobre una lista de acciones. Cada callback
// invoca el mismo código que el botón o atajo existente — no se duplica
// lógica, sólo se referencia.
const ACTIONS = [
  // Timer
  { id: "timer-start",  label: "Iniciar temporizador",     kw: "start play go correr",  run: () => start() },
  { id: "timer-pause",  label: "Pausar temporizador",      kw: "pause stop parar",      run: () => pause() },
  { id: "timer-reset",  label: "Reiniciar temporizador",   kw: "reset restart",         run: () => reset() },
  { id: "mode-focus",   label: "Modo · FOCUS",             kw: "focus trabajar",        run: () => setMode("focus") },
  { id: "mode-break",   label: "Modo · BREAK",             kw: "break descanso corto",  run: () => setMode("short") },
  { id: "mode-long",    label: "Modo · LONG",              kw: "long descanso largo",   run: () => setMode("long") },
  // Tasks
  { id: "task-add",     label: "Añadir tarea",             kw: "new add crear",         run: () => { closePalette(); input.focus(); } },
  { id: "task-clear",   label: "Limpiar completadas",      kw: "clear clean borrar",    run: () => clearCompleted() },
  // Log
  { id: "log-open",     label: "Abrir mission log",        kw: "open log stats",        run: () => openLog() },
  { id: "log-close",    label: "Cerrar mission log",       kw: "close log",             run: () => closeLog() },
  { id: "log-toggle",   label: "Toggle mission log",       kw: "log toggle",            run: () => toggleLog() },
  // Settings
  { id: "settings",     label: "Abrir configuración",      kw: "settings config setup", run: () => openSettings() },
  // Help & Stats
  { id: "help",         label: "Abrir ayuda",              kw: "help ayuda atajos",     run: () => openHelp() },
  { id: "stats",        label: "Abrir estadísticas",       kw: "stats stats modal log", run: () => openStatsModal() },
  // ROMs
  { id: "rom-default",   label: "ROM · DEFAULT",  kw: "rom theme default",         run: () => applyRom("default") },
  { id: "rom-blade",     label: "ROM · BLADE",    kw: "rom theme blade",           run: () => applyRom("blade") },
  { id: "rom-matrix",    label: "ROM · MATRIX",   kw: "rom theme matrix green",    run: () => applyRom("matrix") },
  { id: "rom-cdproject", label: "ROM · CDPROJECT",kw: "rom theme cdproject yellow",run: () => applyRom("cdproject") },
  { id: "rom-akira",     label: "ROM · AKIRA",    kw: "rom theme akira red",       run: () => applyRom("akira") },
  { id: "rom-custom",    label: "Crear ROM custom", kw: "rom custom nuevo create",  run: () => openCustomRomModal() },
  // Data
  { id: "export",       label: "Exportar datos",           kw: "export backup download", run: () => exportData() },
  { id: "import",       label: "Importar datos",           kw: "import restore upload",  run: () => importFile.click() },
  // Filter
  { id: "filter-clear", label: "Quitar filtro de tag",     kw: "filter clear tag",       run: () => setTagFilter(null) },
];

let paletteActive = 0;
let paletteFiltered = ACTIONS.slice();

function openPalette() {
  paletteEl.hidden = false;
  paletteInput.value = "";
  paletteActive = 0;
  paletteFiltered = ACTIONS.slice();
  renderPaletteList();
  setTimeout(() => paletteInput.focus(), 30);
}

function closePalette() {
  if (paletteEl.hidden) return;
  paletteEl.hidden = true;
  paletteInput.value = "";
}

function filterPalette(query) {
  const q = String(query || "").toLowerCase().trim();
  paletteFiltered = q
    ? ACTIONS.filter((a) => a.label.toLowerCase().includes(q) || a.kw.toLowerCase().includes(q))
    : ACTIONS.slice();
  paletteActive = 0;
  renderPaletteList();
}

function renderPaletteList() {
  paletteList.innerHTML = "";
  paletteFiltered.forEach((action, i) => {
    const li = document.createElement("li");
    li.className = "palette__item" + (i === paletteActive ? " palette__item--active" : "");
    li.dataset.id = action.id;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", i === paletteActive ? "true" : "false");
    li.textContent = action.label;
    li.addEventListener("click", () => runPaletteAction(i));
    paletteList.appendChild(li);
  });
  if (paletteFiltered.length === 0) {
    const li = document.createElement("li");
    li.className = "palette__item palette__item--empty";
    li.textContent = "// sin resultados";
    paletteList.appendChild(li);
  }
}

function movePaletteActive(delta) {
  if (paletteFiltered.length === 0) return;
  paletteActive = (paletteActive + delta + paletteFiltered.length) % paletteFiltered.length;
  renderPaletteList();
}

function runPaletteAction(idx) {
  const action = paletteFiltered[idx];
  if (!action) return;
  closePalette();
  try {
    action.run();
  } catch {}
}

paletteInput.addEventListener("input", () => filterPalette(paletteInput.value));
paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); movePaletteActive(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); movePaletteActive(-1); }
  else if (e.key === "Enter") { e.preventDefault(); runPaletteAction(paletteActive); }
});
// Click en el backdrop cierra; click en el panel no.
paletteEl.addEventListener("click", (e) => {
  if (e.target === paletteEl) closePalette();
});

// --- Help modal (?) ---
// Lista estática de atajos y features. Se renderiza una vez al init.
const HELP_CONTENT = [
  {
    title: "Atajos del teclado",
    rows: [
      ["Space", "Iniciar / pausar temporizador"],
      ["R", "Reiniciar temporizador"],
      ["L", "Toggle Mission Log"],
      ["Ctrl/Cmd + K", "Abrir command palette"],
      ["?", "Esta ayuda"],
      ["S", "Modal de estadísticas (▦)"],
      ["Esc", "Cerrar paleta / menú / modal"],
      ["Alt + ↑ / ↓", "Mover tarea enfocada"],
    ],
  },
  {
    title: "Tareas",
    rows: [
      ["Doble clic en tarea", "Editar texto"],
      ["Tags en el texto", "Escribí #frontend para agregar etiqueta"],
      ["Click en chip #tag", "Filtrar lista por etiqueta"],
      ["Hover sobre tarea", "Aparece el handle ⠿ para arrastrar"],
      ["Botón ◎", "Marcar como tarea activa"],
    ],
  },
  {
    title: "Temporizador",
    rows: [
      ["Tabs FOCUS / BREAK / LONG", "Cambiar modo (recuerda el progreso al volver)"],
      ["Auto-advance", "Tras N ciclos focus, salta a break largo"],
      ["Stash de modo", "Al cambiar de modo manualmente guarda el remaining"],
      ["Nota al terminar", "Anotá qué hiciste (configurable en ⚙)"],
    ],
  },
  {
    title: "Mission Log",
    rows: [
      ["Heatmap", "365 días, color por minutos enfocados"],
      ["TOP TASKS", "Tus tareas con más minutos de focus"],
      ["TOP TAGS", "Tus etiquetas con más minutos"],
      ["Modal de stats", "Apretá S o el botón 📊 para verlo grande"],
    ],
  },
  {
    title: "Personalización",
    rows: [
      ["5 ROMs built-in", "Default / Blade / Matrix / CDProject / Akira"],
      ["Custom ROM", "Menú ROM → '+ NEW ROM' · 4 colores + nombre"],
      ["Audio custom", "Subí tu propio sonido de fin (≤50 KB)"],
      ["Volumen", "Slider en ⚙ Settings"],
      ["Preferencias de sonido", "On/off, volumen, archivo custom"],
    ],
  },
];

function renderHelp() {
  if (!helpBody) return;
  helpBody.innerHTML = "";
  for (const section of HELP_CONTENT) {
    const h3 = document.createElement("h3");
    h3.className = "help__section-title";
    h3.textContent = `// ${section.title}`;
    helpBody.appendChild(h3);
    const dl = document.createElement("dl");
    dl.className = "help__list";
    for (const [key, desc] of section.rows) {
      const dt = document.createElement("dt");
      dt.className = "help__key";
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.className = "help__desc";
      dd.textContent = desc;
      dl.append(dt, dd);
    }
    helpBody.appendChild(dl);
  }
}

function openHelp() {
  if (!helpEl) return;
  renderHelp();
  helpEl.hidden = false;
}

function closeHelp() {
  if (!helpEl) return;
  helpEl.hidden = true;
}

helpBtn && helpBtn.addEventListener("click", openHelp);
helpClose && helpClose.addEventListener("click", closeHelp);
helpEl && helpEl.addEventListener("click", (e) => {
  if (e.target === helpEl) closeHelp();
});

// --- Stats modal (S / 📊) ---
// Clon del Mission Log en formato modal. Reusa getStats y las funciones de
// render existentes para no duplicar lógica.
function renderStatsModalBody() {
  if (!statsModalBody) return;
  // Reusamos el bloque log__body como plantilla: lo clonamos dentro del modal.
  const original = document.getElementById("log-body");
  if (!original) return;
  statsModalBody.innerHTML = "";
  const clone = original.cloneNode(true);
  // El clone hereda estilos porque están en .log__stats, .chart, etc.
  statsModalBody.appendChild(clone);
}

function openStatsModal() {
  if (!statsModalEl) return;
  renderStatsModalBody();
  statsModalEl.hidden = false;
}

function closeStatsModal() {
  if (!statsModalEl) return;
  statsModalEl.hidden = true;
}

statsBtn && statsBtn.addEventListener("click", openStatsModal);
statsModalClose && statsModalClose.addEventListener("click", closeStatsModal);
statsModalEl && statsModalEl.addEventListener("click", (e) => {
  if (e.target === statsModalEl) closeStatsModal();
});

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

// ===== AUDIO =====
// Sonidos sintetizados con WebAudio: nada de archivos para el feedback de UI.
// Cada ROM define su propio "kit" (timbre + frecuencias + fanfarria + acorde firma).
// El sonido de sesión completada puede reemplazarse con un archivo del usuario
// (<50 KB, base64 en localStorage) que se sube desde el panel de Settings.

// --- Estado ---
function loadSoundPrefs() {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (!raw) return { ...DEFAULT_SOUND };
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_SOUND.enabled,
      volume: Number.isFinite(parsed.volume) ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SOUND.volume,
      customFile:
        parsed.customFile &&
        typeof parsed.customFile === "object" &&
        typeof parsed.customFile.dataUrl === "string" &&
        typeof parsed.customFile.name === "string"
          ? {
              name: parsed.customFile.name,
              dataUrl: parsed.customFile.dataUrl,
              mime: typeof parsed.customFile.mime === "string" ? parsed.customFile.mime : "audio/*",
              size: Number.isFinite(parsed.customFile.size) ? parsed.customFile.size : 0,
            }
          : null,
    };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

function saveSoundPrefs() {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(soundPrefs));
  } catch {}
}

let soundPrefs = loadSoundPrefs();
let customAudioBuffer = null;

// matchMedia puede no existir en algunos navegadores viejos; defenderse.
let reducedMotion = (() => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();
try {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", (e) => { reducedMotion = e.matches; });
} catch {}

// --- Helpers ---
function ctxOrNull() {
  // El AudioContext sólo se crea en gesto del usuario (en start()).
  // Si no existe aún, los sonidos UI quedan en silencio — coherente con
  // cómo se pide el permiso de Notification en el primer START.
  if (!audioCtx) return null;
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx.state === "running" ? audioCtx : null;
}

// Sonidos no esenciales: se silencian con prefers-reduced-motion.
// sessionComplete sigue sonando porque es señal crítica de fin de sesión.
const NON_ESSENTIAL = new Set([
  "hover", "click", "add", "delete", "deleteBulk", "complete",
  "editSave", "editCancel", "modeFocus", "modeShort", "modeLong",
  "timerStart", "timerPause", "timerReset",
  "settingsOpen", "settingsClose", "settingsSave", "settingsCancel",
  "export", "import", "romSwitch", "targetLock",
]);
function skipForMotion(kind) {
  return reducedMotion && NON_ESSENTIAL.has(kind);
}

// --- Primitiva de oscilador ---
// Programa una nota con envelope ADSR mínimo (attack lineal + decay exponencial).
function tone({ freq, dur, type, gain, attack, decay, start = 0, detune = 0, filter }) {
  const ctx = ctxOrNull();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    osc.connect(g);

    let last = g;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || "lowpass";
      f.frequency.value = filter.freq || 1200;
      g.connect(f);
      last = f;
    }
    last.connect(ctx.destination);

    const t0 = ctx.currentTime + start;
    const a = attack ?? 0.005;
    const d = decay ?? Math.max(0.05, dur * 0.6);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);

    osc.start(t0);
    osc.stop(t0 + a + d + 0.05);
  } catch {}
}

// Programa varias notas. Si stagger > 0 se arpeggian; si no, suenan a la vez.
function chord(notes, { stagger = 0 } = {}) {
  notes.forEach((n, i) => tone({ ...n, start: (n.start || 0) + i * stagger }));
}

// --- Kits de audio por ROM ---
// Cada uno define el carácter sonoro del tema. La fanfare se usa al completar
// sesión; el signatureChord (4 notas, una por slot de color) al cambiar ROM.
const ROM_AUDIO = {
  default: {
    wave: "square",
    baseFreqs: { focus: 196, short: 440, long: 262 }, // G3 / A4 / C4
    envelope: { attack: 0.005, decay: 0.10 },
    hover: { freq: 1200, dur: 0.025, gain: 0.018 },
    click: { freq: 900,  dur: 0.04,  gain: 0.07 },
    fanfare: [
      { freq: 523.25, dur: 0.12, gain: 0.10 }, // C5
      { freq: 659.25, dur: 0.12, gain: 0.10 }, // E5
      { freq: 783.99, dur: 0.12, gain: 0.10 }, // G5
      { freq: 1046.5, dur: 0.32, gain: 0.13 }, // C6 sostenido
    ],
    fanfareBreak: [
      { freq: 880,  dur: 0.10, gain: 0.10 },
      { freq: 1318, dur: 0.30, gain: 0.12 }, // E6
    ],
    signatureChord: [
      { freq: 523.25, dur: 0.18, gain: 0.06 }, // primary
      { freq: 659.25, dur: 0.18, gain: 0.06 }, // accent
      { freq: 783.99, dur: 0.18, gain: 0.06 }, // tertiary
      { freq: 1046.5, dur: 0.24, gain: 0.07 }, // highlight
    ],
  },
  blade: {
    wave: "sawtooth",
    baseFreqs: { focus: 174, short: 415, long: 233 }, // F3 / G#4 / A#3
    envelope: { attack: 0.012, decay: 0.14 },
    hover: { freq: 660, dur: 0.035, gain: 0.02 },
    click: { freq: 330, dur: 0.05,  gain: 0.08 },
    fanfare: [
      { freq: 349.23, dur: 0.14, gain: 0.10 }, // F4
      { freq: 415.30, dur: 0.14, gain: 0.10 }, // G#4
      { freq: 523.25, dur: 0.14, gain: 0.10 }, // C5
      { freq: 698.46, dur: 0.40, gain: 0.13 }, // F5 sostenido
    ],
    fanfareBreak: [
      { freq: 698.46, dur: 0.10, gain: 0.10 },
      { freq: 830.61, dur: 0.30, gain: 0.12 }, // G#5
    ],
    signatureChord: [
      { freq: 349.23, dur: 0.20, gain: 0.06 },
      { freq: 466.16, dur: 0.20, gain: 0.06 }, // A#4
      { freq: 523.25, dur: 0.20, gain: 0.06 },
      { freq: 698.46, dur: 0.26, gain: 0.07 },
    ],
  },
  matrix: {
    wave: "sine",
    baseFreqs: { focus: 220, short: 587, long: 277 }, // A3 / D5 / C#4
    envelope: { attack: 0.003, decay: 0.08 },
    hover: { freq: 1800, dur: 0.02,  gain: 0.015 },
    click: { freq: 1100, dur: 0.045, gain: 0.06 },
    fanfare: [
      { freq: 440, dur: 0.10, gain: 0.10 }, // A4
      { freq: 554, dur: 0.10, gain: 0.10 }, // C#5
      { freq: 659, dur: 0.10, gain: 0.10 }, // E5
      { freq: 880, dur: 0.30, gain: 0.13 }, // A5 sostenido
    ],
    fanfareBreak: [
      { freq: 1175, dur: 0.08, gain: 0.10 },
      { freq: 1568, dur: 0.30, gain: 0.12 }, // G6
    ],
    signatureChord: [
      { freq: 440, dur: 0.18, gain: 0.06 },
      { freq: 554, dur: 0.18, gain: 0.06 },
      { freq: 659, dur: 0.18, gain: 0.06 },
      { freq: 880, dur: 0.24, gain: 0.07 },
    ],
  },
  cdproject: {
    wave: "triangle",
    baseFreqs: { focus: 247, short: 494, long: 294 }, // B3 / B4 / D4
    envelope: { attack: 0.004, decay: 0.09 },
    hover: { freq: 1300, dur: 0.025, gain: 0.018 },
    click: { freq: 1000, dur: 0.045, gain: 0.07 },
    fanfare: [
      { freq: 494, dur: 0.12, gain: 0.10 }, // B4
      { freq: 587, dur: 0.12, gain: 0.10 }, // D5
      { freq: 740, dur: 0.12, gain: 0.10 }, // F#5
      { freq: 988, dur: 0.32, gain: 0.13 }, // B5 sostenido
    ],
    fanfareBreak: [
      { freq: 988,  dur: 0.10, gain: 0.10 },
      { freq: 1175, dur: 0.30, gain: 0.12 }, // D6
    ],
    signatureChord: [
      { freq: 494, dur: 0.18, gain: 0.06 },
      { freq: 659, dur: 0.18, gain: 0.06 }, // E5
      { freq: 740, dur: 0.18, gain: 0.06 },
      { freq: 988, dur: 0.24, gain: 0.07 },
    ],
  },
  akira: {
    wave: "square",
    baseFreqs: { focus: 165, short: 523, long: 247 }, // E3 / C5 / B3
    envelope: { attack: 0.003, decay: 0.06 },
    hover: { freq: 1500, dur: 0.02,  gain: 0.018 },
    click: { freq: 990,  dur: 0.04,  gain: 0.08 },
    fanfare: [
      { freq: 392,  dur: 0.06, gain: 0.09 }, // G4
      { freq: 523,  dur: 0.06, gain: 0.09 }, // C5
      { freq: 659,  dur: 0.06, gain: 0.09 }, // E5
      { freq: 880,  dur: 0.06, gain: 0.09 }, // A5
      { freq: 1046, dur: 0.32, gain: 0.13 }, // C6 sostenido
    ],
    fanfareBreak: [
      { freq: 1046, dur: 0.08, gain: 0.10 },
      { freq: 1568, dur: 0.30, gain: 0.12 }, // G6
    ],
    signatureChord: [
      { freq: 392, dur: 0.16, gain: 0.06 },
      { freq: 523, dur: 0.16, gain: 0.06 },
      { freq: 659, dur: 0.16, gain: 0.06 },
      { freq: 880, dur: 0.22, gain: 0.07 },
    ],
  },
};

// --- Catálogo de sonidos ---
// Cada función construye los parámetros usando el kit del ROM activo.
// Todas las ganancias son pre-multiplicador; playSound() aplica volume.

function buildKitSound(kitKey) {
  return (extra = {}) => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const base = kit[kitKey];
    if (!base) return;
    tone({
      ...base,
      type: extra.type || kit.wave,
      attack: kit.envelope.attack,
      decay: kit.envelope.decay,
      gain: (base.gain || 0.05) * soundPrefs.volume,
      ...extra,
      filter: kit.wave === "sawtooth" ? { freq: 1200, type: "lowpass" } : undefined,
    });
  };
}

const SOUNDS = {
  hover:  buildKitSound("hover"),
  click:  buildKitSound("click"),

  add: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const base = kit.baseFreqs.short;
    chord([
      { freq: base * 1.5, dur: 0.08, gain: 0.08 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
      { freq: base * 2.0, dur: 0.09, gain: 0.07 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
    ]);
  },

  delete: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const base = kit.baseFreqs.short;
    chord([
      { freq: base * 2.0, dur: 0.08, gain: 0.07 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
      { freq: base * 1.5, dur: 0.09, gain: 0.06 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
    ]);
  },

  deleteBulk: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    [1000, 800, 600, 400].forEach((f, i) => {
      tone({ freq: f, dur: 0.08, gain: 0.06 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay, start: i * 0.05 });
    });
  },

  complete: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const base = kit.baseFreqs.short;
    chord([
      { freq: base * 2.0, dur: 0.10, gain: 0.08 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
      { freq: base * 2.4, dur: 0.10, gain: 0.08 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
    ]);
  },

  editSave: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    chord([
      { freq: 740, dur: 0.08, gain: 0.07 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
      { freq: 988, dur: 0.08, gain: 0.07 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay },
    ]);
  },

  editCancel: () => {
    tone({ freq: 220, dur: 0.05, gain: 0.04 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.04 });
    tone({ freq: 196, dur: 0.05, gain: 0.035 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.04, start: 0.04 });
  },

  modeFocus: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    tone({ freq: kit.baseFreqs.focus, dur: 0.18, gain: 0.09 * soundPrefs.volume, type: kit.wave, attack: kit.envelope.attack, decay: 0.18 });
  },

  modeShort: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    tone({ freq: kit.baseFreqs.short * 2, dur: 0.12, gain: 0.08 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.12 });
  },

  modeLong: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const ctx = ctxOrNull();
    if (!ctx) return;
    try {
      // Tono medio con eco vía DelayNode reutilizable.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = kit.wave;
      osc.frequency.value = 392;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.08 * soundPrefs.volume, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(g);
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.12;
      g.connect(delay);
      const dg = ctx.createGain();
      dg.gain.value = 0.6;
      delay.connect(dg);
      dg.connect(ctx.destination);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  },

  timerStart: () => {
    chord([
      { freq: 660, dur: 0.07, gain: 0.07 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.07 },
      { freq: 880, dur: 0.07, gain: 0.07 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.07, start: 0.05 },
    ]);
  },

  timerPause: () => {
    chord([
      { freq: 880, dur: 0.07, gain: 0.07 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.07 },
      { freq: 660, dur: 0.07, gain: 0.07 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.07, start: 0.05 },
    ]);
  },

  timerReset: () => {
    tone({ freq: 440, dur: 0.08, gain: 0.05 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.08 });
  },

  settingsOpen: () => {
    chord(
      [
        { freq: 523, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
        { freq: 659, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
        { freq: 784, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
      ],
      { stagger: 0.05 }
    );
  },

  settingsClose: () => {
    chord(
      [
        { freq: 784, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
        { freq: 659, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
        { freq: 523, dur: 0.10, gain: 0.06 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.10 },
      ],
      { stagger: 0.05 }
    );
  },

  settingsSave: () => {
    // Bloque mayor simultáneo: C+E+G a la vez.
    chord([
      { freq: 523, dur: 0.18, gain: 0.05 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.18 },
      { freq: 659, dur: 0.18, gain: 0.05 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.18 },
      { freq: 784, dur: 0.18, gain: 0.05 * soundPrefs.volume, type: "triangle", attack: 0.003, decay: 0.18 },
    ]);
  },

  settingsCancel: () => {
    tone({ freq: 180, dur: 0.06, gain: 0.035 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.06 });
  },

  export: () => {
    const ctx = ctxOrNull();
    if (!ctx) return;
    try {
      // Sweep 300→1200 Hz + blip final a 1500 Hz.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.25);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.06 * soundPrefs.volume, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.30);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
      tone({ freq: 1500, dur: 0.08, gain: 0.07 * soundPrefs.volume, type: "square", attack: 0.003, decay: 0.08, start: 0.25 });
    } catch {}
  },

  import: () => {
    [800, 600, 500, 400].forEach((f, i) => {
      tone({ freq: f, dur: 0.08, gain: 0.06 * soundPrefs.volume, type: "sine", attack: 0.003, decay: 0.08, start: i * 0.08 });
    });
  },

  romSwitch: (romKey) => {
    const kit = ROM_AUDIO[romKey] || ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    chord(
      kit.signatureChord.map((n) => ({ ...n, gain: n.gain * soundPrefs.volume })),
      { stagger: 0.06 }
    );
  },

  sessionComplete: (finishedMode) => {
    // Si hay archivo custom, decodificar perezosamente y reproducir.
    if (soundPrefs.customFile && soundPrefs.customFile.dataUrl) {
      playCustomFile().then((played) => {
        if (played) return;
        // Fallback a fanfarria sintetizada si falla la decodificación.
        playFanfare(finishedMode);
      });
      return;
    }
    playFanfare(finishedMode);
  },

  targetLock: () => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    const ctx = ctxOrNull();
    if (!ctx) return;
    try {
      const lo = kit.baseFreqs.short * 0.7;
      const hi = kit.baseFreqs.short * 1.6;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(lo, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(hi, ctx.currentTime + 0.10);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05 * soundPrefs.volume, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      tone({ freq: 600, dur: 0.04, gain: 0.08 * soundPrefs.volume, type: "square", attack: 0.002, decay: 0.04, start: 0.10 });
    } catch {}
  },
};

function playFanfare(finishedMode) {
  const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
  const notes = finishedMode === "focus" ? kit.fanfare : kit.fanfareBreak;
  chord(
    notes.map((n) => ({ ...n, gain: n.gain * soundPrefs.volume, type: n.type || kit.wave, attack: kit.envelope.attack, decay: kit.envelope.decay })),
    { stagger: 0.05 }
  );
}

// --- Dispatcher ---
function playSound(kind, ...args) {
  if (!soundPrefs.enabled) return;
  if (skipForMotion(kind)) return;
  const fn = SOUNDS[kind];
  if (!fn) return;
  try {
    fn(...args);
  } catch {}
}

// --- Archivo custom de notificación ---
// Se almacena como base64 en localStorage y se decodifica perezosamente al primer uso.
async function pickSoundFile(file) {
  if (!file) return;
  if (file.size > 50_000) {
    alert("El archivo es demasiado grande (50 KB máx.).");
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  soundPrefs.customFile = {
    name: file.name,
    dataUrl,
    mime: file.type || "audio/*",
    size: file.size,
  };
  customAudioBuffer = null;
  saveSoundPrefs();
  updateSoundFileUI();
}

async function decodeCustomFile() {
  if (!soundPrefs.customFile || !soundPrefs.customFile.dataUrl) return null;
  const ctx = ctxOrNull() || (() => {
    // Si el audioCtx aún no existe (no se ha pulsado START), crearlo aquí
    // rompe la política de autoplay. Devolver null y dejar que playCustomFile
    // intente más tarde, en un gesto.
    return null;
  })();
  if (!ctx) return null;
  try {
    const res = await fetch(soundPrefs.customFile.dataUrl);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    customAudioBuffer = buf;
    return buf;
  } catch {
    return null;
  }
}

async function playCustomFile() {
  const buf = customAudioBuffer || (await decodeCustomFile());
  if (!buf) return false;
  const ctx = ctxOrNull();
  if (!ctx) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = soundPrefs.volume;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0);
    return true;
  } catch {
    return false;
  }
}

function clearCustomFile() {
  soundPrefs.customFile = null;
  customAudioBuffer = null;
  saveSoundPrefs();
  updateSoundFileUI();
}

function updateSoundFileUI() {
  if (!setSoundFile || !setSoundClearBtn || !setSoundNameEl) return;
  if (soundPrefs.customFile) {
    setSoundFile.dataset.hasFile = "true";
    setSoundClearBtn.hidden = false;
    setSoundNameEl.textContent = soundPrefs.customFile.name || "custom";
  } else {
    setSoundFile.dataset.hasFile = "false";
    setSoundClearBtn.hidden = true;
    setSoundNameEl.textContent = "synth";
  }
}

function updateSoundToggleUI() {
  if (!setSoundToggle) return;
  setSoundToggle.setAttribute("aria-pressed", soundPrefs.enabled ? "true" : "false");
  setSoundToggle.textContent = soundPrefs.enabled ? "SOUND ON" : "SOUND OFF";
}

function updateVolumeUI() {
  if (!setVolumeInput || !setVolumeVal) return;
  const pct = Math.round(soundPrefs.volume * 100);
  setVolumeInput.value = String(pct);
  setVolumeVal.textContent = `${pct}%`;
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

  // Reparto por tag. Cada sesión de focus se atribuye a TODOS los tags de la
  // tarea que tenía como target. Si la tarea fue borrada o no tenía tags, va
  // a "untagged" para no perder los minutos en el total.
  const byTag = new Map();
  focusSessions.forEach((s) => {
    if (!s.taskId) return;
    const live = tasks.find((t) => t.id === s.taskId);
    const tags = (live && live.tags) || [];
    const keys = tags.length > 0 ? tags : ["untagged"];
    keys.forEach((tag) => {
      const entry = byTag.get(tag) || { tag, minutes: 0, count: 0 };
      entry.minutes += s.minutes;
      entry.count++;
      byTag.set(tag, entry);
    });
  });
  const topTags = [...byTag.values()]
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  return { todayCount, todayMinutes, totalCount, totalMinutes, bestDay, bestCount, streak, last7, topTasks, topTags };
}

function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- Heatmap calendar ---
// Grid estilo GitHub: 53 columnas × 7 filas = 364 días (año actual). Color
// por nivel de minutos enfocados, sobre var(--c-cyan) con alpha creciente.
function heatmapQuartile(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < HEATMAP_Q1) return 1;
  if (minutes < HEATMAP_Q2) return 2;
  if (minutes < HEATMAP_Q3) return 3;
  return 4;
}

function renderHeatmap() {
  if (!heatmapWrap || !heatmapYearEl || !heatmapTotalEl) return;
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  // Agrupa sesiones focus por día del año actual.
  const byDay = new Map();
  let totalSessions = 0;
  let totalMinutes = 0;
  sessions.forEach((s) => {
    if (s.mode !== "focus") return;
    const d = new Date(s.ts);
    if (d.getFullYear() !== year) return;
    const k = dayKey(d);
    byDay.set(k, (byDay.get(k) || 0) + s.minutes);
    totalSessions++;
    totalMinutes += s.minutes;
  });

  const cellSize = 11;
  const gap = 2;
  const headerH = 14;
  const cols = 53;
  const w = cols * (cellSize + gap);
  const h = headerH + 7 * (cellSize + gap) + 2;

  heatmapWrap.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
  svg.classList.add("heatmap");
  svg.setAttribute("aria-label", `Mapa de calor de pomodoros en ${year}`);

  // Etiquetas de mes en la primera fila de cada mes.
  const monthNames = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  let lastMonth = -1;
  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    const dayOfYear = Math.round((first - start) / 86400000);
    const col = Math.floor(dayOfYear / 7);
    if (col === lastMonth) continue; // muy juntos
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", col * (cellSize + gap));
    label.setAttribute("y", 10);
    label.setAttribute("class", "heatmap__month");
    label.textContent = monthNames[m];
    svg.appendChild(label);
    lastMonth = col;
  }

  // Celdas de cada día del año.
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const minutes = byDay.get(k) || 0;
    const dayOfYear = Math.round((d - start) / 86400000);
    const col = Math.floor(dayOfYear / 7);
    const row = d.getDay();

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", col * (cellSize + gap));
    rect.setAttribute("y", headerH + row * (cellSize + gap));
    rect.setAttribute("width", cellSize);
    rect.setAttribute("height", cellSize);
    rect.setAttribute("rx", 2);
    rect.dataset.q = String(heatmapQuartile(minutes));
    rect.dataset.day = k;

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${k}: ${formatMinutes(minutes)}`;
    rect.appendChild(title);

    svg.appendChild(rect);
  }

  heatmapWrap.appendChild(svg);
  heatmapYearEl.textContent = year;
  heatmapTotalEl.textContent = totalSessions === 0
    ? `${year}: sin sesiones`
    : `${year}: ${totalSessions} sesion${totalSessions === 1 ? "" : "es"} · ${formatMinutes(totalMinutes)}`;
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

  // Top tags: misma forma de fila que TOP TASKS.
  logTagsBlock.hidden = stats.topTags.length === 0;
  logTagsEl.innerHTML = "";
  const maxTagMin = Math.max(1, ...stats.topTags.map((t) => t.minutes));
  stats.topTags.forEach((t) => {
    const row = document.createElement("div");
    row.className = "chart__row chart__row--task";

    const label = document.createElement("span");
    label.className = "chart__day chart__day--task";
    label.textContent = t.tag === "untagged" ? "(sin tag)" : `#${t.tag}`;
    label.title = label.textContent;

    const track = document.createElement("div");
    track.className = "chart__track";
    const fill = document.createElement("div");
    fill.className = "chart__fill";
    fill.style.width = `${Math.max(8, (t.minutes / maxTagMin) * 100)}%`;
    track.appendChild(fill);

    const num = document.createElement("span");
    num.className = "chart__num";
    num.textContent = formatMinutes(t.minutes);

    row.append(label, track, num);
    logTagsEl.appendChild(row);
  });

  renderHeatmap();
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
const DATA_KEYS = [STORAGE_KEY, TIMER_KEY, SETTINGS_KEY, SESSIONS_KEY, LOG_KEY, ROM_KEY, SOUND_KEY, CUSTOM_ROM_KEY];

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
  playSound("export");
  toast(`Backup · ${a.download}`);
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

  playSound("import");
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
  b.addEventListener("click", () => setMode(b.dataset.mode, { fromUser: true }));
});

cfgBtn.addEventListener("click", () => {
  if (settingsPanel.hidden) openSettings();
  else closeSettings("close");
});

settingsSaveBtn.addEventListener("click", commitSettings);
settingsCancelBtn.addEventListener("click", () => closeSettings("cancel"));

[setFocusInput, setShortInput, setLongInput, setCyclesInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitSettings();
    if (e.key === "Escape") closeSettings("cancel");
  });
});

// --- Preferencias de sonido ---
setSoundToggle.addEventListener("click", () => {
  soundPrefs.enabled = !soundPrefs.enabled;
  saveSoundPrefs();
  updateSoundToggleUI();
});

let volumePreviewTimer = 0;
setVolumeInput.addEventListener("input", () => {
  soundPrefs.volume = Number(setVolumeInput.value) / 100;
  saveSoundPrefs();
  updateVolumeUI();
  // Preview blip con throttle para no martillear al arrastrar.
  clearTimeout(volumePreviewTimer);
  volumePreviewTimer = setTimeout(() => {
    const kit = ROM_AUDIO[currentRom] || ROM_AUDIO.default;
    tone({
      freq: kit.click.freq,
      dur: 0.04,
      gain: kit.click.gain * soundPrefs.volume,
      type: kit.wave,
      attack: kit.envelope.attack,
      decay: kit.envelope.decay,
    });
  }, 80);
});

setSoundPickBtn.addEventListener("click", () => setSoundFile.click());

setSoundFile.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) pickSoundFile(file);
  // Permite re-subir el mismo archivo después de quitarlo.
  setSoundFile.value = "";
});

setSoundClearBtn.addEventListener("click", () => clearCustomFile());

// Toggle: pedir nota al terminar focus
setNotePromptToggle && setNotePromptToggle.addEventListener("click", () => {
  settings.notePrompt = !settings.notePrompt;
  saveSettings();
  updateNotePromptUI();
});

logToggle.addEventListener("click", toggleLog);

tagFilterClear.addEventListener("click", () => setTagFilter(null));

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

// Hover delegado con throttle. Un solo listener cubre todos los botones
// (WeakMap evita leak: renderTasks() recrea los .item, las claves se GC solas).
const HOVERABLE = "button, .rom-option, .timer__mode, .item";
const HOVER_THROTTLE_MS = 80;
const lastHover = new WeakMap();
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest && e.target.closest(HOVERABLE);
  if (!el) return;
  if (el.matches && el.matches("button[disabled], [aria-disabled='true']")) return;
  const now = performance.now();
  if (now - (lastHover.get(el) || 0) < HOVER_THROTTLE_MS) return;
  lastHover.set(el, now);
  playSound("hover");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (helpEl && !helpEl.hidden) { closeHelp(); return; }
    if (statsModalEl && !statsModalEl.hidden) { closeStatsModal(); return; }
    if (paletteEl && !paletteEl.hidden) { closePalette(); return; }
    if (customRomEl && !customRomEl.hidden) { closeCustomRomModal(); return; }
    if (!romMenu.hidden) { closeRomMenu(); return; }
    if (!settingsPanel.hidden) { closeSettings("close"); return; }
    if (activeTagFilter) { setTagFilter(null); return; }
  }
  // Alt+↑/↓ sobre una tarea: reordenar por teclado. Antes del guard de INPUT
  // porque el checkbox es INPUT pero queremos actuar sobre él.
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const li = e.target.closest && e.target.closest(".item");
    if (li && li.dataset.id) {
      e.preventDefault();
      moveTaskByKeyboard(li.dataset.id, e.key === "ArrowUp");
      return;
    }
  }
  // Ctrl/Cmd+K abre el command palette — antes del guard de INPUT para que
  // también funcione si el foco está en un input.
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    openPalette();
    return;
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
  } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
    e.preventDefault();
    openHelp();
  } else if (e.key === "s" || e.key === "S") {
    openStatsModal();
  }
});

function moveTaskByKeyboard(id, up) {
  if (activeTagFilter) return;
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const target = up ? idx - 1 : idx + 1;
  if (target < 0 || target >= tasks.length) return;
  [tasks[idx], tasks[target]] = [tasks[target], tasks[idx]];
  saveTasks();
  renderTasks();
  // Devolver el foco a la misma tarea en su nueva posición.
  const moved = list.querySelector(`[data-id="${id}"] .item__checkbox`);
  if (moved) moved.focus();
  announce(`Tarea movida a la posición ${target + 1}.`);
}

// Se pide en el primer START, no al cargar: los navegadores penalizan (y Chrome
// puede autobloquear) los permisos solicitados sin interacción previa.
// La bandera a nivel de módulo garantiza que solo se llame una vez por carga
// de página, aunque por la razón que sea Notification.permission siga siendo
// "default" tras una respuesta (p. ej. file:// en ciertos navegadores).
let notificationPermissionRequested = false;
function requestNotificationPermission() {
  if (notificationPermissionRequested) return;
  notificationPermissionRequested = true;
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
applyRom(currentRom, { silent: true });
updateSoundToggleUI();
updateVolumeUI();
updateSoundFileUI();

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
