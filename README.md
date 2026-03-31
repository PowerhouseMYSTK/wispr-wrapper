# AutoMint Desktop

A lightweight Electron wrapper that turns [automint.online](https://automint.online) into a native desktop app — Discord-style, no browser chrome, just the site in a clean window.

---

## Features

- **Native window** — frameless, draggable, with min/max/close controls
- **Persistent session** — stays logged in between launches
- **Settings panel** — accessible via the gear icon (bottom-right)
  - Toggle desktop notifications
  - Reload the app
  - Clear session & restart
- **Auto-updater** — silently downloads updates in the background and prompts to restart
- **System tray** — closes to tray, double-click to restore

---

## Installation

Download the latest installer from [Releases](https://github.com/PowerhouseMYSTK/wispr-wrapper/releases) and run it.

---

## Development

```bash
npm install
npm start        # run against the live site
npm run dev      # run with Next.js dev server (port 3131)
```

## Building & Publishing

```bash
$env:GH_TOKEN="your_token"
npm run dist
npx electron-builder --publish always
```

---

## Made By

**Powerhouse_** — [Join the Discord](https://discord.gg/5d7uhapU53)
