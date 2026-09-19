import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GraphAgent } from "conveyor-graph";
import { defaultRegistry, loadGraph, type CollectedFile } from "conveyor-graph-model";
import { MetricCollector } from "../src/harness/collector.js";
import { wallWait } from "../src/harness/clock.js";
import { FRAME, catalogBytes, chunkCount, sha256 } from "./chunk-bytes.js";

const dir = dirname(fileURLToPath(import.meta.url));

describe("S21 chunk frame", () => {
  it("frames a catalog-sized buffer and matches sha256 after reassembly", async () => {
    const doc = JSON.parse(readFileSync(join(dir, "../graphs/s21-frame.json"), "utf8"));
    const graph = loadGraph(doc, { registry: defaultRegistry() });
    const ctx: { collected?: CollectedFile[] } = {};
    const session = new GraphAgent("s21", {}, ctx, graph);
    const bytes = catalogBytes();
    const before = sha256(bytes);
    session.write("ingress", "f1", { fileId: "f1", bytes });
    await wallWait(40);
    await graph.drain(5000);
    const metrics = new MetricCollector(graph);
    const expectedChunks = chunkCount(bytes.length, FRAME);
    expect(metrics.edge("frame-collect").objectCount).toBe(expectedChunks);
    expect(metrics.edge("frame-collect").dropCount).toBe(0);
    const got = ctx.collected ?? [];
    expect(got).toHaveLength(1);
    expect(got[0].chunks).toBe(expectedChunks);
    expect(sha256(got[0].bytes)).toBe(before);
  });
});
