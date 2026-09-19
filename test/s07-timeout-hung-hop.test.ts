import { describe, expect, it } from "vitest";
import { multiHop } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S07 timeout aborts a hung hop and frees the edge", () => {
  it("relay timeout is counted and later work can proceed", async () => {
    const hung = multiHop({ hangRelay: true, capacity: 2 });
    hung.gen.write();
    await wallWait(80);
    expect(hung.metrics.vertex("relay").timedOut).toBeGreaterThan(0);
    expect(hung.remote.captured).toHaveLength(0);
    expect(hung.graph.occupancy()).toBeLessThanOrEqual(2);

    const healthy = multiHop({ relayDelayMs: 1, capacity: 2 });
    healthy.gen.write();
    await wallWait(40);
    expect(healthy.remote.captured).toHaveLength(1);
    expect(healthy.metrics.vertex("relay").timedOut).toBe(0);
  });
});
