import { describe, expect, it } from "vitest";
import { fanoutPriority } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S09 drain is actually idle", () => {
  it("after a finite burst drain leaves zero occupancy", async () => {
    const world = fanoutPriority();
    for (let i = 0; i < 5; i++) world.gen.write();
    await wallWait(80);
    await world.graph.drain(500);
    expect(world.graph.totalInFlight()).toBe(0);
    expect(world.graph.occupancy()).toBe(0);
    expect(world.graph.admissionWaiters.size).toBe(0);
    const snap = world.metrics.capture();
    for (const edge of Object.values(snap.edges)) {
      expect(edge.queued).toBe(0);
    }
    for (const v of Object.values(snap.vertices)) {
      expect(v.inFlight).toBe(0);
    }
  });
});
