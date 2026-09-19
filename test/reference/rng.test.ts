import { describe, expect, it } from "vitest";
import { createRootRng, sha256CanonicalV1 } from "../../src/reference/index.js";

describe("SplitMix64 streams", () => {
  it("same seed snapshots match; forks do not share a cursor", () => {
    const a = createRootRng(42n);
    const b = createRootRng(42n);
    expect(a.snapshot()).toEqual(b.snapshot());
    a.stream("network").nextU64();
    expect(a.snapshot().sim).toBe(b.snapshot().sim);
    expect(a.snapshot().network).not.toBe(b.snapshot().network);
    expect(a.snapshot().algo).toBe("splitmix64");
  });

  it("different seeds diverge", () => {
    const a = sha256CanonicalV1(createRootRng(1n).snapshot());
    const c = sha256CanonicalV1(createRootRng(2n).snapshot());
    expect(a).not.toBe(c);
  });

  it("zero seed is allowed", () => {
    const r = createRootRng(0n);
    expect(r.stream("sim").nextU64() >= 0n).toBe(true);
    expect(/^\d+$/.test(r.snapshot().sim)).toBe(true);
  });
});
