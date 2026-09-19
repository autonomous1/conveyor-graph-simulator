import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const FRAME = 128;

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function xorBuffer(buf: Buffer, mask = 0x5a): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i++) out[i] ^= mask;
  return out;
}

export function catalogBytes(): Buffer {
  try {
    return readFileSync(join(here, "../SCENARIO-CATALOG.md"));
  } catch {
    return randomBytes(8 * 1024);
  }
}

export function randomPayload(bytes = 4096): Buffer {
  return randomBytes(bytes);
}

export function chunkCount(length: number, size = FRAME): number {
  return length === 0 ? 1 : Math.ceil(length / size);
}
