// SPDX-License-Identifier: MIT
// Solmar Bay — entities: the player (on foot and driving), traffic cars,
// pedestrians, police (cruisers, foot cops, helicopter), thugs, bullets,
// pickups, the taxi job and the wanted system.

import { WORLD, VEHICLES, PALETTE, TUNE, PLACES } from './config.js';
import { makeRng } from './random.js';
import { onRoad, inWater, resolveBuildings, nearestRoadPoint, atIntersection } from './world.js';

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    hp: TUNE.playerHp, cash: 0, ammo: 12,
    inCar: null, // the traffic/police car object the player drives, or null
    punchCooldown: 0, shootCooldown: 0, invuln: 0,
    moving: false, running: false,
  };
}

function makeTrafficCar(rng, kind, x, y, angle) {
  const spec = VEHICLES[kind];
  return {
    kind, x, y, angle,
    speed: rng.range(60, 130),
    targetSpeed: rng.range(70, 130),
    color: kind === 'taxi' ? PALETTE.taxi : rng.pick(PALETTE.car),
    spec,
    hp: spec.hp,
    wrecked: false,
    honk: 0,
    // traffic AI: follows its road; at intersections sometimes turns
    dir: rng.chance(0.5) ? 1 : -1,
    stuck: 0,
  };
}

export function spawnTraffic(rng, count, nearX, nearY) {
  const cars = [];
  const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'van', 'truck'];
  let guard = 0;
  while (cars.length < count && guard++ < count * 40) {
    const x = nearX + rng.range(-900, 900);
    const y = nearY + rng.range(-700, 700);
    if (!onRoad(x, y) || inWater(x, y)) continue;
    const road = nearestRoadPoint(x, y);
    const angle = road.vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const kind = rng.pick(kinds);
    const car = makeTrafficCar(rng, kind, road.x + (road.vertical ? rng.range(-14, 14) : 0), road.y + (road.vertical ? 0 : rng.range(-14, 14)), angle);
    if (cars.some((c) => Math.hypot(c.x - car.x, c.y - car.y) < 90)) continue;
    cars.push(car);
  }
  return cars;
}

export function spawnPedestrians(rng, count, nearX, nearY) {
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard++ < count * 40) {
    const x = nearX + rng.range(-900, 900);
    const y = nearY + rng.range(-700, 700);
    if (inWater(x, y)) continue;
    if (onRoad(x, y) && !rng.chance(0.25)) continue; // most peds stay on sidewalks
    peds.push({
      x, y,
      angle: rng.range(0, Math.PI * 2),
      speed: rng.range(18, 42),
      shirt: rng.pick(PALETTE.pedShirt),
      skin: rng.pick(PALETTE.pedSkin),
      hair: rng.pick(['#2a2a2a', '#6a4a2a', '#c8c8c8', '#8a5a2a', '#d8a04a']),
      flee: 0, // seconds of panic
      dead: false,
      wander: rng.range(2, 6),
    });
  }
  return peds;
}

// ---- player movement -------------------------------------------------------

export function updatePlayerOnFoot(p, input, dt, city) {
  const ax = input.axis();
  const mag = Math.hypot(ax.x, ax.y);
  p.running = input.isDown('run');
  const speed = p.running ? 235 : 140;
  p.moving = mag > 0;
  if (mag > 0) {
    const nx = ax.x / mag;
    const ny = ax.y / mag;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.angle = Math.atan2(ny, nx);
  }
  p.x = Math.max(30, Math.min(WORLD.w - 30, p.x));
  p.y = Math.max(30, Math.min(WORLD.h - 30, p.y));
  if (inWater(p.x, p.y)) {
    // the sea pushes you back onto the sand
    if (p.x < 44) p.x = 44;
    if (p.x > 2596) p.x = 2596;
  }
  resolveBuildings(city, p, 13);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
}

