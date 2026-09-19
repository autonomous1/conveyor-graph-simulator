import { createReferenceRuntime, type ReferenceRuntime, type ReferenceRuntimeOptions } from "../runtime/ReferenceRuntime.js";
import { encodeArtifact, type ArtifactDocument } from "./artifact.js";
import { Recorder } from "./Recorder.js";
import { TickAbortedError } from "../runtime/errors.js";

export interface RecordRunResult {
  runtime: ReferenceRuntime;
  document: ArtifactDocument;
  bytes: Uint8Array;
}

export async function recordRun(
  opts: ReferenceRuntimeOptions & { scenarioId?: string },
  ticks: number,
  schedule: (rt: ReferenceRuntime, due: bigint) => void,
): Promise<RecordRunResult> {
  const recorder = new Recorder();
  const runtime = createReferenceRuntime(opts);
  runtime.recordTo(recorder);
  runtime.start();
  try {
    for (let i = 0; i < ticks; i++) {
      const due = runtime.clock.tick + 1n;
      schedule(runtime, due);
      await runtime.runTick();
    }
  } catch (err) {
    if (!(err instanceof TickAbortedError)) throw err;
  }
  const document = recorder.document();
  return { runtime, document, bytes: encodeArtifact(document) };
}

export async function replayRun(
  document: ArtifactDocument,
  opts: Pick<
    ReferenceRuntimeOptions,
    "buildAdmit" | "buildSim" | "buildPublish" | "buildObserve" | "admitIngress" | "simIngress" | "network" | "resources"
  > & { schedule?: (rt: ReferenceRuntime, due: bigint) => void } = {},
): Promise<ReferenceRuntime> {
  const replayViaSchedule = typeof opts.schedule === "function";
  const runtime = createReferenceRuntime({
    seed: BigInt(document.seed),
    dt: document.dt,
    initialState: document.initialState,
    mailboxCapacity: document.mailboxCapacity,
    harvestResources: replayViaSchedule,
    harvestNetwork: replayViaSchedule,
    buildAdmit: opts.buildAdmit,
    buildSim: opts.buildSim,
    buildPublish: opts.buildPublish,
    buildObserve: opts.buildObserve,
    admitIngress: opts.admitIngress,
    simIngress: opts.simIngress,
    network: opts.network,
    resources: opts.resources,
  });
  runtime.start();
  const byTick = new Map<string, typeof document.events>();
  for (const event of document.events) {
    const list = byTick.get(event.tick) ?? [];
    list.push(event);
    byTick.set(event.tick, list);
  }
  const lastTick = maxRecordedTick(document);
  for (let due = 1n; due <= lastTick; due++) {
    if (replayViaSchedule) {
      opts.schedule!(runtime, due);
    } else {
      for (const event of byTick.get(due.toString(10)) ?? []) {
        runtime.scheduleExternal(event.id, event.payload, event.kind);
      }
    }
    await runtime.runTick();
  }
  return runtime;
}

function maxRecordedTick(document: ArtifactDocument): bigint {
  let max = 0n;
  for (const cp of document.checkpoints) {
    const t = BigInt(cp.tick);
    if (t > max) max = t;
  }
  for (const ev of document.events) {
    const t = BigInt(ev.tick);
    if (t > max) max = t;
  }
  return max;
}
