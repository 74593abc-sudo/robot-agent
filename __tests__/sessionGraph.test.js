const { SessionGraph } = require('../runtime/sessionGraph');

// Mock store
function createMockStore() {
  const data = {};
  return {
    get: (key, defaultVal) => data[key] ?? defaultVal,
    set: (key, val) => { data[key] = val; },
  };
}

describe('SessionGraph', () => {
  let store;
  let graph;

  beforeEach(() => {
    store = createMockStore();
    graph = new SessionGraph(store);
  });

  test('append creates a node and returns it', () => {
    const node = graph.append('claude', { role: 'user', text: 'hello' });
    expect(node).toHaveProperty('id');
    expect(node.role).toBe('user');
    expect(node.text).toBe('hello');
    expect(node.agent).toBe('claude');
  });

  test('getBranch returns nodes in order', () => {
    graph.append('claude', { role: 'user', text: 'msg1' });
    graph.append('claude', { role: 'assistant', text: 'msg2' });
    const branch = graph.getBranch('claude');
    expect(branch).toHaveLength(2);
    expect(branch[0].text).toBe('msg1');
    expect(branch[1].text).toBe('msg2');
  });

  test('setLeaf switches branch head', () => {
    const n1 = graph.append('claude', { role: 'user', text: 'msg1' });
    const n2 = graph.append('claude', { role: 'assistant', text: 'msg2' });

    // Go back to n1
    graph.setLeaf('claude', n1.id);
    const branch = graph.getBranch('claude');
    expect(branch).toHaveLength(1);
    expect(branch[0].id).toBe(n1.id);
  });

  test('getNode returns node by id', () => {
    const node = graph.append('claude', { role: 'user', text: 'test' });
    const found = graph.getNode('claude', node.id);
    expect(found).toBeDefined();
    expect(found.text).toBe('test');
  });

  test('getNode returns null for unknown id', () => {
    expect(graph.getNode('claude', 'nonexistent')).toBeNull();
  });

  test('findClaudeSessionId walks back to find session id', () => {
    graph.append('claude', { role: 'user', text: 'msg1' });
    const n2 = graph.append('claude', { role: 'assistant', text: 'msg2', claudeSessionId: 'sess-123' });
    const n3 = graph.append('claude', { role: 'user', text: 'msg3' });

    const sid = graph.findClaudeSessionId('claude', n3.id);
    expect(sid).toBe('sess-123');
  });

  test('findClaudeSessionId returns null if none found', () => {
    const n1 = graph.append('claude', { role: 'user', text: 'msg1' });
    expect(graph.findClaudeSessionId('claude', n1.id)).toBeNull();
  });

  test('clear removes all nodes', () => {
    graph.append('claude', { role: 'user', text: 'msg1' });
    graph.clear('claude');
    expect(graph.getBranch('claude')).toHaveLength(0);
  });

  test('branch cache is invalidated on append', () => {
    graph.append('claude', { role: 'user', text: 'msg1' });
    const branch1 = graph.getBranch('claude');
    graph.append('claude', { role: 'assistant', text: 'msg2' });
    const branch2 = graph.getBranch('claude');
    expect(branch2).toHaveLength(2);
    expect(branch1).not.toBe(branch2);
  });

  test('different agents have separate graphs', () => {
    graph.append('claude', { role: 'user', text: 'claude msg' });
    graph.append('hermes', { role: 'user', text: 'hermes msg' });
    expect(graph.getBranch('claude')).toHaveLength(1);
    expect(graph.getBranch('hermes')).toHaveLength(1);
    expect(graph.getBranch('claude')[0].text).toBe('claude msg');
  });
});