export function updatePlayerDriving(p, input, dt, city) {
  const car = p.inCar;
  if (!car) return;
  const ax = input.axis();
  const spec = car.spec;
  const forward = ax.y !== 0 ? -ax.y : 0; // W = accelerate
  const steer = ax.x;
  const accel = forward > 0 ? spec.accel : forward < 0 ? -spec.accel * 0.9 : 0;
  car.speed += accel * dt;
  // drag + rolling resistance
  car.speed -= car.speed * 0.55 * dt;
  if (forward === 0 && Math.abs(car.speed) < 12) car.speed = 0;
  car.speed = Math.max(-spec.top * 0.45, Math.min(spec.top, car.speed));
  const turnRate = spec.grip * (car.speed / spec.top) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * turnRate * dt;
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  const px = car.x + nx * car.speed * dt;
  const py = car.y + ny * car.speed * dt;
  // building collision: slide, lose speed, damage the car
  const probe = { x: px, y: py };
  resolveBuildings(city, probe, 20);
  if (Math.hypot(probe.x - px, probe.y - py) > 1) {
    car.speed *= 0.35;
    car.hp -= 2;
  }
  car.x = probe.x;
  car.y = probe.y;
  car.x = Math.max(56, Math.min(WORLD.w - 56, car.x));
  car.y = Math.max(56, Math.min(WORLD.h - 56, car.y));
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;
  p.moving = Math.abs(car.speed) > 10;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (car.hp <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
  }
}

// ---- stealing / exiting cars -----------------------------------------------

