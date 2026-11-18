// SPDX-License-Identifier: MIT
// Solmar Bay — main: the game loop, camera, save/load, the E-interact
// flow (steal, shops, mission triggers), day/night clock, rain, skid
// marks and the screenshot staging used for the entry's screenshots.

import { WORLD, DAY, TUNE, PLACES } from './config.js';
import { makeRng } from './random.js';
import { generateCity } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { draw } from './render.js';
import {
  makePlayer, spawnTraffic, spawnPedestrians, spawnPickups,
  updatePlayerOnFoot, updatePlayerDriving, nearestStealableCar, stealCar, exitCar,
  updateTraffic, updatePedestrians, updateWanted, spawnPolice, updatePolice,
  playerPunch, playerShoot, updateBullets, updateThugs,
  updatePickups, maybeOfferTaxi, updateTaxi, nearestShop, useShop,
} from './entities.js';
import { makeMissionState, startMission, updateMissions, failMission, currentMission } from './missions.js';

const SAVE_KEY = 'solmar-bay-save';
const SEED = 20261118;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return s;
  } catch {
    return null;
  }
}

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.player.cash,
      missionIndex: state.missions.index,
      missionsDone: state.missions.done,
      taxiDone: state.taxiDone || 0,
    }));
  } catch { /* storage unavailable */ }
}

function createState() {
  const save = loadSave();
  const rng = makeRng(SEED);
  const city = generateCity(SEED);
  const player = makePlayer(720, 1500);
  player.cash = save?.cash ?? 0;
  const state = {
    city,
    player,
    missions: makeMissionState(save),
    traffic: spawnTraffic(rng, TUNE.trafficCars, 1320, 990),
    peds: spawnPedestrians(rng, TUNE.pedestrians, 1320, 990),
    police: [],
    footCops: [],
    thugs: [],
    bullets: [],
    enemyBullets: [],
    pickups: spawnPickups(rng, 14),
    particles: [],
    explosions: [],
    skids: [],
    rain: [],
    taxi: null,
    taxiDone: save?.taxiDone ?? 0,
    wanted: 0,
    wantedTimer: 0,
    wantedFlash: 0,
    lastCrime: '',
    gunfireTimer: 0,
    heli: null,
    hour: DAY.startHour,
    raining: false,
    screen: 'title',
    camera: { x: 0, y: 0 },
    shake: 0,
    punchFx: 0,
    muzzle: 0,
    toast: '',
    toastTimer: 0,
    chime: false,
    crateTaken: false,
    missionStart: false,
    time: 0,
    rng,
    muted: false,
    bustedTimer: 0,
  };
  return state;
}

// ---- interactions ----------------------------------------------------------

function handleInteract(state) {
  const p = state.player;
  const ms = state.missions;
  // in a car: exit it
  if (p.inCar) {
    exitCar(p, state.city);
    return;
  }
  // mission pickup at the docks
  const m = currentMission(ms);
  if (ms.active && m && m.id === 'harbor-hustle' && ms.step === 1) {
    if (Math.hypot(PLACES.docks.x - p.x, PLACES.docks.y - p.y) < 80) {
      state.crateTaken = true;
      state.toast = 'Crate secured — get it to the Beach Hideout';
      state.toastTimer = 2.5;
      return;
    }
  }
  // start / retry a job at the garage
  if (!ms.active && Math.hypot(PLACES.garage.x - p.x, PLACES.garage.y - p.y) < 90) {
    if (currentMission(ms)) {
      startMission(ms, state);
      return;
    }
  }
  // shops
  const shop = nearestShop(state);
  if (shop) {
    useShop(state, shop);
    return;
  }
  // steal the nearest car
  const car = nearestStealableCar(p, [...state.traffic, ...state.police]);
  if (car) {
    stealCar(p, car, state);
    state.toast = car.isPolice ? 'You stole a police cruiser!' : 'Car stolen — lose the heat';
    state.toastTimer = 2;
  }
}

// ---- per-frame update ------------------------------------------------------

