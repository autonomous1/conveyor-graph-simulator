# Review of the integrated spec + plan

Verdict: this is close enough to implement Milestone 0 against. A few new mechanisms are real improvements (tick 0, admit total order, commit-as-driver, mailbox-as-vertex, compose entry point). Several items still fight the current runtime or fight each other. Resolve the numbered issues below before Milestone 1 graphs; Milestone 0 can start once M0 exit ticks are restated.

---

## Accept

- Driver + four graphs; hash and advance stay driver-side.
- Commit as a driver window over a pending-changes bag. Matches authority better than a “commit vertex” that still runs inside event-driven execution.
- DelayedMailbox as the single delayed-delivery home; timing modes as mailbox idioms, not `EdgeOptions.timing`.
- Admit total order + sequence numbers in the artifact.
- Tick-failure records; abort before hash/advance.
- SplitMix64 forks owned by the driver and passed in graph context.
- Replay at admit ingress; framed canonical-v1; little-endian lengths.
- Overflow: native three + wrappers.
- `tickBatch` vs `conveyorBatch` kept as two primitives.
- `conveyorSimulator({ admit, simCore, publish, observe })` as the compose-facing surface.
- S01–S24 left alone.
- v1 cuts (trace, sweep >3 axes, topology rebuild, Immer, format migrate) still correct.

---

## Blockers (fix in the spec text before M1)

### B1. `drain()` is the wrong barrier primitive

Current `ConveyorGraph.drain()`:

- Sets `phase = "draining"`.
- Does **not** return the graph to an accepting phase.
- Uses `setTimeout` as its timeout.
- After drain, `assertAccepting` rejects new work.

That is shutdown, not “finish this tick.” Calling it four times per tick will kill the graph on tick 1.

**Lock:** per-tick group barriers use `whenIdle()` (or a new `quiesce()` that does not change `phase` and does not arm a wall timer). `drain()` stays for scenario teardown.

Prerequisite 4/5 should be rewritten around `whenIdle` / occupancy, not `drain`. The `while (hasWork()) await drain()` loop is invalid on today’s runtime.

`whenIdle()` today resolves when `occupancy() === 0`. Confirm occupancy includes in-flight vertex handlers, edge buffers, and mailbox holdings that live *inside* that graph. DelayedMailbox state that the driver drains *out of band* must not be counted as that graph’s occupancy, or admit will never go idle.

### B2. Barrier vertices vs idle is circular

“A barrier vertex releases only after the graph reports idle” cannot work if idle means “no pending items including items stuck behind the barrier.”

**Lock:** barriers are **driver-released**, not self-released.

```
driver feeds phase-A sources
await graph.whenIdle()          // phase A done; barrier still closed
driver.releaseBarrier(id)       // barrier emits held items into phase B
await graph.whenIdle()          // phase B done
```

That is two idles per group that has an internal barrier (admit: one barrier ⇒ two idles; sim-core: one ⇒ two; publish: one ⇒ two; observe: zero). Document the idle count. Do not hide it behind a vertex that waits on the same idle it prevents.

Fallback if this is too chatty: drop intra-group barrier vertices and have the **driver** inject the four admit kinds in order (external, then network, then resource, then mailbox), awaiting idle after each kind. That preserves logical phases 1–4 without a special vertex type. Prefer that for v1; it is simpler and matches “admit total order” already specified.

### B3. Hash-before / hash-after on *live* state is not isolation

Publish runs *after* commit. If the frame graph is handed the live store (even with top-level `Object.freeze`):

- Nested mutation succeeds in JS unless everything is frozen.
- Hash-after can detect it and throw.
- Authoritative state is **already corrupted** for tick n+1 unless the driver rolls back.

Detection ≠ protection. The original clone-then-freeze exists to keep the next tick clean.

**Lock:**