export function nearestStealableCar(p, cars, maxDist = 64) {
  let best = null;
  let bestD = maxDist;
  for (const c of cars) {
    if (c.wrecked) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function stealCar(p, car, state) {
  p.inCar = car;
  car.speed = 0;
  car.isPlayer = true;
  addWanted(state, TUNE.crimeSteal, 'Car stolen');
}

export function exitCar(p, city) {
  const car = p.inCar;
  if (!car) return;
  car.isPlayer = false;
  // step out to the side of the car
  const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 30, y: car.y + Math.sin(car.angle + Math.PI / 2) * 30 };
  resolveBuildings(city, side, 13);
  p.x = side.x;
  p.y = side.y;
  p.inCar = null;
  p.speed = 0;
}

// ---- traffic AI ------------------------------------------------------------

export function updateTraffic(cars, dt, city, player, state) {
  for (const c of cars) {
    if (c.wrecked) continue;
    if (c.isPlayer) continue;
    // slow down for the car ahead
    let ahead = null;
    let aheadD = 120;
    for (const o of cars) {
      if (o === c || o.wrecked) continue;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < aheadD && Math.cos(c.angle) * dx + Math.sin(c.angle) * dy > 0) {
        aheadD = dist;
        ahead = o;
      }
    }
    let target = c.targetSpeed;
    if (ahead && aheadD < 70) target = Math.min(target, ahead.speed * 0.6);
    // panic: peds/cars near gunfire scatter — traffic just brakes
    if (state && state.gunfireTimer > 0) target = Math.min(target, 30);
    c.speed += (target - c.speed) * Math.min(1, dt * 1.2);
    // turning at intersections
    if (atIntersection(c.x, c.y, 26) && Math.random() < dt * 0.35) {
      c.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    // keep to the road: steer back toward the nearest road line
    const road = nearestRoadPoint(c.x, c.y);
    const off = road.vertical ? c.x - road.x : c.y - road.y;
    if (Math.abs(off) > 16) {
      const steer = road.vertical ? -Math.sign(off) * 0.9 : -Math.sign(off) * 0.9;
      c.angle += steer * dt * 0.8 * (c.speed >= 0 ? 1 : -1);
    }
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = Math.max(70, Math.min(WORLD.w - 70, c.x));
    c.y = Math.max(70, Math.min(WORLD.h - 70, c.y));
    // soft collision with the player's car
    if (player.inCar && player.inCar !== c) {
      const d = Math.hypot(c.x - player.inCar.x, c.y - player.inCar.y);
      if (d < 46) {
        const push = (46 - d) / 2;
        const ux = (c.x - player.inCar.x) / (d || 1);
        const uy = (c.y - player.inCar.y) / (d || 1);
        c.x += ux * push;
        c.y += uy * push;
        c.speed *= 0.7;
        player.inCar.speed *= 0.85;
        if (Math.abs(player.inCar.speed) > 120) {
          c.hp -= 8;
          player.inCar.hp -= 4;
        }
      }
    }
    if (c.hp <= 0) {
      c.wrecked = true;
      c.speed = 0;
      if (state) state.explosions.push({ x: c.x, y: c.y, t: 0, big: true });
    }
  }
}

// ---- pedestrians -----------------------------------------------------------

export function updatePedestrians(peds, dt, city, state, player) {
  for (const ped of peds) {
    if (ped.dead) continue;
    ped.wander -= dt;
    if (ped.wander <= 0) {
      ped.wander = Math.random() * 4 + 2;
      ped.angle = Math.random() * Math.PI * 2;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      // run away from the player
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.angle = away;
      ped.speed = 150;
    } else {
      ped.speed = 30;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.x = Math.max(50, Math.min(WORLD.w - 50, ped.x));
    ped.y = Math.max(50, Math.min(WORLD.h - 50, ped.y));
    if (inWater(ped.x, ped.y)) ped.angle += Math.PI;
    resolveBuildings(city, ped, 10);
    // hit by the player's car
    if (player.inCar && Math.abs(player.inCar.speed) > 60) {
      const d = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (d < 34) {
        ped.dead = true;
        addWanted(state, TUNE.crimeHitPed, 'Pedestrian hit');
        state.particles.push({ x: ped.x, y: ped.y, t: 0, kind: 'hit' });
      }
    }
  }
}

// ---- wanted system + police ------------------------------------------------

export function addWanted(state, stars, reason) {
  if (state.wanted >= 5 && stars > 0) return;
  state.wanted = Math.max(0, Math.min(5, state.wanted + stars));
  state.wantedTimer = 0;
  state.lastCrime = reason;
  if (state.wanted > 0) state.wantedFlash = 1;
}

export function updateWanted(state, dt, player, police) {
  if (state.wanted <= 0) return;
  // wanted fades when no police can see the player
  const seen = police.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 420);
  if (!seen) {
    state.wantedTimer += dt;
    if (state.wantedTimer > TUNE.wantedDecaySeconds) {
      state.wanted -= 1;
      state.wantedTimer = 0;
      if (state.wanted === 0) state.lastCrime = '';
    }
  } else {
    state.wantedTimer = 0;
  }
  state.wantedFlash = Math.max(0, state.wantedFlash - dt * 2);
}

export function spawnPolice(state, rng) {
  // keep the number of active units proportional to the wanted level
  const want = state.wanted <= 1 ? 1 : state.wanted <= 3 ? state.wanted : state.wanted + 1;
  const active = state.police.filter((c) => !c.wrecked).length;
  if (active >= Math.min(want, TUNE.maxPolice)) return;
  const p = state.player;
  const angle = rng.range(0, Math.PI * 2);
  const dist = rng.range(480, 700);
  const x = Math.max(90, Math.min(WORLD.w - 90, p.x + Math.cos(angle) * dist));
  const y = Math.max(90, Math.min(WORLD.h - 90, p.y + Math.sin(angle) * dist));
  const road = nearestRoadPoint(x, y);
  const cop = makeTrafficCar(rng, 'cruiser', road.x, road.y, Math.atan2(p.y - road.y, p.x - road.x));
  cop.color = PALETTE.police;
  cop.isPolice = true;
  cop.siren = rng.range(0, 1);
  cop.targetSpeed = 300;
  state.police.push(cop);
}

export function updatePolice(state, dt) {
  const p = state.player;
  for (const cop of state.police) {
    if (cop.wrecked) continue;
    cop.siren += dt;
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    const wantAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
    // steer toward the player, with some wobble
    let diff = wantAngle - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const target = d > 90 ? 330 : 180;
    cop.speed += (target - cop.speed) * Math.min(1, dt * 1.5);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    // ram the player
    if (d < 46) {
      if (p.inCar) {
        p.inCar.hp -= 6 * dt * 10;
        p.inCar.speed *= 0.92;
        cop.speed *= 0.8;
      } else if (p.invuln <= 0) {
        p.hp -= 14;
        p.invuln = 0.8;
        state.shake = 6;
      }
      cop.x -= Math.cos(cop.angle) * 8;
      cop.y -= Math.sin(cop.angle) * 8;
    }
    // despawn far-away units once the heat is gone
    if (state.wanted === 0 && d > 900) cop.wrecked = true;
    if (cop.hp <= 0) {
      cop.wrecked = true;
      state.explosions.push({ x: cop.x, y: cop.y, t: 0, big: true });
      addWanted(state, 1, 'Cruiser wrecked');
    }
  }
  state.police = state.police.filter((c) => !c.wrecked || Math.hypot(c.x - p.x, c.y - p.y) < 700);
  // foot cops at low wanted levels
  if (state.wanted >= 1 && state.wanted <= 2 && state.footCops.length < 2) {
    if (Math.random() < dt * 0.25) {
      state.footCops.push({
        x: p.x + (Math.random() < 0.5 ? -1 : 1) * 320,
        y: p.y + (Math.random() < 0.5 ? -1 : 1) * 320,
        hp: TUNE.copHp, speed: 120, angle: 0,
      });
    }
  }
  for (const cop of state.footCops) {
    const d = Math.hypot(cop.x - p.x, cop.y - p.y);
    cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
    if (d > 26) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    } else if (p.invuln <= 0) {
      p.hp -= 8;
      p.invuln = 0.7;
      state.shake = 5;
    }
  }
  // helicopter at 5 stars: follows from above, spotlight on the player
  if (state.wanted >= 5) {
    if (!state.heli) state.heli = { x: p.x, y: p.y - 260, t: 0 };
    state.heli.t += dt;
    state.heli.x += (p.x - state.heli.x) * Math.min(1, dt * 0.8);
    state.heli.y += (p.y - 240 - state.heli.y) * Math.min(1, dt * 0.8);
  } else {
    state.heli = null;
  }
}

