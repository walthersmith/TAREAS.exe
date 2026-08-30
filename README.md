# TAREAS.exe

Single-page Pomodoro + todo app with a retro/cyberpunk terminal aesthetic. UI is in Spanish; identifiers and on-screen labels in the timer/log sections are a mix of Spanish and English.

No build, no dependencies, no package manager, no test suite.

## Features

- **Pomodoro timer**: focus / short / long break modes, configurable durations and cycles, wall-clock-driven (correct across tab switches and reloads)
- **Tasks**: CRUD, inline edit, drag-to-reorder, `Alt+↑/↓` keyboard move
- **Tags**: inline `#tag` syntax in task text, clickable chips to filter the list
- **Mission Log**: TODAY / STREAK / TOTAL / BEST stats, last-7-days chart, TOP TASKS, TOP TAGS, 365-day heatmap calendar
- **5 built-in ROMs** (themes): default, blade, matrix, cdproject, akira
- **Custom ROMs**: 4 color pickers + name, persisted, included in export
- **Command palette**: `Ctrl/Cmd+K` for fuzzy-search over all actions
- **Session note prompt**: optional modal after focus sessions to log what you worked on
- **Help modal**: `?` for full keyboard and feature reference
- **Stats modal**: `S` to view the Mission Log full-screen
- **In-app toasts** for ephemeral feedback
- **Settings**: durations, cycles, sound on/off, volume, custom end-sound file (≤50 KB)
- **PWA**: installable, works offline
- **Export / Import**: full state backup as JSON

## Running

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly via `file://` also works — the service worker registration is guarded on `location.protocol`, and there are zero ES modules or imports.

`node --check app.js` is the only static check available.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Start / pause timer |
| `R` | Reset timer |
| `L` | Toggle Mission Log |
| `?` | Help modal |
| `S` | Stats modal |
| `Ctrl/Cmd + K` | Command palette |
| `Esc` | Close palette / ROM menu / settings / modal / tag filter |
| `Alt + ↑/↓` | Move focused task up/down |
| `dblclick` on task | Edit text |
| `Enter` / `Escape` in inputs | Save / cancel |

## Architecture

- `app.js` — single top-level script, ~2,700 LOC, in labeled sections: `ESTADO → ELEMENTOS → PERSISTENCIA → SETTINGS → ROM → TASKS → EDICIÓN EN LÍNEA → TIMER → AUDIO → MISSION LOG → EXPORTAR/IMPORTAR → EVENTOS → INIT`
- `style.css` — flat BEM, ordered top-to-bottom by page structure, ~2,000 LOC
- `sw.js` — network-first service worker with cache fallback
- `manifest.json` — PWA manifest

State lives in module-level `let`s: `tasks`, `timer`, `sessions`, `settings`, plus `activeTaskId`, `editingTaskId`, `activeTagFilter`, `currentRom`. No framework, no diffing — mutate state → call the matching `save*()` → call the matching `render*()`.

### Persistence

Every slice has its own `localStorage` key under the `todo-app:` prefix: `tasks`, `timer`, `settings`, `sessions`, `log-open`, `rom`, `sound`, `custom-roms`. All listed in `DATA_KEYS` for export/import.

Each `load*` is defensive: try/catch → JSON.parse → shape-check → fallback to defaults. Stored data is user-editable and may predate schema changes; new fields are loaded as `undefined` and fall back to defaults. Schema changes are additive (tags, session notes) — old backups load fine.

### Timer invariants

The timer is **wall-clock driven**, not tick-counter: `timer.endAt` is the source of truth, `tick()` only repaints at 250ms. This is load-bearing: browsers throttle `setInterval` to ~1/min in background tabs, so a tick-counter would corrupt session length. A running session **survives reload**: `endAt` + `running` are persisted.

`MODES.focus.duration` is **not a constant** — mutated in place by `applySettings()` from minute values in `settings`. Read it fresh.

Switching modes manually stashes the current `remaining` and restores it when you return. Auto-advance from a completed session does NOT stash, so the new session starts fresh.

### ROM themes

`ROMS` in `app.js` is the single source of truth for theme colors. `applyRom()` writes the four palette variables onto `:root` via `style.setProperty()`.

Colors flow through as **unwrapped RGB components** (`--c-cyan: 0, 245, 255`) so they can be reused at varying alpha via `rgba(var(--c-cyan), 0.35)`. The variable names are historical and no longer describe the hue — under `matrix`, `--c-cyan` is green.

Never hardcode a hex color in a themed rule.

### Service worker

`sw.js` is network-first with a cache fallback, installs with `cache: "reload"` to avoid pinning a stale app shell. **Bump `CACHE`** (in `sw.js`) when changing the asset list — without a bump, the SW serves a stale app shell against new code.

## Customization

- **Add a ROM**: edit `ROMS` in `app.js`; follow the 4-slot pattern (`primary / accent / tertiary / highlight` as `[r, g, b]`).
- **Custom ROM via UI**: click the ROM picker → `+ NEW ROM`, pick 4 colors + name.
- **Custom end-sound**: ⚙ Settings → `SUBIR SONIDO DE FIN`, accepts any audio file ≤50 KB.
- **More audio kits**: each ROM has a `ROM_AUDIO` entry with waveform, base freqs, fanfare, signature chord.

## Accessibility

- ARIA on counters, mode tabs, ROM picker, settings, timer announce region.
- Full keyboard navigation for all primary actions.
- `prefers-reduced-motion` disables the two looping animations (title glitch, ring pulse) and shortens feedback animations.
- Touch-friendly: tap targets ≥ 26×26, mobile media query at 480px.

## License

MIT.
