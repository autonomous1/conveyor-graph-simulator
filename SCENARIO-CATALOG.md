# conveyor-graph-simulator — Scenario Catalog

This catalog is the experiment plan for a **proof-by-experiment** package. It is not another “uppercase a string” stream demo. Every scenario exists to make a runtime contract observable: bounded edges, per-edge overflow policy, vertex concurrency, abort/timeout propagation, required vs best-effort traffic, and drain on shutdown.

Package boundary:

```
conveyor-graph-simulator
  Generic virtual-time / synthetic source and sink harness.
  No real sockets. Deterministic clocks, injectors, and collectors.

conveyor-graph-ssh-simulator   (sibling, later)
  Real network topology using ssh_tunnel_proxy.
  Real SSH client / relay / server paths, port allocation, credentials, cleanup.
```

The catalog is layered. **S-series** scenarios run on the generic harness and must pass without SSH. **T-series** scenarios reuse the same graph shapes against live tunnels. A scenario is accepted only when both the **claim** and the **observable** are recorded.

---

## 1. Why this package exists

`conveyor-graph` is an in-process conveyor: named vertices, bounded edges, backpressure, per-item routing, controlled fan-out, at-most-once delivery, no persistence. Those properties are easy to *state* and easy to hide behind a toy transform.

This package exists so a reviewer can watch them under load that looks like work:

```
generator
    ↓
conveyor-graph ingress
    ↓
classify / policy / encode
    ↓
SSH client tunnel A ──→ SSH relay/server ──→ target port
    ↓
response / event capture
    ↓
telemetry / audit / dashboard / fault injection
```

Multi-hop:

```
client agent
  → tunnel gateway A
  → relay B
  → remote test service
  → response collector
```

Fan-out topology:

```
simulated sources
  ├── direct local target
  ├── SSH tunnel A → target A
  ├── SSH tunnel B → relay → target B
  └── deliberately degraded / failed tunnel
             ↓
       metric and visualization path
```

What the experiments must demonstrate:

- Required traffic **backpressures** when a remote tunnel or service slows.
- Optional packet/trace samples can be **dropped** without delaying required traffic.
- Vertex **concurrency limits** protect tunnel creation and request dispatch.
- **Error routing** when tunnels disconnect or destinations reject work.
- **Timeout and abort** propagation.
- **Drain** during graceful shutdown.
- Queue buildup, peak occupancy, drop counts, and blocked duration on the Sankey / subscriber display.
- Route selection by endpoint, service type, tenant, message class, priority, or simulated link health.
- Policy comparison: **block vs drop vs error** under the same induced failure.

The simulator is separated from the runtime because it has heavier operational dependencies: clocks, injectors, fixtures, port allocation, credentials, cleanup, and integration-test timing. The runtime stays free of those.

---

## 2. Contract claims the catalog is allowed to prove

Mapped to `conveyor-graph` CONTRACT.md / README.

| Claim id | Runtime guarantee | How a scenario proves it |
|---|---|---|
| C1 | `capacity` is a strict queued-item limit on that edge | Peak occupancy never exceeds `capacity`; further items block, error, or drop per policy |
| C2 | Required edge must `block` or `error`; it cannot silently drop | Required path drop count stays 0 while a sink is stalled |
| C3 | Best-effort edge may drop only under its overflow policy; drops are counted | Optional sample path drop count rises; required path latency does not |
| C4 | `write()` admits now and returns pressure; `send()` waits for ingress admission only | Ingress wait time is measured separately from handler completion |
| C5 | Serial vertex starts handlers in arrival order; `parallel > 1` does not preserve order | Order probe on serial vs parallel tunnel-dispatch vertices |
| C6 | `fanout: "all"` clones envelopes; `fanout: "first"` uses first matching edge | Dual-target vs first-healthy-route scenarios |
| C7 | Payload is shared by reference | Mutation isolation probe (copy vs shared) |
| C8 | `drain()` is idle: no handlers, no buffers, no admission waiters | Shutdown scenarios assert drain before process exit |
| C9 | `stop()` refuses new input then drains; `stop({ force: true })` aborts cooperative handlers and pending `send()` | Graceful vs forced stop pair |
| C10 | At-most-once; no persistence; no recovery | Kill-mid-flight scenario shows in-flight agents gone |

Scenarios that only print “it ran” are rejected.

---

## 3. Harness roles (generic simulator)

These are **test fixtures**, not product vertices. They exist so graphs can be driven without SSH.

