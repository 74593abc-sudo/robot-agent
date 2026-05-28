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
    if (!rw || rw.isDestroyed() || !rw.isVisible()) return;
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
    rw.webContents.send('cursor-point', { x: ix, y: iy });
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

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

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
    const cw = getChatWindow();
    if (cw) cw.webContents.send('silent-changed', v);
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
    const cw = getChatWindow();
    if (cw) cw.webContents.send('theme-changed', v);
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
    rw.webContents.send('set-accent', { color: '#D97757', soft: 'rgba(217,119,87,.5)' });
  });

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const rw = getRobotWindow();
    if (rw) {
      if (getPeekSide()) recallRobot();
      rw.webContents.send('trigger-pulse');
    }
    toggleChat();
  });
  globalShortcut.register('CommandOrControl+Shift+R', () => recallRobot());

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
