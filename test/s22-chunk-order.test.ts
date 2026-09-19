import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GraphAgent } from "conveyor-graph";
import { defaultRegistry, loadGraph, type CollectedFile } from "conveyor-graph-model";
import { wallWait } from "../src/harness/clock.js";
import { randomPayload, sha256, xorBuffer } from "./chunk-bytes.js";

const dir = dirname(fileURLToPath(import.meta.url));

describe("S22 chunk order after parallel work", () => {
  it("sha256 of xor-reassembled random bytes matches the precomputed digest", async () => {
    const doc = JSON.parse(readFileSync(join(dir, "../graphs/s22-order.json"), "utf8"));
    const graph = loadGraph(doc, { registry: defaultRegistry() });
    const ctx: { collected?: CollectedFile[] } = {};
    const session = new GraphAgent("s22", {}, ctx, graph);
    const bytes = randomPayload(8 * 1024);
    const expected = sha256(xorBuffer(bytes, 90));
    session.write("ingress", "f1", { fileId: "f1", bytes });
    await wallWait(80);
    await graph.drain(8000);
    const got = ctx.collected ?? [];
    expect(got).toHaveLength(1);
    expect(sha256(got[0].bytes)).toBe(expected);
  });
});
