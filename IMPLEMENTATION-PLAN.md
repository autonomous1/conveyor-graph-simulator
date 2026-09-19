# Conveyor Graph Simulation Reference System — Implementation Plan

Status: plan + locked spec decisions. Runtime/compose barrier work started (`hasWork`, `timeoutMs: 0`, `Handle.whenIdle`, adapters wait on idle not drain, async Transform output). Simulator M0 not started.
Decisions: `SPEC-DECISIONS.md` (wins over the original spec where they conflict).

Package: `conveyor-graph-simulator`.
Compose: `conveyor-graph-compose`. Runtime: `conveyor-graph`.
Existing S01–S24 stay as the *contract* catalog (`src/harness`, `test/s0*.test.ts`). The reference system is a second layer.

---

## Locked choices (summary)

| Topic | v1 lock |
| --- | --- |
| Phases | Option **A**: driver + 4 graphs (admit, sim-core, publish, observe). Hash and advance are not graphs. 12 logical phases remain for docs/obs. |
| Freeze | Fast + replay: clone + deepFreeze + hash. Real-time: hash only. Trace: opt-in proxies. No Immer in v1. |
| Canonical form | `canonical-v1` text + SHA-256. UTF-8 key sort. No `undefined` / NaN / ±Inf / Map / Set in state. Floats shortest-round-trip. Bytes tagged hex. |
| PRNG | SplitMix64. Root seed, forked streams `sim` / `network` / `resource` / `overflow`. State is in the hash. |
| Obs frame | `canonical` vs `incidental` halves. Sim hash does not include obs by default. Wall-clock is incidental only. |
| Topology | Build-once in v1. `topologyVersion` constant. Predicates for disable. Rebuild is v2. |
| Overflow | Native block / drop-newest / fail. Other spec policies are wrapper vertices + DelayedMailbox. |
| Timers | Illegal inside domain graphs. Real-time pacing is outside. Need `tickBatch` instead of `conveyorBatch`. |

Full text: `SPEC-DECISIONS.md`.

---

## Package shape

```
src/reference/
  index.ts
  types.ts
  canonical/          serialize + sha256CanonicalV1
  rng/                SplitMix64 + fork(label)
  clock/              TickClock (tick: bigint, dt, advance)
  driver/             PhaseDriver (admit → sim → publish → observe → hash → advance)
  mailbox/            DelayedMailbox + inspect API
  freeze/             clone + deepFreeze
  authority/          StateStore (mutate only in sim commit)
  simulation/         SimGraph factory
  network/            NetworkGraph
  resource/           ResourceGraph
  frame/              FrameGraph
  observability/      ObsFrame split halves
  replay/             artifact v1, recorder, player, verify
  scenario/           defineScenario + modes
  compose/            metadata helpers, tickBatch, overflow wrappers
test/reference/
test/reference/fixtures/canonical-v1/
test/reference/fixtures/replay-v1/
```

S-series stay put until an optional later move.

---

## Milestone 0 — Foundations (no graphs)

**Goal.** Canonical bytes, hash, PRNG, clock, empty phase driver.

- `canonicalSerialize(value): Uint8Array` implementing D3. Throws on illegal values.
- Fixtures: key-order permutations, `0.1+0.2`, `1e21`, `-0`, bytes, nested arrays. Golden hashes committed.
- Cross-process test: child_process serializes the same fixture; hashes equal.
- `sha256CanonicalV1`.
- SplitMix64 + `fork(root, label)` + canonical `rng` record.
- `TickClock`: `tick: bigint`, `time = Number(tick) * dt`, `advance()`. No timers.
- `PhaseDriver`: ordered group functions, each `await`ed to completion. Empty groups first.
- Lint/grep: driver sources do not contain `setTimeout` / `setInterval`.

**Exit.** 1000 empty ticks produce tick `0..999` and a stable hash of `{tick, rng}`. Green on Node 20 and 22.

**First PR is exactly this milestone.**

---

## Milestone 1 — Simulation core

**Goal.** One admit feed + one sim-core graph + mailbox + hash per tick.

Depends on compose handler-wrap and async-transform fixes if vertices go through helpers; otherwise hand-register `ConveyorGraph` vertices and add compose wrappers in Milestone 6.

- `StateStore`: mutations throw outside the commit window of the sim group.
- Snapshot: clone + deepFreeze in deterministic modes (D2). Prototype freeze on ≥100kB fixture; record cost in a comment/test log.
- `DelayedMailbox`: `(releaseTick, seq, origin, dest, policy, payload)`. Drained at the start of admit (logical phases 4). Inspect: origin, dest, pending count, release tick, policy. Cap + HWM warning (risk: unbounded defer).
- Immediate-cycle DFS on sim-core immediate edges; reject at start.
- Timing modes: immediate | nextTick | delayedTicks. Sampled/buffered can wait until M4/M6 if needed.
- Minimal scenario: counter += 1 per tick; hash every tick.

**Exit.** Two runs, identical hashes every tick. Different seed ⇒ different hashes. Immediate cycle throws. Delayed feedback cannot re-enter the same tick’s sim group.