| Role | Responsibility |
|---|---|
| `source.clock` | Virtual time. Advances on command. Wall-clock tests are T-series only. |
| `source.generator` | Emits agents with tenant, class, priority, endpoint, size, deadline. |
| `source.burst` | Finite or periodic bursts with known inter-arrival. |
| `sink.blackhole` | Consumes and records. Configurable delay, reject rate, stall. |
| `sink.recorder` | Ordered capture of payload + edge/vertex events for assertions. |
| `fault.injector` | Delay, stall, reject, disconnect, jitter, packet-loss *signal* (not IP loss). |
| `metric.collector` | Occupancy, enqueue, drop, block-ms, handler-inflight, abort, timeout. |
| `viz.sankey-feed` | Snapshot stream for queue buildup / peak / drops / blocked duration. |
| `policy.router` | `when` predicates over endpoint, service, tenant, class, priority, link health. |
| `tunnel.fake` | In-process stand-in for a tunnel hop: connect budget, RTT, fail, close. |

S-series uses `tunnel.fake`. T-series replaces it with `ssh_tunnel_proxy` hops and keeps the same metric names.

---

## 4. Topology templates

Reusable graph shapes. Scenarios instantiate them with capacities, policies, and faults.

### TPL-LINEAR

```
gen → classify → encode → hop-A → target → capture → telemetry
```

Baseline path. One required edge chain.

### TPL-FANOUT-PRIORITY

```
gen → classify ┬─ required: hop-A → target-A → capture
               └─ best-effort: sample → trace-sink
```

Proves optional samples do not stall required work.

### TPL-MULTI-HOP

```
gen → classify → gw-A → relay-B → remote-svc → collector
```

Proves backpressure and abort travel the hop chain.

### TPL-MESH-HEALTH

```
gen → classify ┬─ local-direct
               ├─ tunnel-A → target-A
               ├─ tunnel-B → relay → target-B
               └─ tunnel-FAIL (degraded)
                    ↓
              metric / viz
```

Proves route selection and policy comparison.

### TPL-CONCURRENT-CONNECT

```
gen → dispatch[parallel=N] → tunnel-connect → request → capture
```

Proves vertex concurrency caps protect tunnel creation.

---

## 5. Scenario catalog — S-series (virtual time)

Each entry: **intent**, **template**, **knobs**, **fault**, **expect**, **metrics**, **claim**.

### S01 — Required path blocks when the sink stalls

- **Intent.** A required edge must not drop when the remote target stops consuming.
- **Template.** TPL-LINEAR
- **Knobs.** Edge `capacity=8`, `delivery=required`, overflow `block`. Generator rate > sink rate after stall.
- **Fault.** At t=T, `sink.blackhole` stall=∞.
- **Expect.** Ingress `write()` returns pressure / `send()` waits. Occupancy plateaus at 8. Drop count = 0 on the required edge. No silent loss.
- **Metrics.** `edge.occupancy.peak`, `edge.blocked_ms`, `edge.drops`, `ingress.wait_ms`.
- **Claims.** C1, C2, C4.

### S02 — Required path errors instead of blocking

- **Intent.** Same stall, overflow `error`. Admission fails closed rather than queuing forever.
- **Template.** TPL-LINEAR
- **Knobs.** `capacity=4`, required, overflow `error`.
- **Fault.** Sink stall.
- **Expect.** After occupancy=4, further items take the error route. Zero drops. Error count = surplus items.
- **Metrics.** `edge.errors`, `edge.drops=0`, routed-to-error vertex count.
- **Claims.** C1, C2.

### S03 — Best-effort samples drop; required traffic continues

- **Intent.** Optional traces may be shed so the required tunnel path stays live.
- **Template.** TPL-FANOUT-PRIORITY
- **Knobs.** Required edge cap 16 block; sample edge cap 4 drop.
- **Fault.** Sample sink 10× slower than required sink. No required-path stall.
- **Expect.** Sample `drops > 0`. Required path completion count = generated required count. Required p99 latency comparable to unloaded baseline.
- **Metrics.** Per-edge drops, required latency histogram, sample completeness %.
- **Claims.** C3, C6.

### S04 — Policy comparison under one induced failure

- **Intent.** Block vs drop vs error on **identical** load + fault.
- **Template.** TPL-LINEAR × 3 graphs (or 3 edges with different policies if the model allows isolated comparison runs).
- **Knobs.** Same capacity, same generator, same stall instant.
- **Fault.** Target reject or stall.
- **Expect.**
  - block: occupancy=cap, blocked_ms > 0, drops=0, completions resume after stall lifts.
  - drop: occupancy≤cap, drops=surplus, no resume of dropped items (at-most-once).
  - error: occupancy≤cap, errors=surplus, error vertex sees those agents.
