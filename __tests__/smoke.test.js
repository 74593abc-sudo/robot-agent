// Smoke test: verify all runtime modules can be required without errors
// and export the expected API surface.

describe('Runtime module smoke tests', () => {
  test('store exports a valid electron-store instance', () => {
    const store = require('../runtime/store');
    expect(store).toBeDefined();
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
  });

  test('personas exports get, list, PERSONAS', () => {
    const personas = require('../runtime/personas');
    expect(typeof personas.get).toBe('function');
    expect(typeof personas.list).toBe('function');
    expect(personas.PERSONAS).toBeDefined();
    expect(personas.PERSONAS.default).toBeDefined();
    expect(personas.list().length).toBe(4);
  });

  test('agentCheck exports checkAgents', () => {
    const { checkAgents, AGENT_BINARIES } = require('../runtime/agentCheck');
    expect(typeof checkAgents).toBe('function');
    expect(AGENT_BINARIES).toEqual(['claude', 'hermes', 'openclaw']);
  });

  test('sessionGraph can be instantiated and basic ops work', () => {
    const { SessionGraph } = require('../runtime/sessionGraph');
    const mockStore = { _d: {}, get(k, d) { return this._d[k] ?? d; }, set(k, v) { this._d[k] = v; } };
    const graph = new SessionGraph(mockStore);
    const node = graph.append('claude', { role: 'user', text: 'hello' });
    expect(node).toHaveProperty('id');
    expect(node.text).toBe('hello');
    const branch = graph.getBranch('claude');
    expect(branch).toHaveLength(1);
    graph.clear('claude');
    expect(graph.getBranch('claude')).toHaveLength(0);
  });

  test('claudeRuntime class can be imported', () => {
    const { ClaudeRuntime } = require('../runtime/claudeRuntime');
    expect(typeof ClaudeRuntime).toBe('function');
    expect(ClaudeRuntime.prototype.send).toBeDefined();
    expect(ClaudeRuntime.prototype.stop).toBeDefined();
    expect(ClaudeRuntime.prototype.interrupt).toBeDefined();
  });
});
