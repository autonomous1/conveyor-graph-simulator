export type SnapshotProtection = "clone" | "freeze";

export interface ObsCanonical {
  occupancyAdmit: number;
  occupancySim: number;
  mailboxPending: number;
  resourceAdmitted: number;
  networkTraceCount: number;
  networkDelivered: number;
  proposedChanges: number;
}

export interface ObsFrame {
  tick: string;
  canonical: ObsCanonical;
  incidental: Record<string, never>;
}

export interface FrameInput {
  tick: string;
  snapshot: Record<string, unknown>;
}

export interface FrameContext {
  dueTick: () => bigint;
  snapshot: () => Record<string, unknown>;
}
