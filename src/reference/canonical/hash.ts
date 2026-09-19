import { createHash } from "node:crypto";
import { canonicalSerialize } from "./serialize.js";

/** Lowercase hex SHA-256 of canonical-v1 UTF-8 bytes. */
export function sha256CanonicalV1(value: unknown): string {
  return createHash("sha256").update(canonicalSerialize(value)).digest("hex");
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