function update(state, dt, input, audio) {
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 22);
  state.punchFx = Math.max(0, state.punchFx - dt);
  state.muzzle = Math.max(0, state.muzzle - dt);
  state.toastTimer = Math.max(0, state.toastTimer - dt);
  state.gunfireTimer = Math.max(0, state.gunfireTimer - dt);

  if (state.screen !== 'play') return;

  // clock: a full day is 8 real minutes
  state.hour = (state.hour + dt / (DAY.secondsPerHour * 24) * 24) % 24;
  // rain sometimes at night
  if (state.hour >= 20 || state.hour < 5) {
    if (!state.raining && Math.random() < dt * 0.02) state.raining = true;
  } else if (state.raining && Math.random() < dt * 0.05) {
    state.raining = false;
  }
  if (state.raining) {
    for (let i = 0; i < 3; i++) {
      state.rain.push({ x: state.camera.x + Math.random() * 1280, y: state.camera.y - 20, v: 420 });
    }
  }
  for (const drop of state.rain) drop.y += drop.v * dt;
  state.rain = state.rain.filter((d) => d.y < state.camera.y + 800);

  const p = state.player;
  const wasInCar = !!p.inCar;
  const prevSpeed = p.inCar ? p.inCar.speed : 0;

  if (p.inCar) updatePlayerDriving(p, input, dt, state.city);
  else updatePlayerOnFoot(p, input, dt, state.city);

  // skid marks when cornering hard
  if (p.inCar && Math.abs(p.inCar.speed) > 200 && Math.abs(input.axis().x) > 0) {
    const car = p.inCar;
    state.skids.push({
      x1: car.x - Math.cos(car.angle) * 20, y1: car.y - Math.sin(car.angle) * 20,
      x2: car.x - Math.cos(car.angle) * 22, y2: car.y - Math.sin(car.angle) * 22,
    });
    if (state.skids.length > 220) state.skids.splice(0, state.skids.length - 220);
  }
  // hard stop / crash into a building
  if (wasInCar && p.inCar && prevSpeed > 260 && Math.abs(p.inCar.speed) < 60) {
    audio.crash();
    state.shake = 7;
  }

  // actions
  if (input.wasPressed('interact')) handleInteract(state);
  if (input.wasPressed('punch')) {
    playerPunch(state);
    audio.punch();
  }
  if (input.isDown('shoot')) {
    const before = p.ammo;
    playerShoot(state);
    if (p.ammo < before) audio.shoot();
  }
  if (input.wasPressed('mute')) {
    state.muted = audio.toggleMute();
    state.toast = state.muted ? 'Sound muted (M)' : 'Sound on (M)';
    state.toastTimer = 1.5;
  }
  if (input.wasPressed('pause')) {
    state.screen = 'pause';
  }

  updateTraffic(state.traffic, dt, state.city, p, state);
  updatePedestrians(state.peds, dt, state.city, state, p);
  updateWanted(state, dt, p, state.police);
  if (state.wanted > 0) spawnPolice(state, state.rng);
  updatePolice(state, dt);
  updateBullets(state, dt);
  updateThugs(state, dt);
  updatePickups(state, dt);
  maybeOfferTaxi(state, state.rng);
  updateTaxi(state, dt);
  updateMissions(state.missions, state, dt);

  // particles + explosions age out
  for (const pt of state.particles) pt.t += dt;
  state.particles = state.particles.filter((pt) => pt.t < 0.6);
  for (const ex of state.explosions) ex.t += dt;
  if (state.explosions.length) {
    audio.explosion();
    state.shake = Math.max(state.shake, 8);
  }
  state.explosions = state.explosions.filter((ex) => ex.t < 0.8);

  // audio: engine + siren follow the game
  const speedRatio = p.inCar ? p.inCar.speed / p.inCar.spec.top : 0;
  audio.setEngine(speedRatio, !!p.inCar);
  audio.setSiren(state.police.some((c) => !c.wrecked));
  audio.updateSiren(dt);
  if (state.chime) {
    state.chime = false;
    audio.chime();
    if (state.missions.complete) {
      state.missions.complete = false;
      audio.jingle();
    }
  }

  // health regen (slow, only when not wanted)
  if (state.wanted === 0 && p.hp < TUNE.playerHp) p.hp = Math.min(TUNE.playerHp, p.hp + 1.2 * dt);

  // busted / wasted
  if (p.hp <= 0) {
    state.screen = 'wasted';
    saveGame(state);
    return;
  }
  if (state.wanted >= 3) {
    const closeCop = state.police.some((c) => !c.wrecked && Math.hypot(c.x - p.x, c.y - p.y) < 40 && !p.inCar);
    if (closeCop) {
      state.bustedTimer += dt;
      if (state.bustedTimer > 1.2) {
        state.screen = 'busted';
        state.bustedTimer = 0;
        saveGame(state);
        return;
      }
    } else {
      state.bustedTimer = 0;
    }
  }

  // camera follows the player, clamped to the world
  const vw = state.viewW;
  const vh = state.viewH;
  const tx = p.x - vw / 2;
  const ty = p.y - vh / 2;
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 6);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 6);
  state.camera.x = Math.max(-40, Math.min(WORLD.w - vw + 40, state.camera.x));
  state.camera.y = Math.max(-40, Math.min(WORLD.h - vh + 40, state.camera.y));

  // autosave every 10 seconds of play
  if (Math.floor(state.time) % 10 === 0 && Math.floor(state.time - dt) % 10 !== 0) saveGame(state);
}