// ---- combat ----------------------------------------------------------------

export function playerPunch(state) {
  const p = state.player;
  if (p.punchCooldown > 0 || p.inCar) return;
  p.punchCooldown = 0.45;
  state.punchFx = 0.2;
  const reach = 34;
  const fx = p.x + Math.cos(p.angle) * reach;
  const fy = p.y + Math.sin(p.angle) * reach;
  // hit foot cops, thugs and pedestrians (peds just get scared)
  for (const cop of state.footCops) {
    if (Math.hypot(cop.x - fx, cop.y - fy) < 26) {
      cop.hp -= TUNE.punchDamage;
      state.particles.push({ x: cop.x, y: cop.y, t: 0, kind: 'hit' });
      if (cop.hp <= 0) {
        cop.dead = true;
        addWanted(state, TUNE.crimeKillCop, 'Officer down');
      }
    }
  }
  for (const thug of state.thugs) {
    if (!thug.dead && Math.hypot(thug.x - fx, thug.y - fy) < 26) {
      thug.hp -= TUNE.punchDamage;
      state.particles.push({ x: thug.x, y: thug.y, t: 0, kind: 'hit' });
      if (thug.hp <= 0) thug.dead = true;
    }
  }
  for (const ped of state.peds) {
    if (!ped.dead && Math.hypot(ped.x - fx, ped.y - fy) < 26) ped.flee = 3;
  }
}

