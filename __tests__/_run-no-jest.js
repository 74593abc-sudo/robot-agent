// Lightweight self-contained test runner used when jest can't be installed
// (offline / restricted network environments).
//
// Replicates the subset of jest's API that our test files use:
//   describe / test / beforeEach / expect.* (toBe, toEqual, toHaveLength,
//   toHaveProperty, toBeDefined, toBeNull, toBeLessThan, not.toBe)
//
// Run with: node __tests__/_run-no-jest.js

const path = require('path');
const Module = require('module');

// Stub `electron-store` and `electron` so requiring runtime/* doesn't blow up.
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === 'electron-store') {
    return path.resolve(__dirname, '_stub-electron-store.js');
  }
  if (req === 'electron') {
    return path.resolve(__dirname, '_stub-electron.js');
  }
  return _origResolve.call(this, req, parent, ...rest);
};

// Test framework state — beforeEach scopes to the enclosing describe.
const _suiteStack = [];     // describe nesting; each entry has { beforeEach: [] }
const _allTests = [];       // { name, fn, beforeEachChain }
let _failures = 0;

global.describe = function (name, fn) {
  const suite = { name, beforeEach: [] };
  _suiteStack.push(suite);
  try { fn(); } finally { _suiteStack.pop(); }
};

global.test = function (name, fn) {
  // Snapshot the chain of beforeEach hooks visible at registration time.
  const beforeEachChain = _suiteStack.flatMap(s => s.beforeEach);
  const fullName = [..._suiteStack.map(s => s.name), name].join(' › ');
  _allTests.push({ name: fullName, fn, beforeEachChain });
};
global.it = global.test;

global.beforeEach = function (fn) {
  if (_suiteStack.length === 0) {
    throw new Error('beforeEach called outside describe');
  }
  _suiteStack[_suiteStack.length - 1].beforeEach.push(fn);
};

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEq(a[k], b[k]));
  }
  return false;
}

function makeExpect(actual, negate = false) {
  function check(pass, msg) {
    if (negate ? pass : !pass) throw new Error(msg);
  }
  return {
    get not() { return makeExpect(actual, !negate); },
    toBe(expected) { check(actual === expected, `expected ${JSON.stringify(actual)} ${negate?'not ':''}=== ${JSON.stringify(expected)}`); },
    toEqual(expected) { check(deepEq(actual, expected), `expected ${JSON.stringify(actual)} ${negate?'not ':''}deep-eq ${JSON.stringify(expected)}`); },
    toHaveLength(n) { check(actual && actual.length === n, `expected length ${actual && actual.length} ${negate?'not ':''}=== ${n}`); },
    toHaveProperty(p) { check(actual && Object.prototype.hasOwnProperty.call(actual, p), `expected ${JSON.stringify(actual)} ${negate?'not ':''}to have property ${p}`); },
    toBeDefined() { check(actual !== undefined, `expected value to ${negate?'not ':''}be defined`); },
    toBeNull() { check(actual === null, `expected ${JSON.stringify(actual)} ${negate?'not ':''}=== null`); },
    toBeLessThan(n) { check(typeof actual === 'number' && actual < n, `expected ${actual} ${negate?'not ':''}< ${n}`); },
  };
}
global.expect = makeExpect;

// Discover & load test files
const fs = require('fs');
const testDir = __dirname;
const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join(testDir, f));

(async () => {
  for (const f of files) require(f);

  for (const t of _allTests) {
    try {
      for (const h of t.beforeEachChain) await h();
      const r = t.fn();
      if (r && typeof r.then === 'function') await r;
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      _failures++;
      console.error(`  FAIL  ${t.name}`);
      console.error(`        ${(err && err.message) || err}`);
    }
  }
  console.log(`\n${_allTests.length - _failures}/${_allTests.length} passed`);
  process.exit(_failures ? 1 : 0);
})();
