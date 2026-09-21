# conveyor-graph-simulator

Virtual-time harness and reference networking for [`conveyor-graph`](https://www.npmjs.com/package/conveyor-graph).

Use this package to drive graphs on a **synthetic clock**, collect occupancy metrics, inject stalls, and schedule messages with deterministic faults. It does not replace `ConveyorGraph` and it does not own game or renderer state.

License: ISC. Peer: `conveyor-graph` >= 0.1.0.

## Install

```bash
npm install conveyor-graph conveyor-graph-simulator
```

## Entry points

| Import | Role |
| --- | --- |
| `conveyor-graph-simulator` | Clock, metric collector, burst generator, fixture graphs |
| `conveyor-graph-simulator/reference` | Scenario runner, `NetworkScheduler`, SplitMix64, canonical hash |

## Harness (`conveyor-graph-simulator`)

```ts
import { VirtualClock, MetricCollector, BurstGenerator } from "conveyor-graph-simulator";
```

- `VirtualClock` / `wallWait` — advance or wait without coupling tests to wall time
- `snapshotVertex` / `snapshotEdge` / `snapshotGraph` / `MetricCollector` — occupancy and queue views
- `BurstGenerator` — synthetic ingress
- `StallableSink` / `FakeTunnel` — backpressure and lossy links in-process
- Fixture topologies: `linearRequired`, `fanoutPriority`, `concurrentConnect`, `multiHop`, `meshHealth`

## Reference (`conveyor-graph-simulator/reference`)

```ts
import {
  NetworkScheduler,
  SplitMix64,
  defineScenario,
  run,
} from "conveyor-graph-simulator/reference";
```

`NetworkScheduler` is the virtual transport:

```text
send(spec) → drop | delay | deliver | partition | reject
tick(due)  → messages whose dueTick ≤ due
```

Profiles (`LinkProfile`) can set latency, jitter, drop, duplicate, reorder, and capacity. Call `useRng(new SplitMix64(seed))` before `send`, or `useNetworkRng` with separate drop/dup/reorder/jitter streams. Payload hashing uses the reference canonical form; **do not** pass raw JS `bigint` graphs as payload—wrap ticks as strings if the payload is application JSON.

`dropPerU64` / `dupPerU64` / `reorderPerU64` are raw thresholds against `nextU64()`, not “1 in N”. Probability is `threshold / 2^64` (`1n << 63n` is 50%). Use `perU64FromProbability`.

Named streams stay separate: `sim`, `resource`, `overflow`, and `network.drop` / `network.dup` / `network.reorder` / `network.jitter`. Enabling drop does not consume jitter or reorder draws. The envelope hash includes the full RNG snapshot, so two runs that reach the same store state with different draw counts hash differently.

`NetworkScheduler.bodies` holds payloads only while a pending (or duplicate) message still references them; `tick` releases the body after the last delivery.

`StateStore.read` returns the live committed node. Do not cache it across `apply`.

Handler throws in the default vertex wrapper abort the tick (`TickAbortedError`). They do not route to `graph/error`.

Admit validates first and gates sim: an event whose admit step records `ctx.fail` is not sent into sim.

## Scripts

```bash
npm test
npm run test:reference
npm run typecheck
npm run build
```

## Design notes

Longer notes live in this repo (not required to use the API):

- `SPEC-DECISIONS.md`
- `SCENARIO-CATALOG.md`
- `IMPLEMENTATION-PLAN.md`

## Related

- **conveyor-graph** — the runtime being driven
- **conveyor-graph-compose** — topology helpers on that runtime
- **conveyor-engine-*** — uses `NetworkScheduler` on the live snapshot path; engine packages are separate repositories
