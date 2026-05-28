// Session graph store — replaces the old flat history array.
//
// Data shape per agent in electron-store, under key `graph.<agent>`:
//   {
//     nodes: {
//       <nodeId>: {
//         id, parentId, role, text, ts,
//         claudeSessionId?, persona?, agent
//       },
//       ...
//     },
//     leaf: <nodeId>     // current branch head
//   }
//
// Backward compat: if old `history.<agent>` (flat array) exists and no graph,
// we migrate it to a linear chain.

const { randomUUID } = require('crypto');

function emptyGraph() {
  return { nodes: {}, leaf: null };
}

class SessionGraph {
  constructor(store) {
    this.store = store;
    this._branchCache = {};  // agent -> { leaf, result }
  }

  _key(agent) { return `graph.${agent}`; }

  _load(agent) {
    let g = this.store.get(this._key(agent), null);
    if (g && g.nodes) return g;

    // Migrate from old flat history
    const oldKey = `history.${agent}`;
    const oldList = this.store.get(oldKey, null);
    g = emptyGraph();
    if (Array.isArray(oldList) && oldList.length) {
      let parent = null;
      for (const m of oldList) {
        const id = randomUUID();
        g.nodes[id] = {
          id, parentId: parent,
          role: m.role, text: m.text, ts: m.timestamp || Date.now(),
          agent
        };
        parent = id;
      }
      g.leaf = parent;
    }
    this.store.set(this._key(agent), g);
    return g;
  }

  _save(agent, g) { this.store.set(this._key(agent), g); }

  /** Get the current branch as a linear list from root → leaf. */
  getBranch(agent) {
    const g = this._load(agent);
    const cached = this._branchCache[agent];
    if (cached && cached.leaf === g.leaf) return cached.result;
    const out = [];
    let id = g.leaf;
    while (id && g.nodes[id]) {
      out.unshift(g.nodes[id]);
      id = g.nodes[id].parentId;
    }
    this._branchCache[agent] = { leaf: g.leaf, result: out };
    return out;
  }

  /** Append a node as the new leaf. Returns the new node. */
  append(agent, { role, text, claudeSessionId, persona }) {
    const g = this._load(agent);
    const id = randomUUID();
    const node = {
      id,
      parentId: g.leaf,
      role,
      text,
      ts: Date.now(),
      agent,
      ...(claudeSessionId ? { claudeSessionId } : {}),
      ...(persona ? { persona } : {})
    };
    g.nodes[id] = node;
    g.leaf = id;
    this._cap(g);
    this._save(agent, g);
    delete this._branchCache[agent];
    return node;
  }

  /** Move the leaf pointer; existing nodes remain (other branches). */
  setLeaf(agent, nodeId) {
    const g = this._load(agent);
    if (!g.nodes[nodeId]) return false;
    g.leaf = nodeId;
    this._save(agent, g);
    delete this._branchCache[agent];
    return true;
  }

  /** Get a node by id. */
  getNode(agent, nodeId) {
    const g = this._load(agent);
    return g.nodes[nodeId] || null;
  }

  /** Walk back from a node to find the most recent claudeSessionId on the branch. */
  findClaudeSessionId(agent, nodeId) {
    const g = this._load(agent);
    let id = nodeId;
    while (id && g.nodes[id]) {
      if (g.nodes[id].claudeSessionId) return g.nodes[id].claudeSessionId;
      id = g.nodes[id].parentId;
    }
    return null;
  }

  clear(agent) {
    this._save(agent, emptyGraph());
    delete this._branchCache[agent];
  }

  /** Limit total stored nodes per agent to keep store small. */
  _cap(g, maxNodes = 600) {
    const ids = Object.keys(g.nodes);
    if (ids.length <= maxNodes) return;
    // Walk current branch, mark reachable; drop oldest unreachable
    const keep = new Set();
    let id = g.leaf;
    while (id && g.nodes[id]) { keep.add(id); id = g.nodes[id].parentId; }
    const drops = ids
      .filter(i => !keep.has(i))
      .sort((a, b) => (g.nodes[a].ts || 0) - (g.nodes[b].ts || 0))
      .slice(0, ids.length - maxNodes);
    for (const i of drops) delete g.nodes[i];
  }
}

module.exports = { SessionGraph };
