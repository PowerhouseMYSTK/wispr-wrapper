import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
  screen,
} from 'electron';
import path from 'path';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';

import {
  TARGET_URL,
  APP_TITLE,
  getIconPath,
  isAllowedInApp,
} from './constants';

// ─── Setup ────────────────────────────────────────────────────────────────────

const isDev = !app.isPackaged;

// ─── Window-state persistence ─────────────────────────────────────────────────

interface WindowState { x?: number; y?: number; width: number; height: number; }

const windowStore = new Store<{ bounds: WindowState; notificationsEnabled: boolean }>({ name: 'window-state' });

function getSavedBounds(): WindowState {
  const saved = windowStore.get('bounds', { width: 1280, height: 800 });
  if (saved.x !== undefined && saved.y !== undefined) {
    const onScreen = screen.getAllDisplays().some(({ workArea: d }) =>
      saved.x! >= d.x && saved.y! >= d.y &&
      saved.x! < d.x + d.width && saved.y! < d.y + d.height
    );
    if (!onScreen) return { width: saved.width, height: saved.height };
  }
  return saved;
}

// ─── Globals ─────────────────────────────────────────────────────────────────

let win:       BrowserWindow | null = null;
let tray:      Tray          | null = null;
let isQuitting = false;
let zoomFactor = 1.0;

// ─── Update toast ─────────────────────────────────────────────────────────────

