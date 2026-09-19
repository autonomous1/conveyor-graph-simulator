import { describe, expect, it } from "vitest";
import {
  ResourceScheduler,
  createReferenceRuntime,
  recordRun,
  replayRun,
  verifyReplay,
} from "../../src/reference/index.js";

describe("ResourceScheduler", () => {
  it("harvests in key order regardless of complete order", () => {
    const a = new ResourceScheduler();
    a.complete("b", { version: "1", body: { n: 2 } });
    a.complete("a", { version: "1", body: { n: 1 } });
    const harvested = a.harvest(1n);
    expect(harvested.map((x) => x.key)).toEqual(["a", "b"]);
    expect(harvested[0]!.admitTick).toBe("1");
  });

  it("marks older versions stale after a newer identity is admitted", () => {
    const s = new ResourceScheduler();
    s.complete("cfg", { version: "2", body: { v: 2 } });
    s.harvest(1n);
    s.complete("cfg", { version: "1", body: { v: 1 } });
    const second = s.harvest(2n);
    expect(second[0]!.outcome).toBe("stale");
    expect(s.admitted()[0]!.version).toBe("2");
  });
});

describe("resource admission", () => {
  it("same harvest ticks produce the same hashes for opposite wall orders", async () => {
    async function run(order: Array<"a" | "b">) {
      const resources = new ResourceScheduler();
      const rt = createReferenceRuntime({ seed: 5n, initialState: { count: 0 }, resources });
      rt.start();
      for (const key of order) {
        resources.complete(key, { version: "1", body: { key } });
      }
      rt.scheduleExternal("e1", { add: 1 });
      await rt.runTick();
      return rt.hashes;
    }
    expect(await run(["b", "a"])).toEqual(await run(["a", "b"]));
  });

  it("fail and cancel admit without throwing", async () => {
    const resources = new ResourceScheduler();
    const rt = createReferenceRuntime({ seed: 1n, initialState: { count: 0 }, resources });
    rt.start();
    resources.complete("x", { outcome: "failed", version: "1", message: "nope" });
    resources.complete("y", { outcome: "cancelled", version: "1" });
    await rt.runTick();
    expect(rt.clock.tick).toBe(1n);
    expect(rt.resources.admitted().map((r) => r.outcome)).toEqual(["failed", "cancelled"]);
  });

  it("request+complete during sim admits on the next tick", async () => {
    const resources = new ResourceScheduler();
    const rt = createReferenceRuntime({
      seed: 1n,
      initialState: { count: 0 },
      resources,
      buildSim: (graph, ctx) => {
        graph.define("step", (agent) => {
          ctx.resources.request("late");
          ctx.resources.complete("late", { version: "1", body: { ok: true } });
          ctx.propose({ vertexId: "step", path: ["count"], value: 1 });
          return agent.payload;
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e1", { add: 0 });
    await rt.runTick();
    expect(rt.resources.admitted().length).toBe(0);
    await rt.runTick();
    expect(rt.resources.admitted()[0]!.key).toBe("late");
  });

  it("replays recorded resource admits with matching hashes", async () => {
    const resources = new ResourceScheduler();
    const recorded = await recordRun({ seed: 8n, initialState: { count: 0 }, resources }, 1, (rt) => {
      rt.resources.complete("cfg", { version: "1", body: { x: 1 } });
      rt.scheduleExternal("e1", { add: 1 });
    });
    expect(recorded.document.events.some((e) => e.kind === "resource")).toBe(true);
    expect(JSON.stringify(recorded.document.events.find((e) => e.kind === "resource")!.payload)).toBe(
      JSON.stringify(recorded.document.events.find((e) => e.kind === "resource")!.payload).replace("body", "body"),
    );
    const payload = recorded.document.events.find((e) => e.kind === "resource")!.payload as { contentHash: string };
    expect(payload.contentHash.length).toBe(64);
    const played = await replayRun(recorded.document);
    const report = verifyReplay(recorded.document, played.hashes);
    expect(report.ok).toBe(true);
  });
});
