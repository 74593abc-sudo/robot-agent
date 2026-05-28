const { checkAgents, AGENT_BINARIES } = require('../runtime/agentCheck');

// These tests don't assert what's installed on the host — they only
// validate the contract: checkAgents() resolves to a stable shape with
// boolean values for every advertised binary. CI machines without the
// CLIs still pass.

describe('checkAgents', () => {
  test('returns an object with boolean values for each agent', async () => {
    const result = await checkAgents();
    for (const name of AGENT_BINARIES) {
      expect(result).toHaveProperty(name);
      expect(typeof result[name]).toBe('boolean');
    }
  });

  test('resolves within the lookup timeout budget', async () => {
    const start = Date.now();
    await checkAgents();
    // 3s per binary, run in parallel — should be well under 5s even on slow CI
    expect(Date.now() - start).toBeLessThan(8000);
  });
});
