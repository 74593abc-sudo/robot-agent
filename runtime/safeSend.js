// Shared helpers for talking to renderer processes safely.
//
// Why this exists:
//   BrowserWindow handles can outlive their underlying webContents (closed,
//   destroyed, crashed). Calling `win.webContents.send(...)` on a dead
//   handle throws "Object has been destroyed". Every IPC emitter in the
//   codebase used to inline its own `if (win) win.webContents.send(...)` —
//   which catches `null` but not `isDestroyed()` races. This module
//   centralises the guard.
//
// All callers should prefer safeSend / safeInvoke over touching webContents
// directly.

/**
 * Returns true when the BrowserWindow handle still has a usable webContents.
 *
 * @param {Electron.BrowserWindow|null|undefined} win
 */
function isWinAlive(win) {
  if (!win) return false;
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false;
    const wc = win.webContents;
    if (!wc) return false;
    if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return false;
  } catch (_) {
    return false;
  }
  return true;
}

/**
 * Safely send an IPC message. Silently no-ops if the window is gone.
 *
 * @param {Electron.BrowserWindow|null|undefined} win
 * @param {string} channel
 * @param  {...any} args
 */
function safeSend(win, channel, ...args) {
  if (!isWinAlive(win)) return false;
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch (_) {
    // Window died between the alive-check and the send (extremely rare).
    return false;
  }
}

module.exports = { safeSend, isWinAlive };
