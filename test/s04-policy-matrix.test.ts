import { describe, expect, it } from "vitest";
import type { Overflow } from "conveyor-graph";
import { linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

async function runPolicy(overflow: Overflow) {
  const world = linearRequired({
    capacity: 4,
    overflow,
    delivery: overflow === "drop" ? "bestEffort" : "required",
  });
  world.sink.stall();
  for (let i = 0; i < 10; i++) world.gen.write();
  await wallWait(80);
  const mid = world.metrics.edge(world.requiredEdgeId);
  world.sink.lift();
  await wallWait(80);
  const end = world.metrics.edge(world.requiredEdgeId);
  return { mid, end, completed: world.sink.captured.length };
}

describe("S04 policy comparison under one induced failure", () => {
  it("block vs drop vs error differ only in overflow accounting", async () => {
    const block = await runPolicy("block");
    const drop = await runPolicy("drop");
    const error = await runPolicy("error");

    expect(block.mid.dropCount).toBe(0);
    expect(block.mid.peakQueued).toBeLessThanOrEqual(4);
    expect(block.completed).toBeGreaterThan(0);

    expect(drop.mid.dropCount).toBeGreaterThan(0);
    expect(drop.mid.peakQueued).toBeLessThanOrEqual(4);
    expect(drop.completed).toBeLessThan(10);

    expect(error.mid.errorCount).toBeGreaterThan(0);
    expect(error.mid.dropCount).toBe(0);
    expect(error.mid.peakQueued).toBeLessThanOrEqual(4);

    expect(block.end.dropCount).toBe(0);
    expect(error.end.dropCount).toBe(0);
  });
});
