const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ClaudeRuntime, resolveAgentBinary } = require('./claudeRuntime');
const { SessionGraph } = require('./sessionGraph');
const personas = require('./personas');
const { setRobotState, flashRobotError, getIsChatVisible, showBubble } = require('./windows');
const { safeSend } = require('./safeSend');

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
  silentMode = store.get('silentMode', false);
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
  safeSend(w, 'agent-event', ev);
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
        // Prefer the persona that was active when the turn started; fall
        // back to the live currentPersona only if inflight is gone (race
        // with a stop/error path).
        const persona = (inflight.claude && inflight.claude.persona) || currentPersona.claude;
        const node = graph.append('claude', {
          role: 'assistant',
          text,
          claudeSessionId: lastClaudeSessionId || undefined,
          persona,
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
      // Tell the chat UI that the runtime is no longer ready, so the next
      // user message will trigger ensureClaudeRuntime() and a re-spawn.
      emitEvent({ type: 'state', agent: 'claude', state: 'idle' });
      emitEvent({ type: 'ready_changed', agent: 'claude', ready: false });
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

/**
 * Best-effort termination of a child process tree.
 *
 * Why: On Windows, child_process.kill() only signals the immediate process;
 * any grandchildren spawned by the CLI (workers, helpers) become orphans.
 * We use `taskkill /F /T /PID` to walk the tree. On posix, signalling the
 * direct child is sufficient because CLIs typically forward signals.
 */
function killProcessTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  const pid = proc.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      const k = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        windowsHide: true, stdio: 'ignore', detached: true,
      });
      try { k.unref(); } catch (_) {}
    } catch (err) { console.error('[agents] taskkill failed:', err.message); }
    // Also send SIGTERM as a fallback in case taskkill fails to launch.
    try { proc.kill(); } catch (_) {}
  } else {
    try { proc.kill(); } catch (_) {}
  }
}

function killAgent(agentName) {
  killAgent(agentName);
}

function runPlainAgent(agentName, message) {
  const cmdArr = buildPlainCommand(agentName, message);
  if (!cmdArr) return;
  const [cmdName, args] = cmdArr;
  const cwd = getSessionDir(agentName);
  // Resolve to an absolute path so spawn(..., shell:false) works on Windows
  // even when the CLI is shipped as a `.cmd` shim.
  const cmd = resolveAgentBinary(cmdName);

  killAgent(agentName);
  tokenBuf[agentName] = '';
  if (tokenTimer[agentName]) { clearTimeout(tokenTimer[agentName]); tokenTimer[agentName] = null; }

  setRobotState('thinking');
  emitEvent({ type: 'state', agent: agentName, state: 'thinking' });

  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' };
  let proc;
  try {
    // shell:false to prevent command injection — args are user text, not
    // shell-safe. resolveAgentBinary() already resolves .cmd shims on Windows.
    proc = spawn(cmd, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], cwd, env, windowsHide: true });
  } catch (err) {
    emitEvent({ type: 'error', agent: agentName, error: `启动失败: ${err.message}` });
    flashRobotError();
    return;
  }
  runningProc[agentName] = proc;
  conversationStarted[agentName] = true;

  const myPid = proc.pid;
  let collected = '';
  // Track stderr separately so we can surface it in the exit message when
  // the process fails. Capped to keep memory bounded.
  let stderrBuf = '';
  const STDERR_CAP = 4 * 1024;
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
      killProcessTree(proc);
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
    // Capture for end-of-process error reporting (capped)
    if (stderrBuf.length < STDERR_CAP) {
      stderrBuf += chunk.slice(0, STDERR_CAP - stderrBuf.length);
    }
    appendCollected(chunk);
    if (!stdoutTruncated) queueToken(agentName, chunk);
  });
  proc.on('close', code => {
    // Ignore close from a stale process (killed by next message before reply).
    if (runningProc[agentName] && runningProc[agentName].pid !== myPid) return;
    runningProc[agentName] = null;
    flushTokens(agentName);
    const text = collected.trim();
    if (text) {
      const node = graph.append(agentName, { role: 'assistant', text, persona: currentPersona[agentName] });
      emitEvent({ type: 'done', agent: agentName, text, nodeId: node.id });
      if (!getIsChatVisible() && !silentMode) showBubble(text, agentName, silentMode);
    } else {
      // Surface stderr alongside the exit code so users can debug CLI errors.
      let msg;
      if (code !== 0) {
        const tail = stderrBuf.trim();
        msg = tail
          ? `进程退出码 ${code} · ${tail.slice(-400)}`
          : `进程退出码 ${code}`;
      } else {
        msg = '未收到回复';
      }
      emitEvent({ type: 'error', agent: agentName, error: msg });
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
      // Prepend persona as instructions on the first turn of the session.
      // We use locale-neutral tags ([System]/[User]) — the persona body
      // itself is already localised via personas.js, which determines the
      // language the model is most likely to reply in.
      outboundText = `[System]\n${p.systemPrompt}\n\n[User]\n${text}`;
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
    killAgent(agentName);
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
    // a new session starts. Start a new branch (preserves old nodes for
    // potential recovery) so the new persona takes effect immediately.
    graph.forkNew(agentName);
    conversationStarted[agentName] = false;
    if (runningProc[agentName]) {
      killProcessTree(runningProc[agentName]);
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
    if (runningProc[agentName]) { killProcessTree(runningProc[agentName]); runningProc[agentName] = null; }
  }
}

function getBranch(agentName) { return graph.getBranch(agentName); }
function getPersonas() { return { list: personas.list(), current: { ...currentPersona } }; }
function getSilent() { return silentMode; }
function setSilent(v) { silentMode = v; }

function cleanup() {
  if (claudeRT) { try { claudeRT.stop(); } catch (_) {} }
  killAgent('hermes');
  killAgent('openclaw');
}

module.exports = {
  init, sendToAgent, stopAgent, setPersona, forkFrom, newConversation,
  getBranch, getPersonas, getSilent, setSilent, ensureClaudeRuntime, cleanup,
};
