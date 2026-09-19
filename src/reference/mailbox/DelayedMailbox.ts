import type { MailboxItem, MailboxPolicy, MailboxStats } from "../types.js";

export class MailboxOverflowError extends Error {
  constructor(capacity: number) {
    super(`DelayedMailbox at capacity ${capacity}`);
    this.name = "MailboxOverflowError";
  }
}

export class DelayedMailbox {
  readonly capacity: number;
  #nextSeq = 1;
  #highWater = 0;
  #items: MailboxItem[] = [];

  constructor(capacity = 1024) {
    this.capacity = capacity;
  }

  enqueue(item: Omit<MailboxItem, "seq"> & { seq?: number }): MailboxItem {
    if (this.#items.length >= this.capacity) throw new MailboxOverflowError(this.capacity);
    const seq = this.#nextSeq++;
    const stored: MailboxItem = {
      seq,
      releaseTick: item.releaseTick,
      origin: item.origin,
      dest: item.dest,
      policy: item.policy,
      payload: item.payload,
    };
    this.#items.push(stored);
    if (this.#items.length > this.#highWater) this.#highWater = this.#items.length;
    return stored;
  }

  drain(tick: bigint): MailboxItem[] {
    const due: MailboxItem[] = [];
    const rest: MailboxItem[] = [];
    for (const item of this.#items) {
      if (item.releaseTick <= tick) due.push(item);
      else rest.push(item);
    }
    this.#items = rest;
    due.sort(compareMailbox);
    return due;
  }

  inspect(): MailboxStats {
    const items = [...this.#items].sort(compareMailbox).map((item) => ({
      seq: item.seq,
      releaseTick: item.releaseTick.toString(10),
      origin: item.origin,
      dest: item.dest,
      policy: item.policy,
    }));
    return {
      pending: this.#items.length,
      capacity: this.capacity,
      highWater: this.#highWater,
      items,
    };
  }

  canonicalPending(): Array<{
    seq: number;
    releaseTick: string;
    origin: string;
    dest: string;
    policy: MailboxPolicy;
    payload: unknown;
  }> {
    return [...this.#items].sort(compareMailbox).map((item) => ({
      seq: item.seq,
      releaseTick: item.releaseTick.toString(10),
      origin: item.origin,
      dest: item.dest,
      policy: item.policy,
      payload: item.payload,
    }));
  }
}

function compareMailbox(a: MailboxItem, b: MailboxItem): number {
  if (a.releaseTick !== b.releaseTick) return a.releaseTick < b.releaseTick ? -1 : 1;
  if (a.seq !== b.seq) return a.seq - b.seq;
  if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
  if (a.dest !== b.dest) return a.dest < b.dest ? -1 : 1;
  return 0;
}
