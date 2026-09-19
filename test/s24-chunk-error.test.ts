import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GraphAgent } from "conveyor-graph";
import { defaultRegistry, loadGraph } from "conveyor-graph-model";
import { MetricCollector } from "../src/harness/collector.js";
import { wallWait } from "../src/harness/clock.js";
import { randomPayload } from "./chunk-bytes.js";

const dir = dirname(fileURLToPath(import.meta.url));

describe("S24 chunk error isolates one file", () => {
  it("a failed sequence error-routes without dropping the required edge", async () => {
    const doc = JSON.parse(readFileSync(join(dir, "../graphs/s24-error.json"), "utf8"));
    const graph = loadGraph(doc, { registry: defaultRegistry() });
    const session = new GraphAgent("s24", {}, {}, graph);
    session.write("ingress", "a", { fileId: "a", bytes: randomPayload(2048) });
    session.write("ingress", "b", { fileId: "b", bytes: randomPayload(2048) });
    await wallWait(80);
    await graph.drain(8000);
    const metrics = new MetricCollector(graph);
    expect(metrics.edge("work-order").dropCount).toBe(0);
    expect(metrics.edge("frame-work").dropCount).toBe(0);
    expect((session.node.work?.errorCount ?? 0) + metrics.vertex("graph/error").accepted).toBeGreaterThan(0);
  });
});
