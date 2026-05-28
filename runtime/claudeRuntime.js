// Persistent Claude runtime — single long-lived `claude` process per agent slot.
// Uses --input-format=stream-json so the process stays alive across turns.
//
// Lifecycle:
//   new ClaudeRuntime({ cwd, systemPrompt, resumeSessionId, forkSession, onEvent })
//   rt.send(text)
//   rt.stop()
//
// Events ({ type, ...payload }) emitted to onEvent:
//   token       { text }
//   tool_start  { id, name, input }
//   tool_end    { id, name, output, is_error }
//   session     { sessionId }              ← every time a new init arrives
//   done        { text }                   ← end of one turn
//   error       { error }
//   exit        { code }

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Cache resolved absolute paths so we don't shell out to `where`/`which`
// on every spawn. Cleared via clearAgentBinaryCache() (used by tests).
const _binaryCache = new Map();

function clearAgentBinaryCache() { _binaryCache.clear(); }

/**
 * Resolve a CLI binary name to an absolute path on the user's PATH.
 *
 * Why: We use spawn(..., { shell: false }) to avoid command-injection risk.
 * But on Windows many CLIs (claude, hermes, openclaw) ship as `.cmd` shims
 * that the OS only resolves through the shell. Looking up the absolute path
 * up-front lets us keep shell:false everywhere.
 *
 * Falls back to the bare name if lookup fails — caller will see ENOENT and
 * surface a real error to the UI.
 */
function resolveAgentBinary(name) {
  if (_binaryCache.has(name)) return _binaryCache.get(name);
  const tool = process.platform === 'win32' ? 'where' : 'which';
  let resolved = name;
  try {
    const r = spawnSync(tool, [name], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && r.stdout) {
      // `where` may return multiple lines; pick the first that exists.
      const lines = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const candidate of lines) {
        try {
          if (fs.existsSync(candidate)) { resolved = candidate; break; }
        } catch (_) {}
      }
    }
  } catch (_) {}
  _binaryCache.set(name, resolved);
  return resolved;
}

class ClaudeRuntime {
  constructor(opts) {
    this.cwd            = opts.cwd;
    this.systemPrompt   = opts.systemPrompt || '';
    this.resumeSessionId = opts.resumeSessionId || '';
    this.forkSession    = !!opts.forkSession;
    this.onEvent        = opts.onEvent || (() => {});

    this.proc           = null;
    this.buf            = '';        // stdout line buffer
    this.queue          = [];        // queued sends while busy
    this.busy           = false;     // mid-turn
    this.sessionId      = '';
    this.toolNames      = new Map(); // tool_use_id -> name
    this.turnText       = '';        // accumulated text for current turn
    this.stopped        = false;
    this.initTimer      = null;      // spawn timeout

    this._spawn();
  }

  _spawn() {
    const args = [
      '-p',
      '--input-format=stream-json',
      '--output-format=stream-json',
      '--verbose',
      '--include-partial-messages'
    ];
    if (this.systemPrompt) {
      args.push('--append-system-prompt', this.systemPrompt);
    }
    if (this.resumeSessionId) {
      args.push('-r', this.resumeSessionId);
      if (this.forkSession) args.push('--fork-session');
    }

    const env = {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TERM: 'dumb'
    };

    // shell:false avoids any chance of metacharacter injection through args.
    // On Windows, `claude` is typically a `.cmd`/`.ps1` shim that requires the
    // shell to resolve — we look up the explicit binary path instead so that
    // shell:false works the same on win32 as on posix.
    const cmd = resolveAgentBinary('claude');
    try {
      this.proc = spawn(cmd, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.cwd,
        env,
        windowsHide: true
      });
    } catch (err) {
      this.onEvent({ type: 'error', error: `启动失败: ${err.message}` });
      return;
    }

