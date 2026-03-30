import path from 'path';
import { app } from 'electron';

// ─── Hardcoded target ─────────────────────────────────────────────────────────

export const TARGET_URL   = 'https://automint.online';
export const APP_TITLE    = 'AutoMint';
export const TOOLBAR_HEIGHT = 0;

// ─── Derived ──────────────────────────────────────────────────────────────────

/**
 * Extracts the registrable domain so we can keep *.automint.online in-app
 * and send everything else to the system browser.
 * e.g. "https://app.automint.online/path" → "automint.online"
 */
export function getBaseDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    return parts.length <= 2 ? hostname : parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

export const TARGET_BASE_DOMAIN = getBaseDomain(TARGET_URL);

/**
 * Returns true if a URL should stay inside the WebContentsView.
 * - Any page on the target domain / subdomains
 * - Discord OAuth flow  (discord.com/oauth2/…)
 * - Google OAuth / sign-in (accounts.google.com, oauth2.googleapis.com)
 *
 * Everything else is sent to the system browser.
 */
export function isAllowedInApp(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);

    // Same registrable domain (handles subdomains automatically)
    if (getBaseDomain(url) === TARGET_BASE_DOMAIN) return true;

    // Discord – only the OAuth authorisation path
    if (hostname === 'discord.com' && pathname.startsWith('/oauth2/')) return true;

    // Google – sign-in and OAuth token endpoints
    if (hostname === 'accounts.google.com')    return true;
    if (hostname === 'oauth2.googleapis.com')   return true;

  } catch { /* malformed URL — deny */ }

  return false;
}

/** Absolute path to the bundled icon — works in dev and when packaged. */
export function getIconPath(): string {
  const appPath  = app.getAppPath();
  const inside   = path.join(appPath, 'assets', 'mint.jpg');
  const outside  = path.join(path.dirname(appPath), 'assets', 'mint.jpg');
  try {
    const fs = require('fs') as typeof import('fs');
    if (fs.existsSync(outside)) return outside;
    if (fs.existsSync(inside))  return inside;
  } catch { /* ignore */ }
  return inside;
}
