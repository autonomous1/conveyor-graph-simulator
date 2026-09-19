import { ConveyorGraph, GraphAgent, type Delivery, type Overflow, type StreamAgent } from "conveyor-graph";
import { StallableSink, FakeTunnel } from "./sink.js";
import { BurstGenerator } from "./generator.js";
import { MetricCollector } from "./collector.js";
import { wallWait } from "./clock.js";

export interface LinearOpts {
  capacity?: number;
  delivery?: Delivery;
  overflow?: Overflow;
  hopDelayMs?: number;
}

export interface LinearWorld {
  graph: ConveyorGraph;
  session: GraphAgent;
  gen: BurstGenerator;
  hop: FakeTunnel;
  sink: StallableSink;
  metrics: MetricCollector;
  requiredEdgeId: string;
}

export function linearRequired(opts: LinearOpts = {}): LinearWorld {
  const hop = new FakeTunnel(opts.hopDelayMs ?? 1);
  const sink = new StallableSink();
  const graph = new ConveyorGraph("s-linear").initGraph();
  graph.define("gen", (a: StreamAgent) => a.payload);
  graph.define("classify", (a: StreamAgent) => a.payload);
  graph.define("encode", (a: StreamAgent) => a.payload);
  graph.define("hop", hop.handler);
  graph.define("target", sink.handler);
  graph.define("capture", (a: StreamAgent) => a.payload);
  const edgeOpts = {
    capacity: opts.capacity ?? 8,
    delivery: opts.delivery ?? ("required" as const),
    overflow: opts.overflow ?? ("block" as const),
  };
  graph
    .connect("gen", "classify", { capacity: 32, delivery: "required", overflow: "block" })
    .connect("classify", "encode", { capacity: 32, delivery: "required", overflow: "block" })
    .connect("encode", "hop", { capacity: 32, delivery: "required", overflow: "block" })
    .connect("hop", "target", edgeOpts)
    .connect("target", "capture", { capacity: 32, delivery: "required", overflow: "block" })
    .seal();
  const session = new GraphAgent("sim", {}, {}, graph);
  return {
    graph,
    session,
    gen: new BurstGenerator(session, "gen"),
    hop,
    sink,
    metrics: new MetricCollector(graph),
    requiredEdgeId: "hop-target",
  };
}

export interface FanoutWorld {
  graph: ConveyorGraph;
  session: GraphAgent;
  gen: BurstGenerator;
  required: StallableSink;
  sample: StallableSink;
  metrics: MetricCollector;
}

export function fanoutPriority(): FanoutWorld {
  const required = new StallableSink();
  const sample = new StallableSink();
  sample.delayMs = 40;
  const graph = new ConveyorGraph("s-fanout").initGraph();
  graph.define("gen", { fanout: "all" }, (a: StreamAgent) => a.payload);
  graph.define("classify", { fanout: "all" }, (a: StreamAgent) => a.payload);
  graph.define("req", required.handler);
  graph.define("sample", sample.handler);
  graph
    .connect("gen", "classify", { capacity: 32, delivery: "required", overflow: "block" })
    .connect("classify", "req", { capacity: 16, delivery: "required", overflow: "block" })
    .connect("classify", "sample", { capacity: 2, delivery: "bestEffort", overflow: "drop" })
    .seal();
  const session = new GraphAgent("sim", {}, {}, graph);
  return {
    graph,
    session,
    gen: new BurstGenerator(session, "gen"),
    required,
    sample,
    metrics: new MetricCollector(graph),
  };
}

export function concurrentConnect(parallel: number) {
  const started: number[] = [];
  const finished: number[] = [];
  let current = 0;
  let peak = 0;
  const graph = new ConveyorGraph("s-connect").initGraph();
  graph.define("gen", (a: StreamAgent) => a.payload);
  graph.define("connect", { parallel }, async (a: StreamAgent) => {
    const seq = (a.payload as { seq: number }).seq;
    started.push(seq);
    current++;
    peak = Math.max(peak, current);
    await wallWait(40);
    current--;
    finished.push(seq);
    return a.payload;
  });
  graph.define("capture", (a: StreamAgent) => a.payload);
  graph
    .connect("gen", "connect", { capacity: 8, delivery: "required", overflow: "block" })
    .connect("connect", "capture", { capacity: 32, delivery: "required", overflow: "block" })
    .seal();
  const session = new GraphAgent("sim", {}, {}, graph);
  return {
    graph,
    session,
    gen: new BurstGenerator(session, "gen"),
    metrics: new MetricCollector(graph),
    started,
    finished,
    peakOf: () => peak,
  };
}

