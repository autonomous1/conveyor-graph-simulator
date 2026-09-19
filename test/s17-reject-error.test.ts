import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S17 destination reject routes to error vertex", () => {
  it("NACKs appear on graph/error and do not silent-drop", async () => {
    const world = linearRequired({ capacity: 8 });
    world.sink.rejectFn = (payload) => ((payload as { seq: number }).seq % 3 === 0);
    for (let i = 0; i < 9; i++) world.gen.write();
    await wallWait(80);
    const errors = world.metrics.vertex("graph/error").accepted;
    expect(world.sink.rejected.length).toBeGreaterThan(0);
    expect(errors).toBe(world.sink.rejected.length);
    expect(world.sink.captured.length + world.sink.rejected.length).toBe(9);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
  });
});
