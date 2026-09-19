import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S20 kill mid-flight is at-most-once with no recovery", () => {
  it("a replacement graph does not replay in-flight agents", async () => {
    const live = linearRequired({ capacity: 4, hopDelayMs: 40 });
    live.sink.stall();
    for (let i = 0; i < 5; i++) live.gen.write();
    await wallWait(20);
    const lost = live.graph.occupancy();
    expect(lost).toBeGreaterThan(0);
    const capturedBefore = live.sink.captured.length;

    const replacement = linearRequired({ capacity: 4 });
    expect(replacement.sink.captured).toHaveLength(0);
    expect(replacement.graph.occupancy()).toBe(0);
    expect(replacement.metrics.vertex("gen").accepted).toBe(0);

    live.sink.lift();
    await wallWait(20);
    expect(capturedBefore).toBe(0);
    expect(lost).toBeGreaterThan(capturedBefore);
  });
});
