import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S19 burst vs sustained rate", () => {
  it("a short burst over cap does not drop on a blocking required edge", async () => {
    const burst = linearRequired({ capacity: 4, overflow: "block", hopDelayMs: 5 });
    for (let i = 0; i < 7; i++) burst.gen.write();
    await wallWait(80);
    await burst.graph.drain(500);
    expect(burst.metrics.edge(burst.requiredEdgeId).dropCount).toBe(0);
    expect(burst.sink.captured.length).toBeGreaterThan(0);
  });

  it("sustained overrate keeps occupancy on the required edge", async () => {
    const world = linearRequired({ capacity: 2, overflow: "block", hopDelayMs: 20 });
    world.sink.delayMs = 20;
    for (let i = 0; i < 8; i++) world.gen.write();
    await wallWait(15);
    expect(world.graph.occupancy()).toBeGreaterThan(0);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
  });
});
