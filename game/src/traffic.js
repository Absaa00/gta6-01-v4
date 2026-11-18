// Solmar Bay — traffic: 30 cars on the road grid, 52 pedestrians on foot.
// SPDX-License-Identifier: MIT

'use strict';

const CAR_TYPES = [
  { key: 'sedan', name: 'Sedan', w: 46, h: 22, top: 150, accel: 420, colors: ['#c94a4a', '#4a6ac9', '#c9c9c9', '#4ac94a', '#d9a44a'] },
  { key: 'taxi', name: 'Taxi', w: 46, h: 22, top: 140, accel: 420, colors: ['#e8c832'] },
  { key: 'sport', name: 'Sport', w: 48, h: 20, top: 240, accel: 620, colors: ['#d92b2b', '#2b6ad9', '#e8e832'] },
  { key: 'van', name: 'Van', w: 54, h: 24, top: 120, accel: 320, colors: ['#8a8a8a', '#6a4a8a', '#4a8a6a'] },
  { key: 'truck', name: 'Truck', w: 64, h: 26, top: 95, accel: 260, colors: ['#7a5a3a', '#5a6a7a', '#9a9a9a'] },
];

const CAR_COLORS_BY_TYPE = {};
for (const t of CAR_TYPES) CAR_COLORS_BY_TYPE[t.key] = t.colors;

/** A traffic car: drives its road lane, turns at intersections, brakes for trouble. */
class TrafficCar {
  constructor(rng, id) {
    this.id = id;
    const type = pick(rng, CAR_TYPES);
    this.type = type.key;
    this.spec = type;
    this.color = pick(rng, type.colors);
    // Start on a random road, random lane side.
    this.axis = rng() < 0.5 ? 'x' : 'y';
    this.road = pick(rng, ROAD_LINES);
    this.lane = (rng() < 0.5 ? -1 : 1) * 11;
    this.dir = rng() < 0.5 ? 1 : -1;
    if (this.axis === 'x') {
      this.x = randRange(rng, 100, WORLD - 100);
      this.y = this.road + this.lane;
    } else {
      this.x = this.road + this.lane;
      this.y = randRange(rng, 100, WORLD - 100);
    }
    this.angle = this.axis === 'x' ? (this.dir > 0 ? 0 : Math.PI) : (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.speed = randRange(rng, 40, this.spec.top * 0.7);
    this.hp = 100;
    this.smoke = 0;
    this.dead = false;
    this.brake = false;
  }

  /** True when another car is directly ahead within `gap`. */
  _carAhead(cars, gap) {
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    for (const c of cars) {
      if (c === this || c.dead) continue;
      const dx = c.x - this.x, dy = c.y - this.y;
      const along = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (along > 0 && along < gap && side < 30) return true;
    }
    return false;
  }

  update(dt, cars, peds, player, gunfireAt) {
    if (this.dead || this.parked || this.driven) return;
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    // Brake for the player / pedestrians / cars ahead.
    let wantBrake = this._carAhead(cars, 90);
    if (!wantBrake) {
      for (const p of peds) {
        const dx = p.x - this.x, dy = p.y - this.y;
        const along = dx * fx + dy * fy;
        const side = Math.abs(dx * -fy + dy * fx);
        if (along > 0 && along < 70 && side < 26) { wantBrake = true; break; }
      }
    }
    if (!wantBrake && player && player.inCar !== this) {
      const dx = player.x - this.x, dy = player.y - this.y;
      const along = dx * fx + dy * fy;
      const side = Math.abs(dx * -fy + dy * fx);
      if (along > 0 && along < 80 && side < 30) wantBrake = true;
    }
    this.brake = wantBrake;
    const target = wantBrake ? 0 : this.spec.top * (0.55 + 0.3 * Math.sin(this.id * 1.7));
    this.speed += clamp(target - this.speed, -520 * dt, this.spec.accel * dt);
    this.x += fx * this.speed * dt;
    this.y += fy * this.speed * dt;

    // At an intersection, sometimes turn onto the crossing road.
    const nearLine = nearestRoad(this.axis === 'x' ? this.x : this.y);
    const along = this.axis === 'x' ? this.x : this.y;
    if (Math.abs(along - nearLine) < 4 && this.speed > 20) {
      if (Math.random() < 0.35) {
        const turn = Math.random() < 0.5 ? 1 : -1;
        const cross = this.axis === 'x' ? this.y : this.x;
        const crossLine = nearestRoad(cross);
        if (Math.abs(cross - crossLine) < ROAD_HALF) {
          // Snap onto the crossing road and keep going.
          if (this.axis === 'x') {
            this.y = crossLine + this.lane * (turn > 0 ? 1 : -1) * 0;
            this.axis = 'y';
            this.dir = turn;
            this.angle = turn > 0 ? Math.PI / 2 : -Math.PI / 2;
            this.y = crossLine + this.lane;
          } else {
            this.axis = 'x';
            this.dir = turn;
            this.angle = turn > 0 ? 0 : Math.PI;
            this.x = crossLine + this.lane;
          }
        }
      }
    }
    // Wrap around the world edge so traffic never runs out.
    if (this.x < 40) { this.x = WORLD - 40; }
    if (this.x > WORLD - 40) { this.x = 40; }
    if (this.y < 40) { this.y = WORLD - 40; }
    if (this.y > WORLD - 40) { this.y = 40; }
    if (this.hp <= 0 && !this.dead) { this.dead = true; this.smoke = 1; }
  }
}

/** A pedestrian: strolls the sidewalks, flees gunfire, waits at crossings. */
class Pedestrian {
  constructor(rng, id) {
    this.id = id;
    this.road = pick(rng, ROAD_LINES);
    this.axis = rng() < 0.5 ? 'x' : 'y';
    this.side = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 6);
    const along = randRange(rng, 80, WORLD - 80);
    if (this.axis === 'x') { this.x = along; this.y = this.road + this.side; }
    else { this.x = this.road + this.side; this.y = along; }
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = randRange(rng, 28, 55);
    this.flee = 0;
    this.fleeX = 0; this.fleeY = 0;
    this.color = pick(rng, ['#d94a7a', '#4ad9c9', '#d9a44a', '#7a4ad9', '#c9c9c9', '#4a9ad9', '#e88a4a']);
    this.skin = pick(rng, ['#e8c39a', '#c98a5a', '#8a5a3a', '#f0d0b0']);
    this.phase = rng() * Math.PI * 2;
  }

