import type { PendingChange } from "../types.js";

export class CommitWindowError extends Error {
  constructor(message = "StateStore mutation outside commit window") {
    super(message);
    this.name = "CommitWindowError";
  }
}

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

function setPath(root: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) {
    throw new Error("PendingChange path must not be empty");
  }
  if (path.some((k) => FORBIDDEN.has(k))) {
    throw new Error("PendingChange path contains a forbidden key");
  }
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = cursor[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]!] = value;
}

export class StateStore {
  #committed: Record<string, unknown>;
  #open = false;

  constructor(initial: Record<string, unknown> = {}) {
    this.#committed = structuredClone(initial);
  }

  snapshot(): Record<string, unknown> {
    return structuredClone(this.#committed);
  }

  /**
   * Read committed state. Allowed outside and during commit.
   *
   * Returns the live node inside `#committed`, not a clone. Holding the
   * result across `apply` / `commit` aliases later writes (e.g. `read(["a"])`
   * then `apply({ path: ["a","b"], ... })` mutates the held object).
   * Use {@link snapshot} or `structuredClone(read(path))` for a stable view.
   */
  read(path: string[]): unknown {
    let cursor: unknown = this.#committed;
    for (const key of path) {
      if (cursor === null || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
  }

  beginCommit(): void {
    if (this.#open) throw new CommitWindowError("commit already open");
    this.#open = true;
  }

  apply(changes: PendingChange[]): void {
    if (!this.#open) throw new CommitWindowError();
    const ordered = [...changes].sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.vertexId < b.vertexId ? -1 : a.vertexId > b.vertexId ? 1 : 0;
    });
    for (const change of ordered) {
      setPath(this.#committed, change.path, structuredClone(change.value));
    }
  }

  endCommit(): void {
    if (!this.#open) throw new CommitWindowError("commit is not open");
    this.#open = false;
  }

  get open(): boolean {
    return this.#open;
  }
}
