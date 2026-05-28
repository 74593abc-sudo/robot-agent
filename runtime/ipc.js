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
const { safeSend } = require('./safeSend');

let trayCallbacks = null;

// Allow re-registering on test reloads without "second handler for X" errors.
// In production register() runs exactly once, so this is a no-op.
const _registeredChannels = new Set();
function _on(ch, fn)     { if (_registeredChannels.has(ch)) ipcMain.removeAllListeners(ch); ipcMain.on(ch, fn); _registeredChannels.add(ch); }
function _handle(ch, fn) { if (_registeredChannels.has(ch)) ipcMain.removeHandler(ch); ipcMain.handle(ch, fn); _registeredChannels.add(ch); }

const VALID_AGENTS = new Set(['claude', 'hermes', 'openclaw']);
function isValidAgent(a) { return typeof a === 'string' && VALID_AGENTS.has(a); }
function isFiniteNumber(n) { return typeof n === 'number' && Number.isFinite(n); }
function clampInt(n, min, max) { return Math.max(min, Math.min(max, Math.round(n))); }

function setTrayCallbacks(callbacks) {
  trayCallbacks = callbacks;
}

function register() {
  _on('toggle-chat', () => { noteInteraction(); toggleChat(); });

  _on('robot-moved', () => {
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

  _on('move-window', (_, payload) => {
    // Validate: payload must be {x:finite, y:finite}. Reject NaN / Infinity /
    // non-numeric so setBounds never sees garbage that could throw a Win32
    // error and crash the renderer's IPC channel.
    if (!payload || !isFiniteNumber(payload.x) || !isFiniteNumber(payload.y)) return;
    const x = clampInt(payload.x, -32768, 32767);
    const y = clampInt(payload.y, -32768, 32767);
    noteInteraction();
    if (isThrownLock()) { setThrowAbort(true); }
    setSmoothMoveAbort(true);
    const rw = getRobotWindow();
    if (rw) {
      try { rw.setBounds({ x, y, width: ROBOT_W, height: ROBOT_H }); } catch (_) {}
    }
    const bw = getBubbleWindow();
    if (bw && bw.isVisible()) positionBubbleWindow();
    if (getPeekSide()) setPeek('');
  });

  _on('throw-from', (_, payload) => {
    if (!payload || !isFiniteNumber(payload.vx) || !isFiniteNumber(payload.vy)) return;
    const vx = clampInt(payload.vx, -2000, 2000);
    const vy = clampInt(payload.vy, -2000, 2000);
    noteInteraction();
    throwWindow(vx, vy, () => {
      setRobotState(getIsChatVisible() ? 'active' : 'idle');
      clampRobotSize();
      if (getIsChatVisible()) positionChatWindow();
      const bw = getBubbleWindow();
      if (bw && bw.isVisible()) positionBubbleWindow();
    });
  });

  _on('send-message', (_, payload) => {
    if (!payload || !isValidAgent(payload.agent)) return;
    let { agent, text } = payload;
    if (typeof text !== 'string' || !text.trim()) return;
    if (text.length > 100000) text = text.slice(0, 100000);
    noteInteraction();
    sendToAgent(agent, text);
  });
  _on('stop-agent', (_, agentName) => {
    if (!isValidAgent(agentName)) return;
    noteInteraction();
    stopAgent(agentName);
  });

  _on('start-agent', (_, agentName) => {
    if (!isValidAgent(agentName)) return;
    noteInteraction();
    if (agentName === 'claude') ensureClaudeRuntime();
    safeSend(getChatWindow(), 'agent-ready', { agent: agentName });
  });

  _handle('get-branch', (_, agentName) => isValidAgent(agentName) ? getBranch(agentName) : []);
  _handle('get-silent', () => getSilent());
  _handle('get-personas', () => getPersonas());

  _on('set-persona', (_, payload) => {
    if (!payload || !isValidAgent(payload.agent) || typeof payload.persona !== 'string') return;
    noteInteraction();
    setPersona(payload.agent, payload.persona);
  });
  _on('fork-from', (_, payload) => {
    if (!payload || !isValidAgent(payload.agent) || typeof payload.nodeId !== 'string') return;
    noteInteraction();
    forkFrom(payload.agent, payload.nodeId);
  });

  _on('new-conversation', (_, agentName) => {
    if (!isValidAgent(agentName)) return;
    newConversation(agentName);
  });

  const AGENT_ACCENT = {
    claude:   { color: '#D97757', soft: 'rgba(217,119,87,.5)' },
    openclaw: { color: '#D63B2F', soft: 'rgba(214,59,47,.5)'  },
    hermes:   { color: '#F37021', soft: 'rgba(243,112,33,.5)' },
  };

  _on('agent-changed', (_, agentName) => {
    if (!isValidAgent(agentName)) return;
    safeSend(getRobotWindow(), 'set-accent', AGENT_ACCENT[agentName]);
  });

  _on('bubble-click', () => { noteInteraction(); hideBubble(); toggleChat(); });
  _on('bubble-dismiss', () => { noteInteraction(); hideBubble(); });

  _on('toggle-silent', () => {
    const newSilent = !getSilent();
    setSilent(newSilent);
    store.set('silentMode', newSilent);
    safeSend(getChatWindow(), 'silent-changed', newSilent);
    if (trayCallbacks) updateTrayMenu(trayCallbacks);
    if (newSilent) hideBubble();
  });

  _handle('get-first-launch', () => {
    return !store.get('hasLaunched', false);
  });

  _handle('get-auto-start', () => {
    return store.get('autoStart', false);
  });

  _on('set-auto-start', (_, enabled) => {
    const flag = !!enabled;
    store.set('autoStart', flag);
    try {
      app.setLoginItemSettings({
        openAtLogin: flag,
        path: app.getPath('exe'),
      });
    } catch (_) {}
  });

  // Cache agent presence for 60s — the underlying `where`/`which` lookup
  // can take a few hundred ms each and chat.html invokes this on every
  // window open. PATH changes between sessions are rare; the tray's
  // "重新检测智能体" item explicitly bypasses the cache by going through
  // runAgentCheckOnStartup({ force:true }).
  let _agentStatusCache = null;
  let _agentStatusTs = 0;
  _handle('get-agent-status', async () => {
    const now = Date.now();
    if (_agentStatusCache && (now - _agentStatusTs) < 60_000) {
      return _agentStatusCache;
    }
    _agentStatusCache = await checkAgents();
    _agentStatusTs = now;
    return _agentStatusCache;
  });

  _handle('get-theme', () => store.get('theme', 'dark'));

  _on('set-theme', (_, theme) => {
    if (theme !== 'dark' && theme !== 'light') return;
    store.set('theme', theme);
  });

  // Generic UI flag store. Limited to a fixed key prefix so the renderer
  // can't write arbitrary keys into our store. Values are coerced to a
  // primitive (string|number|boolean) to avoid arbitrary-shape persistence.
  const UI_FLAG_PREFIX = 'ui.flag.';
  const isValidFlagKey = (k) => typeof k === 'string' && /^[a-z0-9_-]{1,64}$/i.test(k);
  _handle('get-ui-flag', (_, key) => {
    if (!isValidFlagKey(key)) return null;
    return store.get(UI_FLAG_PREFIX + key, null);
  });
  _on('set-ui-flag', (_, payload) => {
    if (!payload || !isValidFlagKey(payload.key)) return;
    const v = payload.value;
    const t = typeof v;
    if (v !== null && t !== 'string' && t !== 'number' && t !== 'boolean') return;
    store.set(UI_FLAG_PREFIX + payload.key, v);
  });

  _on('hide-chat', () => {
    const cw = getChatWindow();
    if (cw && getIsChatVisible()) {
      try { cw.hide(); } catch (_) {}
      setIsChatVisible(false);
      setRobotState('idle');
    }
  });

  _on('quit-app', () => {
    app.quit();
  });

  _on('onboarding-done', () => {
    store.set('onboardingDone', true);
    // Prefer the explicit global reference; fall back to title match.
    const onbWin = global.__onboardingWindow
      || BrowserWindow.getAllWindows().find(w => {
        try { return w.getTitle() === '灵珑 · 新手引导'; } catch (_) { return false; }
      });
    if (onbWin && !onbWin.isDestroyed()) {
      try { onbWin.close(); } catch (_) {}
    }
  });

  // Dropped-file path resolution: Electron 32+ removed File.path. Renderer
  // hands us a webUtils-resolved path; if that fails we accept a plain
  // string as a fallback (older Electron, Linux drag/drop).
  // We do not read the file — the path is just inserted as `@path` text
  // in the chat input. No filesystem access happens here.
  // (Validation lives in the renderer; main only echoes the result back
  // for any future use case that needs it.)
}

module.exports = { register, setTrayCallbacks };
