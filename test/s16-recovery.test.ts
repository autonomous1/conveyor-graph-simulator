import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S16 queue buildup then recovery", () => {
  it("block policy completes every item after the stall lifts", async () => {
    const world = linearRequired({ capacity: 4, overflow: "block" });
    world.sink.stall();
    const n = 6;
    for (let i = 0; i < n; i++) world.gen.write();
    await wallWait(40);
    const mid = world.metrics.edge(world.requiredEdgeId);
    expect(mid.peakQueued).toBeLessThanOrEqual(4);
    expect(mid.dropCount).toBe(0);
    world.sink.lift();
    await wallWait(80);
    await world.graph.drain(500);
    expect(world.sink.captured.length).toBeGreaterThan(0);
    expect(world.metrics.edge(world.requiredEdgeId).queued).toBe(0);
    const seqs = world.sink.captured.map((p) => (p as { seq: number }).seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
