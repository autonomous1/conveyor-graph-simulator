import type { AdmitEvent } from "../types.js";
import type { ArtifactCheckpoint, ArtifactDocument, ArtifactEvent } from "./artifact.js";
import { eventBodyHash } from "./artifact.js";
import type { TickFailure } from "../types.js";

export interface RecorderHeader {
  scenarioId?: string;
  seed: string;
  dt: number;
  initialState: Record<string, unknown>;
  mailboxCapacity: number;
  topologyVersion?: string;
}

export class Recorder {
  #header: RecorderHeader | null = null;
  readonly events: ArtifactEvent[] = [];
  readonly checkpoints: ArtifactCheckpoint[] = [];
  readonly failures: TickFailure[] = [];

  header(header: RecorderHeader): void {
    this.#header = header;
  }

  admit(tick: bigint, event: AdmitEvent): void {
    if (event.kind === "mailbox") return;
    this.events.push({
      tick: tick.toString(10),
      seq: event.seq,
      kind: event.kind,
      id: event.id,
      payload: event.payload,
      bodyHash: eventBodyHash(event.payload),
    });
  }

  checkpoint(tick: string, hash: string): void {
    this.checkpoints.push({ tick, hash });
  }

  failure(failure: TickFailure): void {
    this.failures.push(failure);
  }

  document(): ArtifactDocument {
    if (!this.#header) throw new Error("Recorder.header was not called");
    return {
      format: "canonical-v1",
      scenarioId: this.#header.scenarioId ?? "default",
      seed: this.#header.seed,
      dt: this.#header.dt,
      initialState: this.#header.initialState,
      mailboxCapacity: this.#header.mailboxCapacity,
      topologyVersion: this.#header.topologyVersion ?? "m1-static",
      events: this.events,
      checkpoints: this.checkpoints,
      failures: this.failures,
    };
  }
}
