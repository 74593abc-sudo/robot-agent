const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { safeSend, isWinAlive } = require('./safeSend');

const ROBOT_W = 135;
const ROBOT_H = 162;

let robotWindow = null;
let chatWindow = null;
let bubbleWindow = null;
let isChatVisible = false;

function getRobotWindow() { return robotWindow; }
function getChatWindow() { return chatWindow; }
function getBubbleWindow() { return bubbleWindow; }
function getIsChatVisible() { return isChatVisible; }
function setIsChatVisible(v) { isChatVisible = v; }

function createRobotWindow(isFirstLaunch, showBubble, smoothMoveWindow) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  robotWindow = new BrowserWindow({
    width: ROBOT_W, height: ROBOT_H, transparent: true, frame: false,
    alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  robotWindow.loadFile(path.join(__dirname, '..', 'renderer', 'robot.html'));
  // Rest position: bottom-right corner, flush with work area bottom so the
  // base sits on the taskbar. Right edge keeps 16px gap from screen edge
  // so the robot doesn't look glued to the wall.
  const restX = width - ROBOT_W - 16, restY = height - ROBOT_H;
  if (isFirstLaunch) {
    const cx = Math.round(width / 2 - ROBOT_W / 2);
    const cy = Math.round(height / 2 - ROBOT_H / 2);
    robotWindow.setBounds({ x: cx, y: cy, width: ROBOT_W, height: ROBOT_H });
    robotWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        showBubble('我是灵珑。按下 Ctrl+Shift+Space 随时唤我;\n平时我在右下角等你。', 'claude');
      }, 1400);
      setTimeout(() => smoothMoveWindow(restX, restY, 900), 3200);
    });
  } else {
    robotWindow.setBounds({ x: restX, y: restY, width: ROBOT_W, height: ROBOT_H });
  }
  robotWindow.on('closed', () => { robotWindow = null; });
  return robotWindow;
}

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 390, height: 570, minWidth: 340, minHeight: 420,
    frame: false, transparent: false,
    resizable: true, show: false, skipTaskbar: true, alwaysOnTop: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  chatWindow.loadFile(path.join(__dirname, '..', 'renderer', 'chat.html'));
  chatWindow.on('closed', () => { chatWindow = null; isChatVisible = false; });
  return chatWindow;
}

function createBubbleWindow() {
  bubbleWindow = new BrowserWindow({
    width: 300, height: 140,
    transparent: true, frame: false,
    alwaysOnTop: true, resizable: false, skipTaskbar: true, hasShadow: false,
    focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  bubbleWindow.loadFile(path.join(__dirname, '..', 'renderer', 'bubble.html'));
  bubbleWindow.on('closed', () => { bubbleWindow = null; });
  return bubbleWindow;
}

function positionBubbleWindow() {
  if (!robotWindow || !bubbleWindow) return;
  try {
    const [rx, ry] = robotWindow.getPosition();
    const bw = 300, bh = 140;
    const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
    let bx = rx - bw + 40;
    let by = ry - bh + 30;
    if (bx < 10) bx = rx + 110;
    if (bx + bw > screenW - 10) bx = screenW - bw - 10;
    if (by < 10) by = ry + 30;
    bubbleWindow.setBounds({ x: Math.round(bx), y: Math.round(by), width: bw, height: bh });
  } catch (_) {}
}

// Per-agent debounce so a fast burst of replies from the same agent isn't
// duplicated, but two different agents can both surface their first reply.
const _bubbleLastTs = { claude: 0, hermes: 0, openclaw: 0, _global: 0 };
let _bubbleHideTimer = null;

function showBubble(text, agent, silentMode) {
  if (silentMode || isChatVisible) return;
  if (!text) return;
  const cleaned = String(text).trim();
  if (cleaned.length < 8) return;
  const now = Date.now();
  const key = (_bubbleLastTs[agent] !== undefined) ? agent : '_global';
  if (_bubbleLastTs[key] && now - _bubbleLastTs[key] < 4000) return;
  _bubbleLastTs[key] = now;
  if (!bubbleWindow) createBubbleWindow();
  const send = () => {
    if (!isWinAlive(bubbleWindow)) return;
    positionBubbleWindow();
    safeSend(bubbleWindow, 'bubble-show', { text, agent });
    try { bubbleWindow.showInactive(); } catch (_) { return; }
    if (_bubbleHideTimer) clearTimeout(_bubbleHideTimer);
    _bubbleHideTimer = setTimeout(() => hideBubble(), 6500);
  };
  if (bubbleWindow.webContents.isLoading()) {
    bubbleWindow.webContents.once('did-finish-load', send);
  } else send();
}

function hideBubble() {
  if (_bubbleHideTimer) { clearTimeout(_bubbleHideTimer); _bubbleHideTimer = null; }
  if (isWinAlive(bubbleWindow) && bubbleWindow.isVisible()) {
    safeSend(bubbleWindow, 'bubble-hide');
    setTimeout(() => {
      if (isWinAlive(bubbleWindow)) {
        try { bubbleWindow.hide(); } catch (_) {}
      }
    }, 350);
  }
}

function positionChatWindow() {
  if (!robotWindow || !chatWindow) return;
  try {
    const [rx, ry] = robotWindow.getPosition();
    // Preserve current chat size if user resized; fall back to defaults
    const [curW, curH] = chatWindow.getSize();
    const chatW = curW || 390;
    const chatH = curH || 570;
    const { height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    let x = rx - chatW - 12;
    if (x < 10) x = rx + ROBOT_W;
    let y = ry - chatH + ROBOT_H;
    if (y < 10) y = 10;
    if (y + chatH > screenH - 10) y = screenH - chatH - 10;
    chatWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: chatW, height: chatH });
  } catch (_) {}
}

function toggleChat() {
  if (!chatWindow) createChatWindow();
  if (isChatVisible) {
    chatWindow.hide(); isChatVisible = false; setRobotState('idle');
  } else {
    hideBubble();
    positionChatWindow(); chatWindow.show(); chatWindow.focus();
    isChatVisible = true; setRobotState('active');
  }
}

function setRobotState(state) {
  safeSend(robotWindow, 'set-state', state);
}

function flashRobotError(duration = 2200) {
  setRobotState('error');
  setTimeout(() => setRobotState(isChatVisible ? 'active' : 'idle'), duration);
}

function clampRobotSize() {
  if (!robotWindow) return;
  try { robotWindow.setSize(ROBOT_W, ROBOT_H); } catch (_) {}
}

module.exports = {
  ROBOT_W, ROBOT_H,
  getRobotWindow, getChatWindow, getBubbleWindow, getIsChatVisible, setIsChatVisible,
  createRobotWindow, createChatWindow, createBubbleWindow,
  positionBubbleWindow, showBubble, hideBubble, positionChatWindow,
  toggleChat, setRobotState, flashRobotError, clampRobotSize,
};
