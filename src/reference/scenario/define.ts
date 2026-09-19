import type { ConveyorGraph } from "conveyor-graph";
import type { RuntimeContext } from "../types.js";
import type { NetworkScheduler } from "../network/NetworkScheduler.js";
import type { ResourceScheduler } from "../resource/ResourceScheduler.js";
import type { ReferenceRuntime } from "../runtime/ReferenceRuntime.js";
import type { SnapshotProtection } from "../frame/types.js";

export type Mode = "deterministicFast" | "realTimeObserved" | "replayVerify" | "faultInjection";

export interface Scenario {
  id: string;
  seed: bigint;
  initialState: Record<string, unknown>;
  ticks: number;
  dt?: number;
  metrics?: boolean;
  snapshotProtection?: SnapshotProtection;
  buildAdmit?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  buildSim?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  buildPublish?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  buildObserve?: (graph: ConveyorGraph, ctx: RuntimeContext) => void;
  setupNetwork?: (net: NetworkScheduler) => void;
  setupResources?: (res: ResourceScheduler) => void;
  schedule: (rt: ReferenceRuntime, due: bigint) => void;
  noisyNetwork?: boolean;
}

export function defineScenario(scenario: Scenario): Scenario {
  return scenario;
}