- Default deterministic/replay snapshot path: **structural clone**, then hand the clone to publish/observe. Live store is not shared.
- Integrity check: hash(store) before publish and after publish; they must match (proves publish did not reach the store). Cheap if publish only sees the clone.
- `snapshotProtection: "freeze"` deep-freezes the **clone** for adversarial tests.
- `snapshotProtection: "hash"` is clone + hash-before/after **without** deep-freeze of the clone (faster; misses in-place clone mutation that is discarded anyway).
- Never pass the live store into publish in deterministic or replay modes.

The “cheaper alternative” in the draft is only safe if it includes rollback (`store.restore(prePublishCanonical)`) on mismatch. If you want that mode, name it `snapshotProtection: "live-hash"` and treat mismatch as tick failure plus restore. Do not make it the default.

### B4. Network and resource graphs are missing from the four-graph driver

The draft names four executable graphs, then specifies a Resource Graph and a Network Graph as if they were peers. They have to live somewhere in the tick.

**Lock:**

```
0. Network scheduler tick (not a compose domain in the four-group list)
   - advances virtual links; enqueues due deliveries into the admit inbox
0b. Resource pending-queue harvest
   - completions that arrived in wall time since last tick become admit records
1. Admit graph (ordered kinds)
2. Sim-core
3. Publish
4. Observe
5. Hash
6. Advance
```

Network and resource are **scheduler modules** the driver runs *before* admit. They may internally use `ConveyorGraph` instances, but they are not the publish/observe pair and they do not get a post-commit snapshot unless we say so. v1: they do not.

Document this as six driver steps with two pre-admit schedulers + four graphs, or the architecture diagram is a lie.

### B5. Milestone 0 tick range contradicts tick-0 semantics

Tick 0 = initial checkpoint, first executed tick = 1. Then “1000 empty ticks produce ticks 0 through 999” is wrong.

**Lock:** M0 exit is:

- Clock starts at `0n`.
- Initial hash recorded at tick 0 without running graphs.
- `advance()` 1000 times yields current tick `1000n`.
- Hashes exist for checkpoints 0..1000 or for 0 plus 1000 empty advances — pick one and write it once.

Recommend: checkpoints at 0 and after each advance (1001 hashes for 1000 executed ticks).

### B6. `-0` policy is two policies

Draft: “`-0` must be encoded distinctly from `0`; the serializer must reject `-0` or encode it as a tagged value.”

Pick one.

**Lock:** reject `-0` on hashed paths (`Object.is(x, -0)`). Applications store a tagged field if they need the sign of zero. Distinct encoding is extra surface for no sim use case.

### B7. `bigint` in canonical state

Earlier lock: bigint illegal except tick as decimal string. New lock: tagged bigint allowed.

**Lock:** allow tagged bigint `{"$i":"-123"}` in canonical-v1. Tick may use the same tag or a dedicated `tick` decimal field; use one representation in the hashed document (`tick` as decimal string is enough; do not also wrap it as `$i`).

---

## Serious but not blocking M0

### W1. Context propagation is a compose prerequisite that does not exist

“Vertex reads `context.rng.sim`” and “`mountInline` must preserve context” invents a context object the runtime does not have. Vertices today are handlers `(item, handle) => …`.

v1 without waiting on compose: driver closes RNG into factory functions when building vertices (`makeSimVertex(ctx)`). `mountInline` preservation becomes real only when compose grows a context slot. Do not block M0–M1 on Prerequisite 6. Write factories with explicit `ctx` parameters.

### W2. Pending-changes bag vs event-driven vertices

If every sim vertex “proposes” into one collector vertex, you reintroduce intra-graph ordering: last writer wins only if proposals are totally ordered.

**Lock:** proposals carry `(path, seq, vertexId)` and apply in `(seq, vertexId)` order at `applyPendingChanges`. No silent last-physical-write. Document conflict policy: two proposals to the same path in one tick — last in that sort order wins, and obs increments a collision counter.

### W3. Mailbox as vertex *and* driver.drain(tick)

