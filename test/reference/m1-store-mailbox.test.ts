import { describe, expect, it } from "vitest";
import {
  StateStore,
  CommitWindowError,
  DelayedMailbox,
  MailboxOverflowError,
} from "../../src/reference/index.js";

describe("StateStore", () => {
  it("applies changes only inside a commit window", () => {
    const store = new StateStore({ count: 0 });
    expect(() => store.apply([{ seq: 1, vertexId: "a", path: ["count"], value: 1 }])).toThrow(CommitWindowError);
    store.beginCommit();
    store.apply([
      { seq: 2, vertexId: "b", path: ["count"], value: 2 },
      { seq: 1, vertexId: "a", path: ["count"], value: 1 },
    ]);
    store.endCommit();
    expect(store.snapshot()).toEqual({ count: 2 });
    expect(store.read(["count"])).toBe(2);
  });
});

describe("DelayedMailbox", () => {
  it("drains due items in stable order and inspects the rest", () => {
    const box = new DelayedMailbox(4);
    box.enqueue({ releaseTick: 2n, origin: "a", dest: "b", policy: "delayedTicks", payload: 2 });
    box.enqueue({ releaseTick: 1n, origin: "a", dest: "b", policy: "nextTick", payload: 1 });
    expect(box.inspect().pending).toBe(2);
    const due = box.drain(1n);
    expect(due.map((i) => i.payload)).toEqual([1]);
    expect(box.inspect().pending).toBe(1);
    expect(box.inspect().items[0]!.releaseTick).toBe("2");
  });

  it("rejects enqueue at capacity", () => {
    const box = new DelayedMailbox(1);
    box.enqueue({ releaseTick: 1n, origin: "a", dest: "b", policy: "nextTick", payload: 1 });
    expect(() =>
      box.enqueue({ releaseTick: 1n, origin: "a", dest: "b", policy: "nextTick", payload: 2 }),
    ).toThrow(MailboxOverflowError);
  });
});
