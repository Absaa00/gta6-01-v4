// Solmar Bay — main game: player, driving, combat, camera, HUD, minimap, day/night.
// SPDX-License-Identifier: MIT

'use strict';

/**
 * Solmar Bay: an original open-world crime game. Rook, a wheelman new to town,
 * works jobs for fixer Dalia Voss across six districts, steals cars, dodges the
 * Solmar Bay Police Department, and climbs from nobody to King of Solmar.
 * Top-down 2D canvas, keyboard + mouse, static files, no network.
 */

const SAVE_KEY = 'solmar-bay-v4-save';
const VIEW_W = 1280, VIEW_H = 800;

/** The player: on foot or behind the wheel. */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;   // facing
    this.hp = 100;
    this.ammo = 48;
    this.car = null;              // TrafficCar when driving, else null
    this.speed = 0;
    this.walkPhase = 0;
    this.hurtT = 0;              // seconds since last damage
    this.punchCd = 0;
    this.punchAnim = 0;
    this.muzzle = 0;
    this.dead = false;
  }

  get inCar() { return this.car !== null; }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = new SoundBank();
    this.city = buildCity();
    this.traffic = new Traffic();
    this.police = new Police();
    this.missions = new MissionSystem(this.city);
    this.player = new Player(1560, 1400);
    this.state = 'title';         // 'title' | 'play' | 'pause' | 'dead'
    this.cash = 100;
    this.stats = { missions: 0, fares: 0, carsStolen: 0, shots: 0 };
    this.bullets = [];
    this.particles = [];
    this.skids = [];
    this.timeH = 10;              // clock, 10:00 start
    this.rain = 0;                // 0..1 rain intensity
    this.rainTimer = 12;
    this.shake = 0;
    this.camX = 0; this.camY = 0;
    this.keys = {};
    this.mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
    this.helpT = 0;
    this.lastTs = 0;
    this._parkMissionCar();
    this._placeTaxiNearby();
    this.load();
  }

  /** A parked sedan right at the mission-1 waypoint so the first job is instant. */
  _parkMissionCar() {
    const car = this.traffic.cars[0];
    car.parked = true;
    car.speed = 0;
    car.x = 1600; car.y = 1400;
    car.angle = 0;
    car.type = 'sedan';
    car.spec = CAR_TYPES[0];
    car.color = '#c94a4a';
  }

  /** Make sure a taxi cruises near the start for fares and screenshots. */
  _placeTaxiNearby() {
    const car = this.traffic.cars[1];
    car.type = 'taxi';
    car.spec = CAR_TYPES[1];
    car.color = '#e8c832';
    car.x = 1500; car.y = 1400;
    car.axis = 'x'; car.dir = 1; car.angle = 0;
    car.speed = 60;
  }

  // ------------------------------------------------------------ save / load
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionIndex: this.missions.index,
        fares: this.missions.faresDone,
        ammo: this.player.ammo,
      }));
    } catch (e) { /* storage unavailable — play on without saving */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.cash === 'number') this.cash = s.cash;
      if (typeof s.ammo === 'number') this.player.ammo = s.ammo;
      if (typeof s.fares === 'number') this.missions.faresDone = s.fares;
      if (typeof s.missionIndex === 'number' && s.missionIndex > 0 && s.missionIndex < MISSION_DEFS.length) {
        this.missions.startMission(s.missionIndex);
      }
    } catch (e) { /* corrupt save — start fresh */ }
  }

  // ------------------------------------------------------------ input
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      this.sfx.ensure();
      if (e.key === 'Enter' && this.state === 'title') this.startPlay();
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (this.state === 'play' || this.state === 'pause')) {
        this.state = this.state === 'play' ? 'pause' : 'play';
        this.sfx.click();
      }
      if ((e.key === 'm' || e.key === 'M')) this.sfx.muted = !this.sfx.muted;
      if (e.key === 'e' || e.key === 'E') this.tryInteract();
      if (e.key === ' ' && this.state === 'play') this.tryPunch();
      if ((e.key === 'r' || e.key === 'R') && this.state === 'dead') this.respawn();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (VIEW_W / r.width);
      this.mouse.y = (e.clientY - r.top) * (VIEW_H / r.height);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.sfx.ensure();
      if (this.state === 'title') { this.startPlay(); return; }
      if (this.state === 'play') this.tryShoot();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  startPlay() {
    this.state = 'play';
    this.sfx.ensure();
    this.sfx.click();
    if (this.missions.index === 0 && this.missions.stage === 0 && !this._briefShown) {
      this._briefShown = true;
      this.missions.showBanner('Mission: First Wheels', MISSION_DEFS[0].brief);
    }
  }

  respawn() {
    this.player.hp = 100;
    this.player.x = 1560; this.player.y = 1400;
    this.player.dead = false;
    this.cash = Math.max(0, this.cash - 100);
    this.police.clearWanted();
    this.state = 'play';
    this.missions.showBanner('Back on your feet', 'Hospital bill: $100. Dalia is waiting.');
  }

  // ------------------------------------------------------------ interactions
  tryInteract() {
    if (this.state !== 'play') return;
    const p = this.player;
    // Shop first (works on foot or in a car).
    const shop = this.missions.shopInRange(p);
    if (shop) { this.missions.useShop(this, shop); return; }
    if (p.inCar) {
      // Exit the car.
      const car = p.car;
      car.driven = false;
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      p.angle = car.angle;
      this.sfx.click();
      return;
    }
    // Steal the nearest car.
    const car = this.traffic.nearestCar(p.x, p.y, 78);
    if (car) {
      car.parked = false;
      car.driven = true;
      car.speed = 0;
      p.car = car;
      p.x = car.x; p.y = car.y;
      this.stats.carsStolen++;
      this.sfx.click();
      const raised = this.police.addWanted(1, 'stole a car');
      if (raised > 0) {
        this.missions.showBanner('Wanted: ' + this.police.label, 'The cops saw that. Lose them or visit a Spray Shop ($150).');
        this.sfx.fail();
      }
      this.traffic.scarePeds(car.x, car.y, 160);
      this.missions.onCarStolen(this);
    }
  }

  tryPunch() {
    const p = this.player;
    if (p.inCar || p.punchCd > 0) return;
    p.punchCd = 0.45;
    p.punchAnim = 0.18;
    this.sfx.punch();
    const fx = p.x + Math.cos(p.angle) * 30, fy = p.y + Math.sin(p.angle) * 30;
    // Punch cops, gunmen and peds (peds just get scared).
    for (const c of this.police.cops) {
      if (!c.dead && dist(c.x, c.y, fx, fy) < 34) {
        c.hp -= 20;
        if (c.hp <= 0) { c.dead = true; this.police.addWanted(1, 'killed a cop'); }
      }
    }
    for (const g of this.missions.gunmen) {
      if (!g.dead && dist(g.x, g.y, fx, fy) < 34) {
        g.hp -= 20;
        if (g.hp <= 0) g.dead = true;
      }
    }
    this.traffic.scarePeds(fx, fy, 120);
  }

  tryShoot() {
    const p = this.player;
    if (p.inCar || p.ammo <= 0) {
      if (p.ammo <= 0) this.missions.showBanner('Out of ammo', 'Buy more at a Gun Shop ($60).');
      return;
    }
    p.ammo--;
    this.stats.shots++;
    p.muzzle = 0.07;
    const wx = this.camX + this.mouse.x, wy = this.camY + this.mouse.y;
    const a = angleTo(p.x, p.y, wx, wy);
    p.angle = a;
    this.bullets.push({
      x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
      vx: Math.cos(a) * 720, vy: Math.sin(a) * 720,
      from: 'player', life: 0.9, dmg: 25,
    });
    this.sfx.gunshot();
    this.shake = Math.max(this.shake, 3);
    this.traffic.scarePeds(p.x, p.y, 320);
    if (this.police.wanted === 0) this.police.addWanted(1, 'fired a gun');
  }

  // ------------------------------------------------------------ damage
  damagePlayer(amount, source) {
    const p = this.player;
    if (p.dead || this.state !== 'play') return;
    p.hp -= amount;
    p.hurtT = 0;
    this.shake = Math.max(this.shake, 6);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      this.state = 'dead';
      this.sfx.fail();
      if (p.inCar) { p.car.driven = false; p.car = null; }
    }
  }

  explodeAt(x, y, big) {
    const n = big ? 42 : 20;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = randRange(Math.random, 40, big ? 320 : 180);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: randRange(Math.random, 0.4, 1.1), max: 1.1,
        color: pick(Math.random, ['#ff8a2a', '#ffcf4a', '#ff5a2a', '#5a5a5a']),
        size: randRange(Math.random, 3, 9),
      });
    }
    this.sfx.explosion();
    this.shake = Math.max(this.shake, big ? 16 : 9);
    this.traffic.scarePeds(x, y, 420);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    if (this.state !== 'play') return;
    const p = this.player;

    // Clock: a full day in 300 s. Rain comes and goes at night.
    this.timeH = (this.timeH + dt * (24 / 300)) % 24;
    this.rainTimer -= dt;
    if (this.rainTimer <= 0) {
      this.rainTimer = 14 + Math.random() * 16;
      const night = this.timeH >= 19 || this.timeH < 6;
      this.rain = night && Math.random() < 0.6 ? randRange(Math.random, 0.4, 1) : 0;
    }

    // Health regen while clean and unhurt for a while.
    p.hurtT += dt;
    if (this.police.wanted === 0 && p.hurtT > 6 && p.hp > 0 && p.hp < 100) {
      p.hp = Math.min(100, p.hp + 8 * dt);
    }
    p.punchCd -= dt;
    p.punchAnim -= dt;
    p.muzzle -= dt;

    // Mission 5 forces night and 3 stars.
    if (this.missions.index === 4 && !this.missions.done) {
      if (this.timeH >= 6 && this.timeH < 19) this.timeH = 20.5;
      if (this.police.wanted < 3) this.police.wanted = 3;
    }

    if (p.inCar) this._updateDriving(dt);
    else this._updateOnFoot(dt);

    this.traffic.update(dt, this.city.buildings, p);
    this.police.update(dt, p, this.city.buildings, (ev, arg) => {
      if (ev === 'cop-punch') this.damagePlayer(8, 'cop');
      else if (ev === 'cop-ram') {
        if (p.car) {
          p.car.hp -= 12;
          p.car.smoke = Math.max(p.car.smoke, 0.4);
          this.shake = Math.max(this.shake, 8);
          this.sfx.crash();
          if (p.car.hp <= 0) this._blowUpCar(p.car);
        } else this.damagePlayer(10, 'ram');
      }
    });
    this.missions.update(dt, this);
    this.missions.updateTaxi(dt, this, p);
    this._updateBullets(dt);
    this._updateParticles(dt);

    // Car smoke / explosion checks for traffic cars.
    for (const c of this.traffic.cars) {
      if (c.dead) continue;
      if (c.hp < 50 && Math.random() < dt * 6) {
        this.particles.push({
          x: c.x + (Math.random() - 0.5) * 20, y: c.y - 10,
          vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
          life: 0.8, max: 0.8, color: '#666', size: 5 + Math.random() * 4,
        });
      }
      if (c.hp <= 0) this._blowUpCar(c);
    }

    // Camera follows the player, clamped to the world.
    const tx = clamp(p.x - VIEW_W / 2, 0, WORLD - VIEW_W);
    const ty = clamp(p.y - VIEW_H / 2, 0, WORLD - VIEW_H);
    this.camX = lerp(this.camX, tx, Math.min(1, dt * 6));
    this.camY = lerp(this.camY, ty, Math.min(1, dt * 6));
    this.shake = Math.max(0, this.shake - dt * 26);

    // Audio follows state.
    this.sfx.siren(this.police.wanted >= 2);
    this.sfx.engine(p.inCar ? clamp(Math.abs(p.car.speed) / p.car.spec.top, 0, 1) : 0);
  }

  _blowUpCar(car) {
    if (car.dead) return;
    car.dead = true;
    car.smoke = 1;
    this.explodeAt(car.x, car.y, true);
    if (this.player.car === car) {
      this.player.car = null;
      this.player.x = car.x + 40; this.player.y = car.y + 40;
      this.damagePlayer(25, 'explosion');
    }
  }

  _updateOnFoot(dt) {
    const p = this.player;
    const k = this.keys;
    let mx = 0, my = 0;
    if (k['w'] || k['arrowup']) my -= 1;
    if (k['s'] || k['arrowdown']) my += 1;
    if (k['a'] || k['arrowleft']) mx -= 1;
    if (k['d'] || k['arrowright']) mx += 1;
    const run = k['shift'] ? 1.55 : 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      const sp = 175 * run;
      const nx = p.x + mx * sp * dt, ny = p.y + my * sp * dt;
      if (!buildingAt(this.city.buildings, nx, p.y, 11)) p.x = nx;
      if (!buildingAt(this.city.buildings, p.x, ny, 11)) p.y = ny;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * (run > 1 ? 13 : 9);
    }
    p.x = clamp(p.x, 30, WORLD - 30);
    p.y = clamp(p.y, 30, WORLD - 30);
    // Bumped by a moving traffic car.
    for (const c of this.traffic.cars) {
      if (c.dead || c.driven || c.speed < 30) continue;
      if (dist(p.x, p.y, c.x, c.y) < 30) {
        const a = angleTo(c.x, c.y, p.x, p.y);
        p.x += Math.cos(a) * 60 * dt * 10;
        p.y += Math.sin(a) * 60 * dt * 10;
        this.damagePlayer(6, 'traffic');
      }
    }
  }

  _updateDriving(dt) {
    const p = this.player;
    const car = p.car;
    const k = this.keys;
    const fwd = (k['w'] || k['arrowup']) ? 1 : 0;
    const back = (k['s'] || k['arrowdown']) ? 1 : 0;
    const left = (k['a'] || k['arrowleft']) ? 1 : 0;
    const right = (k['d'] || k['arrowright']) ? 1 : 0;
    const handbrake = k[' '] ? 1 : 0;

    const accel = car.spec.accel;
    if (fwd) car.speed += accel * dt;
    if (back) car.speed -= (car.speed > 5 ? 620 : 260) * dt;
    // Drag + rolling resistance.
    car.speed -= car.speed * 0.55 * dt;
    if (handbrake) car.speed -= car.speed * 2.2 * dt;
    car.speed = clamp(car.speed, -car.spec.top * 0.45, car.spec.top);

    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const steerAuthority = clamp(Math.abs(car.speed) / 60, 0, 1) * (car.speed >= 0 ? 1 : -1);
    const prevAngle = car.angle;
    car.angle += steer * 2.4 * steerAuthority * dt;

    // Skid marks on hard turns at speed.
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 150 && Math.abs(angleDiff(prevAngle, car.angle)) > 0.02) {
      this.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 6 });
      if (this.skids.length > 220) this.skids.shift();
    }

    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hitBuilding = buildingAt(this.city.buildings, nx, ny, 20);
    if (hitBuilding) {
      if (Math.abs(car.speed) > 90) {
        car.hp -= Math.round(Math.abs(car.speed) / 22);
        car.smoke = Math.max(car.smoke, 0.5);
        this.shake = Math.max(this.shake, 7);
        this.sfx.crash();
        this.damagePlayer(4, 'crash');
      }
      car.speed *= -0.25;
      car.angle += (Math.random() - 0.5) * 0.3;
    } else {
      car.x = nx; car.y = ny;
    }
    // Bump into traffic cars.
    for (const c of this.traffic.cars) {
      if (c === car || c.dead || c.driven) continue;
      if (dist(car.x, car.y, c.x, c.y) < 42) {
        const a = angleTo(c.x, c.y, car.x, car.y);
        const push = 30 * dt;
        c.x -= Math.cos(a) * push * 4;
        c.y -= Math.sin(a) * push * 4;
        c.hp -= 4;
        car.hp -= 2;
        car.speed *= 0.92;
        if (Math.abs(car.speed) > 120) this.sfx.crash();
      }
    }
    car.x = clamp(car.x, 40, WORLD - 40);
    car.y = clamp(car.y, 40, WORLD - 40);
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    if (car.hp <= 0) this._blowUpCar(car);
  }

  _updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (buildingAt(this.city.buildings, b.x, b.y, 2)) {
        b.life = 0;
        this.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#e8c832', size: 3 });
      }
    }
    const p = this.player;
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      if (b.from === 'player') {
        for (const c of this.police.cops) {
          if (!c.dead && dist(b.x, b.y, c.x, c.y) < 14) {
            c.hp -= b.dmg; b.life = 0;
            if (c.hp <= 0) { c.dead = true; this.police.addWanted(1, 'killed a cop'); }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const g of this.missions.gunmen) {
          if (!g.dead && dist(b.x, b.y, g.x, g.y) < 14) {
            g.hp -= b.dmg; b.life = 0;
            if (g.hp <= 0) g.dead = true;
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const c of this.traffic.cars) {
          if (!c.dead && dist(b.x, b.y, c.x, c.y) < 22) {
            c.hp -= b.dmg; b.life = 0;
            if (c.hp <= 0) this._blowUpCar(c);
            break;
          }
        }
      } else {
        // Enemy bullet vs the player (or the player's car).
        const target = p.inCar ? p.car : p;
        const rr = p.inCar ? 24 : 13;
        if (dist(b.x, b.y, target.x, target.y) < rr) {
          b.life = 0;
          if (p.inCar) {
            p.car.hp -= b.dmg;
            if (p.car.hp <= 0) this._blowUpCar(p.car);
          } else {
            this.damagePlayer(b.dmg, 'bullet');
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  _updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
  }

  get isNight() { return this.timeH >= 19 || this.timeH < 6; }

  clockText() {
    const h = Math.floor(this.timeH);
    const m = Math.floor((this.timeH - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
}

// ------------------------------------------------------------ rendering
Game.prototype._isNightNow = function () { return this.isNight; };

Game.prototype.render = function () {
  const ctx = this.ctx;
  const night = this.isNight;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  if (this.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
  }
  const camX = this.camX, camY = this.camY;
  // World space: everything below is drawn in world coordinates.
  ctx.translate(-camX, -camY);
  const view = { x0: camX - 60, y0: camY - 60, x1: camX + VIEW_W + 60, y1: camY + VIEW_H + 60 };

  // Ground: district tints.
  for (const d of DISTRICTS) {
    if (d.x > view.x1 || d.x + d.w < view.x0 || d.y > view.y1 || d.y + d.h < view.y0) continue;
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  // Parks: green lawns.
  for (const pk of this.city.parks) {
    ctx.fillStyle = '#5a8a4a';
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
  }
  // Roads.
  ctx.fillStyle = '#2e2e34';
  for (const l of ROAD_LINES) {
    ctx.fillRect(l - ROAD_HALF, 0, ROAD_HALF * 2, WORLD);
    ctx.fillRect(0, l - ROAD_HALF, WORLD, ROAD_HALF * 2);
  }
  // Road centre dashes.
  ctx.fillStyle = '#c9b458';
  for (const l of ROAD_LINES) {
    for (let v = 0; v < WORLD; v += 64) {
      ctx.fillRect(l - 2, v, 4, 30);
      ctx.fillRect(v, l - 2, 30, 4);
    }
  }
  // Marina water strip (south edge of Marina Bay).
  ctx.fillStyle = '#2a6a8a';
  ctx.fillRect(1066, 3100, 1068, 100);
  ctx.fillStyle = '#3a8ab0';
  for (let x = 1100; x < 2100; x += 90) {
    ctx.fillRect(x, 3120 + Math.sin(x * 0.02) * 8, 46, 3);
  }

  // Buildings with a simple 3D side (height shadow) and neon at night.
  for (const b of this.city.buildings) {
    if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
    const h = b.hgt * 7;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + h, b.y + h, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    // Windows.
    ctx.fillStyle = night ? '#ffd76a' : '#2a3340';
    const cols = Math.max(2, Math.floor(b.w / 26)), rows = Math.max(2, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx * 7 + cy * 13 + b.x) % 5 === 0) continue;
        ctx.fillRect(b.x + 10 + cx * ((b.w - 20) / cols), b.y + 10 + cy * ((b.h - 20) / rows), 8, 10);
      }
    }
    if (b.neon && night) {
      ctx.strokeStyle = (b.x % 3 === 0) ? '#ff2a7a' : '#2ad9ff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
  }

  // Trees.
  for (const t of this.city.trees) {
    if (t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
    ctx.fillStyle = '#3a6a2a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a8a3a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.7, 0, Math.PI * 2); ctx.fill();
  }

  // Landmarks: bank, docks, marina, shops.
  const landmark = (x, y, w, h, color, label) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + h - 12, w, 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
  };
  const bk = this.city.bank;
  landmark(bk.x, bk.y, bk.w, bk.h, bk.color, bk.label);
  const dk = this.city.docks;
  landmark(dk.x, dk.y, dk.w, dk.h, dk.color, dk.label);
  const mr = this.city.marina;
  landmark(mr.x, mr.y, mr.w, mr.h, mr.color, mr.label);
  for (const s of this.city.shops) {
    landmark(s.x, s.y, s.w, s.h, s.color, s.label);
  }

  // Pickups (bobbing icons).
  for (const pk of this.missions.pickups) {
    if (pk.taken) continue;
    const t = PICKUP_TYPES[pk.kind];
    const bob = Math.sin(pk.bob) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(pk.x, pk.y + 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, pk.x, pk.y + bob + 4);
  }

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';
  ctx.lineWidth = 4;
  for (const s of this.skids) {
    ctx.globalAlpha = clamp(s.life / 6, 0, 1) * 0.8;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 14, s.y - Math.sin(s.angle) * 14);
    ctx.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Waypoint beam + pulsing diamond.
  const wp = this.missions.waypoint;
  if (wp && this.state === 'play') {
    const pulse = 1 + Math.sin(performance.now() / 300) * 0.25;
    const grad = ctx.createLinearGradient(wp.x, wp.y - 320, wp.x, wp.y);
    grad.addColorStop(0, 'rgba(255,215,60,0)');
    grad.addColorStop(1, 'rgba(255,215,60,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(wp.x - 14, wp.y - 320, 28, 320);
    ctx.save();
    ctx.translate(wp.x, wp.y - 40 * pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd73c';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
  }

  // Taxi passenger / destination markers.
  const tx = this.missions.taxi;
  if (tx.active && tx.passenger) {
    ctx.fillStyle = '#ffd73c';
    ctx.beginPath(); ctx.arc(tx.passenger.x, tx.passenger.y - 18, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('$', tx.passenger.x, tx.passenger.y - 14);
  }
  if (tx.active && tx.dest) {
    ctx.strokeStyle = '#ffd73c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tx.dest.x, tx.dest.y, 26 + Math.sin(performance.now() / 250) * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd73c';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('DROP-OFF', tx.dest.x, tx.dest.y - 34);
  }

  this._drawCar = this._drawCar || null;
  for (const c of this.traffic.cars) this._drawVehicle(ctx, c);
  for (const p of this.traffic.peds) this._drawPed(ctx, p);
  for (const c of this.police.cops) this._drawCop(ctx, c);
  for (const c of this.police.cruisers) this._drawCruiser(ctx, c);
  for (const g of this.missions.gunmen) this._drawGunman(ctx, g);
  this._drawPlayer(ctx);

  // Bullets.
  for (const b of this.bullets) {
    ctx.strokeStyle = b.from === 'player' ? '#ffe14a' : '#ff6a4a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of this.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Helicopter shadow + body + spotlight.
  const heli = this.police.heli;
  if (heli.active) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(heli.x + 30, heli.y + 40, 34, 18, 0, 0, Math.PI * 2); ctx.fill();
    const sx = this.player.x, sy = this.player.y;
    const grad = ctx.createRadialGradient(sx, sy, 10, sx, sy, 150);
    grad.addColorStop(0, 'rgba(255,255,200,0.35)');
    grad.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, 150, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.ellipse(heli.x, heli.y, 26, 12, heli.angle, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(heli.x - 34, heli.y); ctx.lineTo(heli.x + 34, heli.y);
    ctx.moveTo(heli.x, heli.y - 8); ctx.lineTo(heli.x, heli.y + 8);
    ctx.stroke();
  }

  // Rain at night.
  if (this.rain > 0) {
    ctx.strokeStyle = 'rgba(180,200,255,0.5)';
    ctx.lineWidth = 1;
    const t = performance.now() / 16;
    for (let i = 0; i < 90 * this.rain; i++) {
      const rx = ((i * 173 + t * 40) % (VIEW_W + 40)) + camX - 20;
      const ry = ((i * 97 + t * 260) % (VIEW_H + 40)) + camY - 20;
      ctx.beginPath();
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 14);
      ctx.stroke();
    }
  }

  // Night overlay + lamp glows + headlight cone.
  if (night) {
    ctx.fillStyle = 'rgba(8,10,40,0.42)';
    ctx.fillRect(camX, camY, VIEW_W, VIEW_H);
    // Lamp pools of light.
    for (const l of this.city.lamps) {
      if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
      const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, 70);
      g.addColorStop(0, 'rgba(255,220,120,0.30)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x, l.y, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(l.x, l.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Headlight cone when driving.
    const p = this.player;
    if (p.inCar) {
      const hx = p.x + Math.cos(p.angle) * 200, hy = p.y + Math.sin(p.angle) * 200;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const hg = ctx.createLinearGradient(0, 0, 260, 0);
      hg.addColorStop(0, 'rgba(255,240,180,0.28)');
      hg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(260, -70); ctx.lineTo(260, 70); ctx.lineTo(0, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
  this._drawHud(ctx);
  if (this.state === 'title') this._drawTitle(ctx);
  else if (this.state === 'pause') this._drawPause(ctx);
  else if (this.state === 'dead') this._drawDead(ctx);
};

Game.prototype._drawVehicle = function (ctx, c) {
  if (c.dead) {
    // Burnt-out wreck.
    ctx.fillStyle = '#1c1c1c';
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    ctx.fillRect(-c.spec.w / 2, -c.spec.h / 2, c.spec.w, c.spec.h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-c.spec.w / 2 + 3, -c.spec.h / 2 + 3, c.spec.w, c.spec.h);
  ctx.fillStyle = c.color;
  ctx.fillRect(-c.spec.w / 2, -c.spec.h / 2, c.spec.w, c.spec.h);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-c.spec.w / 2 + 8, -c.spec.h / 2 + 4, 12, c.spec.h - 8);
  ctx.fillStyle = '#d9e4ec';
  ctx.fillRect(c.spec.w / 2 - 4, -c.spec.h / 2 + 3, 3, 5);
  ctx.fillRect(c.spec.w / 2 - 4, c.spec.h / 2 - 8, 3, 5);
  if (c.type === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (c.type === 'truck') {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-c.spec.w / 2 + 4, -c.spec.h / 2 + 3, c.spec.w - 18, c.spec.h - 6);
  }
  ctx.restore();
  // Damage smoke.
  if (c.hp < 50) {
    ctx.fillStyle = 'rgba(90,90,90,0.6)';
    ctx.beginPath();
    ctx.arc(c.x + (Math.random() - 0.5) * 10, c.y - 12, 7 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
};

Game.prototype._drawPed = function (ctx, p) {
  const bob = Math.sin(p.phase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - 5, p.y - 8 + bob, 10, 15);
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(p.x, p.y - 12 + bob, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(p.x - 5, p.y + 7, 4, 5);
  ctx.fillRect(p.x + 1, p.y + 7, 4, 5);
};

Game.prototype._drawCop = function (ctx, c) {
  const bob = Math.sin(c.phase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(c.x, c.y + 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(c.x - 5, c.y - 8 + bob, 10, 15);
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(c.x, c.y - 12 + bob, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a2a4a';
  ctx.fillRect(c.x - 6, c.y - 16 + bob, 12, 4);
  ctx.fillStyle = '#ffd73c';
  ctx.fillRect(c.x - 2, c.y - 4 + bob, 4, 3);
};

Game.prototype._drawCruiser = function (ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-21, -9, 46, 22);
  ctx.fillStyle = c.color;
  ctx.fillRect(-24, -12, 48, 24);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(-8, -12, 16, 24);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-14, -8, 10, 16);
  const blink = Math.floor(performance.now() / 180) % 2 === 0;
  ctx.fillStyle = blink ? '#ff2a2a' : '#2a6aff';
  ctx.fillRect(-4, -14, 8, 4);
  ctx.restore();
};

Game.prototype._drawGunman = function (ctx, g) {
  const bob = Math.sin(g.phase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(g.x, g.y + 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g.color;
  ctx.fillRect(g.x - 5, g.y - 8 + bob, 10, 15);
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(g.x, g.y - 12 + bob, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(g.x - 2, g.y - 2 + bob, 12, 3);
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(g.x - 8, g.y - 20, 16, 3);
  ctx.fillStyle = '#3ddc5a';
  ctx.fillRect(g.x - 8, g.y - 20, 16 * clamp(g.hp / 70, 0, 1), 3);
};

Game.prototype._drawPlayer = function (ctx) {
  const p = this.player;
  if (p.inCar) return; // the car itself is drawn as traffic
  const bob = Math.sin(p.walkPhase) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  // Muzzle flash.
  if (p.muzzle > 0) {
    ctx.fillStyle = 'rgba(255,220,80,0.9)';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(p.x, p.y + bob * 0.4);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#2a6a4a';
  ctx.fillRect(-6, -9, 14, 18);
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(6, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath(); ctx.arc(7, -2, 6, 0, Math.PI); ctx.fill();
  // Gun in hand.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 12, 4);
  if (p.punchAnim > 0) {
    ctx.fillStyle = '#e8c39a';
    ctx.fillRect(14, -3, 8, 6);
  }
  ctx.restore();
  // Low-health pulse.
  if (p.hp < 30 && !p.dead) {
    ctx.strokeStyle = 'rgba(255,40,40,' + (0.4 + 0.3 * Math.sin(performance.now() / 150)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.stroke();
  }
};

// ------------------------------------------------------------ HUD
Game.prototype._drawHud = function (ctx) {
  const p = this.player;
  const night = this.isNight;
  // Top-left: cash + mission.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14, 12, 250, this.missions.timer > 0 ? 84 : 64);
  ctx.fillStyle = '#3ddc5a';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(fmtMoney(this.cash), 24, 40);
  const m = this.missions.current;
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(m ? 'Mission ' + m.id + '/5: ' + m.name : 'Free roam — King of Solmar', 24, 62);
  if (this.missions.timer > 0) {
    ctx.fillStyle = this.missions.timer < 15 ? '#ff5a5a' : '#ffd73c';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('⏱ ' + Math.ceil(this.missions.timer) + 's', 24, 82);
  }

  // Top-right: wanted stars + clock + day/night icon.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(VIEW_W - 250, 12, 236, 56);
  ctx.font = '22px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < this.police.wanted ? '#ffd73c' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', VIEW_W - 236 + i * 26, 40);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(this.clockText() + '  ' + (night ? '☾' : '☀'), VIEW_W - 24, 62);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd73c';
  ctx.font = '11px sans-serif';
  ctx.fillText(districtAt(p.x, p.y).name, VIEW_W - 236, 62);

  // Bottom-left: health + ammo (+ car HP when driving).
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(14, VIEW_H - 66, 230, 52);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HEALTH', 24, VIEW_H - 48);
  ctx.fillStyle = '#333';
  ctx.fillRect(80, VIEW_H - 58, 140, 12);
  ctx.fillStyle = p.hp > 30 ? '#3ddc5a' : '#ff5a5a';
  ctx.fillRect(80, VIEW_H - 58, 140 * clamp(p.hp / 100, 0, 1), 12);
  ctx.fillStyle = '#fff';
  ctx.fillText('AMMO  ' + p.ammo, 24, VIEW_H - 26);
  if (p.inCar) {
    ctx.fillText('CAR', 130, VIEW_H - 26);
    ctx.fillStyle = '#333';
    ctx.fillRect(168, VIEW_H - 36, 66, 10);
    ctx.fillStyle = p.car.hp > 30 ? '#2a9ad9' : '#ff5a5a';
    ctx.fillRect(168, VIEW_H - 36, 66 * clamp(p.car.hp / 100, 0, 1), 10);
  }

  // Speedometer when driving.
  if (p.inCar) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(VIEW_W - 250, VIEW_H - 250, 56, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(kmh, VIEW_W - 204, VIEW_H - 220);
    ctx.font = '11px sans-serif';
    ctx.fillText('km/h', VIEW_W - 204, VIEW_H - 206);
    ctx.textAlign = 'left';
  }

  // Mission banner (word-wrapped).
  if (this.missions.banner && this.missions.bannerT > 0) {
    const b = this.missions.banner;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const lines = wrapText(ctx, b.text + (b.sub ? ' — ' + b.sub : ''), 'bold 17px sans-serif', 640);
    const h = lines.length * 24 + 22;
    ctx.fillRect(VIEW_W / 2 - 340, 92, 680, h);
    ctx.fillStyle = '#ffd73c';
    ctx.font = 'bold 17px sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, VIEW_W / 2, 92 + 26 + i * 24));
    ctx.textAlign = 'left';
  }

  // Context hint (E prompt near shops / cars).
  if (this.state === 'play') {
    const shop = this.missions.shopInRange(p);
    let hint = null;
    if (shop) hint = 'E — ' + shop.label + ': ' + shop.desc;
    else if (!p.inCar && this.traffic.nearestCar(p.x, p.y, 78)) hint = 'E — Steal car';
    else if (p.inCar) hint = 'E — Exit car';
    if (hint) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(VIEW_W / 2 - 150, VIEW_H - 40, 300, 26);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(hint, VIEW_W / 2, VIEW_H - 22);
      ctx.textAlign = 'left';
    }
  }

  // Waypoint distance readout.
  const wp = this.missions.waypoint;
  if (wp && this.state === 'play') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(VIEW_W / 2 - 120, 12, 240, 26);
    ctx.fillStyle = '#ffd73c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('◆ ' + wp.label + '  ' + Math.round(dist(p.x, p.y, wp.x, wp.y)) + 'm', VIEW_W / 2, 30);
    ctx.textAlign = 'left';
  }

  this._drawMinimap(ctx);
};

Game.prototype._drawMinimap = function (ctx) {
  const S = 180, ox = VIEW_W - S - 14, oy = VIEW_H - S - 14;
  const sc = S / WORLD;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(ox - 4, oy - 4, S + 8, S + 8);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(ox, oy, S, S);
  // Roads.
  ctx.fillStyle = '#4a4a55';
  for (const l of ROAD_LINES) {
    ctx.fillRect(ox + l * sc - 1, oy, 2, S);
    ctx.fillRect(ox, oy + l * sc - 1, S, 2);
  }
  // Buildings (dots).
  ctx.fillStyle = '#6a7a8a';
  for (const b of this.city.buildings) {
    ctx.fillRect(ox + b.x * sc, oy + b.y * sc, Math.max(1.5, b.w * sc), Math.max(1.5, b.h * sc));
  }
  // Shops.
  for (const s of this.city.shops) {
    ctx.fillStyle = s.kind === 'gun' ? '#e8c832' : s.kind === 'garage' ? '#2a9ad9' : '#b06ad9';
    ctx.fillRect(ox + (s.x + s.w / 2) * sc - 2, oy + (s.y + s.h / 2) * sc - 2, 4, 4);
  }
  // Pickups.
  ctx.fillStyle = '#3ddc5a';
  for (const pk of this.missions.pickups) {
    if (!pk.taken) ctx.fillRect(ox + pk.x * sc - 1, oy + pk.y * sc - 1, 2, 2);
  }
  // Taxi passenger / dest.
  const tx = this.missions.taxi;
  if (tx.active && tx.passenger) {
    ctx.fillStyle = '#ffd73c';
    ctx.fillRect(ox + tx.passenger.x * sc - 2, oy + tx.passenger.y * sc - 2, 4, 4);
  }
  if (tx.active && tx.dest) {
    ctx.strokeStyle = '#ffd73c';
    ctx.strokeRect(ox + tx.dest.x * sc - 3, oy + tx.dest.y * sc - 3, 6, 6);
  }
  // Waypoint diamond (pulsing).
  const wp = this.missions.waypoint;
  if (wp) {
    const r = 4 + Math.sin(performance.now() / 250) * 1.5;
    ctx.fillStyle = '#ffd73c';
    ctx.save();
    ctx.translate(ox + wp.x * sc, oy + wp.y * sc);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  // Cops (red) and heli (orange ring).
  ctx.fillStyle = '#ff3a3a';
  for (const c of this.police.cops) ctx.fillRect(ox + c.x * sc - 1.5, oy + c.y * sc - 1.5, 3, 3);
  for (const c of this.police.cruisers) ctx.fillRect(ox + c.x * sc - 2, oy + c.y * sc - 2, 4, 4);
  if (this.police.heli.active) {
    ctx.strokeStyle = '#ff8a2a';
    ctx.beginPath();
    ctx.arc(ox + this.police.heli.x * sc, oy + this.police.heli.y * sc, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Player arrow.
  const p = this.player;
  ctx.save();
  ctx.translate(ox + p.x * sc, oy + p.y * sc);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Viewport rect.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + this.camX * sc, oy + this.camY * sc, VIEW_W * sc, VIEW_H * sc);
  // North + label.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR BAY', ox, oy - 8);
};

/** Word-wrap a string to lines fitting maxW. */
function wrapText(ctx, text, font, maxW) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------ screens
Game.prototype._drawTitle = function (ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd73c';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLMAR BAY', VIEW_W / 2, 220);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('An open-world crime story — six districts, five jobs, one king.', VIEW_W / 2, 262);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#3ddc5a';
  ctx.fillText('— Press ENTER to play —', VIEW_W / 2, 330);
  ctx.fillStyle = '#ddd';
  ctx.font = '16px sans-serif';
  const lines = [
    'WASD / Arrows — walk & drive      E — steal / exit car, use shops',
    'Mouse click — shoot pistol      Space — punch      Shift — run',
    'P — pause      M — mute      Steal a car to start Mission 1: First Wheels',
    'Taxi fares, Gun Shop ($60 ammo), Garage ($80 repair), Spray Shop ($150)',
    'Progress saves automatically — cash, missions and fares.',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, VIEW_W / 2, 400 + i * 30));
  ctx.fillStyle = '#888';
  ctx.font = '13px sans-serif';
  ctx.fillText('Original game. No affiliation with any commercial game series.', VIEW_W / 2, 580);
  ctx.textAlign = 'left';
};

Game.prototype._drawPause = function (ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 340);
  ctx.font = '18px sans-serif';
  ctx.fillText('Press P to resume — progress is saved.', VIEW_W / 2, 390);
  ctx.textAlign = 'left';
};

Game.prototype._drawDead = function (ctx) {
  ctx.fillStyle = 'rgba(60,0,0,0.65)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a5a';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('WASTED', VIEW_W / 2, 340);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('Rook got taken down. Press R to get back on the streets ($100 hospital bill).', VIEW_W / 2, 390);
  ctx.textAlign = 'left';
};

// ------------------------------------------------------------ boot
Game.prototype.run = function () {
  this.bindInput();
  const loop = (ts) => {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0.016);
    this.lastTs = ts;
    this.update(dt);
    this.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

// Debug hooks for automated play-testing (not part of normal play).
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  game.run();
  window.SOLMAR = {
    game,
    state: () => game.state,
    snapshot: () => ({
      state: game.state,
      cash: game.cash,
      mission: game.missions.index,
      missionStage: game.missions.stage,
      missionName: game.missions.current ? game.missions.current.name : 'done',
      wanted: game.police.wanted,
      hp: Math.round(game.player.hp),
      ammo: game.player.ammo,
      inCar: game.player.inCar,
      carType: game.player.car ? game.player.car.type : null,
      carHp: game.player.car ? Math.round(game.player.car.hp) : null,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      time: game.clockText(),
      night: game.isNight,
      cops: game.police.cops.length,
      cruisers: game.police.cruisers.length,
      heli: game.police.heli.active,
      fares: game.missions.faresDone,
      cars: game.traffic.cars.length,
      peds: game.traffic.peds.length,
      gunmen: game.missions.gunmen.length,
      errors: window.__errors || [],
    }),
    setTime: (h) => { game.timeH = h; },
    setWanted: (n) => { game.police.wanted = n; },
    teleport: (x, y) => {
      if (game.player.inCar) { game.player.car.x = x; game.player.car.y = y; }
      game.player.x = x; game.player.y = y;
    },
    giveCar: (type) => {
      const car = game.traffic.cars.find((c) => !c.dead && !c.driven) || game.traffic.cars[0];
      const spec = CAR_TYPES.find((t) => t.key === type) || CAR_TYPES[0];
      car.type = spec.key; car.spec = spec; car.color = spec.colors[0];
      car.parked = false; car.driven = false;
      car.x = game.player.x + 60; car.y = game.player.y;
      car.angle = 0; car.speed = 0;
      return car;
    },
    startMission: (i) => game.missions.startMission(i),
    setCash: (n) => { game.cash = n; },
  };
});
