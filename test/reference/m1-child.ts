import { createReferenceRuntime } from "../../src/reference/index.js";

const rt = createReferenceRuntime({ seed: 11n, initialState: { count: 0 } });
rt.start();
for (let i = 0; i < 8; i++) {
  rt.scheduleExternal(`e${i}`, { add: 1 });
  await rt.runTick();
}
process.stdout.write(JSON.stringify({ hashes: rt.hashes, count: rt.store.read(["count"]) }));
