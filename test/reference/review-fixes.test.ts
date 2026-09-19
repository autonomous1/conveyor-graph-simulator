import { describe, expect, it } from "vitest";
import {
  NetworkScheduler,
  SplitMix64,
  encodeArtifact,
  decodeArtifact,
  recordRun,
  run,
  defineScenario,
  deepFreeze,
  createReferenceRuntime,
} from "../../src/reference/index.js";
import { ResourceScheduler } from "../../src/reference/index.js";

describe("review fixes", () => {
  it("does not deliver tick-10 traffic at tick 9", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(1n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", { latencyTicks: 9 });
    net.send({ id: "late", from: "a", to: "b", channel: "ch", payload: { n: 1 }, sendTick: 1n });
    expect(net.tick(9n).length).toBe(0);
    expect(net.tick(10n)[0]!.id).toBe("late");
  });

  it("round-trips bigint payloads in artifacts", async () => {
    const { document, bytes } = await recordRun({ seed: 1n, initialState: { count: 0 } }, 1, (rt) => {
      rt.scheduleExternal("e1", { add: 1n });
    });
    const again = decodeArtifact(bytes);
    expect(typeof again.events[0]!.payload === "object").toBe(true);
    const payload = again.events[0]!.payload as { add: bigint };
    expect(payload.add).toBe(1n);
    expect(again.events[0]!.bodyHash).toBe(document.events[0]!.bodyHash);
  });

  it("applies setupResources in run()", async () => {
    const scenario = defineScenario({
      id: "res-setup",
      seed: 1n,
      initialState: { count: 0 },
      ticks: 1,
      setupResources: (res) => {
        res.complete("cfg", { version: "1", body: { ok: true } });
      },
      schedule: (rt) => rt.scheduleExternal("e1", { add: 1 }),
    });
    const result = await run(scenario, "deterministicFast");
    expect(result.runtime.resources.admitted()[0]!.key).toBe("cfg");
  });

  it("records publish failures with group publish", async () => {
    const rt = createReferenceRuntime({
      seed: 1n,
      initialState: { count: 0 },
      metrics: true,
      buildPublish: (graph, ctx) => {
        graph.define("frame", () => {
          ctx.fail(new Error("pub"), "frame");
          throw new Error("pub");
        });
      },
    });
    rt.start();
    rt.scheduleExternal("e1", { add: 1 });
    let group = "";
    try {
      await rt.runTick();
    } catch (err) {
      group = (err as { failure?: { group: string } }).failure?.group ?? "";
    }
    expect(group).toBe("publish");
    expect(rt.clock.tick).toBe(0n);
  });

  it("deepFreeze walks already-frozen parents", () => {
    const child = { n: 1 };
    const parent = { child };
    Object.freeze(parent);
    deepFreeze(parent);
    expect(Object.isFrozen(parent.child)).toBe(true);
  });
});
