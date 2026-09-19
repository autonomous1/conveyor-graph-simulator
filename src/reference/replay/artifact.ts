import { Buffer } from "node:buffer";
import { canonicalSerialize, canonicalUtf8 } from "../canonical/serialize.js";
import { canonicalParse } from "../canonical/decode.js";
import { sha256CanonicalV1 } from "../canonical/hash.js";
import { CanonicalError } from "../canonical/illegal.js";
import type { AdmitKind, TickFailure } from "../types.js";

export const ARTIFACT_MAGIC = "CGR1";
export const ARTIFACT_VERSION = 1;

export interface ArtifactEvent {
  tick: string;
  seq: number;
  kind: AdmitKind;
  id: string;
  bodyHash: string;
  payload: unknown;
}

export interface ArtifactCheckpoint {
  tick: string;
  hash: string;
}

export interface ArtifactDocument {
  format: "canonical-v1";
  scenarioId: string;
  seed: string;
  dt: number;
  initialState: Record<string, unknown>;
  mailboxCapacity: number;
  topologyVersion: string;
  events: ArtifactEvent[];
  checkpoints: ArtifactCheckpoint[];
  failures: TickFailure[];
}

export class ArtifactFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactFormatError";
  }
}

export function encodeArtifact(doc: ArtifactDocument): Uint8Array {
  const body = canonicalSerialize(doc);
  const out = Buffer.alloc(12 + body.length);
  out.write(ARTIFACT_MAGIC, 0, 4, "ascii");
  out.writeUInt8(ARTIFACT_VERSION, 4);
  out.writeUInt8(0, 5);
  out.writeUInt16LE(0, 6);
  out.writeUInt32LE(body.length, 8);
  Buffer.from(body).copy(out, 12);
  return out;
}

export function decodeArtifact(bytes: Uint8Array): ArtifactDocument {
  const buf = Buffer.from(bytes);
  if (buf.length < 12) throw new ArtifactFormatError("artifact too short");
  const magic = buf.subarray(0, 4).toString("ascii");
  if (magic !== ARTIFACT_MAGIC) throw new ArtifactFormatError(`bad magic ${magic}`);
  const version = buf.readUInt8(4);
  if (version !== ARTIFACT_VERSION) throw new ArtifactFormatError(`unsupported version ${version}`);
  const bodyLen = buf.readUInt32LE(8);
  const body = buf.subarray(12, 12 + bodyLen);
  if (body.length !== bodyLen) throw new ArtifactFormatError("truncated body");
  const text = body.toString("utf8");
  let parsed: unknown;
  try {
    parsed = canonicalParse(text);
  } catch {
    throw new ArtifactFormatError("body is not JSON text");
  }
  if (!parsed || typeof parsed !== "object") throw new ArtifactFormatError("body is not an object");
  const doc = parsed as ArtifactDocument;
  if (doc.format !== "canonical-v1") throw new ArtifactFormatError("format must be canonical-v1");
  for (const event of doc.events ?? []) {
    const hash = sha256CanonicalV1(event.payload);
    if (hash !== event.bodyHash) {
      throw new ArtifactFormatError(`bodyHash mismatch for event ${event.id}`);
    }
  }
  return doc;
}

export function eventBodyHash(payload: unknown): string {
  return sha256CanonicalV1(payload);
}

export function artifactUtf8(doc: ArtifactDocument): string {
  try {
    return canonicalUtf8(doc);
  } catch (err) {
    if (err instanceof CanonicalError) throw err;
    throw err;
  }
}
