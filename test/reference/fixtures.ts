export const FIXTURE_DOC = {
  tick: "0",
  rng: {
    algo: "splitmix64",
    sim: "1",
    network: "2",
    resource: "3",
    overflow: "4",
  },
};

export const KEY_ORDER_A = { b: 1, a: 2 };
export const KEY_ORDER_B = { a: 2, b: 1 };
export const NESTED = { z: [1, { k: "𐍈", n: 0.1 + 0.2 }], m: { "$i": "no-tag-here" } };
export const BYTES = Uint8Array.from([0, 255, 16]);
export const BIG = 10n ** 20n;
export const ASTRAL = { "𐍈": 1, a: 2 };
export const LARGE_EXP = 1e21;
export const TINY = 5e-324;
