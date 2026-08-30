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