- **Metrics.** Side-by-side table of occupancy / drops / errors / blocked_ms / completed.
- **Claims.** C1–C3, C10.

### S05 — Vertex concurrency caps tunnel-connect

- **Intent.** `parallel=K` on the connect vertex limits in-flight SSH-connect stand-ins.
- **Template.** TPL-CONCURRENT-CONNECT
- **Knobs.** `parallel=2`, connect handler virtual RTT=50 ticks, burst=20.
- **Fault.** None (load only).
- **Expect.** In-flight connect handlers never exceed 2. Arrival order is **not** preserved. Queue builds on the inbound edge, not unbounded thread/socket growth.
- **Metrics.** `vertex.inflight.peak`, completion order vs arrival order, edge occupancy.
- **Claims.** C5, C1.

### S06 — Serial connect preserves start order

- **Intent.** Control experiment for S05.
- **Template.** TPL-CONCURRENT-CONNECT with `parallel=1` (serial).
- **Expect.** Handler start order = arrival order. Throughput lower than S05.
- **Claims.** C5.

### S07 — Timeout aborts a hung hop and frees the edge

- **Intent.** A hung fake tunnel must not pin capacity forever.
- **Template.** TPL-MULTI-HOP
- **Knobs.** Per-agent deadline / abort signal. Hop-B hangs.
- **Fault.** `tunnel.fake` on relay-B never completes.
- **Expect.** Agent aborts at deadline. Downstream hops do not start after abort. Occupancy returns to 0. Subsequent agents can use the same edge.
- **Metrics.** `aborts`, `timeouts`, occupancy after deadline, completions after recovery.
- **Claims.** C8, C9 (cooperative abort), C1.

### S08 — Force stop aborts pending send and in-flight handlers

- **Intent.** `stop({ force: true })` vs graceful `stop()`.
- **Template.** TPL-LINEAR with mid-graph delay.
- **Fault.** None. Operator issues stop mid-burst.
- **Expect.**
  - graceful: no new ingress; in-flight finish; `drain()` idle.
  - force: pending `send()` rejects; cooperative handlers abort; then destroy.
- **Metrics.** post-stop ingress refusals, abort count, drain wall-time (virtual).
- **Claims.** C8, C9.

### S09 — Drain is actually idle

- **Intent.** `drain()` means no handlers, no vertex/edge buffers, no admission waiters.
- **Template.** TPL-FANOUT-PRIORITY
- **Knobs.** Finite generator (N known).
- **Expect.** After last completion, collector snapshot shows all occupancies 0, inflight 0, waiter count 0.
- **Claims.** C8.

### S10 — Route by tenant / class / priority

- **Intent.** `when` predicates pick edges.
- **Template.** TPL-MESH-HEALTH without faults.
- **Knobs.** Predicates on `payload.tenant`, `payload.class`, `payload.priority`.
- **Expect.** Each class lands only on its edge. Misroute count = 0.
- **Claims.** C6 (with model predicates).

### S11 — Route by simulated link health

- **Intent.** First-healthy vs fan-out-all.
- **Template.** TPL-MESH-HEALTH
- **Knobs.** `fanout: first` with health predicate; compare `fanout: all`.
- **Fault.** Mark tunnel-FAIL unhealthy. Optionally flap tunnel-B health.
- **Expect.** first: no agents on FAIL. all: FAIL still receives clones (and may drop/error per its policy).
- **Claims.** C6.

### S12 — Degraded hop backpressures the whole required chain

- **Intent.** Slow relay is not isolated; required upstream must feel it.
- **Template.** TPL-MULTI-HOP
- **Knobs.** All hops required, small capacities.
- **Fault.** relay-B delay ×20.
- **Expect.** Occupancy rises hop-by-hop toward generator. Ingress pressure appears. No drops on required edges.
- **Metrics.** Occupancy waterfall over virtual time (Sankey frames).
- **Claims.** C1, C2, C4.

### S13 — Encoder / classifier CPU budget vs IO hop

- **Intent.** A slow classify vertex is a different bottleneck than a slow hop.
- **Template.** TPL-LINEAR
- **Knobs.** classify `parallel=1` with heavy virtual work; hops fast.
- **Expect.** Queue sits on gen→classify, not on hop edges. Distinguishes vertex-limited from edge-limited.
- **Claims.** C1, C5.

### S14 — Shared payload mutation across fan-out

- **Intent.** Document the shared-by-reference contract so SSH encode steps copy when they must.
- **Template.** TPL-FANOUT-PRIORITY
- **Knobs.** Downstream A mutates `payload.headers`.
- **Expect.** Without copy, B sees mutation. With handler-local copy, B does not.
- **Claims.** C7.

