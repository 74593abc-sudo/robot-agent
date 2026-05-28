// electron-updater wrapper.
//
// Behavior:
//   - Silently checks GitHub Releases on app start (5s after ready).
//   - When update is found AND downloaded, shows a bubble notification
//     prompting "重启以应用更新".
//   - User can defer; install happens on app.quit() if accepted.
//
// Skipped entirely in dev (when app is not packaged) to avoid log spam
// and accidental download attempts during local development.

const { app, dialog } = require('electron');

let initialized = false;
let updateReady = false;

function init({ getBubbleShowFn } = {}) {
  if (initialized) return;
  initialized = true;

  // Skip in dev mode — autoUpdater requires a packaged app to function.
  if (!app.isPackaged) {
    console.log('[updater] skipped in development mode');
    return;
  }

  // Skip if no publish config or the placeholder owner is still set.
  // Without these guards the updater would hammer a non-existent GitHub
  // user every 6 hours, fill the log with 404s, and (worse) become a
  // remote code-replacement vector if anyone registered the placeholder
  // username. To enable auto-updates, add a publish entry to package.json
  // with a real owner/repo.
  try {
    const pkg = require('../package.json');
    const pub = Array.isArray(pkg.build && pkg.build.publish)
      ? pkg.build.publish[0]
      : (pkg.build && pkg.build.publish);
    if (!pub) {
      console.log('[updater] disabled: no publish config in package.json');
      return;
    }
    const owner = pub.owner;
    if (!owner || /REPLACE_ME|<.*>/i.test(owner)) {
      console.warn('[updater] disabled: publish.owner is a placeholder ("' + owner + '"). ' +
                   'Set it to a real GitHub user/org in package.json to enable auto-updates.');
      return;
    }
  } catch (_) {
    return;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    console.error('[updater] electron-updater not installed:', err.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => {
    // Network errors are common (offline / GitHub rate-limit). Don't bother the user.
    console.error('[updater] error:', err && err.message);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] no update available');
  });

  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] downloading: ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReady = true;
    console.log('[updater] update downloaded:', info.version);
    // Surface to the user via bubble (non-blocking).
    if (typeof getBubbleShowFn === 'function') {
      try {
        getBubbleShowFn()(
          `新版本 v${info.version} 已下载,下次启动时生效;或现在重启应用更新`,
          'claude'
        );
      } catch (_) {}
    }
  });

  // First check 5s after start to avoid blocking startup.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[updater] initial check failed:', err && err.message);
    });
  }, 5000);

  // Re-check every 6 hours while app is running.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

function isUpdateReady() { return updateReady; }

function quitAndInstall() {
  if (!updateReady) return false;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall(true, true);
    return true;
  } catch (err) {
    console.error('[updater] quitAndInstall failed:', err);
    return false;
  }
}

module.exports = { init, isUpdateReady, quitAndInstall };
