const { app, globalShortcut, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./runtime/store');
const { ROBOT_W, ROBOT_H, createRobotWindow, createChatWindow, getRobotWindow, setRobotState, getIsChatVisible, positionChatWindow, clampRobotSize, getBubbleWindow, getChatWindow, hideBubble, toggleChat: toggleChatImpl, showBubble } = require('./runtime/windows');
const { smoothMoveWindow, noteInteraction, clearPeek, startPhysicsTimers, clearPhysicsTimers, getPeekSide } = require('./runtime/physics');
const { init: initAgents, ensureClaudeRuntime, cleanup: cleanupAgents, getSilent, setSilent } = require('./runtime/agents');
const { register: registerIPC, setTrayCallbacks } = require('./runtime/ipc');
const { createTray, runAgentCheckOnStartup, updateTrayMenu } = require('./runtime/tray');
const updater = require('./runtime/updater');
const { safeSend, isWinAlive } = require('./runtime/safeSend');

const isFirstLaunch = !store.get('hasLaunched', false);
if (isFirstLaunch) store.set('hasLaunched', true);

let cursorTimer = null;

function startCursorTracking() {
  if (cursorTimer) clearInterval(cursorTimer);
  let lastCursor = { x: -1, y: -1 };
  let lastSent = { x: -999, y: -999 };
  // Window-relative coords beyond this from the robot center are too far for
  // eye tracking to register a meaningful change — skip the IPC send.
  const TRACK_RADIUS = 800;
  cursorTimer = setInterval(() => {
    const rw = getRobotWindow();
    if (!isWinAlive(rw) || !rw.isVisible()) return;
    let pt; try { pt = screen.getCursorScreenPoint(); } catch (_) { return; }
    if (pt.x === lastCursor.x && pt.y === lastCursor.y) return;
    lastCursor = pt;
    const [rx, ry] = rw.getPosition();
    const wx = pt.x - rx, wy = pt.y - ry;
    // Quantize to integer pixels and skip if same as last sent.
    const ix = Math.round(wx), iy = Math.round(wy);
    if (ix === lastSent.x && iy === lastSent.y) return;
    // Skip if cursor is far outside the tracking radius — robot eye is at
    // (~67,~80) of the 135x162 window; clamp generously.
    const cx = 67, cy = 80;
    if (Math.abs(ix - cx) > TRACK_RADIUS || Math.abs(iy - cy) > TRACK_RADIUS) return;
    lastSent = { x: ix, y: iy };
    safeSend(rw, 'cursor-point', { x: ix, y: iy });
  }, 80);
}

function recallRobot() {
  const rw = getRobotWindow();
  if (!rw) return;
  noteInteraction();
  clearPeek();

  let rx, ry;
  try {
    [rx, ry] = rw.getPosition();
  } catch (_) {
    const pt = screen.getCursorScreenPoint();
    rx = pt.x; ry = pt.y;
  }

  let disp;
  try {
    disp = screen.getDisplayMatching({ x: rx, y: ry, width: ROBOT_W, height: ROBOT_H });
  } catch (_) {
    disp = screen.getPrimaryDisplay();
  }
  const { width, height } = disp.workAreaSize;
  const { x: screenX, y: screenY } = disp.workArea;

  const tx = screenX + Math.max(10, width  - ROBOT_W - 16);
  const ty = screenY + Math.max(0,  height - ROBOT_H);

  try { if (!rw.isVisible()) rw.show(); } catch (_) {}
  clampRobotSize();
  smoothMoveWindow(tx, ty, 320);
  setRobotState(getIsChatVisible() ? 'active' : 'idle');
  if (getIsChatVisible()) positionChatWindow();
}

function toggleChat() {
  toggleChatImpl();
}

function forceCheck() {
  runAgentCheckOnStartup(store, { force: true }).catch(() => {});
}

function openOnboarding() {
  if (global.__onboardingWindow && !global.__onboardingWindow.isDestroyed()) {
    global.__onboardingWindow.show();
    global.__onboardingWindow.focus();
    return;
  }
  const { BrowserWindow } = require('electron');
  const onbWin = new BrowserWindow({
    width: 400, height: 520, frame: false, transparent: false,
    resizable: false, title: '灵珑 · 新手引导', alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  onbWin.loadFile(path.join(__dirname, 'renderer', 'onboarding.html'));
  global.__onboardingWindow = onbWin;
  onbWin.on('closed', () => { global.__onboardingWindow = null; });
}

// Crash handlers. We log everything; for fatal errors we surface a dialog
// so the user knows why the app is misbehaving, then quit gracefully so
// the OS doesn't show its own "not responding" prompt.
//
// We deliberately do NOT swallow exceptions silently — that left zombie
// IPC channels and inconsistent UI state on prior crashes.
let _crashing = false;
function _handleFatal(label, err) {
  console.error(`[${label}]`, err);
  if (_crashing) return;
  _crashing = true;
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox(
      '灵珑遇到错误',
      `${label}: ${(err && err.stack) || err}`
    );
  } catch (_) {}
  // Give ourselves a moment to flush state to disk before quitting.
  try { cleanupAgents(); } catch (_) {}
  setTimeout(() => app.exit(1), 200);
}
process.on('uncaughtException', (err) => _handleFatal('uncaughtException', err));
process.on('unhandledRejection', (reason) => {
  // Promise rejections aren't always fatal — log but don't kill the app
  // unless they look like programmer errors.
  console.error('[unhandledRejection]', reason);
});

// Single instance lock — running two copies of the app would create two
// robot windows, two sets of IPC handlers, and have both processes
// stomping on the same electron-store file. Quit early if another
// instance already owns the lock; nudge the existing instance to surface.
const _hasLock = app.requestSingleInstanceLock();
if (!_hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to start us again — bring the chat (or robot) forward.
    const rw = getRobotWindow();
    if (rw && !rw.isDestroyed()) {
      try { rw.show(); rw.focus(); } catch (_) {}
    }
    const cw = getChatWindow();
    if (cw && !cw.isDestroyed()) {
      try { cw.show(); cw.focus(); } catch (_) {}
    }
  });
}

