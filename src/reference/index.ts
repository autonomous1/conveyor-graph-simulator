export { CanonicalError } from "./canonical/illegal.js";
export { canonicalSerialize, canonicalUtf8, serializeValue } from "./canonical/serialize.js";
export { sha256CanonicalV1, sha256Bytes } from "./canonical/hash.js";
export { SplitMix64, mix64, toU64, labelMix } from "./rng/splitmix64.js";
export { RootRng, createRootRng, RNG_LABELS, type RngLabel, type RngSnapshot } from "./rng/streams.js";
export { TickClock, type TickClockOptions } from "./clock/TickClock.js";
export { PhaseDriver, GROUP_ORDER, type GroupName, type GroupFn } from "./driver/PhaseDriver.js";
export { StateStore, CommitWindowError } from "./authority/StateStore.js";
export { DelayedMailbox, MailboxOverflowError } from "./mailbox/DelayedMailbox.js";
export { assertNoImmediateCycles, ImmediateCycleError } from "./simulation/cycles.js";
export { ReferenceRuntime, createReferenceRuntime, type ReferenceRuntimeOptions } from "./runtime/ReferenceRuntime.js";
export { PhaseDidNotQuiesce, TickAbortedError } from "./runtime/errors.js";
export type {
  AdmitKind,
  AdmitEvent,
  PendingChange,
  MailboxItem,
  MailboxPolicy,
  MailboxStats,
  TickFailure,
  RuntimeContext,
} from "./types.js";
export {
  encodeArtifact,
  decodeArtifact,
  eventBodyHash,
  ARTIFACT_MAGIC,
  ARTIFACT_VERSION,
  ArtifactFormatError,
} from "./replay/artifact.js";
export type { ArtifactDocument, ArtifactEvent, ArtifactCheckpoint } from "./replay/artifact.js";
export { Recorder } from "./replay/Recorder.js";
export type { RecorderHeader } from "./replay/Recorder.js";
export { recordRun, replayRun } from "./replay/Player.js";
export { verifyReplay } from "./replay/verify.js";
export { ResourceScheduler } from "./resource/ResourceScheduler.js";
export type {
  ResourceOutcome,
  ResourceIdentity,
  ResourceAdmitPayload,
  ResourceRecord,
  ResourceComplete,
} from "./resource/types.js";
export { NetworkScheduler } from "./network/NetworkScheduler.js";
export type { LinkProfile, NetOutcome, NetMessage, NetAdmitPayload, NetDecision, NetSendSpec } from "./network/types.js";
export { deepFreeze } from "./authority/freeze.js";
export { assembleObsFrame } from "./frame/assemble.js";
export type { ObsFrame, ObsCanonical, FrameInput, SnapshotProtection } from "./frame/types.js";
export type { VerifyReport } from "./replay/verify.js";
export { defineScenario, type Scenario, type Mode } from "./scenario/define.js";
export { run, type RunResult } from "./scenario/run.js";
export { catalog, stableCounter, delayedFeedback } from "./scenario/catalog.js";
export { conveyorSimulator } from "./compose/simulator.js";
export { tickBatch } from "./compose/tickBatch.js";
export { dropOldest, coalesce, rejectIfFull, deferTo } from "./compose/overflow.js";
export { sleepMs, paceTick } from "./modes/realTime.js";
