// Solmar Bay — the city: 6 districts, road grid, buildings, lamps, shops, parks.
// SPDX-License-Identifier: MIT

'use strict';

const WORLD = 3200;            // world is WORLD x WORLD pixels
const ROAD_SPACING = 400;      // roads every 400 px
const ROAD_HALF = 22;          // half road width
const ROAD_LINES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

/** The six districts of Solmar Bay, 3 across x 2 down. */
const DISTRICTS = [
  { name: 'Crestview Hills', x: 0, y: 0, w: 1066, h: 1600, tint: '#7fae7a', style: 'residential', neon: false },
  { name: 'Downtown Solmar', x: 1066, y: 0, w: 1068, h: 1600, tint: '#5a6b8a', style: 'downtown', neon: true },
  { name: 'Viceroy Heights', x: 2134, y: 0, w: 1066, h: 1600, tint: '#8a7a5a', style: 'midrise', neon: false },
  { name: 'Old Harbor', x: 0, y: 1600, w: 1066, h: 1600, tint: '#6b7a72', style: 'industrial', neon: false },
  { name: 'Marina Bay', x: 1066, y: 1600, w: 1068, h: 1600, tint: '#4a7a8a', style: 'marina', neon: true },
  { name: 'Palm Court', x: 2134, y: 1600, w: 1066, h: 1600, tint: '#7a9a6a', style: 'park', neon: false },
];

const PALETTES = {
  residential: ['#c9a37e', '#b98d6e', '#d9b48f', '#a98a72'],
  downtown: ['#3d4a63', '#4a5878', '#5b6b8c', '#33405c', '#6b5a7a'],
  midrise: ['#8a7a68', '#9a8a76', '#7a6a58', '#a08a6a'],
  industrial: ['#6e6a62', '#7a7468', '#5e5a52', '#8a7a5e'],
  marina: ['#4a6a7a', '#5a7a8a', '#3d5a6e', '#6a8a9a'],
  park: ['#9ab08a', '#a8b898', '#8aa07e'],
};

/** True when (x,y) is on a road (within ROAD_HALF of a road line). */
function onRoad(x, y) {
  for (const l of ROAD_LINES) {
    if (Math.abs(x - l) < ROAD_HALF || Math.abs(y - l) < ROAD_HALF) return true;
  }
  return false;
}

