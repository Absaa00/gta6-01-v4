// SPDX-License-Identifier: MIT
// Solmar Bay — the city: seeded generation of blocks, buildings, beach,
// harbor, park, roads and props, plus the spatial queries the game needs
// (onRoad, building collision, nearest road point).

import { WORLD, PALETTE, PLACES } from './config.js';
import { makeRng, hash2 } from './random.js';

// A building: rectangle, height (for the shadow), colours, neon sign, roof props.
function makeBuilding(rng, x, y, w, h, district) {
  const tall = district === 'downtown' ? rng.chance(0.55) : rng.chance(0.12);
  const height = tall ? rng.int(26, 60) : rng.int(8, 24);
  return {
    x,
    y,
    w,
    h,
    height,
    color: rng.pick(PALETTE.building),
    roof: rng.pick(PALETTE.buildingRoof),
    neon: district === 'downtown' && rng.chance(0.45) ? rng.pick(PALETTE.neon) : null,
    windows: rng.int(2, 5),
    district,
  };
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const boats = [];
  const benches = [];

  const { avenues, streets } = WORLD;

  // District of a block, by its centre.
  function districtAt(cx, cy) {
    if (cx > 2350) return 'harbor';
    if (cy < 330 && cx > 900 && cx < 1500) return 'park';
    if (cx > 900 && cx < 1800 && cy > 600 && cy < 1500) return 'downtown';
    if (cy > 1500) return 'oldtown';
    if (cx < 500) return 'beachside';
    return 'uptown';
  }

  // Buildings fill every block between roads.
  for (let ai = 0; ai < avenues.length - 1; ai++) {
    for (let si = 0; si < streets.length - 1; si++) {
      const x0 = avenues[ai] + WORLD.roadHalf + 14;
      const x1 = avenues[ai + 1] - WORLD.roadHalf - 14;
      const y0 = streets[si] + WORLD.roadHalf + 14;
      const y1 = streets[si + 1] - WORLD.roadHalf - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (district === 'park') continue; // Palm Park is open green, no buildings
      if (district === 'harbor') continue; // docks and containers instead
      const bw = x1 - x0;
      const bh = y1 - y0;
      const cols = bw > 200 ? 2 : 1;
      const rows = bh > 200 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng.chance(0.12)) continue; // occasional empty lot / parking
          const bx = x0 + (c * bw) / cols + 6;
          const by = y0 + (r * bh) / rows + 6;
          const bwid = bw / cols - 12;
          const bhei = bh / rows - 12;
          buildings.push(makeBuilding(rng, bx, by, bwid, bhei, district));
        }
      }
      // A tree or two on quiet blocks.
      if (district !== 'downtown' && rng.chance(0.6)) {
        trees.push({ x: cx + rng.range(-60, 60), y: cy + rng.range(-60, 60), r: rng.range(9, 14) });
      }
    }
  }

  // Palm Park: pond, palms, benches, paths.
  const park = { x: 1020 + WORLD.roadHalf, y: 420 + WORLD.roadHalf, w: 300 - 2 * WORLD.roadHalf, h: 300 - 2 * WORLD.roadHalf };
  for (let i = 0; i < 14; i++) {
    trees.push({
      x: park.x + rng.range(16, park.w - 16),
      y: park.y + rng.range(16, park.h - 16),
      r: rng.range(9, 15),
      palm: rng.chance(0.6),
    });
  }
  for (let i = 0; i < 6; i++) {
    benches.push({ x: park.x + rng.range(30, park.w - 30), y: park.y + rng.range(30, park.h - 30) });
  }

  // Street lamps along every avenue/street intersection corner.
  for (const ax of avenues) {
    for (const sy of streets) {
      lamps.push({ x: ax + WORLD.roadHalf + 6, y: sy + WORLD.roadHalf + 6 });
    }
  }

  // Harbor: containers + boats in the water.
  for (let i = 0; i < 8; i++) {
    boats.push({
      x: 2610 + rng.range(0, 18),
      y: 200 + i * 210 + rng.range(-40, 40),
      len: rng.range(46, 80),
      color: rng.pick(['#e8e8e8', '#d8a04a', '#7a9cc6', '#c96a4a']),
    });
  }

  // Beach props: umbrellas and towels on the sand.
  const umbrellas = [];
  for (let i = 0; i < 10; i++) {
    umbrellas.push({
      x: rng.range(58, 92),
      y: rng.range(160, 1820),
      color: rng.pick(['#ff5a7a', '#3ae0ff', '#ffe14a', '#7aff5a']),
    });
  }

  return { buildings, trees, lamps, boats, benches, umbrellas, park, seed };
}

// ---- spatial queries -------------------------------------------------------

export function onRoad(x, y) {
  const { avenues, streets, roadHalf } = WORLD;
  for (const ax of avenues) if (Math.abs(x - ax) <= roadHalf) return true;
  for (const sy of streets) if (Math.abs(y - sy) <= roadHalf) return true;
  return false;
}

export function onSidewalk(x, y) {
  const { avenues, streets, roadHalf } = WORLD;
  const pad = 16;
  for (const ax of avenues) if (Math.abs(x - ax) <= roadHalf + pad) return true;
  for (const sy of streets) if (Math.abs(y - sy) <= roadHalf + pad) return true;
  return false;
}

export function inWater(x, y) {
  return x < 44 || x > 2596;
}

export function inPark(city, x, y) {
  const p = city.park;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

// Circle vs buildings: returns the building hit, or null.
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of buildings (simple axis-separated resolve).
export function resolveBuildings(city, p, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.y = cy + (dy / d) * r;
    } else if (d2 <= 0.01) {
      // centre inside the building: push out along the smallest overlap
      const left = p.x - b.x;
      const right = b.x + b.w - p.x;
      const top = p.y - b.y;
      const bot = b.y + b.h - p.y;
      const m = Math.min(left, right, top, bot);
      if (m === left) p.x = b.x - r;
      else if (m === right) p.x = b.x + b.w + r;
      else if (m === top) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    }
  }
}

// Nearest point on the road network to (x, y) — used to spawn traffic.
export function nearestRoadPoint(x, y) {
  const { avenues, streets } = WORLD;
  let best = null;
  let bestD = Infinity;
  for (const ax of avenues) {
    const d = Math.abs(x - ax);
    if (d < bestD) {
      bestD = d;
      best = { x: ax, y, vertical: true };
    }
  }
  for (const sy of streets) {
    const d = Math.abs(y - sy);
    if (d < bestD) {
      bestD = d;
      best = { x, y: sy, vertical: false };
    }
  }
  return best;
}

// Is this spot a road intersection (for traffic turning decisions)?
export function atIntersection(x, y, tol = 40) {
  const { avenues, streets } = WORLD;
  const nearA = avenues.some((ax) => Math.abs(x - ax) <= tol);
  const nearS = streets.some((sy) => Math.abs(y - sy) <= tol);
  return nearA && nearS;
}

// Day/night: hour 0-24 -> 0 = deep night, 1 = bright noon. Also a palette mix.
export function daylight(hour) {
  // sunrise 6, sunset 19; smooth sine ramp, peak at midday
  const t = (hour - 6) / 13; // 0 at 6:00, 1 at 19:00
  const clamped = Math.max(0, Math.min(1, t));
  const v = Math.sin(clamped * Math.PI);
  return 0.12 + 0.88 * v;
}

export function isNight(hour) {
  return hour < 6 || hour >= 19;
}

export function placeById(id) {
  return PLACES[id];
}

export { hash2 };