---

## Milestone 2 — Replay

**Goal.** Record admitted ingress; replay; first divergence.

- Artifact: 4-byte magic + version `1` + payload. Payload encoding: CBOR or MessagePack *if* a single small dep is acceptable; otherwise the same `canonical-v1` text framed with length. Prefer **canonical-v1 framed** in v1 to avoid a dep. Reject other versions (no migrate).
- Record: scenario id, versions, seed, topologyVersion, config hash, resource identities, admitted events `{tick, kind, id, bodyHash}`, checkpoints `{tick, hash}`.
- Recorder sits on the driver ingress only (not on network *send*).
- Player injects recorded events at recorded ticks; no wall pacing.
- Verify: last match, first divergent checkpoint, inputs since last match. No `diffState` hook in v1.

**Exit.** 100-tick record replays with all hashes equal. Mutating event 47 reports divergence at 47 or the next checkpoint.

---

## Milestone 3 — Resource graph

- Separate `ConveyorGraph`. Providers may be async.
- Completions → pending queue. Admit group copies those due this tick into sim ingress.
- Cache bodies **not** hashed. Admitted `{key, version, contentHash}` **are**.
- Version policy default: last-write-wins; stale rejection configurable.
- Fixtures keyed by content hash for replay.

**Exit.** Two wall-clock completion orders, same admission ticks, same hashes. Failure/cancel appear as admitted outcomes, not thrown control flow.

---

## Milestone 4 — Network graph

- Peers, directional links, channels, tick-scheduled queues.
- Faults from `rng.network` only.
- Effective outcome recorded per message (deliver/delay/drop/dup/reorder/queue/reject/partition).
- Bandwidth + queue use native block/drop/error or wrappers (D7).
- Never deliver before due tick.
- Real-time pacing test: hashes unchanged vs fast mode.

**Exit.** Seed 42 + fixed profile, two runs, identical delivery traces and sim hashes. Partition isolates. Vary seed ⇒ different traces, each self-consistent.

---

## Milestone 5 — Frame + observability

- Frame graph receives frozen snapshots only. No `StateStore` handle.
- Adversarial mutation test: write to snapshot throws or is ignored; sim hash unchanged.
- Obs graph: one frame per tick when enabled. Split D5 halves. Metrics profile only (trace is v2).
- Enabling metrics must not change sim hashes.

**Exit.** Frame isolation + hash stability. Metrics-on === metrics-off for sim hash.

---

## Milestone 6 — Harness, modes, compose proof

- `defineScenario` / `run(scenario, mode)`.
- Modes: deterministicFast, realTimeObserved, replayVerify, faultInjection. Sweep: ≤3 axes, explicit budget. traceDiagnostic: stub or metrics-only.
- `tickBatch` compose helper. Overflow wrappers for drop-oldest / coalesce / reject / escalate / defer.
- Reference scenarios from the spec table that are in v1 (cycle, delayed feedback, stable run, latency/jitter/loss/dup/reorder/partition/backpressure, resource timing/stale/fail, frame isolation, snapshot immutability, replay match, replay diverge). Sweep and trace rows are thinner.
- Example composed with source/transform/branch/merge/sink, fan-in to admit, fan-out snapshot to frame/obs/replay.

**Exit.** Those scenarios pass. One scenario runs in fast, realtime, replay-verify, and fault-injection. Compose example is the architecture proof.

---

## Compose / runtime prerequisites (not this package)

Track in conveyor-graph / compose PRs; do not silently reimplement:

1. Handler brand checked before `wrapSimple`.
2. Async transform outputs not dropped (`emitFrom` / write await).
3. `applyErrorMode` window vs lifetime.
4. Drain/whenIdle used as the group barrier (already exists).

Mailbox inspect and freeze live here (D1/D2/D5).

---

## Determinism gates (every milestone)

- No `Date.now` / `Math.random` on hashed paths.
- No shared RNG cursor across domains.
- Object key insertion order must not affect hash (fixture).
- Obs incidental fields absent from hash.
- Deterministic driver never constructs timers.
- Overflow decisions under a fixed seed are stable.

---

## Risks

| Risk | Response |
| --- | --- |
| Multi-graph drain too slow | Benchmark 1000 ticks in M1. If needed, collapse publish+observe or reopen scoped execution. |
| Freeze dominates | Measured in M1; v2 structural sharing if needed. |
| Canonical bugs look like CI flakes | Golden fixtures + child_process + Node 20/22 in M0. |
| Mailbox leak | Cap + HWM in M1. |
| Compose bugs attributed to sim | Prerequisites list; M1 can use raw ConveyorGraph. |
| Real-time leak | Pacing isolated; grep test. |

---

## Suggested first PR

1. `canonical-v1` + SHA-256 + fixtures + child_process equality.
2. SplitMix64 + fork labels + serialized state.
3. TickClock + PhaseDriver with empty groups.
4. 1000 empty ticks test.

Stop there. Review D3 fixtures before any graph code.
