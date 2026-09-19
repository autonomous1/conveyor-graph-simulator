import { Buffer } from "node:buffer";
import { CanonicalError, assertLegalNumber, isPlainObject } from "./illegal.js";

const HEX = "0123456789abcdef";

function hexByte(n: number): string {
  return HEX[(n >> 4) & 15]! + HEX[n & 15]!;
}

function formatNumber(value: number): string {
  assertLegalNumber(value);
  if (Number.isSafeInteger(value)) return String(value);
  return String(value);
}

function formatString(value: string): string {
  return JSON.stringify(value);
}

function compareUtf8Keys(a: string, b: string): number {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return Buffer.compare(ba, bb);
}

function serializeArray(value: unknown[]): string {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(value, i)) {
      throw new CanonicalError("canonical-v1 rejects sparse arrays");
    }
    parts.push(serializeValue(value[i]));
  }
  return `[${parts.join(",")}]`;
}

function serializeBytes(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += hexByte(bytes[i]!);
  return `{"$bytes":"${hex}"}`;
}

function serializeObject(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort(compareUtf8Keys);
  const parts: string[] = [];
  for (const key of keys) {
    const item = value[key];
    if (item === undefined) {
      throw new CanonicalError(`canonical-v1 rejects undefined at key ${key}`);
    }
    parts.push(`${formatString(key)}:${serializeValue(item)}`);
  }
  return `{${parts.join(",")}}`;
}

export function serializeValue(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return formatString(value as string);
  if (t === "number") return formatNumber(value as number);
  if (t === "bigint") return `{"$i":"${(value as bigint).toString(10)}"}`;
  if (t === "undefined") throw new CanonicalError("canonical-v1 rejects undefined");
  if (t === "function") throw new CanonicalError("canonical-v1 rejects functions");
  if (t === "symbol") throw new CanonicalError("canonical-v1 rejects symbols");
  if (t !== "object") throw new CanonicalError(`canonical-v1 rejects ${t}`);

  if (value instanceof Date) throw new CanonicalError("canonical-v1 rejects Date");
  if (value instanceof Map) throw new CanonicalError("canonical-v1 rejects Map");
  if (value instanceof Set) throw new CanonicalError("canonical-v1 rejects Set");
  if (Array.isArray(value)) return serializeArray(value);
  if (value instanceof Uint8Array) return serializeBytes(value);

  if (!isPlainObject(value as object)) {
    throw new CanonicalError("canonical-v1 rejects class instances");
  }
  return serializeObject(value as Record<string, unknown>);
}

/** UTF-8 bytes of the canonical-v1 text form. */
export function canonicalSerialize(value: unknown): Uint8Array {
  return Buffer.from(serializeValue(value), "utf8");
}

export function canonicalUtf8(value: unknown): string {
  return serializeValue(value);
}
