# Spec decisions — Simulation Reference System

Where this file conflicts with the original spec or the integrated draft, this file wins. Review notes: `SPEC-REVIEW.md`.

---

## D1. Phase model — four graphs + two pre-admit schedulers

Driver order each tick (after tick 0 initial checkpoint):

0. Network scheduler: tick virtual links; enqueue due deliveries into the admit inbox.
0b. Resource harvest: wall-completed work becomes pending admit records (no state write).
1. Admit graph — driver injects kinds in order: external, network, resource, mailbox. `whenIdle()` after each kind (logical phases 1–4). No intra-graph barrier vertices in v1.
2. Sim-core graph — transforms only. `whenIdle()`.
3. Driver commit — apply pending-changes bag to `StateStore` (logical phase 7).
4. Publish graph — snapshots and projections. `whenIdle()`.
5. Observe graph — metric frame. `whenIdle()`.
6. Canonical hash (pure function).
7. `TickClock.advance()`.

Network and resource may use their own `ConveyorGraph` instances internally. They are not the four domain graphs.

**Barriers:** never `ConveyorGraph.drain()`. That API sets `phase = "draining"`, arms `setTimeout`, and is scenario teardown only.

### D1a. Group completion — wait for `whenIdle`, slip the frame if late

A group or tick advances only after that graph’s `whenIdle()` has resolved (occupancy 0). Never call `ConveyorGraph.drain()` for this. Never start tick *n+1* while tick *n* still has in-graph work.

If wall-clock pacing says the next tick is due and the current tick has not reached `whenIdle()`:

- Do **not** cut off processing or drop remaining items of this tick.
- Keep running the current group until `whenIdle()`.
- Delay the next tick: **effective frame rate slows** so every tick still runs to completion.

Simulated time still advances by the configured `dt` per completed tick. Only wall time between ticks stretches. Canonical hashes match deterministic-fast for the same scenario and seed; only `ObsFrame.incidental` durations change.

Deterministic-fast and replay-verify never wait on the wall. They await `whenIdle()` and advance immediately.

`MAX_STEPS_PER_PHASE` is a **liveness fuse**, not a frame-rate policy. It fires only if occupancy never reaches 0 (immediate cycle, handler that never returns, occupancy bug). Then the tick fails (`PhaseDidNotQuiesce`): no hash, no advance. That is not “this tick took longer than `dt` on the wall.”

Real-time wrapper sketch:

```
deadline = wallStart + dt
await graph.whenIdle()
hash + advance
if (now < deadline) sleep(deadline - now)
// else no sleep; frame rate dropped; next tick starts immediately
```

Prerequisite: occupancy includes in-flight handlers + edge buffers; driver-owned mailbox is *not* part of graph occupancy.

No self-releasing barrier vertices (idle would deadlock).

---

## D2. Snapshots

Default deterministic-fast and replay: **structural clone** of committed state handed to publish/observe. Live store is not shared.

Integrity: hash(store) before publish and after publish must match.

`snapshotProtection`:

- `"clone"` (default) — clone, no deep-freeze.
- `"freeze"` — deep-freeze the clone (adversarial tests).
- `"live-hash"` — not default; if ever enabled, mismatch must **restore** the store from the pre-publish canonical form and fail the tick.

Real-time: clone optional; hash checkpoints required. No Immer.

Measure clone cost on ≥100kB in M1.

---

## D3. Canonical-v1

SHA-256 over UTF-8 canonical text. Not `JSON.stringify`.

Allowed: null, boolean, finite number except `-0`, string, dense array, plain object, tagged bytes `{"$bytes":"<hex>"}`, tagged bigint `{"$i":"<decimal>"}`.

Illegal (throw): `undefined`, `NaN`, `±Infinity`, `-0` (`Object.is(x,-0)`), `Map`, `Set`, `Date`, function, symbol, class instances, sparse arrays.

Keys sorted by UTF-8 byte order.

Floats: shortest round-trip. Integers in safe range: base-10, no exponent. Tick field in the hashed document is a decimal string, not `$i`.

Hashed document:

```
{ tick, state, mailbox, rng, resources, topologyVersion, configHash? }
```

Golden fixtures + child_process + Node 20/22. Full-scenario cross-process hash equality is an M2+ gate, not M0.

---

## D4. PRNG

SplitMix64. Root seed. Forks: `sim`, `network`, `resource`, `overflow`. Driver owns streams.

v1 vertices receive RNG by factory closure / explicit context argument. Do not block on compose `mountInline` context until M6.

`Math.random` banned on hashed paths.

---

## D5. Observability

`ObsFrame.canonical` vs `.incidental`. Sim hash excludes obs by default.

