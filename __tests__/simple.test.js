/**
 * Simple test to validate Jest configuration
 */

import crypto from 'crypto';

describe('Jest Configuration', () => {
  test('should run basic test', () => {
    expect(2 + 2).toBe(4);
  });

  test('should handle async/await', async () => {
    const promise = Promise.resolve('test');
    const result = await promise;
    expect(result).toBe('test');
  });

  test('should support ES modules', () => {
    const uuid = crypto.randomUUID();
    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe('string');
  });
});
