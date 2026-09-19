export type MessageClass = "command" | "event" | "trace" | "audit";

export interface SimPayload {
  seq: number;
  tenant: string;
  class: MessageClass;
  priority: number;
  endpoint: string;
  service: string;
  link_hint?: "healthy" | "degraded" | "down";
  headers?: Record<string, unknown>;
}

export interface VertexSnapshot {
  id: string;
  sourceCount: number;
  sinkCount: number;
  inFlight: number;
  accepted: number;
  lastHandlerMs: number;
  totalHandlerMs: number;
  timedOut: number;
  peakDepth: number;
}

export interface EdgeSnapshot {
  id: string;
  source: string;
  target: string;
  capacity: number;
  delivery: string;
  overflow: string;
  queued: number;
  peakQueued: number;
  objectCount: number;
  dropCount: number;
  errorCount: number;
  filterCount: number;
  blockedMs: number;
  itemWaitMs: number;
}

export interface GraphSnapshot {
  atMs: number;
  vertices: Record<string, VertexSnapshot>;
  edges: Record<string, EdgeSnapshot>;
}
