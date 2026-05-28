const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ClaudeRuntime } = require('./claudeRuntime');
const { SessionGraph } = require('./sessionGraph');
const personas = require('./personas');
const { setRobotState, flashRobotError, getIsChatVisible, showBubble } = require('./windows');

let store = null;
let graph = null;
let chatWindow = null;

const runningProc = { hermes: null, openclaw: null };
let claudeRT = null;
const conversationStarted = { hermes: false, openclaw: false };
const currentPersona = {
  claude:   'default',
  hermes:   'default',
  openclaw: 'default',
};
const SESSION_DIRS = {};

const tokenBuf   = { claude: '', openclaw: '', hermes: '' };
const tokenTimer = { claude: null, openclaw: null, hermes: null };
const FLUSH_MS = 16;
const TOKEN_BUF_MAX = 32 * 1024;

const inflight = { claude: null, hermes: null, openclaw: null };

let lastClaudeSessionId = null;
let silentMode = false;

function init(storeInstance, chatWindowGetter) {
  store = storeInstance;
  graph = new SessionGraph(store);
  chatWindow = chatWindowGetter;
  currentPersona.claude = store.get('persona.claude', 'default');
  currentPersona.hermes = store.get('persona.hermes', 'default');
  currentPersona.openclaw = store.get('persona.openclaw', 'default');
}

