import type { SplitMix64 } from "../rng/splitmix64.js";
import type { LinkProfile } from "./types.js";

const ZERO = 0n;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

/**
 * Draw against a raw u64 threshold.
 * `threshold / 2^64` is the hit probability: `1n << 63n` is 50%, `1n << 62n` is 25%.
 * `undefined` or `<= 0` never hits and does not consume a draw.
 */
export function hitsThreshold(rng: SplitMix64, threshold: bigint | undefined): boolean {
  if (threshold === undefined || threshold <= ZERO) return false;
  return rng.nextU64() < threshold;
}

/** Map a probability in [0, 1] to a `*PerU64` threshold. */
export function perU64FromProbability(p: number): bigint {
  if (!Number.isFinite(p) || p <= 0) return ZERO;
  if (p >= 1) return U64_MAX;
  const hi = BigInt(Math.floor(p * 2 ** 53));
  return hi << 11n;
}

/** Inverse of {@link perU64FromProbability} (53-bit precision). */
export function probabilityFromPerU64(threshold: bigint | undefined): number {
  if (threshold === undefined || threshold <= ZERO) return 0;
  if (threshold >= U64_MAX) return 1;
  return Number(threshold >> 11n) / 2 ** 53;
}

export function jitterDelay(rng: SplitMix64, jitterTicks: number | undefined): number {
  const max = jitterTicks ?? 0;
  if (max <= 0) return 0;
  return Number(rng.nextU64() % BigInt(max + 1));
}

export function extraReorderDelay(rng: SplitMix64, jitterTicks: number | undefined): number {
  const max = jitterTicks ?? 0;
  return 1 + Number(rng.nextU64() % BigInt(max + 1));
}

export interface DueRng {
  jitter: SplitMix64;
  reorder: SplitMix64;
}

export function resolveDue(sendTick: bigint, profile: LinkProfile | undefined, rng: DueRng): bigint {
  const latency = profile?.latencyTicks ?? 0;
  const jitter = jitterDelay(rng.jitter, profile?.jitterTicks);
  let extra = 0;
  if (hitsThreshold(rng.reorder, profile?.reorderPerU64)) extra = extraReorderDelay(rng.reorder, profile?.jitterTicks);
  const delay = latency + jitter + extra;
  return sendTick + BigInt(delay < 0 ? 0 : delay);
}
