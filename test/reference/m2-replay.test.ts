import { describe, expect, it } from "vitest";
import {
  encodeArtifact,
  decodeArtifact,
  eventBodyHash,
  ArtifactFormatError,
  ARTIFACT_MAGIC,
  recordRun,
  replayRun,
  verifyReplay,
  TickAbortedError,
  createReferenceRuntime,
} from "../../src/reference/index.js";

describe("artifact codec", () => {
  it("round-trips and rejects bad magic/version", async () => {
    const { document, bytes } = await recordRun({ seed: 9n, initialState: { count: 0 } }, 2, (rt, due) => {
      rt.scheduleExternal(`e${due}`, { add: 1 });
    });
    const again = decodeArtifact(bytes);
    expect(again.seed).toBe(document.seed);
    expect(again.events.length).toBe(2);
    expect(again.checkpoints.length).toBe(3);
    const badMagic = Uint8Array.from(bytes);
    badMagic[0] = 65;
    expect(() => decodeArtifact(badMagic)).toThrow(ArtifactFormatError);
    const badVer = Uint8Array.from(bytes);
    badVer[4] = 2;
    expect(() => decodeArtifact(badVer)).toThrow(ArtifactFormatError);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe(ARTIFACT_MAGIC);
  });
});

describe("replay", () => {
  it("replays a counter with identical hashes", async () => {
    const recorded = await recordRun({ seed: 11n, initialState: { count: 0 } }, 32, (rt, due) => {
      rt.scheduleExternal(`e${due}`, { add: 1 });
    });
    const played = await replayRun(recorded.document);
    const report = verifyReplay(recorded.document, played.hashes);
    expect(report.ok).toBe(true);
    expect(played.hashes).toEqual(recorded.runtime.hashes);
    expect(played.store.read(["count"])).toBe(32);
  });

  it("reports first divergent checkpoint when one event changes", async () => {
    const recorded = await recordRun({ seed: 11n, initialState: { count: 0 } }, 8, (rt, due) => {
      rt.scheduleExternal(`e${due}`, { add: 1 });
    });
    const events = recorded.document.events.map((e) => {
      if (e.tick !== "5") return e;
      const payload = { add: 2 };
      return { ...e, payload, bodyHash: eventBodyHash(payload) };
    });
    const played = await replayRun({ ...recorded.document, events });
    const report = verifyReplay(recorded.document, played.hashes);
    expect(report.ok).toBe(false);
    expect(report.firstDivergentTick).toBe("5");
    expect(report.eventsSinceLastMatch.length).toBe(1);
    expect(report.eventsSinceLastMatch[0]!.tick).toBe("5");
  });

  it("does not list mailbox items as recorded events", async () => {
    const buildSim = (
      graph: import("conveyor-graph").ConveyorGraph,
      ctx: import("../../src/reference/index.js").RuntimeContext,
    ) => {
      graph.define("step", (agent) => {
        const payload = agent.payload as { add?: number; hop?: number };
        const rt = (ctx as unknown as { store?: { read: (p: string[]) => unknown } }).store;
        void rt;
        const add = payload.add ?? 0;
        ctx.propose({ vertexId: "step", path: ["count"], value: add });
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
    };
    const recorded = await recordRun({ seed: 3n, initialState: { count: 0 }, buildSim }, 2, (rt, due) => {
      if (due === 1n) rt.scheduleExternal("e0", { add: 1, hop: 1 });
    });
    expect(recorded.document.events.length).toBe(1);
    expect(recorded.document.events[0]!.kind).toBe("external");
    const played = await replayRun(recorded.document, { buildSim });
    expect(played.hashes).toEqual(recorded.runtime.hashes);
    expect(played.store.read(["count"])).toBe(10);
  });

  it("records a tick failure and replay throws without advancing", async () => {
    const recorded = await recordRun(
      {
        seed: 1n,
        initialState: { count: 0 },
        buildSim: (graph, ctx) => {
          graph.define("step", () => {
            ctx.fail(new Error("boom"), "step");
            throw new Error("boom");
          });
        },
      },
      1,
      (rt) => rt.scheduleExternal("e0", { add: 1 }),
    );
    expect(recorded.document.failures.length).toBe(1);
    expect(recorded.document.checkpoints.length).toBe(1);
    expect(recorded.runtime.clock.tick).toBe(0n);
    let threw = false;
    try {
      await replayRun(recorded.document, {
        buildSim: (graph, ctx) => {
          graph.define("step", () => {
            ctx.fail(new Error("boom"), "step");
            throw new Error("boom");
          });
        },
      });
    } catch (err) {
      threw = err instanceof TickAbortedError;
    }
    expect(threw).toBe(true);
  });
});

describe("createReferenceRuntime still records when attached", () => {
  it("start writes checkpoint 0 to the recorder", () => {
    const rt = createReferenceRuntime({ seed: 4n, initialState: { count: 0 } });
    expect(rt.hashes.length).toBe(0);
    rt.start();
    expect(rt.hashes.length).toBe(1);
  });
});
