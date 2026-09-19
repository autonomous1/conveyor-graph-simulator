import type { ConveyorGraph } from "conveyor-graph";

export class ImmediateCycleError extends Error {
  readonly path: string[];
  constructor(path: string[]) {
    super(`immediate cycle: ${path.join(" -> ")}`);
    this.name = "ImmediateCycleError";
    this.path = path;
  }
}

/** DFS over connect() edges. Mailbox is not an edge. */
export function assertNoImmediateCycles(graph: ConveyorGraph): void {
  const adj = new Map<string, string[]>();
  for (const id of Object.keys(graph.vertex)) adj.set(id, []);
  for (const edge of Object.values(graph.edge)) {
    const list = adj.get(edge.sourceId) ?? [];
    list.push(edge.targetId);
    adj.set(edge.sourceId, list);
  }

  const visit = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const dfs = (id: string): void => {
    visit.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const st = visit.get(next) ?? 0;
      if (st === 1) {
        const start = stack.indexOf(next);
        throw new ImmediateCycleError([...stack.slice(start), next]);
      }
      if (st === 0) dfs(next);
    }
    stack.pop();
    visit.set(id, 2);
  };

  for (const id of adj.keys()) {
    if ((visit.get(id) ?? 0) === 0) dfs(id);
  }
}
