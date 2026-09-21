import { describe, expect, it } from "vitest";
import {
  NetworkScheduler,
  SplitMix64,
  decodeArtifact,
  recordRun,
  run,
  defineScenario,
  deepFreeze,
  createReferenceRuntime,
} from "../src/reference/index.js";
import { perU64FromProbability, probabilityFromPerU64 } from "../src/reference/network/FaultEngine.js";

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

  it("releases payload bodies after last pending delivery including dups", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(2n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", {
      dupPerU64: 0xffff_ffff_ffff_ffffn,
    });
    net.send({ id: "m", from: "a", to: "b", channel: "ch", payload: { k: 1 }, sendTick: 1n });
    expect(net.bodies.size).toBe(1);
    expect(net.tick(1n).map((d) => d.id)).toEqual(["m", "m#2"]);
    expect(net.bodies.size).toBe(0);
  });

  it("does not retain bodies for drop/reject/partition", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(1n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", { dropPerU64: 0xffff_ffff_ffff_ffffn });
    net.send({ id: "d", from: "a", to: "b", channel: "ch", payload: { n: 1 }, sendTick: 1n });
    expect(net.bodies.size).toBe(0);

    const p = new NetworkScheduler();
    p.useRng(new SplitMix64(1n));
    p.addPeer("a").addPeer("b").connect("a", "b", "ch");
    p.partition("a", "b", "ch", 1n, 2n);
    p.send({ id: "x", from: "a", to: "b", channel: "ch", payload: 1, sendTick: 1n });
    expect(p.bodies.size).toBe(0);
  });

  it("throws when partition range is inverted", () => {
    const net = new NetworkScheduler();
    expect(() => net.partition("a", "b", "ch", 5n, 1n)).toThrow(RangeError);
  });

  it("maps perU64 thresholds as raw nextU64 cuts", () => {
    expect(probabilityFromPerU64(1n << 63n)).toBe(0.5);
    expect(probabilityFromPerU64(1n << 62n)).toBe(0.25);
    expect(perU64FromProbability(0)).toBe(0n);
    expect(perU64FromProbability(1)).toBe(0xffff_ffff_ffff_ffffn);
  });

  it("split network streams keep jitter independent of drop", () => {
    const drop = new SplitMix64(10n);
    const jitter = new SplitMix64(11n);
    const reorder = new SplitMix64(12n);
    const dup = new SplitMix64(13n);
    const before = jitter.snapshot();
    const net = new NetworkScheduler();
    net.useNetworkRng({ drop, dup, reorder, jitter });
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", {
      dropPerU64: 0xffff_ffff_ffff_ffffn,
      jitterTicks: 4,
    });
    net.send({ id: "d", from: "a", to: "b", channel: "ch", payload: 1, sendTick: 1n });
    expect(jitter.snapshot()).toBe(before);
  });

  it("deepFreeze walks already-frozen parents", () => {
    const child = { n: 1 };
    const parent = { child };
    Object.freeze(parent);
    deepFreeze(parent);
    expect(Object.isFrozen(parent.child)).toBe(true);
  });
});
