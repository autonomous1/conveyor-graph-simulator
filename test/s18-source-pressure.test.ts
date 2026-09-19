import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S18 generator pause on pressure", () => {
  it("keeps the only backlog inside the graph while the source stays sequential", async () => {
    const world = linearRequired({ capacity: 2, overflow: "block" });
    world.sink.stall();
    let local = 0;
    let peakLocal = 0;
    const pressure: boolean[] = [];
    for (let i = 0; i < 16; i++) {
      local++;
      peakLocal = Math.max(peakLocal, local);
      pressure.push(world.gen.write());
      local--;
    }
    await wallWait(20);
    expect(peakLocal).toBe(1);
    expect(world.graph.occupancy()).toBeGreaterThan(0);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
    world.sink.lift();
    await world.graph.drain(500);
    expect(world.graph.occupancy()).toBe(0);
  });
});
