import { describe, expect, it } from "vitest";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S01 required path blocks when the sink stalls", () => {
  it("occupancy plateaus at capacity and required drop count stays 0", async () => {
    const world = linearRequired({ capacity: 8, overflow: "block" });
    world.sink.stall();

    const pressure: boolean[] = [];
    for (let i = 0; i < 16; i++) pressure.push(world.gen.write());

    await wallWait(40);
    const edge = world.metrics.edge(world.requiredEdgeId);
    const target = world.metrics.vertex("target");

    expect(edge.peakQueued).toBeLessThanOrEqual(8);
    expect(edge.queued).toBeLessThanOrEqual(8);
    expect(edge.dropCount).toBe(0);
    expect(world.sink.captured).toHaveLength(0);
    expect(target.accepted + edge.queued).toBeGreaterThan(0);
    expect(target.sourceCount).toBeGreaterThanOrEqual(1);
    expect(target.sinkCount).toBeGreaterThanOrEqual(1);

    world.sink.lift();
    await wallWait(80);
    expect(world.metrics.edge(world.requiredEdgeId).dropCount).toBe(0);
  });
});