// ---- screenshot staging ----------------------------------------------------
// ?shot=1..4 stages a real game state (no fake rendering) for screenshots.

function stageShot(state, n) {
  const p = state.player;
  state.screen = 'play';
  if (n === 1) {
    // Cover: Marina Bank escape at dusk, wanted 4, police chase on the beach road.
    state.hour = 16.5;
    state.missions.index = 3;
    startMission(state.missions, state);
    state.missions.step = 2; // escape leg
    state.wanted = 4;
    state.lastCrime = 'Bank robbery';
    p.x = 420; p.y = 1020; p.angle = 0;
    const car = state.traffic.find((c) => c.kind === 'sport') || state.traffic[0];
    car.x = 420; car.y = 1020; car.angle = 0; car.speed = 0;
    p.inCar = car;
    car.isPlayer = true;
    for (let i = 0; i < 3; i++) spawnPolice(state, state.rng);
    state.police.forEach((cop, i) => {
      cop.x = 420 - 140 - i * 90;
      cop.y = 1020 + (i % 2 ? 40 : -40);
      cop.angle = 0;
      cop.speed = 300;
    });
    state.camera.x = 0;
    state.camera.y = 1020 - state.viewH / 2;
  } else if (n === 2) {
    // Daytime downtown: driving a taxi fare through dense traffic, on a timed job.
    state.hour = 11.5;
    state.missions.index = 2;
    startMission(state.missions, state);
    state.missions.step = 0;
    state.missions.timer = 132;
    p.x = 1320; p.y = 1020; p.angle = Math.PI / 2;
    const car = state.traffic.find((c) => c.kind === 'taxi') || state.traffic[0];
    car.x = 1320; car.y = 1020; car.angle = Math.PI / 2; car.speed = 180;
    p.inCar = car;
    car.isPlayer = true;
    state.taxi = { x: 1420, y: 1120, dest: PLACES.plaza, state: 'riding', timer: 60, fare: TUNE.taxiFare };
    // traffic placed ON roads, driving along them (avenues + streets near the camera)
    const roadSpots = [
      [1020, 800, -Math.PI / 2], [1020, 1180, Math.PI / 2], [1320, 760, -Math.PI / 2],
      [1320, 1280, Math.PI / 2], [1620, 840, -Math.PI / 2], [1620, 1220, Math.PI / 2],
      [1920, 900, -Math.PI / 2], [1920, 1160, Math.PI / 2],
      [860, 720, 0], [1180, 720, Math.PI], [1500, 720, 0], [1820, 720, Math.PI],
      [900, 1020, 0], [1560, 1020, Math.PI], [1880, 1020, 0],
      [900, 1320, 0], [1180, 1320, Math.PI], [1560, 1320, 0], [1900, 1320, Math.PI],
      [1020, 1620, 0], [1420, 1620, Math.PI], [1800, 1620, 0],
    ];
    state.traffic.forEach((c, i) => {
      if (c === car) return;
      const spot = roadSpots[i % roadSpots.length];
      c.x = spot[0];
      c.y = spot[1];
      c.angle = spot[2];
      c.speed = 80;
    });
    state.camera.x = 1320 - state.viewW / 2;
    state.camera.y = 1020 - state.viewH / 2;
  } else if (n === 3) {
    // Night chase: wanted 4 in neon downtown, helicopter overhead.
    state.hour = 22.2;
    state.missions.index = 4;
    startMission(state.missions, state);
    state.missions.step = 1;
    state.wanted = 5;
    state.lastCrime = 'Night Shift getaway';
    p.x = 1620; p.y = 1020; p.angle = Math.PI;
    const car = state.traffic.find((c) => c.kind === 'sport') || state.traffic[0];
    car.x = 1620; car.y = 1020; car.angle = Math.PI; car.speed = 320;
    car.color = '#ffd94a'; // bright getaway car, readable at night
    p.inCar = car;
    car.isPlayer = true;
    for (let i = 0; i < 4; i++) spawnPolice(state, state.rng);
    state.police.forEach((cop, i) => {
      cop.x = 1620 + 160 + i * 70;
      cop.y = 1020 + (i % 2 ? 36 : -36);
      cop.angle = Math.PI;
      cop.speed = 330;
    });
    state.heli = { x: 1620, y: 800, t: 0 };
    state.camera.x = 1620 - state.viewW / 2;
    state.camera.y = 1020 - state.viewH / 2;
  } else {
    // On foot in Palm Park at noon: pedestrians, mission waypoint, pickups.
    state.hour = 12.5;
    state.missions.index = 1;
    startMission(state.missions, state);
    state.missions.step = 0;
    p.x = 1170; p.y = 620; p.angle = -Math.PI / 2;
    p.hp = 82;
    p.ammo = 18;
    p.cash = 640;
    state.peds.forEach((ped, i) => {
      // spread across the park and the sidewalks around it, not one blob
      const col = i % 10;
      const row = Math.floor(i / 10);
      ped.x = 1060 + col * 34 + (row % 2 ? 12 : 0);
      ped.y = 470 + row * 44;
      ped.angle = (i * 1.7) % (Math.PI * 2);
    });
    state.pickups.push({ x: 1240, y: 660, kind: 'cash', taken: false, bob: 1 });
    state.camera.x = 1170 - state.viewW / 2;
    state.camera.y = 570 - state.viewH / 2;
  }
  // let one update settle positions, then freeze the frame for the shot
  update(state, 0.05, { axis: () => ({ x: 0, y: 0 }), isDown: () => false, wasPressed: () => false }, { setEngine: () => {}, setSiren: () => {}, updateSiren: () => {}, chime: () => {}, jingle: () => {}, crash: () => {}, explosion: () => {}, shoot: () => {}, punch: () => {} });
  state.frozen = true; // staged shots render one exact frame, nothing moves or decays
  state.camera.x = Math.max(-40, Math.min(WORLD.w - state.viewW + 40, state.camera.x));
  state.camera.y = Math.max(-40, Math.min(WORLD.h - state.viewH + 40, state.camera.y));
}

