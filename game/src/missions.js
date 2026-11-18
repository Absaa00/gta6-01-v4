// Solmar Bay — story missions, taxi fares, pickups and shops.
// SPDX-License-Identifier: MIT

'use strict';

/**
 * Story arc: Rook, a wheelman new to Solmar Bay, works for fixer Dalia Voss.
 * 1 First Wheels — steal a car. 2 Payback Run — timed package delivery.
 * 3 Marina Bank — heist against armed guards. 4 Harbor Hustle — crate at the docks.
 * 5 Night Shift — drive Dalia to 3 stops at night with 3 stars on you.
 * Epilogue: King of Solmar.
 */
const MISSION_DEFS = [
  {
    id: 1, name: 'First Wheels', giver: 'Dalia Voss',
    brief: 'Dalia needs wheels. Steal any car on the street — press E next to one.',
    reward: 250,
  },
  {
    id: 2, name: 'Payback Run', giver: 'Dalia Voss',
    brief: 'A package for the Viceroy crew. Grab it at the pickup, deliver it to Palm Court before the timer runs out.',
    reward: 400,
  },
  {
    id: 3, name: 'Marina Bank', giver: 'Dalia Voss',
    brief: 'Hit Marina Bank. Armed guards inside — shoot your way in, grab the cash, get out.',
    reward: 900,
  },
  {
    id: 4, name: 'Harbor Hustle', giver: 'Dalia Voss',
    brief: 'A crate is waiting at the Old Harbor docks. Collect it and bring it to the Marina drop-off. Thugs will try to stop you.',
    reward: 650,
  },
  {
    id: 5, name: 'Night Shift', giver: 'Dalia Voss',
    brief: 'Drive Dalia to three stops across the city tonight. The whole force is looking for you — 3 stars, no spray shop.',
    reward: 1200,
  },
];

const PICKUP_TYPES = {
  cash: { color: '#3ddc5a', label: '$', heal: 0, ammo: 0, money: 50 },
  health: { color: '#ff5a5a', label: '+', heal: 40, ammo: 0, money: 0 },
  ammo: { color: '#e8c832', label: 'A', heal: 0, ammo: 24, money: 0 },
};

/** One armed enemy: guards in the bank, thugs at the docks. */
class Gunman {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind; // 'guard' | 'thug'
    this.hp = kind === 'guard' ? 70 : 50;
    this.speed = kind === 'guard' ? 70 : 95;
    this.shootCd = 1 + Math.random();
    this.phase = Math.random() * 6;
    this.dead = false;
    this.color = kind === 'guard' ? '#2a4a6a' : '#6a2a3a';
  }

  update(dt, player, buildings, bullets) {
    if (this.dead) return;
    this.phase += dt * 8;
    this.shootCd -= dt;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d > 320) {
      const a = angleTo(this.x, this.y, player.x, player.y);
      const nx = this.x + Math.cos(a) * this.speed * dt;
      const ny = this.y + Math.sin(a) * this.speed * dt;
      if (!buildingAt(buildings, nx, ny, 10)) { this.x = nx; this.y = ny; }
    } else if (this.shootCd <= 0 && d < 380) {
      this.shootCd = 1.3 + Math.random() * 0.7;
      const a = angleTo(this.x, this.y, player.x, player.y) + (Math.random() - 0.5) * 0.14;
      bullets.push({
        x: this.x, y: this.y, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460,
        from: 'enemy', life: 1.4, dmg: 9,
      });
    }
  }
}

/** Mission runtime: objectives, timers, taxi fares, pickups, shops. */
class MissionSystem {
  constructor(city) {
    this.city = city;
    this.index = 0;               // 0-based into MISSION_DEFS; 5 = all done
    this.stage = 0;               // stage inside the current mission
    this.timer = 0;               // mission countdown, 0 = none
    this.waypoint = null;         // {x, y, label}
    this.banner = null;           // {text, sub}
    this.bannerT = 0;
    this.gunmen = [];
    this.pickups = [];
    this.taxi = { active: false, passenger: null, dest: null, fare: 0, timer: 0 };
    this.faresDone = 0;
    this.hasPackage = false;
    this.hasCrate = false;
    this.nightShiftStops = 0;
    this.epilogue = false;
    this._spawnPickups();
    this._setWaypointForStage();
  }

