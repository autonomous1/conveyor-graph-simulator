import { describe, expect, it } from "vitest";
import {
  NetworkScheduler,
  createReferenceRuntime,
  recordRun,
  replayRun,
  verifyReplay,
} from "../../src/reference/index.js";
import { SplitMix64 } from "../../src/reference/index.js";

const ALWAYS = 0xffff_ffff_ffff_ffffn;

describe("NetworkScheduler", () => {
  it("rejects unknown routes and never delivers early", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(1n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", { latencyTicks: 2 });
    const rejected = net.send({ id: "m0", from: "a", to: "z", channel: "ch", payload: { n: 1 }, sendTick: 1n });
    expect(rejected.outcome).toBe("reject");
    net.send({ id: "m1", from: "a", to: "b", channel: "ch", payload: { n: 1 }, sendTick: 1n });
    expect(net.tick(1n).length).toBe(0);
    expect(net.tick(2n).length).toBe(0);
    expect(net.tick(3n)[0]!.id).toBe("m1");
    expect(net.tick(3n).length).toBe(0);
  });

  it("drops and partitions according to profile", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(1n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", { dropPerU64: ALWAYS });
    expect(net.send({ id: "d", from: "a", to: "b", channel: "ch", payload: 1, sendTick: 1n }).outcome).toBe("drop");
    expect(net.tick(1n).length).toBe(0);

    const p = new NetworkScheduler();
    p.useRng(new SplitMix64(1n));
    p.addPeer("a").addPeer("b").connect("a", "b", "ch");
    p.partition("a", "b", "ch", 1n, 2n);
    expect(p.send({ id: "x", from: "a", to: "b", channel: "ch", payload: 1, sendTick: 1n }).outcome).toBe("partition");
    expect(p.send({ id: "y", from: "a", to: "b", channel: "ch", payload: 1, sendTick: 3n }).outcome).toBe("deliver");
    expect(p.tick(3n)[0]!.id).toBe("y");
  });

  it("duplicates when the dup threshold always hits", () => {
    const net = new NetworkScheduler();
    net.useRng(new SplitMix64(2n));
    net.addPeer("a").addPeer("b").connect("a", "b", "ch", { dupPerU64: ALWAYS });
    net.send({ id: "m", from: "a", to: "b", channel: "ch", payload: { k: 1 }, sendTick: 1n });
    const due = net.tick(1n);
    expect(due.map((d) => d.id)).toEqual(["m", "m#2"]);
  });
});

describe("network admission", () => {
  it("same seed yields the same trace and hashes", async () => {
    async function run(seed: bigint) {
      const network = new NetworkScheduler();
      network.addPeer("a").addPeer("b").connect("a", "b", "ch", { dropPerU64: 1n << 63n });
      const rt = createReferenceRuntime({ seed, initialState: { count: 0 }, network });
      rt.start();
      rt.network.send({ id: "m1", from: "a", to: "b", channel: "ch", payload: { n: 1 }, sendTick: 1n });
      rt.scheduleExternal("e1", { add: 1 });
      await rt.runTick();
      return { hashes: rt.hashes, trace: rt.network.trace().map((t) => t.outcome) };
    }
    expect(await run(42n)).toEqual(await run(42n));
    const a = await run(42n);
    const b = await run(43n);
    expect(a.hashes[0]).not.toBe(b.hashes[0]);
  });

  it("replays recorded network admits", async () => {
    const network = new NetworkScheduler();
    network.addPeer("a").addPeer("b").connect("a", "b", "ch");
    const recorded = await recordRun({ seed: 42n, initialState: { count: 0 }, network }, 1, (rt, due) => {
      rt.network.send({ id: "m1", from: "a", to: "b", channel: "ch", payload: { n: 1 }, sendTick: due });
      rt.scheduleExternal("e1", { add: 1 });
    });
    expect(recorded.document.events.some((e) => e.kind === "network")).toBe(true);
    const played = await replayRun(recorded.document);
    expect(verifyReplay(recorded.document, played.hashes).ok).toBe(true);
  });
});