export function multiHop(opts: { relayDelayMs?: number; capacity?: number; hangRelay?: boolean } = {}) {
  const gw = new FakeTunnel(1);
  const relay = new FakeTunnel(opts.relayDelayMs ?? 1);
  if (opts.hangRelay) relay.hang();
  const remote = new StallableSink();
  const cap = opts.capacity ?? 2;
  const graph = new ConveyorGraph("s-multihop").initGraph();
  graph.define("gen", (a: StreamAgent) => a.payload);
  graph.define("classify", (a: StreamAgent) => a.payload);
  graph.define("gw", { timeoutMs: 40 }, gw.handler);
  graph.define("relay", { timeoutMs: 40 }, relay.handler);
  graph.define("remote", remote.handler);
  graph.define("collector", (a: StreamAgent) => a.payload);
  const req = { capacity: cap, delivery: "required" as const, overflow: "block" as const };
  graph
    .connect("gen", "classify", req)
    .connect("classify", "gw", req)
    .connect("gw", "relay", req)
    .connect("relay", "remote", req)
    .connect("remote", "collector", { capacity: 32, delivery: "required", overflow: "block" })
    .seal();
  const session = new GraphAgent("sim", {}, {}, graph);
  return {
    graph,
    session,
    gen: new BurstGenerator(session, "gen"),
    gw,
    relay,
    remote,
    metrics: new MetricCollector(graph),
  };
}

export function meshHealth(opts: { fanout: "all" | "first"; failHealthy?: boolean }) {
  const local = new StallableSink();
  const tunnelA = new StallableSink();
  const tunnelB = new StallableSink();
  const fail = new StallableSink();
  const graph = new ConveyorGraph("s-mesh").initGraph();
  const failHealthy = opts.failHealthy ?? false;
  graph.define("gen", { fanout: opts.fanout }, (a: StreamAgent) => a.payload);
  graph.define("classify", { fanout: opts.fanout }, (a: StreamAgent) => a.payload);
  graph.define("local", local.handler);
  graph.define("tunnelA", tunnelA.handler);
  graph.define("tunnelB", tunnelB.handler);
  graph.define("fail", fail.handler);
  graph
    .connect("gen", "classify", { capacity: 32, delivery: "required", overflow: "block" })
    .connect("classify", "local", {
      capacity: 16,
      delivery: "required",
      overflow: "block",
      when: (a) => {
        const p = a.payload as { endpoint?: string; class?: string };
        return p.endpoint === "local" || p.class === "audit";
      },
    })
    .connect("classify", "tunnelA", {
      capacity: 16,
      delivery: "required",
      overflow: "block",
      when: (a) => {
        const p = a.payload as { endpoint?: string; tenant?: string };
        return p.endpoint === "target-a" || p.tenant === "alpha";
      },
    })
    .connect("classify", "tunnelB", {
      capacity: 16,
      delivery: "required",
      overflow: "block",
      when: (a) => {
        const p = a.payload as { endpoint?: string; tenant?: string };
        return p.endpoint === "target-b" || p.tenant === "beta";
      },
    })
    .connect("classify", "fail", {
      capacity: 4,
      delivery: "bestEffort",
      overflow: "drop",
      when: (a) => {
        const p = a.payload as { endpoint?: string; link_hint?: string };
        if (opts.fanout === "first") return failHealthy && p.endpoint === "fail";
        return p.endpoint === "fail" || p.link_hint === "down";
      },
    })
    .seal();
  const session = new GraphAgent("sim", {}, {}, graph);
  return {
    graph,
    session,
    gen: new BurstGenerator(session, "gen"),
    local,
    tunnelA,
    tunnelB,
    fail,
    metrics: new MetricCollector(graph),
  };
}
