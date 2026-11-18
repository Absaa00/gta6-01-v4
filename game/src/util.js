// Solmar Bay — shared helpers: seeded random, math, collision.
// SPDX-License-Identifier: MIT

'use strict';

/** Deterministic RNG (mulberry32) so the city layout is stable every load. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
/** Shortest signed turn from angle a toward b. */
const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);

/** Circle vs axis-aligned rect overlap test. */
function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) < r * r;
}

/** Format dollars as $1,250. */
function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
