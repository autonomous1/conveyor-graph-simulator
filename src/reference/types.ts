export type AdmitKind = "external" | "network" | "resource" | "mailbox";

export const ADMIT_RANK: Record<AdmitKind, number> = {
  external: 0,
  network: 1,
  resource: 2,
  mailbox: 3,
};

export interface AdmitEvent {
  seq: number;
  kind: AdmitKind;
  id: string;
  payload: unknown;
}

export interface PendingChange {
  seq: number;
  vertexId: string;
  path: string[];
  value: unknown;
}

export type MailboxPolicy = "nextTick" | "delayedTicks";

export interface MailboxItem {
  seq: number;
  releaseTick: bigint;
  origin: string;
  dest: string;
  policy: MailboxPolicy;
  payload: unknown;
}

export interface MailboxStats {
  pending: number;
  capacity: number;
  highWater: number;
  items: Array<{
    seq: number;
    releaseTick: string;
    origin: string;
    dest: string;
    policy: MailboxPolicy;
  }>;
}

export interface TickFailure {
  tick: string;
  group: string;
  vertexId?: string;
  message: string;
}

export interface RuntimeContext {
  dueTick: () => bigint;
  rng: import("./rng/streams.js").RootRng;
  propose: (change: Omit<PendingChange, "seq">) => void;
  enqueueMailbox: (item: Omit<MailboxItem, "seq">) => void;
  fail: (err: Error, vertexId?: string) => void;
  resources: import("./resource/ResourceScheduler.js").ResourceScheduler;
  network: import("./network/NetworkScheduler.js").NetworkScheduler;
}