Keep both surfaces, but own the buffer in one place. Recommended: mailbox state lives in the driver module; the vertex is a thin enqueue adapter on sim-core output edges. `inspect()` and `drain(tick)` are driver methods. Avoid a vertex that holds the only copy of deferred work so occupancy/idle stay understandable (see B1).

### W4. `ConveyorGraph.drain` timer vs “driver must not construct timers”

Even if the driver never mentions `setTimeout`, calling `drain()` constructs one inside the runtime. Another reason to use `whenIdle()` plus an optional *test-only* deadline implemented with tick counts, not `timeoutMs`.

### W5. Error taps vs “must not swallow”

Compose `graph/error` and `emitFrom` catch paths exist so graphs do not die. Uniform abort-the-tick is a **driver policy**: domain graphs surface errors to the driver; the driver fails the tick. Do not require compose to stop catching. Require that caught errors are forwarded to `driver.failTick`, not dropped.

### W6. Counter determinism

“Increment in vertex-order fixed at construction” is weaker than needed if vertices run as items arrive. **Lock:** observe graph does not increment during sim execution. Driver, after each group idle, reads occupancy snapshots / mailbox stats / edge counters from the runtime subscriber API and writes the metric frame. That removes traversal-order from canonical counters. Matches “obs must not change scheduling.”

### W7. Public API vs four callbacks

`conveyorSimulator({ admit, simCore, publish, observe })` is good. Also accept prebuilt `ConveyorGraph` instances for M1 raw-vertex work so tests do not depend on compose.

### W8. 1000 ticks/sec on ≥20 vertices

Fine as a *measurement gate*, not an acceptance cliff. Record the number in M1. Do not fail the milestone if the machine is slow; fail if a trivial graph cannot beat a few hundred ticks/sec without I/O — that would mean the barrier design is wrong (B1/B2).

---

## Internal inconsistency in the draft’s own summary

The “preserved original decisions” list still says clone+deep-freeze as default for fast/replay. The “new decisions” list says hash-before/after is default. After B3, the document should say:

- Default: **clone** + hash-before/after on the **store**.
- Opt-in: deep-freeze the clone.
- Opt-in later: live-hash + rollback.

Update that summary so implementers do not pick the wrong default.

---

## Prerequisite list, rewritten

| # | Item | Blocks |
| --- | --- | --- |
| 1 | Handler brand before wrapSimple | Compose examples (M6), not M0–M1 raw vertices |
| 2 | Async transform output not dropped | Any async vertex in a `whenIdle` group |
| 3 | applyErrorMode window vs lifetime | Obs error counts |
| 4 | **`whenIdle` / occupancy quiescence without phase=draining** | M1 barriers |
| 5 | Occupancy includes in-flight handlers and edge buffers; excludes driver-owned mailbox | M1 |
| 6 | Context through mountInline | M6 only; use factory closures until then |
| 7 | HANDLE_BRAND robustness | Compose only |

Item 5 in the draft (`drain()` quiescence) is replaced by 4–5 here.

---

## What I would still cut from v1

- Intra-group barrier *vertices* (use driver-ordered inject + idle; W/B2).
- Live-store snapshot mode.
- Prerequisite 6 as a start-of-M1 blocker.
- Observe-graph self-instrumentation of canonical counters (W6).

Keep everything else in the integrated draft.

---

## Milestone 0 restated (this can be coded)

1. `canonical-v1` + SHA-256 + golden fixtures + illegal-value throws + `-0` reject + tagged bigint + UTF-8 key order including astral keys.
2. Child-process equality of canonical bytes.
3. SplitMix64 + four labeled forks + state in the hashed document.
4. `TickClock` `0n` start; `advance()` only; no timers in these modules.
5. `PhaseDriver` skeleton: ordered group functions, `whenIdle` placeholder, no graphs.
6. Grep test: those modules do not contain `setTimeout`/`setInterval`.
7. 1000 advances: tick ends at `1000n`; hash(tick, rng) stable in-process and in a child.

Do not implement mailbox, store, or graphs in that PR.
