import { ConveyorGraph, GraphAgent, type StreamAgent, type VertexHandler } from "conveyor-graph";
import { TickClock } from "../clock/TickClock.js";
import { createRootRng, type RootRng } from "../rng/streams.js";
import { sha256CanonicalV1 } from "../canonical/hash.js";
import { StateStore } from "../authority/StateStore.js";
import { DelayedMailbox } from "../mailbox/DelayedMailbox.js";
import { assertNoImmediateCycles } from "../simulation/cycles.js";
import { PhaseDidNotQuiesce, TickAbortedError } from "./errors.js";
import { ADMIT_RANK, type AdmitEvent, type AdmitKind, type PendingChange, type RuntimeContext, type TickFailure } from "../types.js";
import type { Recorder } from "../replay/Recorder.js";
import { ResourceScheduler } from "../resource/ResourceScheduler.js";
import { NetworkScheduler } from "../network/NetworkScheduler.js";
import { deepFreeze } from "../authority/freeze.js";
import { assembleObsFrame } from "../frame/assemble.js";
import type { ObsFrame } from "../frame/types.js";

const MAX_STEPS_PER_PHASE = 10_000;

export interface ReferenceRuntimeOptions {
  seed?: bigint | number;
  dt?: number;
  initialState?: Record<string, unknown>;
  mailboxCapacity?: number;
  buildAdmit?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  buildSim?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  admitIngress?: string;
  simIngress?: string;
  resources?: ResourceScheduler;
  harvestResources?: boolean;
  network?: NetworkScheduler;
  harvestNetwork?: boolean;
  buildPublish?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  buildObserve?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  publishIngress?: string;
  observeIngress?: string;
  metrics?: boolean;
  snapshotProtection?: "clone" | "freeze";
}

export class ReferenceRuntime {
  readonly clock: TickClock;
  readonly rng: RootRng;
  readonly store: StateStore;
  readonly mailbox: DelayedMailbox;
  readonly admit: ConveyorGraph;
  readonly sim: ConveyorGraph;
  readonly admitIngress: string;
  readonly simIngress: string;
  readonly hashes: string[] = [];
  readonly seed: bigint;
  readonly initialState: Record<string, unknown>;
  readonly resources: ResourceScheduler;
  readonly harvestResources: boolean;
  readonly network: NetworkScheduler;
  readonly harvestNetwork: boolean;
  readonly publish: ConveyorGraph;
  readonly observe: ConveyorGraph;
  readonly publishIngress: string;
  readonly observeIngress: string;
  readonly metrics: boolean;
  readonly snapshotProtection: "clone" | "freeze";
  readonly frames: ObsFrame[] = [];
  #recorder: Recorder | null = null;
  #publishAgent!: GraphAgent;
  #observeAgent!: GraphAgent;
  #hasPublish: boolean;
  #hasObserve: boolean;

  #seq = 1;
  #changeSeq = 1;
  #pending: PendingChange[] = [];
  #external: AdmitEvent[] = [];
  #failure: TickFailure | null = null;
  #started = false;
  #due = 1n;
  #activeGroup = "sim";
  #admitAgent!: GraphAgent;
  #simAgent!: GraphAgent;

  constructor(opts: ReferenceRuntimeOptions = {}) {
    this.clock = new TickClock({ dt: opts.dt });
    this.rng = createRootRng(opts.seed ?? 0n);
    this.seed = this.rng.seed;
    this.initialState = structuredClone(opts.initialState ?? {});
    this.store = new StateStore(this.initialState);
    this.mailbox = new DelayedMailbox(opts.mailboxCapacity ?? 1024);
    this.resources = opts.resources ?? new ResourceScheduler();
    this.harvestResources = opts.harvestResources !== false;
    this.network = opts.network ?? new NetworkScheduler();
    this.harvestNetwork = opts.harvestNetwork !== false;
    this.admit = new ConveyorGraph("admit");
    this.sim = new ConveyorGraph("sim");
    this.publish = new ConveyorGraph("publish");
    this.observe = new ConveyorGraph("observe");
    this.publishIngress = opts.publishIngress ?? "frame";
    this.observeIngress = opts.observeIngress ?? "obs";
    this.metrics = opts.metrics === true;
    this.snapshotProtection = opts.snapshotProtection ?? "clone";
    this.#hasPublish = Boolean(opts.buildPublish);
    this.#hasObserve = Boolean(opts.buildObserve);
    this.admitIngress = opts.admitIngress ?? "in";
    this.simIngress = opts.simIngress ?? "step";

    const ctx: RuntimeContext = {
      dueTick: () => this.#due,
      rng: this.rng,
      propose: (change) => {
        this.#pending.push({ ...change, seq: this.#changeSeq++ });
      },
      enqueueMailbox: (item) => {
        this.mailbox.enqueue(item);
      },
      fail: (err, vertexId) => {
        this.#failure = {
          tick: this.#due.toString(10),
          group: this.#activeGroup,
          vertexId,
          message: err.message,
        };
      },
      resources: this.resources,
      network: this.network,
    };

