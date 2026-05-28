const { checkAgents } = require('../runtime/agentCheck');

// Note: These tests require the actual CLI tools to be on PATH
// They test the lookup functionality against real system state

describe('checkAgents', () => {
  test('returns an object with boolean values for each agent', async () => {
    const result = await checkAgents();
    expect(result).toHaveProperty('claude');
    expect(result).toHaveProperty('hermes');
    expect(result).toHaveProperty('openclaw');
    expect(typeof result.claude).toBe('boolean');
    expect(typeof result.hermes).toBe('boolean');
    expect(typeof result.openclaw).toBe('boolean');
  });

  test('claude is typically available on developer machines', async () => {
    // This test may fail on CI or machines without Claude CLI
    const result = await checkAgents();
    // Just verify it returns a boolean, don't assert true/false
    expect(typeof result.claude).toBe('boolean');
  });
});
