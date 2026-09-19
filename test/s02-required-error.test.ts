import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S02 required path errors instead of blocking", () => {
  it("surplus items error-route; required drops stay 0", async () => {
    const world = linearRequired({ capacity: 4, overflow: "error" });
    world.sink.stall();

    for (let i = 0; i < 10; i++) world.gen.write();
    await wallWait(80);

    const edge = world.metrics.edge(world.requiredEdgeId);
    expect(edge.dropCount).toBe(0);
    expect(edge.peakQueued).toBeLessThanOrEqual(4);
    expect(edge.errorCount).toBeGreaterThan(0);
    expect(world.metrics.vertex("graph/error").accepted).toBeGreaterThan(0);

    world.sink.lift();
    await wallWait(60);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
  });
});
