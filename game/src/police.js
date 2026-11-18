// Solmar Bay — wanted system: foot cops, police cruisers, helicopter at 5 stars.
// SPDX-License-Identifier: MIT

'use strict';

const WANTED_LABELS = [
  'Clean', 'Petty theft', 'Grand theft', 'Armed & dangerous', 'Cop killer', 'City-wide manhunt',
];

/** A foot cop: chases the player on foot, punches at close range. */
class FootCop {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.speed = 118;
    this.hp = 60;
    this.punchCd = 0;
    this.phase = Math.random() * 6;
    this.dead = false;
  }

  update(dt, player, buildings) {
    if (this.dead) return;
    this.punchCd -= dt;
    this.phase += dt * 9;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d > 26) {
      const a = angleTo(this.x, this.y, player.x, player.y);
      const nx = this.x + Math.cos(a) * this.speed * dt;
      const ny = this.y + Math.sin(a) * this.speed * dt;
      if (!buildingAt(buildings, nx, ny, 10)) { this.x = nx; this.y = ny; }
    } else if (this.punchCd <= 0 && !player.inCar) {
      this.punchCd = 0.9;
      return 'punch';
    }
    return null;
  }
}

/** A police cruiser: rams the player's car, blocks the road ahead. */
class PoliceCruiser {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = 0;
    this.speed = 0;
    this.top = 265;
    this.hp = 120;
    this.color = '#1a2a4a';
    this.dead = false;
    this.ramCd = 0;
  }

  update(dt, player, buildings) {
    if (this.dead) return null;
    this.ramCd -= dt;
    const target = player.inCar ? player.car : player;
    const d = dist(this.x, this.y, target.x, target.y);
    const want = angleTo(this.x, this.y, target.x, target.y);
    const turn = clamp(angleDiff(this.angle, want), -2.6 * dt, 2.6 * dt);
    this.angle += turn;
    const goal = d > 90 ? this.top : this.top * 0.55;
    this.speed += clamp(goal - this.speed, -600 * dt, 500 * dt);
    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;
    if (!buildingAt(buildings, nx, ny, 20)) { this.x = nx; this.y = ny; }
    else { this.angle += 1.2 * dt; this.speed *= 0.6; }
    // Ram: shove the player's car and damage it.
    if (d < 46 && this.ramCd <= 0) {
      this.ramCd = 1.1;
      this.speed *= 0.4;
      return 'ram';
    }
    return null;
  }
}

/** Police helicopter: circles at 5 stars, spotlight cone, calls in more cops. */
class Helicopter {
  constructor() {
    this.angle = 0;
    this.x = 0; this.y = 0;
    this.alt = 1;
    this.active = false;
  }

  update(dt, player) {
    if (!this.active) return;
    this.angle += dt * 0.55;
    const r = 190;
    this.x = player.x + Math.cos(this.angle) * r;
    this.y = player.y + Math.sin(this.angle) * r;
    this.alt = 1;
  }
}

/** Wanted level, police spawns, decay when unseen, spray-shop clearing. */
class Police {
  constructor() {
    this.wanted = 0;
    this.cops = [];
    this.cruisers = [];
    this.heli = new Helicopter();
    this.unseenTimer = 0;
    this.spawnTimer = 0;
    this.decayTimer = 0;
  }

  get label() { return WANTED_LABELS[this.wanted]; }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.unseenTimer = 0;
    this.decayTimer = 0;
    return this.wanted > before ? this.wanted : -1;
  }

  clearWanted() {
    this.wanted = 0;
    this.cops = [];
    this.cruisers = [];
    this.heli.active = false;
    this.unseenTimer = 0;
  }

  /** True when any cop/cruiser/heli can see the player (close enough). */
  _seen(player) {
    for (const c of this.cops) if (dist(c.x, c.y, player.x, player.y) < 460) return true;
    for (const c of this.cruisers) if (dist(c.x, c.y, player.x, player.y) < 520) return true;
    if (this.heli.active) return true;
    return false;
  }

  update(dt, player, buildings, onEvent) {
    // Spawn pressure scales with wanted level.
    const wantCops = this.wanted >= 1 ? Math.min(2 + this.wanted, 6) : 0;
    const wantCruisers = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      if (this.cops.length < wantCops) {
        const a = Math.random() * Math.PI * 2;
        const x = clamp(player.x + Math.cos(a) * 420, 60, WORLD - 60);
        const y = clamp(player.y + Math.sin(a) * 420, 60, WORLD - 60);
        this.cops.push(new FootCop(x, y));
      }
      if (this.cruisers.length < wantCruisers) {
        const a = Math.random() * Math.PI * 2;
        const x = clamp(player.x + Math.cos(a) * 480, 60, WORLD - 60);
        const y = clamp(player.y + Math.sin(a) * 480, 60, WORLD - 60);
        this.cruisers.push(new PoliceCruiser(x, y));
      }
    }
    this.heli.active = this.wanted >= 5;
    this.heli.update(dt, player);

    for (const c of this.cops) {
      const ev = c.update(dt, player, buildings);
      if (ev === 'punch') onEvent('cop-punch', c);
    }
    for (const c of this.cruisers) {
      const ev = c.update(dt, player, buildings);
      if (ev === 'ram') onEvent('cop-ram', c);
    }
    this.cops = this.cops.filter((c) => !c.dead);
    this.cruisers = this.cruisers.filter((c) => !c.dead);

    // Decay: while unseen, wanted drops one star every 8 seconds.
    if (this.wanted > 0) {
      if (this._seen(player)) {
        this.unseenTimer = 0;
        this.decayTimer = 0;
      } else {
        this.unseenTimer += dt;
        if (this.unseenTimer > 3) {
          this.decayTimer += dt;
          if (this.decayTimer > 8) {
            this.decayTimer = 0;
            this.wanted--;
            onEvent('wanted-down', this.wanted);
          }
        }
      }
    }
  }
}
