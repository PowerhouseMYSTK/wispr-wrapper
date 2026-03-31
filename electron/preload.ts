import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // ── toolbar → main ──────────────────────────────────────────────────────────
  navigateBack:    (): Promise<void> => ipcRenderer.invoke('navigate-back'),
  navigateForward: (): Promise<void> => ipcRenderer.invoke('navigate-forward'),
  navigateHome:    (): Promise<void> => ipcRenderer.invoke('navigate-home'),
  navigateTo:  (url: string): Promise<void> => ipcRenderer.invoke('navigate-to', url),
  reload:          (): Promise<void> => ipcRenderer.invoke('reload'),
  zoomIn:          (): Promise<void> => ipcRenderer.invoke('zoom-in'),
  zoomOut:         (): Promise<void> => ipcRenderer.invoke('zoom-out'),
  zoomReset:       (): Promise<void> => ipcRenderer.invoke('zoom-reset'),
  toggleDevTools:  (): Promise<void> => ipcRenderer.invoke('toggle-devtools'),
  clearSession:    (): Promise<void> => ipcRenderer.invoke('clear-session'),
  windowMinimize:     (): Promise<void>    => ipcRenderer.invoke('window-minimize'),
  windowMaximize:     (): Promise<void>    => ipcRenderer.invoke('window-maximize'),
  windowClose:        (): Promise<void>    => ipcRenderer.invoke('window-close'),
  isWindowMaximized:  (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void) => {
    const h = (_: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on('window-maximized-changed', h);
    return () => ipcRenderer.off('window-maximized-changed', h);
  },
  getNotificationsEnabled: (): Promise<boolean> => ipcRenderer.invoke('get-notifications-enabled'),
  setNotificationsEnabled: (value: boolean): Promise<void> => ipcRenderer.invoke('set-notifications-enabled', value),
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('quit-and-install'),

  // ── main → toolbar ──────────────────────────────────────────────────────────
  onUrlChanged: (cb: (url: string) => void) => {
    const h = (_: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('url-changed', h);
    return () => ipcRenderer.off('url-changed', h);
  },
  onLoadingChanged: (cb: (loading: boolean) => void) => {
    const h = (_: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on('loading-changed', h);
    return () => ipcRenderer.off('loading-changed', h);
  },
  onCanGoBack: (cb: (can: boolean) => void) => {
    const h = (_: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on('can-go-back', h);
    return () => ipcRenderer.off('can-go-back', h);
  },
  onCanGoForward: (cb: (can: boolean) => void) => {
    const h = (_: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on('can-go-forward', h);
    return () => ipcRenderer.off('can-go-forward', h);
  },
  onFocusUrlBar: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on('focus-url-bar', h);
    return () => ipcRenderer.off('focus-url-bar', h);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
