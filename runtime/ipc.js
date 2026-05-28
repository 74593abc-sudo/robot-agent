const { ipcMain, app, BrowserWindow } = require('electron');
const {
  ROBOT_W, ROBOT_H,
  getIsChatVisible, setIsChatVisible, toggleChat, setRobotState,
  positionChatWindow, positionBubbleWindow, hideBubble, getRobotWindow,
  getBubbleWindow, getChatWindow, clampRobotSize,
} = require('./windows');
const {
  noteInteraction, smoothMoveWindow, getEdgeSnap, setPeek, getPeekSide,
  clearPeek, isThrownLock, setThrowAbort, setSmoothMoveAbort, throwWindow,
} = require('./physics');
const {
  sendToAgent, stopAgent, setPersona, forkFrom, newConversation,
  getBranch, getPersonas, getSilent, setSilent, ensureClaudeRuntime,
} = require('./agents');
const { updateTrayMenu } = require('./tray');
const store = require('./store');
const { checkAgents } = require('./agentCheck');

let trayCallbacks = null;

function setTrayCallbacks(callbacks) {
  trayCallbacks = callbacks;
}

function register() {
  ipcMain.on('toggle-chat', () => { noteInteraction(); toggleChat(); });

  ipcMain.on('robot-moved', () => {
    noteInteraction();
    if (isThrownLock()) return;
    clampRobotSize();
    if (getIsChatVisible()) positionChatWindow();
    const bw = getBubbleWindow();
    if (bw && bw.isVisible()) positionBubbleWindow();
    const snap = getEdgeSnap();
    if (snap) { smoothMoveWindow(snap.x, snap.y, 240); setPeek(snap.side); }
    else if (getPeekSide()) setPeek('');
  });

  ipcMain.on('move-window', (_, { x, y }) => {
    noteInteraction();
    if (isThrownLock()) { setThrowAbort(true); }
    setSmoothMoveAbort(true);
    const rw = getRobotWindow();
    if (rw) rw.setBounds({ x, y, width: ROBOT_W, height: ROBOT_H });
    const bw = getBubbleWindow();
    if (bw && bw.isVisible()) positionBubbleWindow();
    if (getPeekSide()) setPeek('');
  });

  ipcMain.on('throw-from', (_, { vx, vy }) => {
    noteInteraction();
    throwWindow(vx, vy, () => {
      setRobotState(getIsChatVisible() ? 'active' : 'idle');
      clampRobotSize();
      if (getIsChatVisible()) positionChatWindow();
      const bw = getBubbleWindow();
      if (bw && bw.isVisible()) positionBubbleWindow();
    });
  });

  ipcMain.on('send-message', (_, { agent, text }) => {
    if (typeof text !== 'string' || !text.trim()) return;
    if (text.length > 100000) { text = text.slice(0, 100000); }
    noteInteraction();
    sendToAgent(agent, text);
  });
  ipcMain.on('stop-agent', (_, agentName) => { noteInteraction(); stopAgent(agentName); });

  ipcMain.on('start-agent', (_, agentName) => {
    noteInteraction();
    if (agentName === 'claude') ensureClaudeRuntime();
    const cw = getChatWindow();
    if (cw) cw.webContents.send('agent-ready', { agent: agentName });
  });

  ipcMain.handle('get-branch', (_, agentName) => getBranch(agentName));
  ipcMain.handle('get-silent', () => getSilent());
  ipcMain.handle('get-personas', () => getPersonas());

  ipcMain.on('set-persona', (_, { agent, persona }) => { noteInteraction(); setPersona(agent, persona); });
  ipcMain.on('fork-from', (_, { agent, nodeId }) => { noteInteraction(); forkFrom(agent, nodeId); });

  ipcMain.on('new-conversation', (_, agentName) => { newConversation(agentName); });

  const AGENT_ACCENT = {
    claude:   { color: '#D97757', soft: 'rgba(217,119,87,.5)' },
    openclaw: { color: '#D63B2F', soft: 'rgba(214,59,47,.5)'  },
    hermes:   { color: '#F37021', soft: 'rgba(243,112,33,.5)' },
  };

  ipcMain.on('agent-changed', (_, agentName) => {
    const a = AGENT_ACCENT[agentName];
    const rw = getRobotWindow();
    if (a && rw) rw.webContents.send('set-accent', a);
  });

  ipcMain.on('bubble-click', () => { noteInteraction(); hideBubble(); toggleChat(); });
  ipcMain.on('bubble-dismiss', () => { noteInteraction(); hideBubble(); });

  ipcMain.on('toggle-silent', () => {
    const newSilent = !getSilent();
    setSilent(newSilent);
    store.set('silentMode', newSilent);
    const cw = getChatWindow();
    if (cw) cw.webContents.send('silent-changed', newSilent);
    if (trayCallbacks) updateTrayMenu(trayCallbacks);
    if (newSilent) hideBubble();
  });

  ipcMain.handle('get-first-launch', () => {
    return !store.get('hasLaunched', false);
  });

  ipcMain.handle('get-auto-start', () => {
    return store.get('autoStart', false);
  });

  ipcMain.on('set-auto-start', (_, enabled) => {
    store.set('autoStart', enabled);
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe'),
    });
  });

  ipcMain.handle('get-agent-status', () => {
    return checkAgents();
  });

  ipcMain.handle('get-theme', () => {
    return store.get('theme', 'dark');
  });

  ipcMain.on('set-theme', (_, theme) => {
    store.set('theme', theme);
  });

  ipcMain.on('hide-chat', () => {
    const cw = getChatWindow();
    if (cw && getIsChatVisible()) {
      cw.hide(); setIsChatVisible(false); setRobotState('idle');
    }
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.on('onboarding-done', () => {
    store.set('onboardingDone', true);
    // Prefer the explicit global reference; fall back to title match.
    const onbWin = global.__onboardingWindow
      || BrowserWindow.getAllWindows().find(w => w.getTitle() === '灵珑 · 新手引导');
    if (onbWin && !onbWin.isDestroyed()) onbWin.close();
  });
}

module.exports = { register, setTrayCallbacks };
