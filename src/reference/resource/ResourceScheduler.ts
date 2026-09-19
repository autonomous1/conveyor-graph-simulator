import { sha256CanonicalV1 } from "../canonical/hash.js";
import type {
  ResourceAdmitPayload,
  ResourceComplete,
  ResourceIdentity,
  ResourceOutcome,
  ResourceRecord,
} from "./types.js";

function versionRank(version: string): { n: number | null; raw: string } {
  if (/^\d+$/.test(version)) return { n: Number(version), raw: version };
  return { n: null, raw: version };
}

function versionGreater(a: string, b: string): boolean {
  const A = versionRank(a);
  const B = versionRank(b);
  if (A.n !== null && B.n !== null) return A.n > B.n;
  return A.raw > B.raw;
}

function compareAdmit(a: ResourceAdmitPayload, b: ResourceAdmitPayload): number {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  if (a.version !== b.version) return a.version < b.version ? -1 : 1;
  if (a.contentHash !== b.contentHash) return a.contentHash < b.contentHash ? -1 : 1;
  if (a.outcome !== b.outcome) return a.outcome < b.outcome ? -1 : 1;
  return 0;
}

export class ResourceScheduler {
  readonly cache = new Map<string, ResourceRecord>();
  #pending: ResourceAdmitPayload[] = [];
  #admitted = new Map<string, ResourceIdentity>();

  request(_key: string, _opts?: { version?: string }): void {
    // Request is recorded only so sim can call it. Admission happens on complete+harvest.
  }

  complete(key: string, spec: ResourceComplete): ResourceAdmitPayload {
    let outcome: ResourceOutcome = spec.outcome ?? "ready";
    let version = "version" in spec && spec.version ? spec.version : "0";
    let contentHash = "";
    let body: unknown;
    let message: string | undefined;
    if (outcome === "ready" && "body" in spec) {
      body = spec.body;
      contentHash = sha256CanonicalV1(body);
      if (typeof spec.version !== "string" || spec.version.length === 0) {
        throw new Error("ResourceScheduler.complete requires version for ready resources");
      }
      version = spec.version;
    } else {
      message = "message" in spec ? spec.message : undefined;
    }

    const current = this.#admitted.get(key);
    if (current && !versionGreater(version, current.version) && outcome === "ready") {
      outcome = "stale";
    }

    const payload: ResourceAdmitPayload = {
      key,
      version,
      contentHash,
      outcome,
      admitTick: "",
    };
    this.#pending.push(payload);
    this.cache.set(key, { ...payload, body, message });
    return payload;
  }

  harvest(due: bigint): ResourceAdmitPayload[] {
    const batch = this.#pending.map((item) => ({ ...item, admitTick: due.toString(10) }));
    this.#pending = [];
    batch.sort(compareAdmit);
    for (const item of batch) {
      if (item.outcome === "ready") {
        this.#admitted.set(item.key, {
          key: item.key,
          version: item.version,
          contentHash: item.contentHash,
          outcome: item.outcome,
        });
      } else if (item.outcome === "failed" || item.outcome === "cancelled") {
        this.#admitted.set(item.key, {
          key: item.key,
          version: item.version,
          contentHash: item.contentHash,
          outcome: item.outcome,
        });
      }
    }
    return batch;
  }

  noteAdmitted(item: ResourceIdentity): void {
    if (item.outcome === "stale") return;
    this.#admitted.set(item.key, {
      key: item.key,
      version: item.version,
      contentHash: item.contentHash,
      outcome: item.outcome,
    });
  }

  pendingCanonical(): ResourceAdmitPayload[] {
    return [...this.#pending].sort(compareAdmit);
  }

  admitted(): ResourceIdentity[] {
    return [...this.#admitted.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
}
