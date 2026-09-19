import type { SplitMix64 } from "../rng/splitmix64.js";
import type { LinkProfile } from "./types.js";

const ZERO = 0n;

export function hitsThreshold(rng: SplitMix64, threshold: bigint | undefined): boolean {
  if (threshold === undefined || threshold <= ZERO) return false;
  return rng.nextU64() < threshold;
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

export function resolveDue(sendTick: bigint, profile: LinkProfile | undefined, rng: SplitMix64): bigint {
  const latency = profile?.latencyTicks ?? 0;
  const jitter = jitterDelay(rng, profile?.jitterTicks);
  let extra = 0;
  if (hitsThreshold(rng, profile?.reorderPerU64)) extra = extraReorderDelay(rng, profile?.jitterTicks);
  const delay = latency + jitter + extra;
  return sendTick + BigInt(delay < 0 ? 0 : delay);
}
