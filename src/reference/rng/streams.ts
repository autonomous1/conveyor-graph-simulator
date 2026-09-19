import { SplitMix64, labelMix, toU64 } from "./splitmix64.js";

export const RNG_LABELS = ["sim", "network", "resource", "overflow"] as const;
export type RngLabel = (typeof RNG_LABELS)[number];

export interface RngSnapshot {
  algo: "splitmix64";
  sim: string;
  network: string;
  resource: string;
  overflow: string;
}

export class RootRng {
  readonly seed: bigint;
  private readonly streams: Record<RngLabel, SplitMix64>;

  constructor(seed: bigint | number = 0n) {
    this.seed = toU64(seed);
    this.streams = {
      sim: new SplitMix64(labelMix(this.seed, "sim")),
      network: new SplitMix64(labelMix(this.seed, "network")),
      resource: new SplitMix64(labelMix(this.seed, "resource")),
      overflow: new SplitMix64(labelMix(this.seed, "overflow")),
    };
  }

  stream(label: RngLabel): SplitMix64 {
    return this.streams[label];
  }

  snapshot(): RngSnapshot {
    return {
      algo: "splitmix64",
      sim: this.streams.sim.snapshot(),
      network: this.streams.network.snapshot(),
      resource: this.streams.resource.snapshot(),
      overflow: this.streams.overflow.snapshot(),
    };
  }
}

export function createRootRng(seed: bigint | number = 0n): RootRng {
  return new RootRng(seed);
}
