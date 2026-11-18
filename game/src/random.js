// SPDX-License-Identifier: MIT
// Solmar Bay — seeded RNG (mulberry32) so the city, traffic and pedestrians
// are identical on every load. No Math.random in world generation.

// mulberry32: small, fast, deterministic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    // float in [min, max)
    range(min, max) {
      return min + next() * (max - min);
    },
    // integer in [min, max] inclusive
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // pick one element of an array
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // true with probability p
    chance(p) {
      return next() < p;
    },
  };
}

// Cheap hash of two integers, for per-cell variation without storing state.
export function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
