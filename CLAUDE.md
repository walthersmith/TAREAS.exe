# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page Pomodoro + todo app ("TAREAS.exe") with a cyberpunk/retro-terminal aesthetic. UI text is in Spanish; identifiers, comments, and on-screen labels in the timer/log sections are a mix of Spanish and English — match whatever the surrounding code uses.

## Running

No build, no dependencies, no test suite, no package manager.

```
python3 -m http.server 8000    # then open http://localhost:8000
```

**Opening `index.html` by double-click (`file://`) must keep working** — the owner asked for it explicitly, and it rules out ES modules and anything needing a build step. Keep all JS in the single `app.js` loaded with a plain `<script>`. The service worker is the one feature that only activates over HTTP; its registration is guarded on `location.protocol` so `file://` stays clean.

Verifying changes means loading the page and exercising the UI. There is no lint/typecheck step, so `node --check app.js` is the only cheap static check.

To drive the app non-interactively, `chromium --headless --remote-debugging-port=9222` plus a small CDP script over the built-in `WebSocket` works well; that is how the timer's resume paths and the theme migration were verified.

## Architecture

`app.js` is a single top-level script laid out in labeled sections: ESTADO → ELEMENTOS → PERSISTENCIA → SETTINGS → ROM → TASKS → EDICIÓN EN LÍNEA → TIMER → MISSION LOG → EXPORTAR/IMPORTAR → EVENTOS → INIT. All DOM handles are grabbed once at load into module-scope `const`s, so **every element the script touches must exist in `index.html` with a matching `id`** — a missing id throws on the first `addEventListener` and aborts the rest of the script, including INIT.

State lives in module-level `let`s (`tasks`, `timer`, `sessions`, `settings`) plus `activeTaskId`, `editingTaskId` and `currentRom`. There is no framework and no diffing: mutate state → call the matching `save*()` → call the matching `render*()`. `renderTasks()` and `renderMissionLog()` wipe their container with `innerHTML = ""` and rebuild every node.

### Persistence

Every slice has its own `localStorage` key under the `todo-app:` prefix (`tasks`, `timer`, `settings`, `sessions`, `log-open`, `rom`), all listed in `DATA_KEYS` for export/import. Each `load*()` is defensive — try/catch, shape-check, fall back to a default — because stored data is user-editable and may predate a schema change. Preserve that pattern when adding fields.

### Timer

`MODES` holds `duration` in seconds and is **mutated in place** by `applySettings()` from the minute values in `settings`. So `MODES.focus.duration` is not a constant — read it fresh, never cache it. `applySettings()` must run before the first `renderTimer()` (see the INIT block).

**The timer is driven by wall clock, not by tick count.** `remainingFromClock()` derives the seconds left from `timer.endAt`; `tick()` runs 4×/second only to repaint. This is deliberate and load-bearing: browsers throttle `setInterval` to ~1/min in background tabs, so decrementing a counter made a 25-minute session take far longer in real time and corrupted the recorded stats. Never reintroduce `timer.remaining--`. `ceil` (not `round`) keeps the last second visible and lands completion exactly on the duration.

A running session **survives reload**: `endAt` and `running` are persisted and restored. The INIT block handles the case where `endAt` already passed while the page was closed — it logs exactly one completed session no matter how long you were away, and passes `{silent: true}` to `onComplete()` to suppress a stale beep, flash, and notification.

`onComplete()` is the hub: logs a session, increments the active task's pomodoro count, beeps, announces to screen readers, fires a Notification, then auto-advances mode — focus → `long` every `settings.cycles`-th cycle, else `short`; breaks always return to focus.

Two things are deliberately deferred to a user gesture, because browsers penalize otherwise: the Notification permission prompt and the `AudioContext`, both created on the first START via `requestNotificationPermission()` and `ensureAudio()`. The context is created once and reused.

### Sessions and the Mission Log

`sessions` is an append-only array of `{ts, mode, minutes, taskId, taskText}`. `taskText` is a later addition so the TOP TASKS breakdown survives deleting a task; older records lack it and fall back to resolving `taskId` against `tasks`, which is why `getStats()` handles both. All log statistics are derived on the fly — nothing is precomputed or cached. Days are keyed by local-time `YYYY-MM-DD` via `dayKey()`; do not swap in `toISOString()`, which would shift the day boundary to UTC and silently corrupt streaks.

### ROM themes

`ROMS` in `app.js` is the **single source of truth** for theme colors. `applyRom()` writes the four palette variables onto `:root` via `style.setProperty()`. `style.css` only carries the default palette in its own `:root`, for the moment before the script runs — do not add `[data-rom="..."]` blocks back to the CSS; that duplication existed before and had to be hand-synced.

