// Minimal in-memory replacement for electron-store, used only by the
// no-jest test runner when network access prevents installing real deps.

class Store {
  constructor() { this._d = {}; }
  get(k, def) {
    if (k in this._d) return this._d[k];
    return def;
  }
  set(k, v) { this._d[k] = v; }
}

module.exports = Store;