/** Nearest road line coordinate to v. */
function nearestRoad(v) {
  let best = ROAD_LINES[0], bd = 1e9;
  for (const l of ROAD_LINES) {
    const d = Math.abs(v - l);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

/** District containing (x,y). */
function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[1];
}

/** Build the whole static city once. Returns { buildings, lamps, trees, shops, parks, docks }. */
function buildCity() {
  const rng = makeRng(20261118);
  const buildings = [];
  const lamps = [];
  const trees = [];
  const parks = [];

  // Buildings fill every block between roads. Roads sit at 200+400k, so a block
  // runs from road edge +22 to the next road edge -22: x0 = 222+400k, width 356.
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 8; by++) {
      const x0 = bx * 400 + 222, y0 = by * 400 + 222;
      const bw = Math.min(356, WORLD - x0), bh = Math.min(356, WORLD - y0);
      const d = districtAt(x0 + 160, y0 + 160);
      // Palm Court's south-east blocks are parks, Old Harbor's south-west are docks.
      const isParkBlock = d.style === 'park' && rng() < 0.55;
      const isDockBlock = d.style === 'industrial' && by >= 6 && rng() < 0.6;
      if (isParkBlock) {
        parks.push({ x: x0, y: y0, w: Math.min(320, bw), h: Math.min(320, bh) });
        for (let t = 0; t < 9; t++) {
          trees.push({ x: x0 + 30 + rng() * Math.max(10, bw - 60), y: y0 + 30 + rng() * Math.max(10, bh - 60), r: 12 + rng() * 8 });
        }
        continue;
      }
      if (isDockBlock) {
        // Warehouses: long low sheds with container stacks.
        const ww = Math.min(300, bw - 20);
        buildings.push({
          x: x0 + 10, y: y0 + 40, w: ww, h: 90,
          hgt: 1, color: '#7a6a55', style: 'industrial', neon: false, roof: '#5e5346',
        });
        buildings.push({
          x: x0 + 10, y: y0 + 180, w: ww, h: 90,
          hgt: 1, color: '#6e5a48', style: 'industrial', neon: false, roof: '#564a3c',
        });
        continue;
      }
      const palette = PALETTES[d.style];
      const tall = d.style === 'downtown';
      const n = (bw >= 320 && bh >= 320) ? (tall ? (rng() < 0.5 ? 2 : 1) : (rng() < 0.4 ? 2 : 1)) : 1;
      if (n === 1) {
        const w = Math.min(200 + rng() * 100, bw - 20), h = Math.min(180 + rng() * 110, bh - 20);
        buildings.push({
          x: x0 + (bw - w) / 2, y: y0 + (bh - h) / 2, w, h,
          hgt: tall ? 3 + Math.floor(rng() * 5) : 1 + Math.floor(rng() * 2),
          color: pick(rng, palette), style: d.style,
          neon: d.neon && rng() < 0.6, roof: '#2e3440',
        });
      } else {
        buildings.push({
          x: x0 + 8, y: y0 + 20, w: 140, h: 130,
          hgt: tall ? 2 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2),
          color: pick(rng, palette), style: d.style,
          neon: d.neon && rng() < 0.5, roof: '#2e3440',
        });
        buildings.push({
          x: x0 + 172, y: y0 + 170, w: 140, h: 130,
          hgt: tall ? 2 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2),
          color: pick(rng, palette), style: d.style,
          neon: d.neon && rng() < 0.5, roof: '#2e3440',
        });
      }
      if (d.style === 'residential' || d.style === 'park') {
        for (let t = 0; t < 3; t++) {
          trees.push({ x: x0 + 20 + rng() * Math.max(10, bw - 40), y: y0 + 20 + rng() * Math.max(10, bh - 40), r: 10 + rng() * 7 });
        }
      }
    }
  }

  // Street lamps along every road, both sides, every 200 px.
  for (const l of ROAD_LINES) {
    for (let v = 100; v < WORLD; v += 200) {
      lamps.push({ x: l - ROAD_HALF - 6, y: v });
      lamps.push({ x: v, y: l - ROAD_HALF - 6 });
    }
  }

  // Landmark shops and mission spots (inside blocks, just off the roads).
  const shops = [
    { kind: 'gun', name: 'Harbor Arms', x: 1430, y: 640, w: 90, h: 70, color: '#8a4a3a', label: 'GUN SHOP', price: 60, desc: 'Ammo $60' },
    { kind: 'garage', name: 'Rico\'s Garage', x: 2230, y: 1430, w: 100, h: 80, color: '#3a6a8a', label: 'GARAGE', price: 80, desc: 'Repair $80' },
    { kind: 'spray', name: 'Solmar Spray', x: 630, y: 2230, w: 100, h: 80, color: '#7a5a9a', label: 'SPRAY SHOP', price: 150, desc: 'Lose cops $150' },
    { kind: 'gun', name: 'Viceroy Guns', x: 2630, y: 630, w: 90, h: 70, color: '#8a4a3a', label: 'GUN SHOP', price: 60, desc: 'Ammo $60' },
    { kind: 'garage', name: 'Bay Motors', x: 1030, y: 2630, w: 100, h: 80, color: '#3a6a8a', label: 'GARAGE', price: 80, desc: 'Repair $80' },
  ];
  // Mission landmarks.
  const bank = { x: 1430, y: 2230, w: 130, h: 100, color: '#c9b06a', label: 'MARINA BANK' };
  const docks = { x: 230, y: 3030, w: 160, h: 90, color: '#5a6a5a', label: 'DOCKS' };
  const marina = { x: 1830, y: 2630, w: 150, h: 90, color: '#4a8a9a', label: 'MARINA' };

  return { buildings, lamps, trees, parks, shops, bank, docks, marina };
}

/** Circle-vs-buildings collision: returns the building hit, or null. */
function buildingAt(buildings, x, y, r) {
  for (const b of buildings) {
    if (circleHitsRect(x, y, r, b.x, b.y, b.w, b.h)) return b;
  }
  return null;
}

/** Push a circle out of buildings; returns true when a push happened. */
function resolveBuildingCollision(buildings, ent, r) {
  const b = buildingAt(buildings, ent.x, ent.y, r);
  if (!b) return false;
  // Push out along the smallest penetration axis.
  const cx = clamp(ent.x, b.x, b.x + b.w), cy = clamp(ent.y, b.y, b.y + b.h);
  const dx = ent.x - cx, dy = ent.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) ent.x = dx > 0 ? b.x + b.w + r : b.x - r;
  else ent.y = dy > 0 ? b.y + b.h + r : b.y - r;
  return true;
}