export function playerShoot(state) {
  const p = state.player;
  if (p.shootCooldown > 0 || p.ammo <= 0 || p.inCar) return;
  p.shootCooldown = 0.28;
  p.ammo -= 1;
  state.gunfireTimer = 1.2;
  state.muzzle = 0.08;
  state.shake = Math.max(state.shake, 2);
  const bx = p.x + Math.cos(p.angle) * 20;
  const by = p.y + Math.sin(p.angle) * 20;
  state.bullets.push({ x: bx, y: by, vx: Math.cos(p.angle) * 900, vy: Math.sin(p.angle) * 900, life: 0.6 });
  addWanted(state, TUNE.crimeShoot, 'Shots fired');
  for (const ped of state.peds) {
    if (!ped.dead && Math.hypot(ped.x - p.x, ped.y - p.y) < 320) ped.flee = 4;
  }
}

export function updateBullets(state, dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // hit thugs, foot cops, traffic (drivers bail), police cars
    for (const thug of state.thugs) {
      if (!thug.dead && Math.hypot(thug.x - b.x, thug.y - b.y) < 16) {
        thug.hp -= TUNE.bulletDamage;
        b.life = 0;
        if (thug.hp <= 0) thug.dead = true;
      }
    }
    for (const cop of state.footCops) {
      if (!cop.dead && Math.hypot(cop.x - b.x, cop.y - b.y) < 16) {
        cop.hp -= TUNE.bulletDamage;
        b.life = 0;
        if (cop.hp <= 0) {
          cop.dead = true;
          addWanted(state, TUNE.crimeKillCop, 'Officer down');
        }
      }
    }
    for (const car of [...state.traffic, ...state.police]) {
      if (!car.wrecked && Math.hypot(car.x - b.x, car.y - b.y) < 26) {
        car.hp -= TUNE.bulletDamage;
        b.life = 0;
        if (car.hp <= 0) {
          car.wrecked = true;
          state.explosions.push({ x: car.x, y: car.y, t: 0, big: true });
        }
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
  state.footCops = state.footCops.filter((c) => !c.dead);
  state.thugs = state.thugs.filter((t) => !t.dead);
}

export function updateThugs(state, dt) {
  const p = state.player;
  for (const thug of state.thugs) {
    if (thug.dead) continue;
    thug.shootCooldown -= dt;
    const d = Math.hypot(thug.x - p.x, thug.y - p.y);
    if (d < 420 && thug.shootCooldown <= 0) {
      thug.shootCooldown = 1.4;
      const a = Math.atan2(p.y - thug.y, p.x - thug.x) + (Math.random() - 0.5) * 0.25;
      state.enemyBullets.push({ x: thug.x, y: thug.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.1 });
    }
    // thugs hold their ground and strafe a little
    thug.x += Math.cos(thug.angle) * 12 * dt;
  }
  for (const b of state.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (Math.hypot(b.x - p.x, b.y - p.y) < 16 && p.invuln <= 0) {
      p.hp -= 7;
      p.invuln = 0.5;
      b.life = 0;
      state.shake = 4;
    }
  }
  state.enemyBullets = state.enemyBullets.filter((b) => b.life > 0);
}

// ---- pickups, taxi, shops ---------------------------------------------------

export function spawnPickups(rng, count) {
  const picks = [];
  const kinds = ['cash', 'cash', 'cash', 'health', 'ammo'];
  for (let i = 0; i < count; i++) {
    const road = rng.chance(0.5)
      ? { x: rng.pick(WORLD.avenues) + rng.range(-20, 20), y: rng.range(140, 1840) }
      : { x: rng.range(140, 2500), y: rng.pick(WORLD.streets) + rng.range(-20, 20) };
    picks.push({ x: road.x, y: road.y, kind: rng.pick(kinds), taken: false, bob: rng.range(0, 6) });
  }
  return picks;
}

export function updatePickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    pk.bob += dt;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        p.cash += TUNE.pickupCash;
        state.toast = `+$${TUNE.pickupCash} street cash`;
      } else if (pk.kind === 'health') {
        p.hp = Math.min(TUNE.playerHp, p.hp + 40);
        state.toast = '+40 health';
      } else {
        p.ammo += 12;
        state.toast = '+12 ammo';
      }
      state.toastTimer = 2;
      state.chime = true;
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);
}