function getSessionDir(agentName) {
  if (!SESSION_DIRS[agentName]) {
    const dir = path.join(app.getPath('userData'), 'sessions', agentName);
    fs.mkdirSync(dir, { recursive: true });
    SESSION_DIRS[agentName] = dir;
  }
  return SESSION_DIRS[agentName];
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[\d;]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function emitEvent(ev) {
  const w = typeof chatWindow === 'function' ? chatWindow() : chatWindow;
  if (w) w.webContents.send('agent-event', ev);
}

function flushTokens(agentName) {
  if (!tokenBuf[agentName]) return;
  emitEvent({ type: 'token', agent: agentName, text: tokenBuf[agentName] });
  tokenBuf[agentName] = '';
}

function queueToken(agentName, text) {
  if (!text) return;
  tokenBuf[agentName] += text;
  if (tokenBuf[agentName].length > TOKEN_BUF_MAX) {
    if (tokenTimer[agentName]) { clearTimeout(tokenTimer[agentName]); tokenTimer[agentName] = null; }
    flushTokens(agentName);
    return;
  }
  if (tokenTimer[agentName]) return;
  tokenTimer[agentName] = setTimeout(() => {
    tokenTimer[agentName] = null;
    flushTokens(agentName);
  }, FLUSH_MS);
}

function onTurnFinished(agentName, hadText) {
  if (!hadText) {
    flashRobotError();
  } else if (!getIsChatVisible() && !silentMode) {
    setRobotState('notification');
    setTimeout(() => { if (!getIsChatVisible()) setRobotState('idle'); }, 4500);
  } else if (silentMode && !getIsChatVisible()) {
    setRobotState('idle');
  } else {
    setRobotState('active');
  }
}

function handleClaudeEvent(ev) {
  switch (ev.type) {
    case 'session':
      lastClaudeSessionId = ev.sessionId;
      break;
    case 'token':
      if (inflight.claude && !inflight.claude.sawText) {
        inflight.claude.sawText = true;
        setRobotState('speaking');
      }
      queueToken('claude', ev.text);
      break;
    case 'tool_start':
      flushTokens('claude');
      setRobotState('working');
      emitEvent({ type: 'tool_start', agent: 'claude', id: ev.id, name: ev.name, input: ev.input });
      break;
    case 'tool_end':
      emitEvent({ type: 'tool_end', agent: 'claude', id: ev.id, name: ev.name, output: ev.output, is_error: ev.is_error });
      break;
    case 'done': {
      flushTokens('claude');
      const text = ev.text || '';
      if (text) {
        const node = graph.append('claude', {
          role: 'assistant',
          text,
          claudeSessionId: lastClaudeSessionId || undefined,
          persona: inflight.claude ? inflight.claude.persona : currentPersona.claude,
        });
        emitEvent({ type: 'done', agent: 'claude', text, nodeId: node.id, claudeSessionId: lastClaudeSessionId });
        if (!getIsChatVisible() && !silentMode) showBubble(text, 'claude', silentMode);
      } else {
        emitEvent({ type: 'error', agent: 'claude', error: '未收到回复' });
      }
      inflight.claude = null;
      onTurnFinished('claude', !!text);
      break;
    }
    case 'error':
      flushTokens('claude');
      emitEvent({ type: 'error', agent: 'claude', error: ev.error });
      inflight.claude = null;
      onTurnFinished('claude', false);
      break;
    case 'exit':
      claudeRT = null;
      break;
  }
}

function ensureClaudeRuntime() {
  if (claudeRT) return claudeRT;
  const persona = personas.get(currentPersona.claude);
  const branch = graph.getBranch('claude');
  const last   = branch.length ? branch[branch.length - 1] : null;
  const resume = last ? graph.findClaudeSessionId('claude', last.id) : null;

  claudeRT = new ClaudeRuntime({
    cwd: getSessionDir('claude'),
    systemPrompt: persona.systemPrompt,
    resumeSessionId: resume,
    forkSession: false,
    onEvent: (ev) => handleClaudeEvent(ev),
  });
  return claudeRT;
}

function buildPlainCommand(agentName, message) {
  const isFirst = !conversationStarted[agentName];
  const safe = message.replace(/\0/g, '');

  if (agentName === 'hermes') {
    return isFirst
      ? ['hermes', ['-z', safe]]
      : ['hermes', ['--continue', '-z', safe]];
  }
  if (agentName === 'openclaw') {
    return ['openclaw', ['agent', '--local', '-m', safe]];
  }
  return null;
}

function runPlainAgent(agentName, message) {
  const cmdArr = buildPlainCommand(agentName, message);
  if (!cmdArr) return;
  const [cmd, args] = cmdArr;
  const cwd = getSessionDir(agentName);

  if (runningProc[agentName]) {
    try { runningProc[agentName].kill(); } catch (_) {}
    runningProc[agentName] = null;
  }
  tokenBuf[agentName] = '';
  if (tokenTimer[agentName]) { clearTimeout(tokenTimer[agentName]); tokenTimer[agentName] = null; }

  setRobotState('thinking');
  emitEvent({ type: 'state', agent: agentName, state: 'thinking' });

  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' };
  let proc;
  try {
    proc = spawn(cmd, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], cwd, env, windowsHide: true });
  } catch (err) {
    emitEvent({ type: 'error', agent: agentName, error: `启动失败: ${err.message}` });
    flashRobotError();
    return;
  }
  runningProc[agentName] = proc;
  conversationStarted[agentName] = true;

  let collected = '';
  let sawFirst = false;
  // Cap collected output to prevent OOM if a CLI floods stdout.
  // 4MB is plenty for any reasonable conversation reply; beyond that we
  // truncate and mark, but still finish gracefully on close().
  const STDOUT_CAP = 4 * 1024 * 1024;
  let stdoutTruncated = false;
  const appendCollected = (chunk) => {
    if (stdoutTruncated) return;
    if (collected.length + chunk.length > STDOUT_CAP) {
      collected += chunk.slice(0, STDOUT_CAP - collected.length);
      collected += '\n\n…[输出过长，已截断]';
      stdoutTruncated = true;
      // Stop the child to free resources.
      try { proc.kill(); } catch (_) {}
    } else {
      collected += chunk;
    }
  };
  proc.stdout.on('data', d => {
    const chunk = stripAnsi(d.toString());
    if (!chunk) return;
    if (!sawFirst) { sawFirst = true; setRobotState('speaking'); if (inflight[agentName]) inflight[agentName].sawText = true; }
    appendCollected(chunk);
    if (!stdoutTruncated) queueToken(agentName, chunk);
  });
  proc.stderr.on('data', d => {
    const chunk = stripAnsi(d.toString());
    if (!chunk || chunk.length <= 5) return;
    if (/^\s*(Warning|Info|Debug|Hint):/i.test(chunk)) return;
    appendCollected(chunk);
    if (!stdoutTruncated) queueToken(agentName, chunk);
  });
  proc.on('close', code => {
    runningProc[agentName] = null;
    flushTokens(agentName);
    const text = collected.trim();
    if (text) {
      const node = graph.append(agentName, { role: 'assistant', text, persona: currentPersona[agentName] });
      emitEvent({ type: 'done', agent: agentName, text, nodeId: node.id });
      if (!getIsChatVisible() && !silentMode) showBubble(text, agentName, silentMode);
    } else {
      emitEvent({ type: 'error', agent: agentName, error: code !== 0 ? `进程退出码 ${code}` : '未收到回复' });
    }
    inflight[agentName] = null;
    onTurnFinished(agentName, !!text);
  });
  proc.on('error', err => {
    runningProc[agentName] = null;
    emitEvent({ type: 'error', agent: agentName, error: `错误: ${err.message}` });
    inflight[agentName] = null;
    onTurnFinished(agentName, false);
  });
}

