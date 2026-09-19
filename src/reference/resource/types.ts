export type ResourceOutcome = "ready" | "failed" | "cancelled" | "stale";

export interface ResourceIdentity {
  key: string;
  version: string;
  contentHash: string;
  outcome: ResourceOutcome;
}

export interface ResourceAdmitPayload extends ResourceIdentity {
  admitTick: string;
}

export interface ResourceRecord extends ResourceIdentity {
  body?: unknown;
  message?: string;
}

export interface ResourceCompleteReady {
  version: string;
  body: unknown;
  outcome?: "ready";
}

export interface ResourceCompleteTerminal {
  version?: string;
  outcome: "failed" | "cancelled";
  message?: string;
}

export type ResourceComplete = ResourceCompleteReady | ResourceCompleteTerminal;