  get current() { return MISSION_DEFS[this.index] || null; }
  get done() { return this.index >= MISSION_DEFS.length; }

  showBanner(text, sub) {
    this.banner = { text, sub: sub || '' };
    this.bannerT = 4.5;
  }

  _spawnPickups() {
    const rng = makeRng(4242);
    const spots = [];
    for (let i = 0; i < 14; i++) {
      const road = pick(rng, ROAD_LINES);
      const along = randRange(rng, 120, WORLD - 120);
      if (rng() < 0.5) spots.push({ x: along, y: road + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 6) });
      else spots.push({ x: road + (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 6), y: along });
    }
    const kinds = ['cash', 'cash', 'health', 'ammo', 'cash', 'health', 'ammo', 'cash', 'ammo', 'health', 'cash', 'cash', 'ammo', 'health'];
    this.pickups = spots.map((s, i) => ({ x: s.x, y: s.y, kind: kinds[i % kinds.length], taken: false, bob: rng() * 6 }));
  }

  /** Waypoint for the current mission stage. */
  _setWaypointForStage() {
    const i = this.index, s = this.stage;
    const bank = this.city.bank, docks = this.city.docks, marina = this.city.marina;
    if (this.done) { this.waypoint = null; return; }
    if (i === 0) {
      this.waypoint = { x: 1600, y: 1400, label: 'Steal a car (E)' };
    } else if (i === 1) {
      this.waypoint = s === 0
        ? { x: 1000, y: 1000, label: 'Pick up the package' }
        : { x: 2600, y: 2600, label: 'Deliver the package' };
    } else if (i === 2) {
      this.waypoint = s === 0
        ? { x: bank.x + bank.w / 2, y: bank.y + bank.h / 2, label: 'Enter Marina Bank' }
        : { x: 600, y: 600, label: 'Escape to Crestview' };
    } else if (i === 3) {
      this.waypoint = s === 0
        ? { x: docks.x + docks.w / 2, y: docks.y + docks.h / 2, label: 'Collect the crate' }
        : { x: marina.x + marina.w / 2, y: marina.y + marina.h / 2, label: 'Deliver to the Marina' };
    } else if (i === 4) {
      const stops = [
        { x: 600, y: 600, label: 'Stop 1: Crestview' },
        { x: 2600, y: 1000, label: 'Stop 2: Viceroy' },
        { x: 2200, y: 2600, label: 'Stop 3: Palm Court' },
      ];
      this.waypoint = stops[Math.min(s, 2)];
    }
  }

  startMission(i) {
    this.index = i;
    this.stage = 0;
    this.timer = i === 1 ? 75 : 0;
    this.hasPackage = false;
    this.hasCrate = false;
    this.nightShiftStops = 0;
    this.gunmen = [];
    const m = MISSION_DEFS[i];
    if (m) this.showBanner('Mission: ' + m.name, m.brief);
    this._setWaypointForStage();
  }

  completeMission(game) {
    const m = this.current;
    if (!m) return;
    game.cash += m.reward;
    game.stats.missions++;
    this.showBanner('Mission complete: ' + m.name, '+' + fmtMoney(m.reward) + ' — ' + (MISSION_DEFS[this.index + 1] ? 'Next: ' + MISSION_DEFS[this.index + 1].name : 'That is the whole story.'));
    game.sfx.jingle();
    this.index++;
    this.stage = 0;
    this.timer = 0;
    this.gunmen = [];
    this.hasPackage = false;
    this.hasCrate = false;
    if (this.done) {
      this.epilogue = true;
      this.showBanner('KING OF SOLMAR', 'Rook owns this city now. Free roam — taxi fares, shops and the streets are yours.');
      game.sfx.jingle();
    } else {
      this.startMission(this.index);
    }
    game.save();
  }

  failMission(game, reason) {
    this.showBanner('Mission failed', reason);
    game.sfx.fail();
    this.timer = 0;
    this.gunmen = [];
    this.hasPackage = false;
    this.hasCrate = false;
    this.stage = 0;
    this._setWaypointForStage();
  }

  /** Called when the player steals a car (mission 1 trigger). */
  onCarStolen(game) {
    if (this.index === 0 && this.stage === 0) this.completeMission(game);
  }

  /** Taxi fare lifecycle: hail, pickup, deliver. */
  updateTaxi(dt, game, player) {
    const t = this.taxi;
    if (!player.inCar || player.car.type !== 'taxi') {
      if (t.active) { t.active = false; t.passenger = null; t.dest = null; }
      return;
    }
    if (!t.active) {
      t.active = true;
      const rng = Math.random;
      const road = pick(rng, ROAD_LINES);
      const along = clamp(player.x + (rng() < 0.5 ? -1 : 1) * randRange(rng, 250, 500), 100, WORLD - 100);
      const side = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 6);
      if (rng() < 0.5) { t.passenger = { x: along, y: road + side }; }
      else { t.passenger = { x: road + side, y: along }; }
      t.dest = null;
      t.fare = 0;
      t.timer = 0;
    } else if (t.passenger && !t.dest) {
      if (dist(player.x, player.y, t.passenger.x, t.passenger.y) < 46) {
        const road = pick(Math.random, ROAD_LINES);
        const along = randRange(Math.random, 200, WORLD - 200);
        const dx = Math.random() < 0.5 ? along : road;
        const dy = Math.random() < 0.5 ? road : along;
        t.dest = { x: clamp(dx, 120, WORLD - 120), y: clamp(dy, 120, WORLD - 120) };
        t.fare = 40 + Math.round(dist(t.passenger.x, t.passenger.y, t.dest.x, t.dest.y) / 28);
        t.timer = 60;
        t.passenger = null;
        game.sfx.blip();
        this.showBanner('Passenger aboard', 'Drop them at the marker — fast drop earns a tip.');
      }
    } else if (t.dest) {
      t.timer -= dt;
      if (t.timer <= 0) {
        this.showBanner('Fare lost', 'Too slow — the passenger got out.');
        t.active = false; t.dest = null;
        return;
      }
      if (dist(player.x, player.y, t.dest.x, t.dest.y) < 52) {
        const tip = t.timer > 30 ? Math.round(t.fare * 0.5) : 0;
        const total = t.fare + tip;
        game.cash += total;
        this.faresDone++;
        game.stats.fares++;
        this.showBanner('Fare paid: ' + fmtMoney(total), tip > 0 ? 'Includes a ' + fmtMoney(tip) + ' tip for speed.' : 'Thanks for the ride.');
        game.sfx.blip();
        t.active = false; t.dest = null;
        game.save();
      }
    }
  }

  /** Shops: press E near one to use it. Returns the shop in range, or null. */
  shopInRange(player) {
    for (const s of this.city.shops) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (dist(player.x, player.y, cx, cy) < 110) return s;
    }
    return null;
  }

  useShop(game, shop) {
    if (game.cash < shop.price) {
      this.showBanner('Not enough cash', shop.label + ' costs ' + fmtMoney(shop.price) + '.');
      return;
    }
    if (shop.kind === 'gun') {
      game.cash -= shop.price;
      game.player.ammo += 48;
      this.showBanner('Ammo bought', '+48 pistol rounds for ' + fmtMoney(shop.price) + '.');
      game.sfx.blip();
    } else if (shop.kind === 'garage') {
      const car = game.player.car;
      if (!car || car.hp >= 100) { this.showBanner('Garage', 'No repair needed right now.'); return; }
      game.cash -= shop.price;
      car.hp = 100; car.smoke = 0;
      this.showBanner('Car repaired', 'Good as new — ' + fmtMoney(shop.price) + '.');
      game.sfx.blip();
    } else if (shop.kind === 'spray') {
      if (game.police.wanted === 0) { this.showBanner('Spray Shop', 'You are already clean.'); return; }
      game.cash -= shop.price;
      game.police.clearWanted();
      this.showBanner('Fresh paint', 'The cops lost you — ' + fmtMoney(shop.price) + '.');
      game.sfx.blip();
    }
    game.save();
  }

  /** Spawn the bank guards when the player enters the bank (mission 3). */
  _spawnGuards(game) {
    const bank = this.city.bank;
    const spots = [
      [bank.x + 20, bank.y + 20], [bank.x + bank.w - 20, bank.y + 20],
      [bank.x + 20, bank.y + bank.h - 20], [bank.x + bank.w - 20, bank.y + bank.h - 20],
    ];
    this.gunmen = spots.map((s) => new Gunman(s[0], s[1], 'guard'));
    this.showBanner('Marina Bank', 'Guards! Take them down, then grab the cash.');
    game.sfx.fail();
  }

  /** Spawn dock thugs when the player reaches the crate (mission 4). */
  _spawnThugs(game) {
    const docks = this.city.docks;
    const spots = [
      [docks.x + 10, docks.y + 10], [docks.x + docks.w - 10, docks.y + 10],
      [docks.x + docks.w / 2, docks.y + docks.h + 30],
    ];
    this.gunmen = spots.map((s) => new Gunman(s[0], s[1], 'thug'));
    this.showBanner('Ambush!', 'Thugs want the crate. Fight them off.');
  }

  /** Per-frame mission logic. */
  update(dt, game) {
    const p = game.player;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.index === 1) this.failMission(game, 'The package window closed.');
    }

    // Pickups: walk or drive over one to collect it.
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.bob += dt * 3;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        const t = PICKUP_TYPES[pk.kind];
        if (t.money) { game.cash += t.money; this.showBanner('Cash found', '+' + fmtMoney(t.money)); }
        if (t.heal) { p.hp = clamp(p.hp + t.heal, 0, 100); this.showBanner('Health +', 'You feel better.'); game.sfx.heal(); }
        if (t.ammo) { p.ammo += t.ammo; this.showBanner('Ammo found', '+' + t.ammo + ' rounds.'); }
        if (t.money) game.sfx.blip();
        game.save();
      }
    }

    // Gunmen act.
    for (const g of this.gunmen) g.update(dt, p, this.city.buildings, game.bullets);
    this.gunmen = this.gunmen.filter((g) => !g.dead);

    if (this.done) return;
    const wp = this.waypoint;
    if (!wp) return;

    if (this.index === 1) {
      if (this.stage === 0 && dist(p.x, p.y, wp.x, wp.y) < 52) {
        this.hasPackage = true;
        this.stage = 1;
        this._setWaypointForStage();
        this.showBanner('Package secured', 'Deliver it to Palm Court — watch the clock.');
        game.sfx.blip();
      } else if (this.stage === 1 && dist(p.x, p.y, wp.x, wp.y) < 52) {
        this.completeMission(game);
      }
    } else if (this.index === 2) {
      if (this.stage === 0 && dist(p.x, p.y, wp.x, wp.y) < 90) {
        if (!this._guardsSpawned) {
          this._guardsSpawned = true;
          this._spawnGuards(game);
        } else if (this.gunmen.length === 0) {
          this.stage = 1;
          this._guardsSpawned = false;
          this._setWaypointForStage();
          this.showBanner('Vault emptied', 'Run! Get to Crestview.');
        }
      } else if (this.stage === 1 && dist(p.x, p.y, wp.x, wp.y) < 60) {
        this.completeMission(game);
      }
    } else if (this.index === 3) {
      if (this.stage === 0 && dist(p.x, p.y, wp.x, wp.y) < 70) {
        if (!this._thugsSpawned) { this._thugsSpawned = true; this._spawnThugs(game); }
        if (this.gunmen.length === 0 && this._thugsSpawned) {
          this.hasCrate = true;
          this.stage = 1;
          this._thugsSpawned = false;
          this._setWaypointForStage();
          this.showBanner('Crate secured', 'Deliver it to the Marina.');
          game.sfx.blip();
        }
      } else if (this.stage === 1 && dist(p.x, p.y, wp.x, wp.y) < 60) {
        this.completeMission(game);
      }
    } else if (this.index === 4) {
      if (dist(p.x, p.y, wp.x, wp.y) < 60) {
        this.nightShiftStops++;
        if (this.nightShiftStops >= 3) {
          this.completeMission(game);
        } else {
          this.stage++;
          this._setWaypointForStage();
          this.showBanner('Stop ' + this.nightShiftStops + ' of 3 done', 'Dalia: "Next stop, driver."');
          game.sfx.blip();
        }
      }
    }
  }
}