    this.proc.stdout.on('data', (chunk) => this._handleStdout(chunk));
    // Timeout: if no init message within 10s, kill and report error
    this.initTimer = setTimeout(() => {
      if (this.initTimer && this.proc && !this.stopped) {
        this.initTimer = null;
        this.busy = false;
        try { this.proc.kill(); } catch (_) {}
        this.onEvent({ type: 'error', error: 'Claude 进程启动超时（10 秒无响应）' });
      }
    }, 10000);
    this.proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      const trimmed = s.trim();
      if (!trimmed) return;
      // Filter known noise.
      if (/^\s*(Warning|Info|Debug|Hint):/i.test(s)) return;
      // Buffer up to a small cap and emit as an error so the user sees it.
      // Only emit once per spawn — we don't want to spam events for a CLI
      // that babbles on stderr during normal operation.
      if (!this._stderrEmitted) {
        this._stderrEmitted = true;
        this._stderrBuf = '';
      }
      if (this._stderrBuf.length < 2048) {
        this._stderrBuf += trimmed.slice(0, 2048 - this._stderrBuf.length);
      }
    });
    this.proc.on('exit', (code) => {
      const wasBusy = this.busy;
      const stderrTail = this._stderrBuf || '';
      this.busy = false;
      this.proc = null;
      this.onEvent({ type: 'exit', code });
      // If exited mid-turn and we weren't asked to stop, surface as error.
      // Include the stderr tail so users have something actionable instead
      // of a bare "code N".
      if (wasBusy && !this.stopped) {
        const detail = stderrTail ? ` · ${stderrTail.slice(-400)}` : '';
        this.onEvent({ type: 'error', error: `Claude 进程意外退出 (code ${code})${detail}` });
      } else if (!wasBusy && stderrTail && code !== 0) {
        // Process died between turns with a non-zero code — still worth surfacing.
        this.onEvent({ type: 'error', error: `Claude: ${stderrTail.slice(-400)}` });
      }
    });
    this.proc.on('error', (err) => {
      this.onEvent({ type: 'error', error: `Claude 进程错误: ${err.message}` });
    });
  }

  _handleStdout(chunk) {
    this.buf += chunk.toString();
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line) this._handleLine(line);
    }
  }

  _handleLine(line) {
    let obj;
    try { obj = JSON.parse(line); } catch (_) { return; }

    if (obj.type === 'system' && obj.subtype === 'init') {
      if (this.initTimer) { clearTimeout(this.initTimer); this.initTimer = null; }
      if (obj.session_id && obj.session_id !== this.sessionId) {
        this.sessionId = obj.session_id;
        this.onEvent({ type: 'session', sessionId: this.sessionId });
      }
      return;
    }

    if (obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      for (const part of obj.message.content) {
        if (part.type === 'text' && part.text) {
          this.turnText += part.text;
          this.onEvent({ type: 'token', text: part.text });
        } else if (part.type === 'tool_use') {
          this.toolNames.set(part.id, part.name);
          this.onEvent({
            type: 'tool_start',
            id: part.id,
            name: part.name,
            input: part.input || {}
          });
        }
      }
      return;
    }

    if (obj.type === 'user' && obj.message && Array.isArray(obj.message.content)) {
      for (const part of obj.message.content) {
        if (part.type === 'tool_result') {
          const out = typeof part.content === 'string'
            ? part.content
            : Array.isArray(part.content)
              ? part.content.map(c => c.text || '').join('').slice(0, 1000)
              : '';
          this.onEvent({
            type: 'tool_end',
            id: part.tool_use_id,
            name: this.toolNames.get(part.tool_use_id) || 'tool',
            output: out,
            is_error: !!part.is_error
          });
        }
      }
      return;
    }

    if (obj.type === 'result') {
      const text = (obj.result && obj.result.trim()) || this.turnText.trim();
      this.onEvent({ type: 'done', text });
      this.turnText = '';
      this.busy = false;
      this._drain();
      return;
    }
  }

  _drain() {
    if (this.busy || !this.queue.length || !this.proc) return;
    const next = this.queue.shift();
    this._writeUser(next);
  }

  _writeUser(text) {
    if (!this.proc || !this.proc.stdin.writable) {
      this.onEvent({ type: 'error', error: 'Claude 进程未就绪' });
      return;
    }
    this.busy = true;
    this.turnText = '';
    const msg = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text }]
      }
    };
    try {
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
    } catch (err) {
      this.busy = false;
      this.onEvent({ type: 'error', error: `写入失败: ${err.message}` });
    }
  }

  send(text) {
    if (!this.proc) {
      // Preserve session ID across respawns so conversation continues
      if (this.sessionId) this.resumeSessionId = this.sessionId;
      this._spawn();
    }
    if (this.busy) {
      this.queue.push(text);
    } else {
      this._writeUser(text);
    }
  }

  /** Interrupt current turn without killing the runtime. We can't truly
   *  cancel a streaming claude turn without process exit, so we kill and
   *  respawn — but next send() will reuse session via -r if we still have
   *  sessionId. */
  interrupt() {
    if (!this.proc) return;
    const sid = this.sessionId;
    this.stopped = true;
    try { this.proc.kill(); } catch (_) {}
    this.proc = null;
    this.busy = false;
    this.queue = [];
    this.stopped = false;
    // re-spawn with -r to keep continuity
    if (sid) this.resumeSessionId = sid;
    this._spawn();
  }

  stop() {
    this.stopped = true;
    if (this.initTimer) { clearTimeout(this.initTimer); this.initTimer = null; }
    if (this.proc) {
      try { this.proc.stdin.end(); } catch (_) {}
      try { this.proc.kill(); } catch (_) {}
      this.proc = null;
    }
    this.busy = false;
    this.queue = [];
  }
}

module.exports = { ClaudeRuntime, resolveAgentBinary, clearAgentBinaryCache };