### S15 — Peak occupancy, drops, blocked duration on Sankey feed

- **Intent.** Visualization path is a first-class consumer of subscriber snapshots, not a bolt-on.
- **Template.** TPL-MESH-HEALTH
- **Fault.** Mix of stall, drop, and healthy routes.
- **Expect.** Feed contains per-edge: enqueue, occupancy, peak, drops, blocked_ms. Frames are consistent with collector totals.
- **Claims.** observability of C1–C3.

### S16 — Queue buildup then recovery

- **Intent.** After a stall lifts, blocked required traffic drains in order on serial hops.
- **Template.** TPL-LINEAR
- **Fault.** Stall window [T0, T1], then full-speed sink.
- **Expect.** Occupancy rises to cap, blocked_ms accumulates, then occupancy falls to 0. Completions = generated (block policy). No duplicates.
- **Claims.** C1, C2, C8, C10.

### S17 — Destination reject routes to error vertex

- **Intent.** Application-level NACK from the target is not a silent drop.
- **Template.** TPL-LINEAR + error edge from hop-A.
- **Fault.** Target reject rate 30%.
- **Expect.** Rejected agents appear on error/audit path. Success path count + error path count = generated.
- **Claims.** C2, error routing.

### S18 — Generator pause on pressure (good citizen source)

- **Intent.** Sources that honor `write()` false / `send()` wait do not unbounded-buffer outside the graph.
- **Template.** TPL-LINEAR
- **Fault.** Sink stall.
- **Expect.** Generator-side unsent buffer stays ≤ 1 (or documented source window). Graph occupancy is the only backlog.
- **Claims.** C4.

### S19 — Burst vs sustained rate

- **Intent.** Capacity sized for burst, not average.
- **Template.** TPL-LINEAR
- **Knobs.** Burst of cap+K then idle; compare to sustained rate just under service rate.
- **Expect.** Burst under block policy: brief blocked_ms, no loss. Sustained overrate: perpetual pressure.
- **Claims.** C1, C2.

### S20 — Kill mid-flight (at-most-once, no recovery)

- **Intent.** Process death is loss. The simulator records that honestly.
- **Template.** Any
- **Fault.** Harness `crash()` while occupancy > 0.
- **Expect.** Restarted graph does not replay. In-flight count at crash is the loss number.
- **Claims.** C10.

---

## 6. Scenario catalog — T-series (real SSH / ssh_tunnel_proxy)

Same claims, live sockets. These belong in `conveyor-graph-ssh-simulator`. They consume the generic collector and scenario IDs so S and T results can be compared.

Operational requirements (package-level, not per scenario):

- ephemeral SSHD or fixture container
- allocated ports, known host keys, throwaway credentials
- `ssh_tunnel_proxy` client / relay / target processes
- teardown that kills children and frees ports even on test failure
- wall-clock timeouts with slack; no virtual time
- skip or quarantine when the host cannot bind or ssh is missing

### T01 — Direct local target (control)

- Linear graph to a local TCP echo/service **without** SSH.
- Proves fixtures and collectors work before tunnels are introduced.

### T02 — Single SSH client tunnel to target port

```
ingress → classify → encode → ssh-client-A → target → capture
```

- Expect: N request/response pairs complete. Occupancy stays below cap. No drops.

### T03 — Client → relay → target (multi-hop)

```
client agent → tunnel gateway A → relay B → remote test service → collector
```

- Expect: end-to-end completeness. Per-hop occupancy visible.

### T04 — Required traffic backpressures on a throttled tunnel

- Apply `ssh_tunnel_proxy` rate/window limit or a slow target.
- Expect: same signature as S01/S12: peak occupancy = cap, drops=0 on required edges, ingress pressure.

### T05 — Optional traces dropped under tunnel slowness

- Same as S03 on a real hop.
- Expect: sample drops > 0; required completions intact.

### T06 — Tunnel disconnect mid-batch

- Kill relay or close client channel after M successes.
- Expect: in-flight agents error-route; no hang past timeout; drain reachable after reconnect or stop.

### T07 — Destination port refused

- Point tunnel at a closed port.
- Expect: connect failures go to error vertex; required edge does not drop.

### T08 — Connect concurrency cap against real ssh

- Burst connect through a vertex with `parallel=2`.
- Expect: at most two simultaneous ssh client sessions from that vertex. Extra work queues on the inbound edge.

### T09 — Graceful drain while tunnels are open