app.whenReady().then(() => {
  initAgents(store, () => getChatWindow());
  registerIPC();

  // Apply auto-start setting
  const autoStart = store.get('autoStart', false);
  app.setLoginItemSettings({
    openAtLogin: autoStart,
    path: app.getPath('exe'),
  });

  const toggleChatFn = () => { noteInteraction(); toggleChat(); };
  const recallRobotFn = () => recallRobot();
  const getSilentFn = () => getSilent();
  const setSilentFn = (v) => {
    setSilent(v);
    store.set('silentMode', v);
    safeSend(getChatWindow(), 'silent-changed', v);
    updateTrayMenu(trayCallbacks);
    if (v) hideBubble();
  };
  const getAutoStartFn = () => store.get('autoStart', false);
  const setAutoStartFn = (v) => {
    store.set('autoStart', v);
    app.setLoginItemSettings({ openAtLogin: v, path: app.getPath('exe') });
    updateTrayMenu(trayCallbacks);
  };
  const getThemeFn = () => store.get('theme', 'dark');
  const setThemeFn = (v) => {
    store.set('theme', v);
    safeSend(getChatWindow(), 'theme-changed', v);
    updateTrayMenu(trayCallbacks);
  };
  const trayCallbacks = {
    toggleChat: toggleChatFn,
    recallRobot: recallRobotFn,
    getSilent: getSilentFn,
    setSilent: setSilentFn,
    getAutoStart: getAutoStartFn,
    setAutoStart: setAutoStartFn,
    getTheme: getThemeFn,
    setTheme: setThemeFn,
    forceCheck,
    openOnboarding,
  };
  setTrayCallbacks(trayCallbacks);

  createRobotWindow(isFirstLaunch, showBubble, smoothMoveWindow);
  startPhysicsTimers();
  const rw = getRobotWindow();
  rw.webContents.once('did-finish-load', () => {
    startCursorTracking();
    safeSend(rw, 'set-accent', { color: '#D97757', soft: 'rgba(217,119,87,.5)' });
  });

  // Register global shortcuts. .register() returns false if the chord is
  // already taken by another app — surface that to the user via bubble so
  // they know why a key isn't working, instead of silently no-op'ing.
  const failedShortcuts = [];
  const reg1 = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const rw = getRobotWindow();
    if (rw) {
      if (getPeekSide()) recallRobot();
      safeSend(rw, 'trigger-pulse');
    }
    toggleChat();
  });
  if (!reg1) failedShortcuts.push('Ctrl+Shift+Space');
  const reg2 = globalShortcut.register('CommandOrControl+Shift+R', () => recallRobot());
  if (!reg2) failedShortcuts.push('Ctrl+Shift+R');
  if (failedShortcuts.length) {
    // Defer slightly so the bubble window is ready.
    setTimeout(() => {
      try {
        showBubble(
          `快捷键被占用: ${failedShortcuts.join('、')}。其他应用先注册了相同组合，请关闭它们或更换。`,
          'claude'
        );
      } catch (_) {}
    }, 2500);
  }

  createTray(trayCallbacks);

  // Show onboarding on first launch
  if (isFirstLaunch && !store.get('onboardingDone', false)) {
    openOnboarding();
  }

  setTimeout(() => { runAgentCheckOnStartup(store).catch(() => {}); }, 1500);

  // Auto-update checker (runs in packaged build only; no-op in dev).
  updater.init({ getBubbleShowFn: () => showBubble });
});

app.on('window-all-closed', () => { /* keep in tray */ });

app.on('will-quit', () => {
  clearPhysicsTimers();
  if (cursorTimer) clearInterval(cursorTimer);
  globalShortcut.unregisterAll();
  cleanupAgents();
});
