import { describe, expect, it } from "vitest";
import { GraphAgent } from "conveyor-graph";
import { defaultRegistry, loadGraph } from "conveyor-graph-model";
import { MetricCollector } from "../src/harness/collector.js";
import { StallableSink } from "../src/harness/sink.js";
import { wallWait } from "../src/harness/clock.js";
import { FRAME, randomPayload } from "./chunk-bytes.js";

describe("S23 chunk required writer backpressures; monitor drops", () => {
  it("keeps required drops at 0 while the sample edge drops", async () => {
    const sink = new StallableSink();
    sink.stall();
    const registry = defaultRegistry();
    registry.register("stall.write", () => sink.handler);
    const graph = loadGraph(
      {
        id: "s23",
        vertices: [
          { id: "ingress", type: "identity" },
          { id: "frame", type: "chunk.frame", config: { size: FRAME } },
          { id: "work", type: "chunk.xor", options: { parallel: 2, fanout: "all" } },
          { id: "write", type: "stall.write" },
          { id: "monitor", type: "identity" },
        ],
        edges: [
          { source: "ingress", target: "frame", capacity: 32, delivery: "required", overflow: "block" },
          { source: "frame", target: "work", capacity: 64, delivery: "required", overflow: "block" },
          { source: "work", target: "write", capacity: 2, delivery: "required", overflow: "block" },
          { source: "work", target: "monitor", capacity: 1, delivery: "bestEffort", overflow: "drop" },
        ],
      },
      { registry },
    );
    const session = new GraphAgent("s23", {}, {}, graph);
    session.write("ingress", "f1", { fileId: "f1", bytes: randomPayload(4096) });
    await wallWait(80);
    const metrics = new MetricCollector(graph);
    expect(metrics.edge("work-write").dropCount).toBe(0);
    expect(metrics.edge("work-write").peakQueued).toBeLessThanOrEqual(2);
    expect(metrics.edge("work-monitor").dropCount).toBeGreaterThan(0);
    sink.lift();
    await graph.drain(8000);
    expect(metrics.edge("work-write").dropCount).toBe(0);
  });
});
