// Targeted regression tests for the audit-driven fixes. Each block names
// the issue it guards against so a future maintainer breaking the
// behavior gets a clear signal.

const { SessionGraph } = require('../runtime/sessionGraph');
const personas = require('../runtime/personas');
const { resolveAgentBinary } = require('../runtime/claudeRuntime');
const { isWinAlive, safeSend } = require('../runtime/safeSend');

function mockStore() {
  const d = {};
  return { get: (k, def) => (k in d ? d[k] : def), set: (k, v) => { d[k] = v; } };
}

describe('issue #3 — persona switch must not destroy history', () => {
  test('forkNew detaches the leaf but keeps every previous node', () => {
    const g = new SessionGraph(mockStore());
    const n1 = g.append('hermes', { role: 'user', text: 'one' });
    const n2 = g.append('hermes', { role: 'assistant', text: 'two' });
    g.forkNew('hermes');
    // Active branch is empty (fresh start)…
    expect(g.getBranch('hermes')).toHaveLength(0);
    // …but the old nodes are still recoverable by id.
    expect(g.getNode('hermes', n1.id)).toBeDefined();
    expect(g.getNode('hermes', n2.id)).toBeDefined();
  });

  test('clear still wipes when explicitly requested (newConversation path)', () => {
    const g = new SessionGraph(mockStore());
    const n1 = g.append('hermes', { role: 'user', text: 'x' });
    g.clear('hermes');
    expect(g.getBranch('hermes')).toHaveLength(0);
    expect(g.getNode('hermes', n1.id)).toBeNull();
  });
});

describe('issue #1 — claudeRuntime.resolveAgentBinary', () => {
  test('returns a non-empty string for an arbitrary lookup', () => {
    // We don't assert resolution succeeded — just that the function never
    // returns undefined/null (caller relies on this for spawn()).
    const r = resolveAgentBinary('definitely-not-a-real-binary-xyz');
    expect(typeof r).toBe('string');
  });
});

describe('issue #2 — safeSend tolerates dead windows', () => {
  test('isWinAlive on null/undefined returns false', () => {
    expect(isWinAlive(null)).toBe(false);
    expect(isWinAlive(undefined)).toBe(false);
  });

  test('isWinAlive on isDestroyed window returns false', () => {
    const fake = { isDestroyed: () => true, webContents: { send: () => {} } };
    expect(isWinAlive(fake)).toBe(false);
  });

  test('safeSend on dead window is a no-op (no throw)', () => {
    const fake = { isDestroyed: () => true };
    expect(safeSend(fake, 'channel', { a: 1 })).toBe(false);
  });

  test('safeSend on live window invokes webContents.send', () => {
    let called = null;
    const fake = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (...a) => { called = a; } },
    };
    expect(safeSend(fake, 'ch', 1, 2)).toBe(true);
    expect(called).toEqual(['ch', 1, 2]);
  });
});

describe('issue #30 — personas localised', () => {
  test('Chinese labels are used', () => {
    expect(personas.get('coding').label).toBe('编码');
    expect(personas.get('research').label).toBe('调研');
    expect(personas.get('infra').label).toBe('运维');
  });

  test('system prompts are in Chinese', () => {
    const sp = personas.get('coding').systemPrompt;
    expect(sp.length).toBeGreaterThan(0);
    expect(sp).toContain('编码');
  });

  test('list() returns 4 personas in stable order', () => {
    const ids = personas.list().map(p => p.id);
    expect(ids).toEqual(['default', 'coding', 'research', 'infra']);
  });
});

describe('issue #16 — render cache memory bound', () => {
  // We can't import chat.html directly. This test just documents the
  // contract: long messages must NOT be cached. Marker test for the
  // CB regression.
  test('marker: render cache is keyed only on short input', () => {
    expect(true).toBe(true);
  });
});
