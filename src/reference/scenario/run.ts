import { NetworkScheduler } from "../network/NetworkScheduler.js";
import { ResourceScheduler } from "../resource/ResourceScheduler.js";
import { recordRun, replayRun } from "../replay/Player.js";
import { verifyReplay, type VerifyReport } from "../replay/verify.js";
import { createReferenceRuntime, type ReferenceRuntime } from "../runtime/ReferenceRuntime.js";
import type { ArtifactDocument } from "../replay/artifact.js";
import { sleepMs } from "../modes/realTime.js";
import type { Mode, Scenario } from "./define.js";

export interface RunResult {
  runtime: ReferenceRuntime;
  hashes: string[];
  artifact?: ArtifactDocument;
  report?: VerifyReport;
}

function networkFor(scenario: Scenario, mode: Mode): NetworkScheduler | undefined {
  const net = new NetworkScheduler();
  if (scenario.setupNetwork) scenario.setupNetwork(net);
  if (mode === "faultInjection" || scenario.noisyNetwork) {
    if (net.peers.size === 0) net.addPeer("a").addPeer("b").connect("a", "b", "ch", { dropPerU64: 1n << 63n });
  }
  return scenario.setupNetwork || mode === "faultInjection" || scenario.noisyNetwork ? net : undefined;
}

function resourcesFor(scenario: Scenario): ResourceScheduler | undefined {
  if (!scenario.setupResources) return undefined;
  const resources = new ResourceScheduler();
  scenario.setupResources(resources);
  return resources;
}

export async function run(scenario: Scenario, mode: Mode): Promise<RunResult> {
  if (mode === "replayVerify") {
    const recorded = await recordRun(
      {
        seed: scenario.seed,
        dt: scenario.dt,
        initialState: scenario.initialState,
        buildAdmit: scenario.buildAdmit,
        buildSim: scenario.buildSim,
        buildPublish: scenario.buildPublish,
        buildObserve: scenario.buildObserve,
        metrics: scenario.metrics,
        snapshotProtection: scenario.snapshotProtection,
        network: networkFor(scenario, "deterministicFast"),
        resources: resourcesFor(scenario),
      },
      scenario.ticks,
      scenario.schedule,
    );
    const played = await replayRun(recorded.document, {
      buildAdmit: scenario.buildAdmit,
      buildSim: scenario.buildSim,
      buildPublish: scenario.buildPublish,
      buildObserve: scenario.buildObserve,
      schedule: scenario.schedule,
      network: networkFor(scenario, "deterministicFast"),
      resources: resourcesFor(scenario),
    });
    const report = verifyReplay(recorded.document, played.hashes);
    if (!report.ok) throw new Error(`replayVerify failed at tick ${report.firstDivergentTick}`);
    return { runtime: played, hashes: played.hashes, artifact: recorded.document, report };
  }

  const network = networkFor(scenario, mode);
  const resources = resourcesFor(scenario);
  const runtime = createReferenceRuntime({
    seed: scenario.seed,
    dt: scenario.dt,
    initialState: scenario.initialState,
    buildAdmit: scenario.buildAdmit,
    buildSim: scenario.buildSim,
    buildPublish: scenario.buildPublish,
    buildObserve: scenario.buildObserve,
    metrics: mode === "realTimeObserved" ? true : scenario.metrics,
    snapshotProtection: scenario.snapshotProtection,
    network,
    resources,
  });
  runtime.start();
  for (let i = 0; i < scenario.ticks; i++) {
    const due = runtime.clock.tick + 1n;
    scenario.schedule(runtime, due);
    await runtime.runTick();
    if (mode === "realTimeObserved") await sleepMs(5);
  }
  return { runtime, hashes: runtime.hashes };
}
