// Check whether the three required CLI agents (claude / hermes / openclaw)
// are resolvable on the user's PATH. Returns a promise that resolves to a
// { claude, hermes, openclaw } map of booleans.

const { spawn } = require('child_process');

const AGENT_BINARIES = ['claude', 'hermes', 'openclaw'];
const LOOKUP_TIMEOUT_MS = 3000;

function lookup(binary) {
  return new Promise(resolve => {
    const tool = process.platform === 'win32' ? 'where' : 'which';
    let proc;
    let settled = false;
    let output = '';
    const finish = (found) => {
      if (settled) return;
      settled = true;
      try { if (proc) proc.kill(); } catch (_) {}
      resolve(found);
    };
    try {
      proc = spawn(tool, [binary], { shell: false, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch (_) {
      return finish(false);
    }
    proc.on('error', () => finish(false));
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.on('close', code => {
      // Windows 'where' returns multiple lines if binary exists in multiple PATH locations.
      // We only need to know it exists at least once.
      finish(code === 0 && output.trim().length > 0);
    });
    setTimeout(() => finish(false), LOOKUP_TIMEOUT_MS);
  });
}

async function checkAgents() {
  const entries = await Promise.all(
    AGENT_BINARIES.map(async b => [b, await lookup(b)])
  );
  return Object.fromEntries(entries);
}

module.exports = { checkAgents, AGENT_BINARIES };
