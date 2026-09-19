import { describe, expect, it } from "vitest";
import { concurrentConnect } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S05 vertex concurrency caps tunnel-connect", () => {
  it("parallel=2 never exceeds two in-flight connects", async () => {
    const world = concurrentConnect(2);
    for (let i = 0; i < 10; i++) world.gen.write();
    await wallWait(30);
    expect(world.peakOf()).toBeLessThanOrEqual(2);
    expect(world.metrics.vertex("connect").inFlight).toBeLessThanOrEqual(2);
    await wallWait(250);
    expect(world.started.length).toBe(10);
    expect(world.peakOf()).toBe(2);
  });
});
