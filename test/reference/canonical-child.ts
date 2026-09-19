import { sha256CanonicalV1 } from "../../src/reference/index.js";
import { KEY_ORDER_A, NESTED, BYTES, ASTRAL, FIXTURE_DOC } from "./fixtures.js";

const docs = {
  keys: KEY_ORDER_A,
  nested: NESTED,
  bytes: BYTES,
  astral: ASTRAL,
  envelope: FIXTURE_DOC,
};

const out: Record<string, string> = {};
for (const [k, v] of Object.entries(docs)) out[k] = sha256CanonicalV1(v);
process.stdout.write(JSON.stringify(out));
