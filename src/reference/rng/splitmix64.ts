import { Buffer } from "node:buffer";

/**
 * SplitMix64. Mix constants from Steele / Vigna / Java SplittableRandom.
 * State is a single u64. No wall clock. No Math.random.
 */
const MASK = 0xffff_ffff_ffff_ffffn;
const GOLDEN = 0x9e37_79b9_7f4a_7c15n;
const M1 = 0xbf58_476d_1ce4_e5b9n;
const M2 = 0x94d0_49bb_1331_11ebn;

export function toU64(value: bigint | number): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new RangeError("seed must be a finite integer");
    }
    return BigInt(value) & MASK;
  }
  return value & MASK;
}

export function mix64(z: bigint): bigint {
  z &= MASK;
  z = (z ^ (z >> 30n)) * M1 & MASK;
  z = (z ^ (z >> 27n)) * M2 & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

export class SplitMix64 {
  private state: bigint;

  constructor(seed: bigint | number) {
    this.state = toU64(seed);
  }

  nextU64(): bigint {
    this.state = (this.state + GOLDEN) & MASK;
    return mix64(this.state);
  }

  snapshot(): string {
    return this.state.toString(10);
  }

  static fromSnapshot(decimal: string): SplitMix64 {
    return new SplitMix64(BigInt(decimal));
  }
}

export function labelMix(rootSeed: bigint | number, label: string): bigint {
  let h = 0xcbf2_9ce4_8422_2325n;
  const bytes = Buffer.from(label, "utf8");
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100_0000_01b3n) & MASK;
  }
  return mix64(toU64(rootSeed) ^ h ^ GOLDEN);
}
