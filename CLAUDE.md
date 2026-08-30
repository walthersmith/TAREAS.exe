# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-page Pomodoro + todo app ("TAREAS.exe") with a cyberpunk/retro-terminal aesthetic. UI text is in Spanish; identifiers, comments, and on-screen labels in the timer/log sections are a mix of Spanish and English — match whatever the surrounding code uses.

## Running

No build, no dependencies, no test suite, no package manager. Three files served as-is:

```
python3 -m http.server 8000    # then open http://localhost:8000
```

Opening `index.html` via `file://` mostly works, but `localStorage` and `Notification` behave inconsistently under that origin. Prefer the HTTP server.

Verifying changes means loading the page and exercising the UI. There is no lint/typecheck step.

## Architecture

`app.js` is a single top-level script (no modules, no bundler) laid out in labeled sections: ESTADO → ELEMENTOS → PERSISTENCIA → SETTINGS → ROM → TASKS → TIMER → MISSION LOG → EVENTOS → INIT. All DOM handles are grabbed once at load into module-scope `const`s, so **every element the script touches must exist in `index.html` with a matching `id`** — a missing id fails silently at first use.

State lives in four module-level `let`s (`tasks`, `timer`, `sessions`, `settings`) plus `activeTaskId` and `currentRom`. There is no framework and no diffing: mutate state → call the matching `save*()` → call the matching `render*()`. `renderTasks()` and `renderMissionLog()` wipe their container with `innerHTML = ""` and rebuild every node.

### Persistence

Every slice has its own `localStorage` key under the `todo-app:` prefix (`tasks`, `timer`, `settings`, `sessions`, `log-open`, `rom`). Each `load*()` is defensive — try/catch, shape-check, fall back to a default — because stored data is user-editable and may predate a schema change. Preserve that pattern when adding fields.

`timer.running` is deliberately **never** restored as `true` on load; a reload always lands paused.

### Timer

`MODES` holds `duration` in seconds and is **mutated in place** by `applySettings()` from the minute values in `settings`. So `MODES.focus.duration` is not a constant — read it fresh, never cache it. `applySettings()` must run before the first `renderTimer()` (see the INIT block).

Ticking is a plain 1-second `setInterval` that decrements `timer.remaining`. `timer.endAt` is set on `start()` but nothing currently reads it back, so the timer drifts while the tab is throttled — relevant if you touch timing behavior.

`onComplete()` is the hub: logs a session, increments the active task's pomodoro count, beeps (WebAudio, built inline), fires a Notification, then auto-advances mode — focus → `long` every 4th cycle, else `short`; breaks always return to focus.

### Sessions and the Mission Log

`sessions` is an append-only array of `{ts, mode, minutes, taskId}`. All log statistics (today, streak, total, best day, last-7-days chart) are derived on the fly in `getStats()` — nothing is precomputed or cached, so the log stays correct if session records are edited or removed. Days are keyed by local-time `YYYY-MM-DD` via `dayKey()`; do not swap in `toISOString()`, which would shift the day boundary to UTC.

### ROM themes — the one real gotcha

Theme colors are defined **twice**, and the two copies must be kept in sync manually:

- `ROMS` in `app.js` — RGB triples used *only* to draw the swatches in the picker menu.
- `:root[data-rom="<key>"]` blocks in `style.css` — the values that actually theme the page.

`applyRom()` just sets `document.documentElement[data-rom]` and persists the key; CSS does the rest. Adding a ROM requires an entry in both places with the same key.

Colors flow through as *unwrapped RGB components* (`--c-cyan: 0, 245, 255`) so they can be reused at varying alpha via `rgba(var(--c-cyan), 0.35)`. The variable names are historical and no longer describe the hue — under `matrix`, `--c-cyan` is green. Treat them as the four semantic slots the code comments describe: `--c-cyan` = primary/FOCUS, `--c-pink` = accent/BREAK + completed, `--c-purple` = tertiary/LONG, `--c-yellow` = highlight/active task. Never hardcode a hex color in a themed rule.

Component state is driven by data attributes on containers rather than class toggling in most places: `timer[data-mode]`, `timer[data-running]`, `log[data-open]`. CSS keys off those.

### Keyboard shortcuts

Global handler at the bottom of the EVENTOS section: Space toggles start/pause, `R` resets, `L` toggles the log, Escape closes the ROM menu then the settings panel. It bails early when the event target is an `INPUT`, so typing in a task field is safe — keep that guard if you add a shortcut.

## Styling

`style.css` is flat BEM (`block__element--modifier`), single file, ordered roughly top-to-bottom by page structure. The retro effects (scanlines, grid, CRT vignette, glitch on the title) are `body::before` / `body::after` / `.app::before` / `.app::after` pseudo-elements — those four are load-bearing for the aesthetic, not decoration you can drop.
