import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalUtf8, sha256CanonicalV1, CanonicalError } from "../../src/reference/index.js";
import {
  KEY_ORDER_A,
  KEY_ORDER_B,
  NESTED,
  BYTES,
  BIG,
  ASTRAL,
  LARGE_EXP,
  TINY,
  FIXTURE_DOC,
} from "./fixtures.js";

const golden = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/canonical-v1/hashes.json"), "utf8"),
) as { keys: string; bytes: string; envelope: string };

describe("canonical-v1", () => {
  it("sorts object keys by UTF-8 bytes, not insertion order", () => {
    expect(canonicalUtf8(KEY_ORDER_A)).toBe(canonicalUtf8(KEY_ORDER_B));
    expect(canonicalUtf8(KEY_ORDER_A)).toBe('{"a":2,"b":1}');
    expect(sha256CanonicalV1(KEY_ORDER_A)).toBe(golden.keys);
    expect(sha256CanonicalV1(BYTES)).toBe(golden.bytes);
    expect(sha256CanonicalV1(FIXTURE_DOC)).toBe(golden.envelope);
  });

  it("round-trips 0.1+0.2 and large exponents via String(number)", () => {
    expect(canonicalUtf8(0.1 + 0.2)).toBe(String(0.1 + 0.2));
    expect(canonicalUtf8(LARGE_EXP)).toBe(String(LARGE_EXP));
    expect(canonicalUtf8(TINY)).toBe(String(TINY));
    expect(canonicalUtf8(0)).toBe("0");
    expect(canonicalUtf8(42)).toBe("42");
  });

  it("tags bytes and bigint; tick fields stay decimal strings in envelopes", () => {
    expect(canonicalUtf8(BYTES)).toBe('{"$bytes":"00ff10"}');
    expect(canonicalUtf8(BIG)).toBe('{"$i":"100000000000000000000"}');
    expect(canonicalUtf8({ tick: "0" })).toBe('{"tick":"0"}');
  });

  it("sorts astral-plane keys by UTF-8", () => {
    const text = canonicalUtf8(ASTRAL);
    expect(text.startsWith("{")).toBe(true);
    expect(sha256CanonicalV1(ASTRAL)).toBe(sha256CanonicalV1({ a: 2, "𐍈": 1 }));
  });

  it("nested structures are stable", () => {
    const a = sha256CanonicalV1(NESTED);
    expect(a.length).toBe(64);
  });

  it("rejects illegal values", () => {
    const bad: unknown[] = [
      undefined,
      NaN,
      Infinity,
      -Infinity,
      new Map(),
      new Set(),
      new Date(),
      () => 1,
      Symbol("x"),
      new (class Foo {})(),
    ];
    expect(() => canonicalUtf8(-0)).toThrow(CanonicalError);
    for (const value of bad) {
      expect(() => canonicalUtf8(value)).toThrow(CanonicalError);
    }
    const sparse: unknown[] = [];
    sparse[1] = 1;
    expect(() => canonicalUtf8(sparse)).toThrow(CanonicalError);
    expect(() => canonicalUtf8({ a: undefined })).toThrow(CanonicalError);
  });
});
