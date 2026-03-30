'use client';

import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Home, X, Loader2 } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname + u.search + u.hash).replace(/\/$/, '');
  } catch { return url; }
}

// ─── NavButton ────────────────────────────────────────────────────────────────

function NavButton({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        'flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-100',
        disabled
          ? 'text-[#585b70] cursor-not-allowed opacity-40'
          : 'text-[#cdd6f4] hover:bg-[#45475a] hover:text-white cursor-default',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export function Toolbar() {
  const [nav, setNav] = useState({ url: '', isLoading: false, canGoBack: false, canGoForward: false });
  const [editValue, setEditValue]   = useState('');
  const [isEditing, setIsEditing]   = useState(false);
  const [loadKey,   setLoadKey]     = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const api         = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isEditingRef = useLatest(isEditing);

  // ── IPC subscriptions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    const unsubs = [
      api.onUrlChanged((url) => {
        setNav((s) => ({ ...s, url }));
        if (!isEditingRef.current) setEditValue(displayUrl(url));
      }),
      api.onLoadingChanged((loading) => {
        setNav((s) => ({ ...s, isLoading: loading }));
        if (loading) setLoadKey((k) => k + 1);
      }),
      api.onCanGoBack((can)     => setNav((s) => ({ ...s, canGoBack: can }))),
      api.onCanGoForward((can)  => setNav((s) => ({ ...s, canGoForward: can }))),
      api.onFocusUrlBar(()      => { inputRef.current?.focus(); inputRef.current?.select(); }),
    ];
    return () => unsubs.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBack    = useCallback(() => api?.navigateBack(),    [api]);
  const handleForward = useCallback(() => api?.navigateForward(), [api]);
  const handleHome    = useCallback(() => api?.navigateHome(),    [api]);
  const handleReload  = useCallback(() => api?.reload(),          [api]);

  const handleNavigate = useCallback(() => {
    const val = editValue.trim();
    if (!val) return;
    api?.navigateTo(val);
    inputRef.current?.blur();
    setIsEditing(false);
  }, [api, editValue]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleNavigate(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(displayUrl(nav.url));
      setIsEditing(false);
      inputRef.current?.blur();
    }
  }, [handleNavigate, nav.url]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setEditValue(nav.url);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [nav.url]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    setEditValue(displayUrl(nav.url));
  }, [nav.url]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full" style={{ height: '48px', background: '#1e1e2e' }}>
      {/* Loading progress bar */}
      <div className="relative h-0.5 w-full overflow-hidden">
        {nav.isLoading && (
          <div key={loadKey} className="absolute top-0 left-0 h-full bg-[#89b4fa] loading-bar" />
        )}
      </div>

      {/* Toolbar row */}
      <div
        className="flex items-center gap-1 px-2 w-full flex-1"
        style={{
          borderBottom: '1px solid #313244',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        {/* Nav buttons */}
        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <NavButton onClick={handleBack}    disabled={!nav.canGoBack}    title="Back">    <ArrowLeft  size={15} /></NavButton>
          <NavButton onClick={handleForward} disabled={!nav.canGoForward} title="Forward"> <ArrowRight size={15} /></NavButton>
          <NavButton onClick={handleReload}  title={nav.isLoading ? 'Stop' : 'Reload (Ctrl+R)'}>
            {nav.isLoading ? <X size={15} /> : <RotateCw size={15} />}
          </NavButton>
          <NavButton onClick={handleHome} title="Home"><Home size={15} /></NavButton>
        </div>

        {/* URL bar */}
        <div className="flex-1 relative flex items-center mx-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className={[
            'flex items-center w-full h-7 rounded-md px-2.5 transition-all duration-150',
            isEditing ? 'bg-[#11111b] ring-1 ring-[#89b4fa]/60' : 'bg-[#181825] hover:bg-[#1e1e2e]',
          ].join(' ')}>
            {nav.isLoading && !isEditing && (
              <Loader2 size={12} className="text-[#89b4fa] animate-spin mr-1.5 shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={isEditing ? editValue : displayUrl(nav.url)}
              onChange={(e) => setEditValue(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className={[
                'flex-1 bg-transparent border-none outline-none text-xs leading-none',
                'placeholder:text-[#585b70]',
                isEditing ? 'text-[#cdd6f4]' : 'text-[#a6adc8]',
              ].join(' ')}
              placeholder="Search or enter address…"
            />
            {isEditing && editValue.length > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setEditValue(''); }}
                className="ml-1 text-[#585b70] hover:text-[#cdd6f4] transition-colors shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
