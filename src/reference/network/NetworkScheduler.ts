import type { SplitMix64 } from "../rng/splitmix64.js";
import { sha256CanonicalV1 } from "../canonical/hash.js";
import { canonicalSerialize } from "../canonical/serialize.js";
import { hitsThreshold, resolveDue } from "./FaultEngine.js";
import type {
  LinkProfile,
  NetAdmitPayload,
  NetDecision,
  NetMessage,
  NetSendSpec,
} from "./types.js";

interface LinkKey {
  from: string;
  to: string;
  channel: string;
}

function linkId(link: LinkKey): string {
  return `${link.from}>${link.to}:${link.channel}`;
}

interface Pending extends NetMessage {
  payloadHash: string;
}

function compareTick(a: string, b: string): number {
  const A = BigInt(a);
  const B = BigInt(b);
  if (A < B) return -1;
  if (A > B) return 1;
  return 0;
}

function comparePending(a: Pending, b: Pending): number {
  const byTick = compareTick(a.dueTick, b.dueTick);
  if (byTick !== 0) return byTick;
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export interface NetworkRng {
  drop: SplitMix64;
  dup: SplitMix64;
  reorder: SplitMix64;
  jitter: SplitMix64;
}

export class NetworkScheduler {
  readonly peers = new Set<string>();
  readonly bodies = new Map<string, unknown>();
  #refs = new Map<string, number>();
  #links = new Map<string, LinkProfile>();
  #partitions = new Map<string, { fromTick: bigint; toTick: bigint }>();
  #pending: Pending[] = [];
  #trace: NetDecision[] = [];
  #traceCap = 1024;
  #rng: NetworkRng | null = null;

  /** Single stream used for every network decision (tests / simple callers). */
  useRng(rng: SplitMix64): void {
    this.#rng = { drop: rng, dup: rng, reorder: rng, jitter: rng };
  }

  /** Independent streams so enabling drop does not retarget jitter/reorder. */
  useNetworkRng(rng: NetworkRng): void {
    this.#rng = rng;
  }

  #record(decision: NetDecision): void {
    this.#trace.push(decision);
    if (this.#trace.length > this.#traceCap) this.#trace.splice(0, this.#trace.length - this.#traceCap);
  }

  #retain(hash: string, payload: unknown): void {
    this.bodies.set(hash, payload);
    this.#refs.set(hash, (this.#refs.get(hash) ?? 0) + 1);
  }

  #release(hash: string): void {
    const n = (this.#refs.get(hash) ?? 1) - 1;
    if (n <= 0) {
      this.bodies.delete(hash);
      this.#refs.delete(hash);
    } else {
      this.#refs.set(hash, n);
    }
  }

  /**
   * Drop one retain on a payload body. The engine calls this after it has
   * consumed an admitted message (`payload.payloadHash`). Safe if the hash
   * is already gone. Duplicates share a hash: the body stays until the last
   * pending reference is released.
   */
  release(hash: string): void {
    if (!hash) return;
    if (!this.bodies.has(hash) && !this.#refs.has(hash)) return;
    this.#release(hash);
  }

  addPeer(id: string): this {
    this.peers.add(id);
    return this;
  }

  connect(from: string, to: string, channel: string, profile: LinkProfile = {}): this {
    this.addPeer(from).addPeer(to);
    this.#links.set(linkId({ from, to, channel }), profile);
    return this;
  }

  partition(from: string, to: string, channel: string, fromTick: bigint, toTick: bigint): this {
    if (toTick < fromTick) {
      throw new RangeError(`partition toTick (${toTick}) < fromTick (${fromTick})`);
    }
    this.#partitions.set(linkId({ from, to, channel }), { fromTick, toTick });
    return this;
  }

  send(spec: NetSendSpec): NetDecision {
    const payloadHash = sha256CanonicalV1(spec.payload);
    const bytes = canonicalSerialize(spec.payload).length;
    const key = linkId(spec);
    const profile = this.#links.get(key);
    const base: NetMessage = {
      id: spec.id,
      from: spec.from,
      to: spec.to,
      channel: spec.channel,
      sendTick: spec.sendTick.toString(10),
      dueTick: spec.sendTick.toString(10),
      bytes,
      payloadHash,
    };

    if (!this.peers.has(spec.from) || !this.peers.has(spec.to) || !profile) {
      const decision: NetDecision = { message: base, outcome: "reject" };
      this.#record(decision);
      return decision;
    }

    const part = this.#partitions.get(key);
    if (part && spec.sendTick >= part.fromTick && spec.sendTick <= part.toTick) {
      const decision: NetDecision = { message: base, outcome: "partition" };
      this.#record(decision);
      return decision;
    }

    const rng = this.#rng;
    if (!rng) throw new Error("NetworkScheduler.useRng required before send");

    if (hitsThreshold(rng.drop, profile.dropPerU64)) {
      const decision: NetDecision = { message: base, outcome: "drop" };
      this.#record(decision);
      return decision;
    }

    const cap = profile.capacity;
    if (cap !== undefined && this.#pending.filter((p) => linkId(p) === key).length >= cap) {
      const decision: NetDecision = { message: base, outcome: "reject" };
      this.#record(decision);
      return decision;
    }

    const dueTick = resolveDue(spec.sendTick, profile, rng);
    const msg: Pending = { ...base, dueTick: dueTick.toString(10) };
    this.#pending.push(msg);
    this.#retain(payloadHash, spec.payload);
    const decision: NetDecision = {
      message: msg,
      outcome: dueTick === spec.sendTick ? "deliver" : "delay",
    };
    this.#record(decision);

    if (hitsThreshold(rng.dup, profile.dupPerU64)) {
      const dup: Pending = { ...msg, id: `${spec.id}#2` };
      this.#pending.push(dup);
      this.#retain(payloadHash, spec.payload);
      this.#record({ message: dup, outcome: "duplicate" });
    }
    return decision;
  }

  tick(due: bigint): NetAdmitPayload[] {
    const out: NetAdmitPayload[] = [];
    const rest: Pending[] = [];
    for (const item of this.#pending) {
      if (BigInt(item.dueTick) <= due) {
        out.push({ ...item, outcome: "deliver" });
      } else {
        rest.push(item);
      }
    }
    this.#pending = rest;
    out.sort(comparePending);
    return out;
  }

  trace(): NetDecision[] {
    return [...this.#trace];
  }

  pendingCanonical(): Pending[] {
    return [...this.#pending].sort(comparePending);
  }
}
