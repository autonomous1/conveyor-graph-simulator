import { SplitMix64, labelMix, toU64 } from "./splitmix64.js";

export const RNG_LABELS = [
  "sim",
  "network",
  "network.drop",
  "network.dup",
  "network.reorder",
  "network.jitter",
  "resource",
  "overflow",
] as const;
export type RngLabel = (typeof RNG_LABELS)[number];

export interface RngSnapshot {
  algo: "splitmix64";
  sim: string;
  network: string;
  "network.drop": string;
  "network.dup": string;
  "network.reorder": string;
  "network.jitter": string;
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
      "network.drop": new SplitMix64(labelMix(this.seed, "network.drop")),
      "network.dup": new SplitMix64(labelMix(this.seed, "network.dup")),
      "network.reorder": new SplitMix64(labelMix(this.seed, "network.reorder")),
      "network.jitter": new SplitMix64(labelMix(this.seed, "network.jitter")),
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
      "network.drop": this.streams["network.drop"].snapshot(),
      "network.dup": this.streams["network.dup"].snapshot(),
      "network.reorder": this.streams["network.reorder"].snapshot(),
      "network.jitter": this.streams["network.jitter"].snapshot(),
      resource: this.streams.resource.snapshot(),
      overflow: this.streams.overflow.snapshot(),
    };
  }
}

export function createRootRng(seed: bigint | number = 0n): RootRng {
  return new RootRng(seed);
}
