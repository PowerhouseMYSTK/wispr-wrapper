export interface ElectronAPI {
  navigateBack:    () => Promise<void>;
  navigateForward: () => Promise<void>;
  navigateHome:    () => Promise<void>;
  navigateTo:  (url: string) => Promise<void>;
  reload:          () => Promise<void>;
  zoomIn:          () => Promise<void>;
  zoomOut:         () => Promise<void>;
  zoomReset:       () => Promise<void>;
  toggleDevTools:  () => Promise<void>;
  clearSession:    () => Promise<void>;
  windowMinimize:    () => Promise<void>;
  windowMaximize:    () => Promise<void>;
  windowClose:       () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void) => () => void;
  getNotificationsEnabled: () => Promise<boolean>;
  setNotificationsEnabled: (value: boolean) => Promise<void>;

  onUrlChanged:     (cb: (url: string)   => void) => () => void;
  onLoadingChanged: (cb: (loading: boolean) => void) => () => void;
  onCanGoBack:      (cb: (can: boolean)  => void) => () => void;
  onCanGoForward:   (cb: (can: boolean)  => void) => () => void;
  onFocusUrlBar:    (cb: () => void)              => () => void;
}

declare global {
  interface Window { electronAPI?: ElectronAPI; }
}
