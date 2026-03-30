# wispr-wrapper

A production-ready Electron + Next.js desktop wrapper with a native-feeling dark toolbar UI.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  BrowserWindow                                   │
│  ┌───────────────────────────────────────────┐  │
│  │  Toolbar (Next.js 15, static export)       │  │  ← 48 px
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │                                           │  │
│  │  WebContentsView  (target site)            │  │  ← fills remainder
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

- **Electron main process** (`electron/main.ts`) manages the window, WebContentsView, tray, IPC, and shortcuts.
- **Preload** (`electron/preload.ts`) bridges IPC via `contextBridge` — `contextIsolation: true`, no `nodeIntegration`.
- **Next.js toolbar** (`src/`) compiled to a static export (`out/`) and loaded directly from disk.

## Customising the target app

All three branding constants live in **`electron/constants.ts`**:

```ts
export const TARGET_URL  = 'https://wispr.flow';   // site to wrap
export const APP_TITLE   = 'Wispr';                 // window title & tray tooltip
export const TOOLBAR_HEIGHT = 48;                  // toolbar px height
```

Change those values and rebuild.

## Icon

`assets/icon.png` is auto-generated as a 256 × 256 indigo placeholder on `npm install`.
**Replace it** with your own 256 × 256 (or 1024 × 1024) PNG before distributing.
`electron-builder` converts it to `.ico` / `.icns` automatically for Windows / macOS.

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies and generate placeholder icon |
| `npm run dev` | Start Next.js dev server + Electron (hot-reload toolbar) |
| `npm run build` | Compile Next.js → `out/` and TypeScript → `electron/dist/` |
| `npm run dist` | Full production build + package to installer in `dist-electron/` |
| `npm run pack` | Build + create unpacked directory (no installer, fast iteration) |

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- Windows SDK / Visual Studio Build Tools (for native deps on Windows)

## Development workflow

```bash
npm install
npm run dev
```

The toolbar reloads instantly when you edit files in `src/`.
The Electron main/preload changes require restarting `npm run dev`.

## Production build

```bash
npm run dist
# → dist-electron/Wispr Wrapper Setup x.x.x.exe
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Reload |
| `Ctrl+L` | Focus URL bar |
| `Ctrl+=` / `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |
| `F12` | Toggle DevTools (site view, detached) |

## IPC channels

### Toolbar → Main
`navigate-back` · `navigate-forward` · `navigate-home` · `navigate-to(url)` · `reload` · `zoom-in` · `zoom-out` · `zoom-reset` · `toggle-devtools` · `clear-session`

### Main → Toolbar
`url-changed(url)` · `loading-changed(bool)` · `can-go-back(bool)` · `can-go-forward(bool)` · `focus-url-bar`

## Security

- `contextIsolation: true`
- `nodeIntegration: false`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- External-domain links open in the system browser (not inside the app)
- `setWindowOpenHandler` blocks all popups and routes them appropriately