    if (opts.buildAdmit) opts.buildAdmit(this.admit, ctx);
    else this.admit.define(this.admitIngress, wrap(ctx, this.admitIngress, (agent: StreamAgent) => agent.payload));

    if (opts.buildSim) opts.buildSim(this.sim, ctx);
    else {
      this.sim.define(
        this.simIngress,
        wrap(ctx, this.simIngress, (agent) => {
          const payload = agent.payload as { add?: number };
          const add = typeof payload?.add === "number" ? payload.add : 0;
          const prev = Number(this.store.read(["count"]) ?? 0);
          ctx.propose({ vertexId: this.simIngress, path: ["count"], value: prev + add });
          return payload;
        }),
      );
    }

    const locked = () => {
      throw new Error("publish/observe context is read-only");
    };
    const frameCtx: RuntimeContext = {
      ...ctx,
      propose: locked,
      enqueueMailbox: locked,
      fail: (err, vertexId) => ctx.fail(err, vertexId),
      resources: new Proxy(this.resources, {
        get: (target, prop, recv) => (prop === "complete" || prop === "request" ? locked : Reflect.get(target, prop, recv)),
      }),
      network: new Proxy(this.network, {
        get: (target, prop, recv) => (prop === "send" ? locked : Reflect.get(target, prop, recv)),
      }),
    };
    if (opts.buildPublish) opts.buildPublish(this.publish, frameCtx);
    else this.publish.define(this.publishIngress, (agent: StreamAgent) => agent.payload);
    if (opts.buildObserve) opts.buildObserve(this.observe, frameCtx);
    else this.observe.define(this.observeIngress, (agent: StreamAgent) => agent.payload);
  }

  recordTo(recorder: Recorder): this {
    this.#recorder = recorder;
    return this;
  }

  start(): this {
    if (this.#started) return this;
    if (!this.admit.vertex[this.admitIngress]) {
      this.admit.define(this.admitIngress, (agent: StreamAgent) => agent.payload);
    }
    if (!this.sim.vertex[this.simIngress]) {
      this.sim.define(this.simIngress, (agent: StreamAgent) => agent.payload);
    }
    assertNoImmediateCycles(this.admit);
    assertNoImmediateCycles(this.sim);
    assertNoImmediateCycles(this.publish);
    assertNoImmediateCycles(this.observe);
    this.admit.seal();
    this.sim.seal();
    this.publish.seal();
    this.observe.seal();
    this.#publishAgent = new GraphAgent("publish-driver", {}, {}, this.publish);
    this.#observeAgent = new GraphAgent("observe-driver", {}, {}, this.observe);
    this.#admitAgent = new GraphAgent("admit-driver", {}, {}, this.admit);
    this.#simAgent = new GraphAgent("sim-driver", {}, {}, this.sim);
    this.network.useNetworkRng({
      drop: this.rng.stream("network.drop"),
      dup: this.rng.stream("network.dup"),
      reorder: this.rng.stream("network.reorder"),
      jitter: this.rng.stream("network.jitter"),
    });
    this.#started = true;
    const hash0 = this.hashEnvelope("0");
    this.hashes.push(hash0);
    this.#recorder?.header({
      seed: this.seed.toString(10),
      dt: this.clock.dt,
      initialState: this.initialState,
      mailboxCapacity: this.mailbox.capacity,
      topologyVersion: "m1-static",
    });
    this.#recorder?.checkpoint("0", hash0);
    return this;
  }

  scheduleExternal(id: string, payload: unknown, kind: AdmitKind = "external"): void {
    this.#external.push({ seq: this.#seq++, kind, id, payload });
  }

  async runTick(): Promise<string> {
    if (!this.#started) this.start();
    this.#due = this.clock.tick + 1n;
    this.#failure = null;
    this.#pending = [];
    if (this.harvestNetwork) {
      for (const item of this.network.tick(this.#due)) {
        this.#external.push({
          seq: this.#seq++,
          kind: "network",
          id: item.id,
          payload: item,
        });
      }
    }
    if (this.harvestResources) {
      for (const item of this.resources.harvest(this.#due)) {
        this.#external.push({
          seq: this.#seq++,
          kind: "resource",
          id: `res:${item.key}:${item.version}`,
          payload: item,
        });
      }
    }

    const events = this.#collectAdmit(this.#due);
    this.#activeGroup = "admit";
    const admitted: AdmitEvent[] = [];
    for (const event of events) {
      await this.#admitAgent.send(this.admitIngress, event.id, event);
      if (this.#failure) break;
      admitted.push(event);
    }
    const occupancyAdmit = this.admit.occupancy();
    await this.#quiesce(this.admit, "admit");
    this.#throwIfFailed();

    this.#activeGroup = "sim";
    for (const event of admitted) {
      await this.#simAgent.send(this.simIngress, event.id, event.payload);
    }
    const occupancySim = this.sim.occupancy();
    await this.#quiesce(this.sim, "sim");
    this.#throwIfFailed();

    const proposedChanges = this.#pending.length;
    this.store.beginCommit();
    try {
      this.store.apply(this.#pending);
    } finally {
      this.store.endCommit();
    }

    const hashBefore = sha256CanonicalV1(this.store.snapshot());
    let snapshot = this.store.snapshot();
    if (this.snapshotProtection === "freeze") snapshot = deepFreeze(snapshot);
    if (this.#hasPublish) {
      this.#activeGroup = "publish";
      await this.#publishAgent.send(this.publishIngress, `frame-${this.#due}`, { tick: this.#due.toString(10), snapshot });
      await this.#quiesce(this.publish, "publish");
      this.#throwIfFailed();
    }
    const hashAfter = sha256CanonicalV1(this.store.snapshot());
    if (hashBefore !== hashAfter) {
      this.#failure = {
        tick: this.#due.toString(10),
        group: "publish",
        message: "snapshot protection: store mutated during publish",
      };
      this.#recorder?.failure(this.#failure);
      throw new TickAbortedError(this.#failure);
    }
    if (this.metrics) {
      const frame = assembleObsFrame(this.#due.toString(10), {
        occupancyAdmit,
        occupancySim,
        mailboxPending: this.mailbox.inspect().pending,
        resourceAdmitted: this.resources.admitted().length,
        networkTraceCount: this.network.trace().length,
        networkDelivered: events.filter((e) => e.kind === "network").length,
        proposedChanges,
      });
      this.frames.push(frame);
      if (this.#hasObserve) {
        this.#activeGroup = "observe";
        await this.#observeAgent.send(this.observeIngress, `obs-${this.#due}`, frame);
        await this.#quiesce(this.observe, "observe");
        this.#throwIfFailed();
      }
    }

    const digest = this.hashEnvelope(this.#due.toString(10));
    this.hashes.push(digest);
    this.#recorder?.checkpoint(this.#due.toString(10), digest);
    this.clock.advance();
    return digest;
  }

  /** Envelope identity includes RNG cursors: same world, different draw counts, different hash. */
  hashEnvelope(tick: string): string {
    return sha256CanonicalV1({
      tick,
      state: this.store.snapshot(),
      mailbox: this.mailbox.canonicalPending(),
      rng: this.rng.snapshot(),
      resources: this.resources.admitted(),
      resourcePending: this.resources.pendingCanonical(),
      networkPending: this.network.pendingCanonical(),
    });
  }

  get lastFailure(): TickFailure | null {
    return this.#failure;
  }

  #collectAdmit(due: bigint): AdmitEvent[] {
    const events = [...this.#external];
    this.#external = [];
    for (const item of this.mailbox.drain(due)) {
      events.push({
        seq: this.#seq++,
        kind: "mailbox",
        id: `mb-${item.seq}`,
        payload: item.payload,
      });
    }
    events.sort((a, b) => {
      const rk = ADMIT_RANK[a.kind] - ADMIT_RANK[b.kind];
      if (rk !== 0) return rk;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return a.seq - b.seq;
    });
    for (const event of events) {
      if (event.kind === "resource" && event.payload && typeof event.payload === "object") {
        const p = event.payload as { key: string; version: string; contentHash: string; outcome: "ready" | "failed" | "cancelled" | "stale" };
        if (p.key) this.resources.noteAdmitted(p);
      }
      this.#recorder?.admit(due, event);
    }
    return events;
  }

  #throwIfFailed(): void {
    if (!this.#failure) return;
    this.#recorder?.failure(this.#failure);
    throw new TickAbortedError(this.#failure);
  }

  async #quiesce(graph: ConveyorGraph, group: string): Promise<void> {
    if (!graph.hasWork()) return;
    const idle = graph.whenIdle();
    const fused = new Promise<never>((_, reject) => {
      let steps = 0;
      const hop = () => {
        if (!graph.hasWork()) return;
        if (++steps >= MAX_STEPS_PER_PHASE) {
          reject(new PhaseDidNotQuiesce(group, steps));
          return;
        }
        queueMicrotask(hop);
      };
      queueMicrotask(hop);
    });
    await Promise.race([idle, fused]);
  }
}

/** Handler throw aborts the tick via `ctx.fail`; it does not route to `graph/error`. */
function wrap(ctx: RuntimeContext, vertexId: string, handler: VertexHandler): VertexHandler {
  return async (agent) => {
    try {
      return await handler(agent);
    } catch (err) {
      ctx.fail(err instanceof Error ? err : new Error(String(err)), vertexId);
      return { disposition: "skip" as const };
    }
  };
}

export function createReferenceRuntime(opts?: ReferenceRuntimeOptions): ReferenceRuntime {
  return new ReferenceRuntime(opts);
}
