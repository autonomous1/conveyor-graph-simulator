import { describe, expect, it } from "vitest";
import { fanoutPriority } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S03 best-effort samples drop; required traffic continues", () => {
  it("sample edge drops while required completes the burst", async () => {
    const world = fanoutPriority();
    for (let i = 0; i < 8; i++) world.gen.write();
    await wallWait(40);

    const sampleEdge = world.metrics.edge("classify-sample");
    const reqEdge = world.metrics.edge("classify-req");
    const reqV = world.metrics.vertex("req");
    const genV = world.metrics.vertex("gen");

    expect(sampleEdge.dropCount).toBeGreaterThan(0);
    expect(reqEdge.dropCount).toBe(0);
    expect(world.required.captured.length).toBe(8);
    expect(genV.accepted).toBe(8);
    expect(reqV.inFlight).toBeLessThanOrEqual(1);
    expect(reqV.sourceCount).toBeGreaterThanOrEqual(0);
    expect(reqV.sinkCount).toBeGreaterThanOrEqual(1);
  });
});
