import { describe, expect, it } from "vitest";
import { createReferenceRuntime, TickAbortedError } from "../../src/reference/index.js";

describe("frame isolation", () => {
  it("clone mutations do not change the store or hash", async () => {
    const rt = createReferenceRuntime({
      seed: 1n,
      initialState: { count: 0 },
      snapshotProtection: "clone",
      buildPublish: (graph) => {
        graph.define("frame", (agent) => {
          const payload = agent.payload as { snapshot: Record<string, unknown> };
          payload.snapshot.count = 99;
          return payload;
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e1", { add: 1 });
    await rt.runTick();
    expect(rt.store.read(["count"])).toBe(1);
    const plain = createReferenceRuntime({ seed: 1n, initialState: { count: 0 } });
    plain.start();
    plain.scheduleExternal("e1", { add: 1 });
    await plain.runTick();
    expect(rt.hashes).toEqual(plain.hashes);
  });

  it("frozen snapshots reject mutation", async () => {
    const rt = createReferenceRuntime({
      seed: 1n,
      initialState: { count: 0 },
      snapshotProtection: "freeze",
      buildPublish: (graph) => {
        graph.define("frame", (agent) => {
          const payload = agent.payload as { snapshot: Record<string, number> };
          payload.snapshot.count = 99;
          return payload;
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e1", { add: 1 });
    try {
      await rt.runTick();
    } catch {
      /* freeze write may surface as a vertex error */
    }
    expect(rt.store.read(["count"])).toBe(1);
    expect(rt.store.read(["count"])).not.toBe(99);
  });
});

describe("observability", () => {
  it("metrics on and off share sim hashes", async () => {
    async function run(metrics: boolean) {
      const rt = createReferenceRuntime({ seed: 9n, initialState: { count: 0 }, metrics });
      rt.start();
      for (let i = 0; i < 4; i++) {
        rt.scheduleExternal(`e${i}`, { add: 1 });
        await rt.runTick();
      }
      return rt;
    }
    const on = await run(true);
    const off = await run(false);
    expect(on.hashes).toEqual(off.hashes);
    expect(on.frames.length).toBe(4);
    expect(off.frames.length).toBe(0);
    expect(on.frames[0]!.tick).toBe("1");
    expect(on.frames[0]!.canonical.proposedChanges).toBe(1);
  });

  it("canonical counters match across two metrics-on runs", async () => {
    async function run() {
      const rt = createReferenceRuntime({ seed: 9n, initialState: { count: 0 }, metrics: true });
      rt.start();
      rt.scheduleExternal("e1", { add: 1 });
      await rt.runTick();
      return rt.frames[0]!.canonical;
    }
    expect(await run()).toEqual(await run());
  });

  it("failed ticks do not emit a frame", async () => {
    const rt = createReferenceRuntime({
      seed: 1n,
      initialState: { count: 0 },
      metrics: true,
      buildSim: (graph, ctx) => {
        graph.define("step", () => {
          ctx.fail(new Error("boom"), "step");
          throw new Error("boom");
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e1", { add: 1 });
    try {
      await rt.runTick();
    } catch {
      /* expected */
    }
    expect(rt.frames.length).toBe(0);
  });
});