function sendToAgent(agentName, text) {
  const persona = currentPersona[agentName];
  let outboundText = text;
  if (agentName !== 'claude') {
    const p = personas.get(persona);
    if (p.systemPrompt && !conversationStarted[agentName]) {
      outboundText = `[系统指令] ${p.systemPrompt}\n\n[用户] ${text}`;
    }
  }

  const userNode = graph.append(agentName, { role: 'user', text, persona });
  inflight[agentName] = { userNodeId: userNode.id, persona, sawText: false };
  emitEvent({ type: 'user_node', agent: agentName, nodeId: userNode.id, text, ts: userNode.ts });

  if (agentName === 'claude') {
    ensureClaudeRuntime().send(outboundText);
    setRobotState('thinking');
    emitEvent({ type: 'state', agent: agentName, state: 'thinking' });
  } else {
    runPlainAgent(agentName, outboundText);
  }
}

function stopAgent(agentName) {
  if (agentName === 'claude') {
    if (claudeRT) { claudeRT.interrupt(); }
  } else {
    const p = runningProc[agentName];
    if (p) { try { p.kill(); } catch (_) {} runningProc[agentName] = null; }
  }
  inflight[agentName] = null;
  emitEvent({ type: 'error', agent: agentName, error: '已停止生成' });
  setRobotState(getIsChatVisible() ? 'active' : 'idle');
}

function setPersona(agentName, personaId) {
  if (!personas.PERSONAS[personaId]) return;
  if (currentPersona[agentName] === personaId) return;
  currentPersona[agentName] = personaId;
  store.set(`persona.${agentName}`, personaId);
  if (agentName === 'claude' && claudeRT) {
    // Claude supports system-prompt re-injection by respawning; conversation
    // continues via resumeSessionId on next send. No history clear needed.
    claudeRT.stop();
    claudeRT = null;
  }
  if (agentName === 'hermes' || agentName === 'openclaw') {
    // Hermes/OpenClaw inject persona as a prefix to the FIRST user message of
    // a session — switching mid-conversation would silently do nothing until
    // a new session starts. Clear the branch so the new persona takes effect
    // immediately and the user sees a clean slate.
    graph.clear(agentName);
    conversationStarted[agentName] = false;
    if (runningProc[agentName]) {
      try { runningProc[agentName].kill(); } catch (_) {}
      runningProc[agentName] = null;
    }
  }
  emitEvent({ type: 'persona', agent: agentName, persona: personaId, cleared: agentName !== 'claude' });
}

function forkFrom(agentName, nodeId) {
  const node = graph.getNode(agentName, nodeId);
  if (!node) return false;
  graph.setLeaf(agentName, nodeId);
  if (agentName === 'claude') {
    const sid = graph.findClaudeSessionId(agentName, nodeId);
    if (claudeRT) { claudeRT.stop(); claudeRT = null; }
    if (sid) {
      const persona = personas.get(currentPersona.claude);
      claudeRT = new ClaudeRuntime({
        cwd: getSessionDir('claude'),
        systemPrompt: persona.systemPrompt,
        resumeSessionId: sid,
        forkSession: true,
        onEvent: handleClaudeEvent,
      });
    }
  } else {
    conversationStarted[agentName] = false;
  }
  emitEvent({ type: 'fork', agent: agentName, nodeId });
  return true;
}

function newConversation(agentName) {
  graph.clear(agentName);
  if (agentName === 'claude') {
    if (claudeRT) { claudeRT.stop(); claudeRT = null; }
    lastClaudeSessionId = null;
  } else {
    conversationStarted[agentName] = false;
    if (runningProc[agentName]) { try { runningProc[agentName].kill(); } catch (_) {} runningProc[agentName] = null; }
  }
}

function getBranch(agentName) { return graph.getBranch(agentName); }
function getPersonas() { return { list: personas.list(), current: { ...currentPersona } }; }
function getSilent() { return silentMode; }
function setSilent(v) { silentMode = v; }

function cleanup() {
  if (claudeRT) { try { claudeRT.stop(); } catch (_) {} }
  Object.values(runningProc).forEach(p => { if (p) try { p.kill(); } catch (_) {} });
}

module.exports = {
  init, sendToAgent, stopAgent, setPersona, forkFrom, newConversation,
  getBranch, getPersonas, getSilent, setSilent, ensureClaudeRuntime, cleanup,
};
