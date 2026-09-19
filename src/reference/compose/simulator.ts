import { NetworkScheduler } from "../network/NetworkScheduler.js";
import { ResourceScheduler } from "../resource/ResourceScheduler.js";
import { createReferenceRuntime, type ReferenceRuntime, type ReferenceRuntimeOptions } from "../runtime/ReferenceRuntime.js";
import type { Mode } from "../scenario/define.js";

export interface ConveyorSimulatorOptions extends ReferenceRuntimeOptions {
  id?: string;
  mode?: Mode;
  simCore?: ReferenceRuntimeOptions["buildSim"];
}

export function conveyorSimulator(opts: ConveyorSimulatorOptions = {}): ReferenceRuntime {
  const { simCore, buildSim, ...rest } = opts;
  return createReferenceRuntime({
    ...rest,
    buildSim: buildSim ?? simCore,
  });
}

export function defaultNetwork(): NetworkScheduler {
  return new NetworkScheduler();
}

export function defaultResources(): ResourceScheduler {
  return new ResourceScheduler();
}