Colors flow through as *unwrapped RGB components* (`--c-cyan: 0, 245, 255`) so they can be reused at varying alpha via `rgba(var(--c-cyan), 0.35)`. The variable names are historical and no longer describe the hue — under `matrix`, `--c-cyan` is green. Treat them as four semantic slots: `--c-cyan` = primary/FOCUS, `--c-pink` = accent/BREAK + completed, `--c-purple` = tertiary/LONG, `--c-yellow` = highlight/active task. Never hardcode a hex color in a themed rule.

Component state is driven by data attributes on containers rather than class toggling in most places: `timer[data-mode]`, `timer[data-running]`, `log[data-open]`. CSS keys off those.

### Task editing

Double-click on `.item__text` swaps the span for an `.item__edit` input; `editingTaskId` drives this from inside `renderTasks()`. Enter saves, Escape discards, blur saves. The `settled` flag in `buildEditInput()` exists because cancelling re-renders the list, which removes the input and fires `blur` — without the guard, Escape would immediately be undone by a save.

Single click on the task text deliberately does **not** set the pomodoro target; the `◎` button is the only affordance for that. Both gestures on the same element would fire together on a double-click.

### Export / import

`exportData()` dumps the raw `localStorage` strings for every `DATA_KEYS` entry into a versioned JSON envelope, so the existing defensive loaders validate on the next load. `parseBackup()` validates the **entire** file before `importData()` writes anything — a corrupt file must not leave the state half-overwritten — and the overwrite is behind an explicit `confirm()` because it is irreversible. Import finishes with `location.reload()`, which is the only cheap way to re-init every module-level `let` consistently.

### Service worker

`sw.js` is network-first with a cache fallback, and installs with `cache: "reload"`. Both details matter: a plain `addAll()` seeds the cache from the browser's HTTP cache and can pin a stale app shell — that actually happened during development, serving an old `index.html` against a new `app.js`. Bump `CACHE` when changing the asset list.

### Keyboard shortcuts

Global handler in the EVENTOS section: Space toggles start/pause, `R` resets, `L` toggles the log, Escape closes the ROM menu then the settings panel. It bails early when the event target is an `INPUT`, so typing in a task or edit field is safe — keep that guard if you add a shortcut.

## Styling

`style.css` is flat BEM (`block__element--modifier`), single file, ordered roughly top-to-bottom by page structure. The retro effects (scanlines, grid, CRT vignette, corner brackets) are `body::before` / `body::after` / `.app::before` / `.app::after` pseudo-elements — those four are load-bearing for the aesthetic, not decoration you can drop.

Only two animations run continuously: `glitch` on the title and `pulse-ring` on the running timer. The `prefers-reduced-motion` block at the end of the file disables exactly those two and shortens the one-shot feedback animations (`flash`, `pomo-flash`) rather than removing them, since they signal that something happened. Any new looping animation belongs in that block.

## Fase 6: tags, drag, note prompt, toasts, heatmap, palette

The previous phases established the core loop and aesthetics; this phase is about breadth — adding things that multiply value across existing surfaces without changing the wall-clock timer invariant or the ROM single-source-of-truth.

### Tags (`#palabra` en el texto)

Tags are not a separate input: they live **inside the task text** as `#word` tokens at submit time. `parseTextAndTags()` strips them and normalizes (lowercase, no `#`, dashes for spaces). When the user types `Fix login #frontend #urgent`, the task is stored as `{text: "Fix login", tags: ["frontend", "urgent"]}` and the field clears. The same parser runs on inline-edit save, so re-typing the `#tokens` updates both fields. `loadTasks` defensively re-runs `normalizeTag` and caps at 5 tags per task — older entries without `tags` get `[]`.

