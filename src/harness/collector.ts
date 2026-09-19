import type { ConveyorGraph, VertexStream, EdgeStream } from "conveyor-graph";
import type { EdgeSnapshot, GraphSnapshot, VertexSnapshot } from "../types.js";

/** Read live VertexStream / EdgeStream counters used by the Sankey path. */
export function snapshotVertex(v: VertexStream): VertexSnapshot {
  v.bufferDepth();
  return {
    id: v.id,
    sourceCount: v.sourceCount,
    sinkCount: v.sinkCount,
    inFlight: v.inFlight,
    accepted: v.accepted,
    lastHandlerMs: v.lastHandlerMs,
    totalHandlerMs: v.totalHandlerMs,
    timedOut: v.timedOut,
    peakDepth: v.peakDepth,
  };
}

export function snapshotEdge(e: EdgeStream): EdgeSnapshot {
  return {
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    capacity: e.capacity,
    delivery: e.delivery,
    overflow: e.overflow,
    queued: e.queued,
    peakQueued: e.peakQueued,
    objectCount: e.objectCount,
    dropCount: e.dropCount,
    errorCount: e.errorCount,
    filterCount: e.filterCount,
    blockedMs: e.blockedMs,
    itemWaitMs: e.itemWaitMs,
  };
}

export function snapshotGraph(graph: ConveyorGraph): GraphSnapshot {
  const vertices: Record<string, VertexSnapshot> = {};
  const edges: Record<string, EdgeSnapshot> = {};
  for (const [id, v] of Object.entries(graph.vertex)) vertices[id] = snapshotVertex(v);
  for (const [id, e] of Object.entries(graph.edge)) edges[id] = snapshotEdge(e);
  return { atMs: Date.now(), vertices, edges };
}

export class MetricCollector {
  readonly frames: GraphSnapshot[] = [];
  private graph: ConveyorGraph;

  constructor(graph: ConveyorGraph) {
    this.graph = graph;
  }

  capture(): GraphSnapshot {
    const frame = snapshotGraph(this.graph);
    this.frames.push(frame);
    return frame;
  }

  vertex(id: string): VertexSnapshot {
    return snapshotVertex(this.graph.vertex[id]!);
  }

  edge(id: string): EdgeSnapshot {
    return snapshotEdge(this.graph.edge[id]!);
  }

  last(): GraphSnapshot | undefined {
    return this.frames[this.frames.length - 1];
  }
}
