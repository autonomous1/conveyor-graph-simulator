import { describe, expect, it } from "vitest";
import { multiHop } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S12 degraded hop backpressures the required chain", () => {
  it("slow relay fills upstream required edges without drops", async () => {
    const world = multiHop({ relayDelayMs: 40, capacity: 2 });
    for (let i = 0; i < 8; i++) world.gen.write();
    await wallWait(30);
    const snap = world.metrics.capture();
    const drops = Object.values(snap.edges).reduce((n, e) => n + e.dropCount, 0);
    expect(drops).toBe(0);
    expect(snap.edges["gw-relay"]!.peakQueued).toBeGreaterThan(0);
    expect(world.graph.occupancy()).toBeGreaterThan(0);
    await wallWait(400);
    expect(world.metrics.edge("gw-relay").dropCount).toBe(0);
  });
});