  scare(x, y) {
    this.flee = 3 + Math.random() * 2;
    this.fleeX = x; this.fleeY = y;
  }

  update(dt, buildings) {
    let vx = 0, vy = 0;
    if (this.flee > 0) {
      this.flee -= dt;
      const a = angleTo(this.fleeX, this.fleeY, this.x, this.y);
      vx = Math.cos(a) * 130; vy = Math.sin(a) * 130;
    } else {
      if (this.axis === 'x') vx = this.dir * this.speed;
      else vy = this.dir * this.speed;
    }
    const nx = this.x + vx * dt, ny = this.y + vy * dt;
    if (!buildingAt(buildings, nx, ny, 8)) { this.x = nx; this.y = ny; }
    this.phase += dt * (this.flee > 0 ? 14 : 7);
    // Turn around at the world edge.
    if (this.x < 60 || this.x > WORLD - 60 || this.y < 60 || this.y > WORLD - 60) {
      this.dir *= -1;
      this.x = clamp(this.x, 60, WORLD - 60);
      this.y = clamp(this.y, 60, WORLD - 60);
    }
  }
}

/** Owns all traffic cars and pedestrians. */
class Traffic {
  constructor() {
    const rng = makeRng(777);
    this.cars = [];
    for (let i = 0; i < 30; i++) this.cars.push(new TrafficCar(rng, i));
    this.peds = [];
    for (let i = 0; i < 52; i++) this.peds.push(new Pedestrian(rng, i));
  }

  /** All peds within r of (x,y) flee from it. */
  scarePeds(x, y, r) {
    for (const p of this.peds) {
      if (dist2(p.x, p.y, x, y) < r * r) p.scare(x, y);
    }
  }

  /** Nearest drivable car to (x,y) within range, or null. */
  nearestCar(x, y, range) {
    let best = null, bd = range * range;
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = dist2(c.x, c.y, x, y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt, buildings, player) {
    for (const c of this.cars) c.update(dt, this.cars, this.peds, player, null);
    for (const p of this.peds) p.update(dt, buildings);
  }
}
