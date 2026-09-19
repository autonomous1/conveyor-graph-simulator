import { describe, it } from "node:test";
import assert from "node:assert/strict";

export { describe, it };

export const expect = (actual) => ({
  toBe(expected) {
    assert.equal(actual, expected);
  },
  toEqual(expected) {
    assert.deepEqual(actual, expected);
  },
  toBeLessThan(expected) {
    assert.ok(actual < expected, `${actual} < ${expected}`);
  },
  toBeLessThanOrEqual(expected) {
    assert.ok(actual <= expected, `${actual} <= ${expected}`);
  },
  toBeGreaterThan(expected) {
    assert.ok(actual > expected, `${actual} > ${expected}`);
  },
  toBeGreaterThanOrEqual(expected) {
    assert.ok(actual >= expected, `${actual} >= ${expected}`);
  },
  toHaveLength(expected) {
    assert.equal(actual.length, expected);
  },
  toThrow(pattern) {
    assert.throws(actual, pattern);
  },
  get not() {
    return {
      toEqual(expected) {
        assert.notDeepEqual(actual, expected);
      },
      toBe(expected) {
        assert.notEqual(actual, expected);
      },
    };
  },
  get resolves() {
    return {
      async toMatch(pattern) {
        const value = await actual;
        assert.match(String(value), pattern);
      },
    };
  },
});
