// Persistent store wrapper.
//
// Why a wrapper around electron-store:
//   - Centralises the schema so future fields & migrations live in one place.
//   - Defaults travel with the schema; callers can `store.get('foo')`
//     without re-stating the default at every site.
//   - Light-weight validation catches accidentally-shaped writes early.
//
// Schema notes:
//   `graph.<agent>` and `ui.flag.<key>` use dynamic key names, so we mark
//   them as additionalProperties on the parent object. The session-graph
//   shape is owned by SessionGraph and validated on read; we only enforce
//   the top-level type here.

const Store = require('electron-store');

const schema = {
  hasLaunched:       { type: 'boolean', default: false },
  silentMode:        { type: 'boolean', default: false },
  autoStart:         { type: 'boolean', default: false },
  onboardingDone:    { type: 'boolean', default: false },
  agentCheckDone:    { type: 'boolean', default: false },
  theme:             { type: 'string',  enum: ['dark', 'light'], default: 'dark' },
  persona: {
    type: 'object',
    properties: {
      claude:   { type: 'string', default: 'default' },
      hermes:   { type: 'string', default: 'default' },
      openclaw: { type: 'string', default: 'default' },
    },
    default: { claude: 'default', hermes: 'default', openclaw: 'default' },
    additionalProperties: false,
  },
  // graph.<agent> shape is enforced by sessionGraph.js; we accept any
  // object here and let the migration code in _load() handle legacy data.
  graph: { type: 'object', default: {} },
  // Generic UI flags — limited keyset enforced at IPC boundary.
  'ui.flag': { type: 'object', default: {} },
};

let store;
try {
  store = new Store({ schema, clearInvalidConfig: false });
} catch (err) {
  // electron-store throws on schema validation failure when the on-disk
  // file is somehow corrupt. Fall back to a plain instance so the app
  // still boots; the bad file will be overwritten on next save.
  console.error('[store] schema validation failed, falling back:', err && err.message);
  store = new Store();
}

module.exports = store;
