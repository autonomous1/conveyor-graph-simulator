import { describe, expect, it } from "vitest";
import { fanoutPriority, linearRequired } from "../src/harness/graphs.js";
import { wallWait } from "../src/harness/clock.js";

describe("S15 peak occupancy, drops, blocked duration on Sankey feed", () => {
  it("collector frames expose enqueue, occupancy, peak, drops, blocked_ms", async () => {
    const required = linearRequired({ capacity: 4, overflow: "block" });
    required.sink.stall();
    for (let i = 0; i < 8; i++) required.gen.write();
    await wallWait(40);
    const blocked = required.metrics.capture();
    required.sink.lift();

    const samples = fanoutPriority();
    for (let i = 0; i < 8; i++) samples.gen.write();
    await wallWait(40);
    const dropped = samples.metrics.capture();

    const edge = blocked.edges["hop-target"]!;
    expect(edge.objectCount).toBeGreaterThan(0);
    expect(edge.peakQueued).toBeGreaterThan(0);
    expect(edge.capacity).toBe(4);
    expect(typeof edge.blockedMs).toBe("number");
    expect(dropped.edges["classify-sample"]!.dropCount).toBeGreaterThan(0);

    const live = required.metrics.edge("hop-target");
    expect(live.peakQueued).toBe(blocked.edges["hop-target"]!.peakQueued);
  });
});