// Taxi: a passenger waves on a sidewalk; drive them to their destination.
export function maybeOfferTaxi(state, rng) {
  if (state.taxi) return;
  if (Math.random() > 0.004) return;
  const p = state.player;
  const px = p.x + rng.range(-260, 260);
  const py = p.y + rng.range(-200, 200);
  const dest = rng.pick([PLACES.plaza, PLACES.motel, PLACES.diner, PLACES.bank, PLACES.park]);
  state.taxi = {
    x: Math.max(120, Math.min(2500, px)),
    y: Math.max(120, Math.min(1840, py)),
    dest,
    state: 'waiting', // waiting -> riding -> done
    timer: 90,
    fare: TUNE.taxiFare,
  };
  state.toast = 'Taxi fare nearby — pick up the passenger';
  state.toastTimer = 2.5;
}

export function updateTaxi(state, dt) {
  const t = state.taxi;
  if (!t) return;
  const p = state.player;
  t.timer -= dt;
  if (t.timer <= 0) {
    state.taxi = null;
    state.toast = 'Fare expired — the passenger gave up';
    state.toastTimer = 2;
    return;
  }
  if (t.state === 'waiting') {
    if (p.inCar && Math.hypot(t.x - p.x, t.y - p.y) < 52) {
      t.state = 'riding';
      state.toast = `Passenger aboard — take them to ${t.dest.name}`;
      state.toastTimer = 2.5;
    }
  } else if (t.state === 'riding') {
    if (!p.inCar) {
      t.state = 'waiting'; // they wait where you left them
      return;
    }
    if (Math.hypot(t.dest.x - p.x, t.dest.y - p.y) < 56) {
      const tip = Math.max(0, Math.floor(t.timer)) > 45 ? TUNE.taxiTip : 0;
      p.cash += t.fare + tip;
      state.toast = `Fare complete +$${t.fare + tip}${tip ? ' (fast tip!)' : ''}`;
      state.toastTimer = 2.5;
      state.taxiDone = (state.taxiDone || 0) + 1;
      state.taxi = null;
    }
  }
}

// Shops: gun shop sells ammo, spray shop clears wanted, garage repairs.
export function nearestShop(state) {
  const p = state.player;
  const shops = [
    { id: 'gun', place: PLACES.gunShop, label: 'Gun Shop — E: buy ammo $60' },
    { id: 'spray', place: PLACES.sprayShop, label: 'Spray Shop — E: lose the cops $150' },
    { id: 'garage', place: PLACES.garage, label: "Kade's Garage — E: repair car $80" },
  ];
  for (const s of shops) {
    if (Math.hypot(s.place.x - p.x, s.place.y - p.y) < 64) return s;
  }
  return null;
}

export function useShop(state, shop) {
  const p = state.player;
  if (shop.id === 'gun') {
    if (p.cash < TUNE.ammoPrice) {
      state.toast = 'Not enough cash for ammo';
    } else {
      p.cash -= TUNE.ammoPrice;
      p.ammo += TUNE.ammoAmount;
      state.toast = `+${TUNE.ammoAmount} ammo`;
    }
  } else if (shop.id === 'spray') {
    if (state.wanted === 0) {
      state.toast = 'No heat to lose';
    } else if (p.cash < TUNE.sprayPrice) {
      state.toast = 'Not enough cash for a respray';
    } else {
      p.cash -= TUNE.sprayPrice;
      state.wanted = 0;
      state.police = [];
      state.footCops = [];
      state.heli = null;
      state.toast = 'Resprayed — the cops lost you';
    }
  } else if (shop.id === 'garage') {
    if (!p.inCar) {
      state.toast = 'Bring a car to repair it';
    } else if (p.cash < TUNE.repairPrice) {
      state.toast = 'Not enough cash for repairs';
    } else {
      p.cash -= TUNE.repairPrice;
      p.inCar.hp = p.inCar.spec.hp;
      state.toast = 'Car repaired';
    }
  }
  state.toastTimer = 2.5;
}