- Finite workload, then `stop()`.
- Expect: no new ingress, in-flight replies collected, tunnels closed, `drain()` idle, no orphan ssh processes.

### T10 — Forced stop with open channels

- `stop({ force: true })` during inflight request.
- Expect: pending send aborted, handlers cooperative-abort, child processes reaped.

### T11 — Policy matrix on one broken hop

- Repeat S04 with the broken hop being a real tunnel.
- Expect: block / drop / error table matches S04 qualitatively (magnitudes differ; wall clock).

### T12 — Mixed mesh: local + good tunnel + failed tunnel

```
sources
  ├── direct local target
  ├── SSH tunnel A → target A
  ├── SSH tunnel B → relay → target B
  └── deliberately failed tunnel
```

- Route by endpoint and link health.
- Expect: failed tunnel receives nothing under `fanout: first` + health predicate; metric path still sees the failed edge’s zero-success / error counts.

### T13 — Link-health flap

- Periodically disable/enable tunnel B.
- Expect: first-match routing follows health; no required-path drops; brief error or block during flap window documented.

### T14 — Timeout vs slow SSH RTT

- Deadline shorter than induced RTT.
- Expect: abort, not completion. Capacity released.

### T15 — Cleanup invariant

- After every T-scenario: no listening ports left from the fixture, no sshd/child leaks, temp keys removed.
- This is a **meta-scenario** run as `afterEach` plus a dedicated soak.

---

## 7. Observables and assertion vocabulary

Keep names stable across S and T so Sankey and tests share one schema.

```
edge.<id>.enqueued
edge.<id>.dequeued
edge.<id>.occupancy
edge.<id>.occupancy_peak
edge.<id>.drops
edge.<id>.errors
edge.<id>.blocked_ms
vertex.<id>.inflight
vertex.<id>.inflight_peak
vertex.<id>.started
vertex.<id>.completed
vertex.<id>.aborted
vertex.<id>.timed_out
ingress.admitted
ingress.rejected
ingress.wait_ms
route.miscount
sink.completed
sink.rejected
harness.orphans          # T-series process/port leaks
```

Assertion style: **equality or inequality on counters**, not “looks fine.” Example:

```
assert.equal(required.drops, 0)
assert.equal(required.occupancy_peak, capacity)
assert.ok(sample.drops > 0)
assert.equal(sink.completed + error.completed, generated)
assert.equal(postDrain.occupancy_sum, 0)
```

---

## 8. Message classes used by generators

A small closed set so predicates stay readable.

| Field | Values | Role |
|---|---|---|
| `tenant` | `alpha`, `beta` | isolation / route |
| `class` | `command`, `event`, `trace`, `audit` | required vs best-effort |
| `priority` | `0..3` | first-match order |
| `endpoint` | `local`, `target-a`, `target-b`, `fail` | mesh selection |
| `service` | `echo`, `reject`, `slow` | destination behavior |
| `deadline_tick` | int | S-series timeout |
| `link_hint` | `healthy`, `degraded`, `down` | optional explicit health |

Default policy: `command` and `audit` are required; `trace` is best-effort drop; `event` is required unless marked sample.

---

## 9. Implementation order

Build the generic package first. Do not start SSH until S01–S04, S07–S09, and S15 pass.

1. Harness skeleton: virtual clock, generator, recorder, collector, fake tunnel.
2. S01, S02, S03, S04 — overflow policy matrix.
3. S05, S06 — concurrency and order.
4. S07, S08, S09 — abort, stop, drain.
5. S10–S12, S15, S16 — routing, waterfall, viz feed.
6. Remaining S-series.
7. Sibling `conveyor-graph-ssh-simulator`: fixtures + T01–T03.
8. T04–T15 against the same IDs and metric names.

Suggested package layout (generic):

```
conveyor-graph-simulator/
  SCENARIO-CATALOG.md          # this document
  src/
    harness/                   # clock, generator, collector, injector
    vertices/                  # fake tunnel, recorder, blackhole
    scenarios/                 # one module per S-id
    viz/                       # sankey-feed snapshot mapper
  test/
    s01-required-block.test.ts
    ...
```

SSH sibling stays out of this tree: credentials, port brokers, and integration timing must not leak into the virtual-time harness.

---

## 10. Acceptance

A scenario is done when:

1. It is named in this catalog with a stable id.
2. It states a contract claim from §2.
3. It records knobs, fault, expected counters, and metric names from §7.
4. A test fails if the claim is violated.
5. For T-series, teardown is asserted (`harness.orphans === 0`).

This package succeeds when someone can induce a slow or dead hop and *see* why bounded routing and per-edge policy exist — not merely that the API methods are present.
