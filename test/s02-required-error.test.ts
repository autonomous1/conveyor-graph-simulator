import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S02 required path errors instead of blocking", () => {
  it("surplus items error-route; required drops stay 0", async () => {
    const world = linearRequired({ capacity: 1, overflow: "error", hopDelayMs: 0 });
    world.sink.stall();

    for (let i = 0; i < 24; i++) world.gen.write();
    await wallWait(40);
    for (let i = 0; i < 8; i++) world.gen.write();
    await wallWait(40);

    const edge = world.metrics.edge(world.requiredEdgeId);
    const routed = world.metrics.vertex("graph/error")?.accepted ?? 0;
    expect(edge.dropCount).toBe(0);
    expect(edge.peakQueued).toBeLessThanOrEqual(1);
    expect(edge.errorCount + routed).toBeGreaterThan(0);

    world.sink.lift();
    await wallWait(60);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
  });
});