// ---- boot ------------------------------------------------------------------

export function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const input = createInput();
  const audio = createAudio();
  const state = createState();

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.viewW = canvas.width;
    state.viewH = canvas.height;
  }
  window.addEventListener('resize', resize);
  resize();

  const params = new URLSearchParams(window.location.search);
  const shot = Number(params.get('shot') || 0);
  const autostart = params.get('autostart') === '1';
  if (shot >= 1 && shot <= 4) {
    stageShot(state, shot);
    state.screen = 'play';
  } else if (autostart) {
    state.screen = 'play';
  }

  let last = performance.now();
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    // global keys work on every screen
    if (input.wasPressed('confirm')) {
      audio.unlock();
      if (state.screen === 'title') {
        state.screen = 'play';
        state.camera.x = state.player.x - state.viewW / 2;
        state.camera.y = state.player.y - state.viewH / 2;
      } else if (state.screen === 'busted' || state.screen === 'wasted') {
        const fresh = createState();
        Object.assign(state, fresh);
        state.screen = 'play';
      }
    }
    if (state.screen === 'pause' && (input.wasPressed('pause') || input.wasPressed('confirm'))) {
      state.screen = 'play';
      input.consume('pause');
      input.consume('confirm');
    }
    if (!state.frozen) update(state, dt, input, audio);
    draw(ctx, state, canvas.width, canvas.height);
    input.endFrame();
  }
  raf = requestAnimationFrame(frame);

  // expose a tiny handle for automated checks (not part of the game UI)
  window.__solmar = {
    state,
    screen: () => state.screen,
    wanted: () => state.wanted,
    missionsDone: () => state.missions.done.length,
  };
  return { state, stop: () => cancelAnimationFrame(raf) };
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', boot);
}