The chip below each task is a button that **toggles a filter** (`activeTagFilter`, module state, not persisted). Click the same chip again to clear; `Esc` clears if a filter is active. While a filter is on, the **counter and tag stats still reflect the unfiltered totals** — the filter is cosmetic, not a "view", so it can't mislead about what's left to do. Drag-to-reorder is disabled while a filter is active (the visible array doesn't represent `tasks[]`).

### Drag-to-reorder

Each `.item` is `draggable="true"`; the handle is the `⠿` glyph that fades in on hover (`opacity: 0` → `0.7` on `.item:hover`). Drop targets are indicated by a 2px cyan inset shadow at top or bottom of the target row depending on cursor Y. `dragstart` sets `dragId`; `drop` calls `reorderTasks(src, dst, before)`. The `editing` and `activeTagFilter` cases bail with `e.preventDefault()` to keep the model consistent with what's visible.

Keyboard equivalent: `Alt+↑` / `Alt+Down` over a task's checkbox swaps it with the neighbour and refocuses the checkbox in its new position (announced via `announce()`). Both gestures coexist with `dblclick` to edit because the checkbox click doesn't interfere with `dragstart`.

### Session note prompt

After a focus session, **before** the sound/notification/auto-advance (the order in `onComplete` was rearranged in this phase), if the tab is visible, a small modal appears: "¿Qué hiciste en este pomodoro? (opcional)" with a single text input. `Enter` saves, `Esc` skips, click-outside is a no-op (must be explicit), 30s timeout auto-skips. The note is appended to the **last** session in `sessions` as `note?: string`. The prompt only fires for `mode === "focus"` — breaks get only a toast + notification.

`tick()` calls `onComplete()` and returns synchronously; the prompt is fire-and-forget (not awaited) so the rest of the session bookkeeping — sound, notification, mode advance — runs immediately, and the note simply updates `sessions[sessions.length - 1]` when the user resolves it. The `settled` flag (analogous to the edit input) prevents double-commit if Enter + a button click race.

### Toasts

Stack of up to 3 in the bottom-right, 4s TTL, click to dismiss. Wired into: task completion, ROM switch, backup export, and every session end (focus gets toast + note modal; breaks get only toast). The container is `aria-live="polite"`; each toast is `role="status"` so screen readers announce them. No looping animation — single `toast-in` (slide+fade) on entry and `toast-out` on exit, both listed in the `prefers-reduced-motion` block.

### Heatmap calendar

SVG grid in Mission Log: 53 columns × 7 rows = 364 days of the current year. Each cell is colored by intensity quartile (`<15m`, `<45m`, `<90m`, `<150m`, `150m+`) over `rgba(var(--c-cyan), 0.30/0.55/0.80/1.0)` plus a `0` level at `0.08`. Month labels at the top of the first column of each month that doesn't collide with the previous one. Native `<title>` element provides hover tooltip with date + minutes. Year total line below: `"2026: 412 sesiones · 103h 20m"`.

The cells reference the active ROM palette at varying alpha — never hex. If a day lands in the empty quartile it still gets a faint outline so the grid is visible. `renderHeatmap()` reads `sessions` directly (no `getStats` dependency) so it can be invoked from anywhere.

### Command palette (Ctrl/Cmd+K)

Overlay with fuzzy-substring search over an `ACTIONS` array. Each action is `{id, label, kw, run}`; `run` invokes the same code path as the existing button or shortcut — no duplicated logic. Categories: timer (start/pause/reset, mode switch), tasks (add, clear), log (open/close/toggle), settings (open), ROMs (5), data (export, import), and filter-clear.

`↑/↓` move the active item (wrap-around), `Enter` runs, `Esc` closes. Click on the backdrop closes; clicks inside the panel do not. `Ctrl/Cmd+K` works even when focus is in an `INPUT` — the handler runs before the `INPUT` guard, with `e.preventDefault()` to suppress Chrome's address-bar focus. The handler is in the global `keydown` listener (not a separate one) because both code paths need to coexist with the other shortcuts.

### New keyboard shortcuts (extending the existing list)

| Key | Action |
|---|---|
| `Ctrl/Cmd+K` | open command palette |
| `Esc` (palette open) | close palette (before any other Esc handling) |
| `Esc` (filter active) | clear tag filter |
| `Alt+↑` / `Alt+↓` (on task checkbox) | move task up/down |

The `Esc` chain in the global handler is: palette → ROM menu → settings → tag filter. Each handler only consumes the key when its surface is visible, then returns.

### Schema additions (additive, defensively loaded)

| Slice | New field | Loader behavior |
|---|---|---|
| `todo-app:tasks` | `tags?: string[]` (≤5, normalized) | `loadTasks` re-normalizes via `normalizeTag`; old tasks without `tags` get `[]` |
| `todo-app:sessions` | `note?: string` (≤200) | `loadSessions` already passes unknown fields through |

`parseBackup` is unchanged — the envelope dumps raw `localStorage` strings, so old backups load fine and `loadTasks`/`loadSessions` quietly fill the new fields.

## Fase 7: cola, archivo, backlog, plantillas, deadlines, notas visibles

### Cola de tareas

- `addTask` hace **unshift** entre las pendientes: lo nuevo queda primero.
- `normalizeTaskOrder()` mantiene `tasks[]` como `[...pendientes, ...hechas]`.
- `renderTasks()` pinta dos listas: `#list` (pendientes) y `#list-done` bajo `// HECHAS (n)`.
- Drag y `Alt+↑/↓` sólo reordenan dentro del mismo grupo (pendiente↔pendiente).
- Import/export viven en el panel ⚙ Settings (`#export-btn`, `#import-btn`).
- Cada `.item` usa `.item__main` (texto + tags) y `.item__actions` (botones); `.item__text` tiene `min-width: 0` y `overflow-wrap: break-word` para no apilar una letra por línea en móvil.

### Archivo (`todo-app:archived`)

Baúl de tareas **ya terminadas** sacadas de la cola. No confundir con el Mission Log (sesiones de focus) ni con el backlog.

- `archiveTask(id)` / `archiveCompleted()` mueven de `tasks[]` a `archived[]` con `archivedAt`.
- UI en el panel lateral `#side-dock` **a la izquierda** de TAREAS.exe (botones ▤/☰/◇ **bajo el form** de nueva tarea): restaurar (vuelve pendiente) o borrar.
- Footer: **Archivar completadas**.
- Se conserva el `id` original para que `sessions[].taskId` siga resolviendo.

### Backlog (`todo-app:backlog`)

Cola “para después”: tareas **reales** movidas desde pendientes (mismo `id`), no plantillas.

- `sendToBacklog(id)` / `pullFromBacklog(id)` (unshift a la cola).
- Botón `→` en pendientes; pestaña BACKLOG (☰) en el side-dock.
- Migración: el antiguo `todo-app:bank` (plantillas) se copia a `todo-app:templates` en el primer load y se borra.

### Plantillas (`todo-app:templates`)

`{id, text, tags}` — feature separada del backlog.

- Formulario en pestaña PLANTILLAS (◇); click instancia con **id nuevo** vía `addTask`.
- Palette: “Guardar tarea activa como plantilla”.
- `DATA_KEYS` incluye `ARCHIVE_KEY`, `BACKLOG_KEY`, `TEMPLATES_KEY`. Import también acepta `LEGACY_BANK_KEY` para backups viejos.

### Panel lateral (`#side-dock`)

Companion **a la izquierda** de `.app` (mismo patrón que RADIO.exe a la derecha): abierto ~280px sticky; cerrado `width/height: 0`. Tabs ARCHIVO | BACKLOG | PLANTILLAS. Botones de apertura en `.shelves` bajo `#form`. Persistencia `todo-app:side-open` + `todo-app:side-tab`. En `max-width: 899px` se abre debajo a ancho completo. Esc cierra el dock.

### Deadlines

- Campo opcional `deadline: number | null` (epoch ms) y `completedAt` al marcar hecha.
- Badge `⏱` / fecha en pendientes; click abre `datetime-local`; click derecho quita.
- Estado derivado: **ok** (cyan), **soon** ≤24h (yellow), **over** (pink).
- `checkDeadlines()` en INIT y `visibilitychange`; toasts sin repetir por sesión (`deadlineNotified` Set).

### Notas de sesión visibles

- `sessions[].note` ya existía; ahora `// ÚLTIMAS SESIONES` en el modal de stats (▦ / S / L) lista focus recientes (hora, minutos, tarea ◎, nota).
- El bloque colapsable STATS/[ MISSION LOG ] se quitó del scroll principal; la zona de tareas va en `.queue` con etiqueta `// ACTIVIDADES`.
- El modal cita la tarea activa: `¿Qué hiciste en “Fix login”?`

### Tags y ROM

- `.tag-filter[hidden] { display: none }` — el filtro chip/×/Esc sí se oculta.
- Autocomplete `#` en `#input` y edición inline (`#tag-suggest`).
- ROM custom editable: botón ✎ en menú; mismo modal, mismo `id` al guardar.

### Schema additions (Fase 7+)

| Slice | New field | Loader behavior |
|---|---|---|
| `todo-app:tasks` | `deadline?: number \| null`, `completedAt?: number \| null`, `createdAt?: number \| null` | default `null`; `createdAt` se setea en `addTask` |
| `todo-app:archived` | array de tareas + `archivedAt` | defensive `loadArchived()` |
| `todo-app:backlog` | mismas campos que tarea (done=false) | defensive `loadBacklog()` |
| `todo-app:templates` | `{id, text, tags[]}` | defensive `loadTemplates()`; migra desde `todo-app:bank` |
