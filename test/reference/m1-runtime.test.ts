import { describe, expect, it } from "vitest";
import {
  createReferenceRuntime,
  ImmediateCycleError,
  TickAbortedError,
} from "../../src/reference/index.js";

describe("ReferenceRuntime", () => {
  it("hashes match across two counter runs including tick 0", async () => {
    async function run() {
      const rt = createReferenceRuntime({ seed: 11n, initialState: { count: 0 } });
      rt.start();
      for (let i = 0; i < 8; i++) {
        rt.scheduleExternal(`e${i}`, { add: 1 });
        await rt.runTick();
      }
      return { hashes: rt.hashes, count: rt.store.read(["count"]), tick: rt.clock.tick };
    }
    const a = await run();
    const b = await run();
    expect(a.hashes).toEqual(b.hashes);
    expect(a.hashes.length).toBe(9);
    expect(a.count).toBe(8);
    expect(a.tick).toBe(8n);
  });

  it("different seeds change the envelope hash", async () => {
    const a = createReferenceRuntime({ seed: 1n, initialState: { count: 0 } });
    const b = createReferenceRuntime({ seed: 2n, initialState: { count: 0 } });
    a.start();
    b.start();
    expect(a.hashes[0]).not.toBe(b.hashes[0]);
  });

  it("rejects an immediate cycle at start", () => {
    const rt = createReferenceRuntime({
      buildSim: (graph) => {
        graph.define("a", (agent) => agent.payload);
        graph.define("b", (agent) => agent.payload);
        graph.connect("a", "b");
        graph.connect("b", "a");
      },
      simIngress: "a",
    });
    expect(() => rt.start()).toThrow(ImmediateCycleError);
  });

  it("next-tick mailbox does not re-enter the same sim tick", async () => {
    const seen: number[] = [];
    const rt = createReferenceRuntime({
      seed: 3n,
      initialState: { count: 0 },
      buildSim: (graph, ctx) => {
        graph.define("step", (agent) => {
          const payload = agent.payload as { add?: number; hop?: number };
          seen.push(Number(ctx.dueTick()));
          const prev = Number(rt.store.read(["count"]) ?? 0);
          ctx.propose({ vertexId: "step", path: ["count"], value: prev + (payload.add ?? 0) });
          if (payload.hop === 1) {
            ctx.enqueueMailbox({
              releaseTick: ctx.dueTick() + 1n,
              origin: "step",
              dest: "step",
              policy: "nextTick",
              payload: { add: 10, hop: 0 },
            });
          }
          return payload;
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e0", { add: 1, hop: 1 });
    await rt.runTick();
    expect(rt.store.read(["count"])).toBe(1);
    expect(rt.mailbox.inspect().pending).toBe(1);
    expect(rt.mailbox.inspect().items[0]!.releaseTick).toBe("2");
    await rt.runTick();
    expect(rt.store.read(["count"])).toBe(11);
    expect(rt.mailbox.inspect().pending).toBe(0);
    expect(seen).toEqual([1, 2]);
  });

  it("does not advance the clock when sim fails the tick", async () => {
    const rt = createReferenceRuntime({
      buildSim: (graph, ctx) => {
        graph.define("step", () => {
          ctx.fail(new Error("boom"), "step");
          throw new Error("boom");
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e0", { add: 1 });
    let failed = false;
    try {
      await rt.runTick();
    } catch (err) {
      failed = err instanceof TickAbortedError;
    }
    expect(failed).toBe(true);
    expect(rt.clock.tick).toBe(0n);
    expect(rt.hashes.length).toBe(1);
  });
});
