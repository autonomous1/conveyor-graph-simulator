import { describe, expect, it } from "vitest";
import { concurrentConnect } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S06 serial connect preserves start order", () => {
  it("parallel=1 starts handlers in arrival order", async () => {
    const world = concurrentConnect(1);
    for (let i = 0; i < 6; i++) world.gen.write();
    await wallWait(300);
    expect(world.peakOf()).toBe(1);
    expect(world.started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(world.finished).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
