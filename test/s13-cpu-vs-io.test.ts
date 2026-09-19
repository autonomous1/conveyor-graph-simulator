import { describe, expect, it } from "vitest";
import { ConveyorGraph, GraphAgent } from "conveyor-graph";
import { StallableSink } from "../src/harness/sink.js";
import { BurstGenerator } from "../src/harness/generator.js";
import { MetricCollector } from "../src/harness/collector.js";
import { wallWait } from "../src/harness/clock.js";

describe("S13 encoder / classifier CPU budget vs IO hop", () => {
  it("queue sits on gen→classify when classify is the slow vertex", async () => {
    const sink = new StallableSink();
    const graph = new ConveyorGraph("s13").initGraph();
    graph.define("gen", (a) => a.payload);
    graph.define("classify", { parallel: 1 }, async (a) => {
      await wallWait(30);
      return a.payload;
    });
    graph.define("hop", (a) => a.payload);
    graph.define("target", sink.handler);
    graph
      .connect("gen", "classify", { capacity: 4, delivery: "required", overflow: "block" })
      .connect("classify", "hop", { capacity: 16, delivery: "required", overflow: "block" })
      .connect("hop", "target", { capacity: 16, delivery: "required", overflow: "block" })
      .seal();
    const session = new GraphAgent("sim", {}, {}, graph);
    const gen = new BurstGenerator(session, "gen");
    for (let i = 0; i < 8; i++) gen.write();
    await wallWait(25);
    const metrics = new MetricCollector(graph);
    const inbound = metrics.edge("gen-classify");
    const hopEdge = metrics.edge("classify-hop");
    expect(inbound.peakQueued).toBeGreaterThanOrEqual(hopEdge.peakQueued);
    expect(inbound.dropCount).toBe(0);
  });
});