Canonical counters are **driver-aggregated after `whenIdle`**, from runtime snapshots / mailbox inspect / network outcome logs — not incremented during vertex traversal.

Metrics-on vs metrics-off: identical sim hashes. Two metrics-on runs: identical canonical counters.

Trace profile: v2.

---

## D6. Topology

Build-once. Constant `topologyVersion`. Predicates/state for disable. Rebuild is v2.

---

## D7. Overflow

Native: block, drop-newest (`drop`), fail (`error`). Wrappers + mailbox: drop-oldest, coalesce, reject, defer, escalate.

---

## D8. Timers

No `setTimeout` / `setInterval` / `Date.now` as control in driver, mailbox, clock, canonical, rng modules. Real-time pacing is an outer wrapper only.

`tickBatch` is tick-bounded (admit/sim-core). `conveyorBatch` stays wall-clock and is only legal outside those graphs.

---

## D9. Tick 0

- Construct initial state before any group runs.
- Hash + record **initial checkpoint at tick 0**.
- First executed tick is **1**. Clock starts `0n`; first `advance()` → `1n` at the end of tick 1.
- Replay compares tick 0 before per-tick checkpoints.

M0 empty run: start `0n`, 1000 advances, current tick `1000n`, hashes of `{tick, rng}` stable.

---

## D10. Admit order

Sequence number per admitted event. Kind order: external < network < resource < mailbox. Within kind: stable source id. Replay stores tick + seq.

---

## D11. DelayedMailbox

Only delayed-delivery mechanism. Immediate edges stay ordinary edges. Next-tick / delayed-ticks enqueue `{ releaseTick, origin, dest, policy, payload }`.

State owned by the **driver**. Vertex is an enqueue adapter. `drain(tick)` and `inspect()` are driver APIs. Capacity + HWM required.

Immediate-cycle DFS ignores mailbox-mediated edges.

`sampled` / `buffered`: later milestones, still mailbox policies.

---

## D12. Commit and errors

Sim-core emits a pending-changes bag. Driver `beginCommit` / apply sorted by `(seq, vertexId)` / `endCommit`. Same-path collisions: last in that order wins; obs collision counter.

Thrown error in any group: abort tick **before** hash and advance; write tick-failure (canonical: tick, group, vertex id; incidental: stack, timing); fail scenario unless retry policy set; record failure for replay.

Compose may catch; it must forward to `driver.failTick`, not drop.

---

## D13. Replay artifact v1

Magic + version 1 + little-endian length frames + canonical-v1 body. Reject other versions.

Includes initial checkpoint, seq numbers, tick failures. No `diffState`. No format migrate.

---

## D14. Public API

```
conveyorSimulator({
  id?,
  admit, simCore, publish, observe,  // compose builders or prebuilt graphs
  seed, mode, snapshotProtection?,
})
```

Driver is not a compose helper. Each domain graph is.

---

## D15. v1 cuts

Trace profile; sweep >3 axes; topology rebuild; Immer; replay migrate; state-diff hooks; per-node PRNG; extra native overflow modes; intra-group barrier vertices; live-store default snapshots; compose context-through-mount as an M1 blocker.

---

## Prerequisites (runtime / compose)

1. Handler brand before wrapSimple — M6.
2. Async transform output not dropped — any async vertex behind `whenIdle`.
3. applyErrorMode window vs lifetime — obs error counts.
4. `whenIdle` / occupancy quiescence **without** `phase = draining`.
5. Occupancy = handlers + edge buffers; excludes driver mailbox.
6. mountInline context — M6 only.
7. HANDLE_BRAND robustness — compose only.

Early milestones may register raw `ConveyorGraph` vertices.

---

## D16. Review follow-ups (bodies, streams, admit gate)

- `NetworkScheduler.bodies` is refcounted. Retain only when a message is queued (including `dupPerU64` copies). `tick` releases after the last pending reference is delivered. Drop / reject / partition never store a body.
- `*PerU64` fields are raw `nextU64()` thresholds (`1n << 63n` = 50%). Not “once per N”.
- Network decisions use labeled streams `network.drop`, `network.dup`, `network.reorder`, `network.jitter`. A single `useRng` still fans one stream to all four for tests.
- Admit gates sim: `ctx.fail` during an admit send stops further admit injects and that event is not sent to sim. The tick still aborts via `TickAbortedError`.
- Handler throw in the default wrapper is tick abort, not `graph/error` routing.
- Envelope hash includes the full RNG snapshot. Same committed state with different draw counts is a different envelope.
- `StateStore.read` aliases live committed objects. Callers that cache a read across `apply` see later writes.