function injectUpdateToast() {
  win?.webContents.executeJavaScript(`
    (function () {
      const ID = '__ew_update_toast__';
      if (document.getElementById(ID)) return;

      const toast = document.createElement('div');
      toast.id = ID;
      toast.style.cssText =
        'position:fixed;bottom:64px;right:16px;z-index:2147483647;width:288px;' +
        'background:rgba(7,11,22,0.96);border:1px solid rgba(255,255,255,0.08);' +
        'border-radius:14px;overflow:hidden;' +
        'backdrop-filter:blur(24px) saturate(180%);' +
        'box-shadow:0 12px 48px rgba(0,0,0,0.72),0 0 0 1px rgba(99,102,241,0.15);' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
        'transform:translateY(16px);opacity:0;' +
        'transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s ease;';

      toast.innerHTML =
        '<div style="padding:14px 15px 12px;border-bottom:1px solid rgba(255,255,255,0.06);' +
        'display:flex;align-items:center;gap:10px;">' +
          '<div style="width:32px;height:32px;border-radius:9px;flex-shrink:0;' +
          'background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.25);' +
          'display:flex;align-items:center;justify-content:center;font-size:15px;">🚀</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#f1f5f9;letter-spacing:-0.01em;">Update Ready</div>' +
            '<div style="font-size:11px;color:rgba(100,116,139,0.9);margin-top:1px;">A new version has been downloaded</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:10px 12px;display:flex;gap:7px;">' +
          '<button id="__ew_upd_restart__" style="flex:1;padding:8px 0;border-radius:8px;border:none;cursor:pointer;' +
          'background:linear-gradient(180deg,rgba(99,102,241,0.9),rgba(79,82,221,0.9));' +
          'color:#fff;font-size:12px;font-weight:600;font-family:inherit;' +
          'box-shadow:0 2px 12px rgba(99,102,241,0.35);transition:opacity 0.15s;">Restart Now</button>' +
          '<button id="__ew_upd_later__" style="flex:1;padding:8px 0;border-radius:8px;cursor:pointer;' +
          'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);' +
          'color:rgba(148,163,184,0.9);font-size:12px;font-weight:500;font-family:inherit;' +
          'transition:background 0.15s;">Later</button>' +
        '</div>';

      document.documentElement.appendChild(toast);
      requestAnimationFrame(function() {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });

      function dismiss() {
        toast.style.transform = 'translateY(16px)';
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
      }

      var restartBtn = toast.querySelector('#__ew_upd_restart__');
      restartBtn.addEventListener('click', function() {
        if (window.electronAPI && window.electronAPI.quitAndInstall) {
          window.electronAPI.quitAndInstall();
        }
      });
      restartBtn.addEventListener('mouseenter', function() { restartBtn.style.opacity = '0.85'; });
      restartBtn.addEventListener('mouseleave', function() { restartBtn.style.opacity = '1'; });
      toast.querySelector('#__ew_upd_later__').addEventListener('click', dismiss);
    })();
  `).catch(() => {});
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const saved = getSavedBounds();

  win = new BrowserWindow({
    ...saved,
    minWidth:  800,
    minHeight: 600,
    title:     APP_TITLE,
    icon:      getIconPath(),
    backgroundColor: '#000000',
    show: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      contextIsolation:            true,
      nodeIntegration:             false,
      webSecurity:                 true,
      allowRunningInsecureContent: false,
      partition: 'persist:automint',
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  Menu.setApplicationMenu(null);

  win.loadURL(TARGET_URL);

  // ── Notification permission ───────────────────────────────────────────────
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications') {
      callback(windowStore.get('notificationsEnabled', true));
    } else {
      callback(true);
    }
  });

  // Inject a thin draggable strip across the top-left so the window can be
  // moved (the overlay on the right already handles the button area).
  // Re-injected after every navigation in case the page replaces the DOM.
  function injectDragRegion() {
    win?.webContents.executeJavaScript(`
      (function () {
        const ID = '__ew_drag__';
        if (document.getElementById(ID)) return;
        const el = document.createElement('div');
        el.id = ID;
        // Sits above page content, covers only the left portion of the 36px strip.
        // right:140px leaves room for the three native window-control buttons.
        el.style.cssText =
          'position:fixed;top:0;left:0;right:110px;height:36px;' +
          '-webkit-app-region:drag;z-index:2147483647;pointer-events:auto;';
        document.documentElement.appendChild(el);
      })();
    `).catch(() => {/* page not ready yet — safe to ignore */});
  }

  function injectWindowControls() {
    win?.webContents.executeJavaScript(`
      (function () {
        const ID = '__ew_winctrl__';
        if (document.getElementById(ID)) return;

        const container = document.createElement('div');
        container.id = ID;
        container.style.cssText =
          'position:fixed;top:6px;right:10px;z-index:2147483647;' +
          'display:flex;gap:6px;align-items:center;-webkit-app-region:no-drag;';

        const btnBase =
          'width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;' +
          'background:rgba(0,0,0,0.7);color:#fff;font-size:13px;' +
          'display:flex;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.5);' +
          'transition:background 0.15s;-webkit-app-region:no-drag;line-height:1;';

        function makeBtn(label, ipcMethod, hoverBg) {
          const btn = document.createElement('button');
          btn.textContent = label;
          btn.style.cssText = btnBase;
          btn.addEventListener('mouseenter', function() { btn.style.background = hoverBg; });
          btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(0,0,0,0.7)'; });
          btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (window.electronAPI && window.electronAPI[ipcMethod]) {
              window.electronAPI[ipcMethod]();
            }
          });
          return btn;
        }

        const minBtn  = makeBtn('–', 'windowMinimize', 'rgba(250,204,21,0.85)');
        const maxBtn  = makeBtn('□', 'windowMaximize', 'rgba(74,222,128,0.85)');
        const closeBtn = makeBtn('✕', 'windowClose',   'rgba(239,68,68,0.85)');

        if (window.electronAPI && window.electronAPI.isWindowMaximized) {
          window.electronAPI.isWindowMaximized().then(function(v) {
            maxBtn.textContent = v ? '❐' : '□';
          });
          window.electronAPI.onWindowMaximizedChanged(function(v) {
            maxBtn.textContent = v ? '❐' : '□';
          });
        }

        container.appendChild(minBtn);
        container.appendChild(maxBtn);
        container.appendChild(closeBtn);
        document.documentElement.appendChild(container);
      })();
    `).catch(() => {});
  }

  function injectSettingsPanel() {
    win?.webContents.executeJavaScript(`
      (function () {
        const ID = '__ew_settings__';
        if (document.getElementById(ID)) return;

        // ── Root wrapper ─────────────────────────────────────────────────────
        const wrap = document.createElement('div');
        wrap.id = ID;
        wrap.style.cssText =
          'position:fixed;bottom:16px;right:16px;z-index:2147483646;' +
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;';

        // ── Trigger button ───────────────────────────────────────────────────
        const btn = document.createElement('button');
        btn.title = 'App Settings';
        btn.style.cssText =
          'width:36px;height:36px;border-radius:50%;' +
          'border:1px solid rgba(255,255,255,0.1);cursor:pointer;' +
          'background:rgba(8,12,24,0.82);color:rgba(148,163,184,0.9);' +
          'display:flex;align-items:center;justify-content:center;' +
          'backdrop-filter:blur(12px);' +
          'box-shadow:0 4px 20px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.04);' +
          'transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);' +
          'padding:0;flex-shrink:0;';
        btn.innerHTML =
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
          'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08' +
          'a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74' +
          'l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25' +
          'a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25' +
          'a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08' +
          'a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38' +
          'a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>' +
          '<circle cx="12" cy="12" r="3"/></svg>';

        // ── Panel ────────────────────────────────────────────────────────────
        const panel = document.createElement('div');
        panel.style.cssText =
          'display:none;position:absolute;bottom:48px;right:0;width:272px;' +
          'background:rgba(7,11,22,0.94);' +
          'border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;' +
          'backdrop-filter:blur(24px) saturate(180%);' +
          'box-shadow:0 12px 48px rgba(0,0,0,0.72),0 0 0 1px rgba(255,255,255,0.04);' +
          'transform:translateY(10px);opacity:0;' +
          'transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1),opacity 0.18s ease;';

        // ── Panel: header ────────────────────────────────────────────────────
        const hdr = document.createElement('div');
        hdr.style.cssText =
          'padding:12px 15px 10px;border-bottom:1px solid rgba(255,255,255,0.06);';
        hdr.innerHTML =
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
            'stroke="rgba(129,140,248,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="2" y="3" width="20" height="14" rx="2"/>' +
            '<line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' +
            '<span style="font-size:10px;font-weight:600;' +
            'letter-spacing:0.08em;text-transform:uppercase;color:rgba(129,140,248,0.75);">AutoMint Wrapper</span>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:700;' +
          'letter-spacing:-0.02em;color:#f1f5f9;line-height:1.15;">Settings</div>';
        panel.appendChild(hdr);

        // ── Helper: section label ────────────────────────────────────────────
        function sectionLabel(text) {
          const d = document.createElement('div');
          d.style.cssText =
            'font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;' +
            'color:rgba(100,116,139,0.7);margin-bottom:6px;';
          d.textContent = text;
          return d;
        }

        // ── Helper: icon tile ────────────────────────────────────────────────
        function iconTile(svgPath, r, g, b) {
          const d = document.createElement('div');
          d.style.cssText =
            'width:30px;height:30px;border-radius:8px;flex-shrink:0;' +
            'background:rgba(' + r + ',' + g + ',' + b + ',0.12);' +
            'border:1px solid rgba(' + r + ',' + g + ',' + b + ',0.22);' +
            'display:flex;align-items:center;justify-content:center;';
          d.innerHTML = svgPath;
          return d;
        }

        // ── Helper: row ──────────────────────────────────────────────────────
        function makeRow(el) {
          el.style.cssText =
            'display:flex;align-items:center;gap:10px;padding:10px 11px;' +
            'border-radius:9px;background:rgba(255,255,255,0.03);' +
            'border:1px solid rgba(255,255,255,0.05);' +
            'cursor:pointer;transition:background 0.18s,border-color 0.18s;width:100%;box-sizing:border-box;';
          el.addEventListener('mouseenter', function() {
            el.style.background = 'rgba(255,255,255,0.06)';
            el.style.borderColor = 'rgba(255,255,255,0.1)';
          });
          el.addEventListener('mouseleave', function() {
            el.style.background = 'rgba(255,255,255,0.03)';
            el.style.borderColor = 'rgba(255,255,255,0.05)';
          });
        }

        // ── Helper: row label block ──────────────────────────────────────────
        function rowLabels(title, sub, titleColor) {
          const d = document.createElement('div');
          d.style.flex = '1';
          d.innerHTML =
            '<div style="font-size:13px;font-weight:500;color:' + (titleColor || '#e2e8f0') + ';">' + title + '</div>' +
            '<div style="font-size:11px;font-weight:300;color:rgba(100,116,139,0.8);margin-top:1px;">' + sub + '</div>';
          return d;
        }

        // ── Section: System ──────────────────────────────────────────────────
        const sysSec = document.createElement('div');
        sysSec.style.cssText = 'padding:10px 15px 9px;border-bottom:1px solid rgba(255,255,255,0.05);';
        sysSec.appendChild(sectionLabel('System'));

        // Notifications row
        const notifRow = document.createElement('div');
        makeRow(notifRow);

        const notifIcon = iconTile(
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
          'stroke="rgba(52,211,153,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
          16, 185, 129
        );

        // Toggle switch
        const toggleTrack = document.createElement('div');
        toggleTrack.style.cssText =
          'width:34px;height:19px;border-radius:10px;background:rgba(255,255,255,0.1);' +
          'position:relative;flex-shrink:0;border:1px solid rgba(255,255,255,0.07);' +
          'transition:background 0.22s;cursor:pointer;';
        const toggleThumb = document.createElement('div');
        toggleThumb.style.cssText =
          'position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;' +
          'background:#94a3b8;transition:transform 0.22s cubic-bezier(0.34,1.56,0.64,1),' +
          'background 0.22s;box-shadow:0 1px 4px rgba(0,0,0,0.45);';
        toggleTrack.appendChild(toggleThumb);

        let notifOn = true;
        function applyToggle(on) {
          notifOn = on;
          toggleTrack.style.background = on ? 'rgba(16,185,129,0.65)' : 'rgba(255,255,255,0.1)';
          toggleThumb.style.transform = on ? 'translateX(15px)' : 'translateX(0)';
          toggleThumb.style.background = on ? '#ffffff' : '#94a3b8';
        }

        if (window.electronAPI && window.electronAPI.getNotificationsEnabled) {
          window.electronAPI.getNotificationsEnabled().then(function(v) { applyToggle(v); });
        }

        notifRow.addEventListener('click', function(e) {
          e.stopPropagation();
          applyToggle(!notifOn);
          if (window.electronAPI && window.electronAPI.setNotificationsEnabled) {
            window.electronAPI.setNotificationsEnabled(notifOn);
          }
        });

        notifRow.appendChild(notifIcon);
        notifRow.appendChild(rowLabels('Notifications', 'Desktop alerts'));
        notifRow.appendChild(toggleTrack);
        sysSec.appendChild(notifRow);
        panel.appendChild(sysSec);

        // ── Section: Actions ─────────────────────────────────────────────────
        const actSec = document.createElement('div');
        actSec.style.cssText = 'padding:10px 15px 11px;display:flex;flex-direction:column;gap:8px;';
        actSec.appendChild(sectionLabel('Actions'));

        // Reload row
        const reloadRow = document.createElement('button');
        reloadRow.style.cssText = 'text-align:left;color:inherit;background:none;border:none;font-family:inherit;';
        makeRow(reloadRow);
        reloadRow.appendChild(iconTile(
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
          'stroke="rgba(96,165,250,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="1 4 1 10 7 10"/>' +
          '<path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>',
          59, 130, 246
        ));
        reloadRow.appendChild(rowLabels('Reload', 'Refresh the app'));
        reloadRow.addEventListener('click', function(e) {
          e.stopPropagation();
          location.reload();
        });
        actSec.appendChild(reloadRow);

        // Clear session row
        const clearRow = document.createElement('button');
        clearRow.style.cssText = 'text-align:left;color:inherit;background:none;border:none;font-family:inherit;';
        makeRow(clearRow);
        clearRow.appendChild(iconTile(
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
          'stroke="rgba(248,113,113,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"/>' +
          '<path d="M19 6l-1 14H6L5 6"/>' +
          '<path d="M10 11v6"/><path d="M14 11v6"/>' +
          '<path d="M9 6V4h6v2"/></svg>',
          239, 68, 68
        ));
        clearRow.appendChild(rowLabels('Clear Session', 'Logs out & restarts', '#fca5a5'));
        clearRow.addEventListener('click', function(e) {
          e.stopPropagation();
          if (window.electronAPI && window.electronAPI.clearSession) {
            window.electronAPI.clearSession();
          }
        });
        actSec.appendChild(clearRow);
        panel.appendChild(actSec);

        // ── Panel: footer ────────────────────────────────────────────────────
        const ftr = document.createElement('div');
        ftr.style.cssText =
          'padding:8px 15px;border-top:1px solid rgba(255,255,255,0.05);' +
          'display:flex;align-items:center;justify-content:center;gap:4px;';
        ftr.innerHTML =
          '<span style="font-size:11px;color:rgba(100,116,139,0.7);">🚀 Made By</span>' +
          '<span style="font-size:11px;font-weight:600;' +
          'background:linear-gradient(90deg,#a78bfa,#60a5fa,#34d399);' +
          '-webkit-background-clip:text;-webkit-text-fill-color:transparent;' +
          'background-clip:text;">Powerhouse_</span>' +
          '<button id="__ew_discord__" title="Join Discord" style="' +
          'background:none;border:none;cursor:pointer;padding:2px 4px;' +
          'display:flex;align-items:center;opacity:0.6;transition:opacity 0.15s;margin-left:2px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(148,163,184,1)">' +
          '<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>' +
          '</svg></button>';
        panel.appendChild(ftr);

        var discordBtn = ftr.querySelector('#__ew_discord__');
        discordBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.open('https://discord.gg/5d7uhapU53');
        });
        discordBtn.addEventListener('mouseenter', function() { discordBtn.style.opacity = '1'; });
        discordBtn.addEventListener('mouseleave', function() { discordBtn.style.opacity = '0.6'; });

        // ── Open / close logic ───────────────────────────────────────────────
        let isOpen = false;

        function openPanel() {
          isOpen = true;
          panel.style.display = 'block';
          requestAnimationFrame(function() {
            panel.style.transform = 'translateY(0)';
            panel.style.opacity = '1';
          });
          btn.style.background = 'rgba(99,102,241,0.18)';
          btn.style.borderColor = 'rgba(99,102,241,0.38)';
          btn.style.color = 'rgba(165,180,252,1)';
          btn.style.boxShadow = '0 4px 20px rgba(0,0,0,0.55),0 0 0 1px rgba(99,102,241,0.28)';
        }

        function closePanel() {
          isOpen = false;
          panel.style.transform = 'translateY(10px)';
          panel.style.opacity = '0';
          setTimeout(function() { if (!isOpen) panel.style.display = 'none'; }, 240);
          btn.style.background = 'rgba(8,12,24,0.82)';
          btn.style.borderColor = 'rgba(255,255,255,0.1)';
          btn.style.color = 'rgba(148,163,184,0.9)';
          btn.style.boxShadow = '0 4px 20px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.04)';
        }

        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          isOpen ? closePanel() : openPanel();
        });

        btn.addEventListener('mouseenter', function() {
          if (!isOpen) {
            btn.style.background = 'rgba(20,26,46,0.9)';
            btn.style.transform = 'scale(1.08)';
          }
        });
        btn.addEventListener('mouseleave', function() {
          if (!isOpen) {
            btn.style.background = 'rgba(8,12,24,0.82)';
            btn.style.transform = 'scale(1)';
          }
        });

        document.addEventListener('click', function() { if (isOpen) closePanel(); });
        panel.addEventListener('click', function(e) { e.stopPropagation(); });

        wrap.appendChild(panel);
        wrap.appendChild(btn);
        document.documentElement.appendChild(wrap);
      })();
    `).catch(() => {});
  }

  win.webContents.on('did-finish-load',      () => { injectDragRegion(); injectWindowControls(); injectSettingsPanel(); });
  win.webContents.on('did-navigate',         () => { injectDragRegion(); injectWindowControls(); injectSettingsPanel(); });
  win.webContents.on('did-navigate-in-page', () => { injectDragRegion(); injectWindowControls(); injectSettingsPanel(); });

  // ── Link / redirect routing ───────────────────────────────────────────────
  // Same domain + whitelisted OAuth providers → stay in window.
  // Everything else → system browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedInApp(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) {
      // Navigate in the same window rather than opening a new one
      win?.webContents.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;

    if (ctrl && input.key.toLowerCase() === 'r') {
      event.preventDefault(); win?.webContents.reload();
    } else if (ctrl && (input.key === '=' || input.key === '+')) {
      event.preventDefault();
      zoomFactor = Math.min(zoomFactor + 0.1, 3.0);
      win?.webContents.setZoomFactor(zoomFactor);
    } else if (ctrl && input.key === '-') {
      event.preventDefault();
      zoomFactor = Math.max(zoomFactor - 0.1, 0.25);
      win?.webContents.setZoomFactor(zoomFactor);
    } else if (ctrl && input.key === '0') {
      event.preventDefault();
      zoomFactor = 1.0; win?.webContents.setZoomFactor(1.0);
    } else if (input.key === 'F12' || (input.alt && input.key.toLowerCase() === 'i')) {
      event.preventDefault();
      win?.webContents.isDevToolsOpened()
        ? win?.webContents.closeDevTools()
        : win?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // ── Window lifecycle ──────────────────────────────────────────────────────
  win.on('ready-to-show', () => win?.show());
  win.on('maximize',   () => win?.webContents.send('window-maximized-changed', true));
  win.on('unmaximize', () => win?.webContents.send('window-maximized-changed', false));

  win.on('close', (e) => {
    if (win) windowStore.set('bounds', win.getBounds());
    if (!isQuitting) { e.preventDefault(); win?.hide(); }
  });

  win.on('closed', () => { win = null; });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const notificationsEnabled = windowStore.get('notificationsEnabled', true);
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { win?.show(); win?.focus(); } },
    { type: 'separator' },
    {
      label: 'Notifications',
      type: 'checkbox',
      checked: notificationsEnabled,
      click: () => {
        windowStore.set('notificationsEnabled', !windowStore.get('notificationsEnabled', true));
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Clear Session & Restart', click: async () => {
        const ses = win?.webContents.session;
        if (ses) { await ses.clearCache(); await ses.clearStorageData(); }
        app.relaunch(); app.exit(0);
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(getIconPath());
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
    else icon = icon.resize({ width: 16, height: 16 });
  } catch { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip(APP_TITLE);
  buildTrayMenu();
  tray.on('double-click', () => { win?.show(); win?.focus(); });
}

// ─── IPC (kept minimal — nothing to bridge without a toolbar) ────────────────

function registerIpc() {
  ipcMain.handle('clear-session', async () => {
    const ses = win?.webContents.session;
    if (ses) { await ses.clearCache(); await ses.clearStorageData(); }
    app.relaunch(); app.exit(0);
  });

  ipcMain.handle('window-minimize',     () => win?.minimize());
  ipcMain.handle('window-maximize',     () => win?.isMaximized() ? win?.restore() : win?.maximize());
  ipcMain.handle('window-close',        () => win?.close());
  ipcMain.handle('window-is-maximized', () => win?.isMaximized() ?? false);

  ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

  ipcMain.handle('get-notifications-enabled', () =>
    windowStore.get('notificationsEnabled', true)
  );

  ipcMain.handle('set-notifications-enabled', (_e, value: boolean) => {
    windowStore.set('notificationsEnabled', value);
    buildTrayMenu();
  });
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    injectUpdateToast();
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {/* no network or no releases yet */});
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // In dev open DevTools automatically so you can debug the site
  if (isDev) {
    app.on('browser-window-created', (_, w) => {
      // uncomment to auto-open devtools:
      // w.webContents.openDevTools({ mode: 'detach' });
    });
  }

  registerIpc();
  createWindow();
  createTray();
  if (!isDev) setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else win?.show();
  });
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
