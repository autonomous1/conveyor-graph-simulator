import { describe, expect, it } from "vitest";
import { ConveyorGraph, GraphAgent, type StreamAgent } from "conveyor-graph";
import { wallWait } from "../src/harness/clock.js";

describe("S14 shared payload mutation across fan-out", () => {
  it("without a copy both branches see the mutation", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const graph = new ConveyorGraph("s14-shared").initGraph();
    graph.define("src", { fanout: "all" }, (a) => a.payload);
    graph.define("left", async (a: StreamAgent) => {
      const p = a.payload as { headers: Record<string, unknown> };
      p.headers.mutated = true;
      await wallWait(10);
      return a.payload;
    });
    graph.define("right", async (a: StreamAgent) => {
      await wallWait(20);
      seen.push({ ...(a.payload as { headers: Record<string, unknown> }).headers });
      return a.payload;
    });
    graph.connect("src", "left").connect("src", "right").seal();
    new GraphAgent("sim", {}, {}, graph).write("src", "1", { headers: {} });
    await wallWait(40);
    expect(seen[0]!.mutated).toBe(true);
  });

  it("a handler-local copy isolates the other branch", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const graph = new ConveyorGraph("s14-copy").initGraph();
    graph.define("src", { fanout: "all" }, (a) => a.payload);
    graph.define("left", async (a: StreamAgent) => {
      const p = { ...(a.payload as object), headers: { ...(a.payload as { headers: object }).headers } } as {
        headers: Record<string, unknown>;
      };
      p.headers.mutated = true;
      await wallWait(10);
      return p;
    });
    graph.define("right", async (a: StreamAgent) => {
      await wallWait(20);
      seen.push({ ...(a.payload as { headers: Record<string, unknown> }).headers });
      return a.payload;
    });
    graph.connect("src", "left").connect("src", "right").seal();
    new GraphAgent("sim", {}, {}, graph).write("src", "1", { headers: {} });
    await wallWait(40);
    expect(seen[0]!.mutated).toBe(undefined);
  });
});
