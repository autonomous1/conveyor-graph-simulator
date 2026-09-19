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

Profiles (`LinkProfile`) can set latency, jitter, drop, duplicate, reorder, and capacity. Call `useRng(new SplitMix64(seed))` before `send`. Payload hashing uses the reference canonical form; **do not** pass raw JS `bigint` graphs as payload—wrap ticks as strings if the payload is application JSON.

Named streams should stay separate: agent RNG vs network RNG. Changing drop probability must not change a world step that used a different stream.

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
