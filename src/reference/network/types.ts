export type NetOutcome =
  | "deliver"
  | "delay"
  | "drop"
  | "duplicate"
  | "reorder"
  | "queue"
  | "reject"
  | "partition";

/**
 * Per-link fault profile.
 *
 * `dropPerU64`, `dupPerU64`, and `reorderPerU64` are raw thresholds against
 * `SplitMix64.nextU64()`, not "1 in N". Probability is `threshold / 2^64`:
 * `1n << 63n` ≈ 50%, `1n << 62n` ≈ 25%. Use `perU64FromProbability`.
 */
export interface LinkProfile {
  latencyTicks?: number;
  jitterTicks?: number;
  dropPerU64?: bigint;
  dupPerU64?: bigint;
  reorderPerU64?: bigint;
  capacity?: number;
}

export interface NetMessage {
  id: string;
  from: string;
  to: string;
  channel: string;
  sendTick: string;
  dueTick: string;
  bytes: number;
  payloadHash: string;
}

export interface NetAdmitPayload extends NetMessage {
  outcome: "deliver";
}

export interface NetDecision {
  message: NetMessage;
  outcome: NetOutcome;
}

export interface NetSendSpec {
  id: string;
  from: string;
  to: string;
  channel: string;
  payload: unknown;
  sendTick: bigint;
}
