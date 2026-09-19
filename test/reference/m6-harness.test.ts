import { describe, expect, it } from "vitest";
import {
  run,
  stableCounter,
  delayedFeedback,
  conveyorSimulator,
  tickBatch,
  dropOldest,
  coalesce,
} from "../../src/reference/index.js";

describe("run modes", () => {
  it("stable-counter is identical in fast and replayVerify", async () => {
    const fast = await run(stableCounter, "deterministicFast");
    const replayed = await run(stableCounter, "replayVerify");
    expect(replayed.report?.ok).toBe(true);
    expect(replayed.hashes).toEqual(fast.hashes);
    expect(fast.runtime.store.read(["count"])).toBe(8);
  });

  it("realTimeObserved matches fast hashes", async () => {
    const fast = await run({ ...stableCounter, ticks: 3 }, "deterministicFast");
    const live = await run({ ...stableCounter, ticks: 3 }, "realTimeObserved");
    expect(live.hashes).toEqual(fast.hashes);
    expect(live.runtime.frames.length).toBe(3);
  });

  it("faultInjection is deterministic for a fixed seed", async () => {
    const scenario = { ...stableCounter, ticks: 4, noisyNetwork: true };
    const a = await run(scenario, "faultInjection");
    const b = await run(scenario, "faultInjection");
    expect(a.hashes).toEqual(b.hashes);
  });

  it("delayed-feedback still applies mailbox on tick 2", async () => {
    const result = await run(delayedFeedback, "deterministicFast");
    expect(result.runtime.store.read(["count"])).toBe(10);
  });
});

describe("helpers", () => {
  it("tickBatch flushes on size and tick change", () => {
    const batch = tickBatch<number>(2);
    expect(batch.push(1n, 1)).toEqual([]);
    expect(batch.push(1n, 2)).toEqual([1, 2]);
    expect(batch.push(2n, 3)).toEqual([]);
    expect(batch.push(3n, 4)).toEqual([3]);
    expect(batch.flush()).toEqual([4]);
  });

  it("overflow helpers", () => {
    expect(dropOldest([1, 2], 2, 3)).toEqual([2, 3]);
    expect(coalesce([{ k: 1, v: 1 }], { k: 1, v: 9 }, (a, b) => a.k === b.k)).toEqual([{ k: 1, v: 9 }]);
  });

  it("conveyorSimulator builds a runtime", async () => {
    const rt = conveyorSimulator({ seed: 1n, initialState: { count: 0 } });
    rt.start();
    rt.scheduleExternal("e1", { add: 2 });
    await rt.runTick();
    expect(rt.store.read(["count"])).toBe(2);
  });
});
