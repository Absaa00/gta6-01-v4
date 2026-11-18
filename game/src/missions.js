// SPDX-License-Identifier: MIT
// Solmar Bay — missions: the five-job story state machine, plus the
// mission-complete flow, thug ambushes and the free-roam epilogue.

import { MISSIONS, PLACES, TUNE } from './config.js';
import { placeById } from './world.js';
import { addWanted } from './entities.js';

export function makeMissionState(save) {
  return {
    index: save?.missionIndex ?? 0, // which job is active
    done: save?.missionsDone ?? [],
    step: 0,
    timer: 0,
    holdTimer: 0,
    active: false,
    complete: false,
    banner: '',
    bannerTimer: 0,
    nightForced: false,
  };
}

export function currentMission(ms) {
  return MISSIONS[ms.index] ?? null;
}

export function currentStep(ms) {
  const m = currentMission(ms);
  return m ? m.steps[ms.step] : null;
}

export function startMission(ms, state) {
  const m = currentMission(ms);
  if (!m) return;
  ms.active = true;
  ms.step = 0;
  ms.timer = 0;
  ms.holdTimer = 0;
  const step = m.steps[0];
  if (step && step.time) ms.timer = step.time;
  if (step && step.night) {
    state.hour = 21.5;
    ms.nightForced = true;
  }
  ms.banner = `${m.title} — ${m.giver}: ${m.brief}`;
  ms.bannerTimer = 5;
  state.toast = `New job: ${m.title} — $${m.pay}`;
  state.toastTimer = 3;
  state.missionStart = true;
}

function advanceStep(ms, state) {
  const m = currentMission(ms);
  ms.step += 1;
  ms.holdTimer = 0;
  if (ms.step >= m.steps.length) {
    finishMission(ms, state);
    return;
  }
  const step = m.steps[ms.step];
  if (step.time) ms.timer = step.time;
  if (step.wanted) addWanted(state, step.wanted - state.wanted > 0 ? step.wanted - state.wanted : 0, 'Job heat');
  if (step.night) state.hour = 21.5;
  if (m.id === 'marina-bank' && ms.step === 1) spawnBankThugs(state);
  if (m.id === 'night-shift' && ms.step === 1) {
    state.toast = 'Dalia is in the car — do not stop';
    state.toastTimer = 3;
  }
}

function spawnBankThugs(state) {
  const bank = PLACES.bank;
  state.thugs.push(
    { x: bank.x - 40, y: bank.y - 30, hp: TUNE.thugHp, angle: 0, shootCooldown: 1, dead: false },
    { x: bank.x + 40, y: bank.y + 30, hp: TUNE.thugHp, angle: 0, shootCooldown: 1.6, dead: false },
    { x: bank.x + 10, y: bank.y - 50, hp: TUNE.thugHp, angle: 0, shootCooldown: 2.2, dead: false },
  );
  state.toast = 'Bank guards! Fight or hold the lobby';
  state.toastTimer = 3;
}

function finishMission(ms, state) {
  const m = currentMission(ms);
  state.player.cash += m.pay;
  ms.done.push(m.id);
  ms.active = false;
  ms.complete = true;
  ms.banner = `JOB DONE — ${m.title}: +$${m.pay}`;
  ms.bannerTimer = 4;
  state.toast = `+$${m.pay} — ${m.pay >= 1500 ? 'Big score!' : 'Job complete'}`;
  state.toastTimer = 3;
  state.chime = true;
  ms.index += 1;
  if (ms.index >= MISSIONS.length) {
    ms.banner = 'KING OF SOLMAR — all five jobs done. The city is yours. Free roam!';
    ms.bannerTimer = 6;
  }
  // save progress
  try {
    localStorage.setItem('solmar-bay-save', JSON.stringify({
      cash: state.player.cash,
      missionIndex: ms.index,
      missionsDone: ms.done,
      taxiDone: state.taxiDone || 0,
    }));
  } catch { /* storage unavailable: progress just does not persist */ }
}

export function failMission(ms, state, reason) {
  const m = currentMission(ms);
  if (!m) return;
  ms.active = false;
  ms.step = 0;
  ms.timer = 0;
  ms.banner = `JOB FAILED — ${m.title}: ${reason}. Talk to Dalia to retry.`;
  ms.bannerTimer = 4;
  state.toast = 'Job failed — press E near the garage to retry';
  state.toastTimer = 3;
  state.thugs = [];
}

// Per-frame mission logic. Returns nothing; mutates ms and state.
export function updateMissions(ms, state, dt) {
  ms.bannerTimer = Math.max(0, ms.bannerTimer - dt);
  if (!ms.active) return;
  const m = currentMission(ms);
  const step = currentStep(ms);
  if (!m || !step) return;
  const p = state.player;

  if (step.time) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      failMission(ms, state, 'out of time');
      return;
    }
  }

  const place = step.place ? placeById(step.place) : null;
  const near = place ? Math.hypot(place.x - p.x, place.y - p.y) < 60 : false;

  switch (step.kind) {
    case 'stealCar':
      if (p.inCar) advanceStep(ms, state);
      break;
    case 'goto':
      if (near) advanceStep(ms, state);
      break;
    case 'pickup':
      // E at the docks grabs the crate; the step completes in main.js via interact
      if (state.crateTaken) {
        state.crateTaken = false;
        advanceStep(ms, state);
      }
      break;
    case 'checkpoint':
      if (near) {
        state.chime = true;
        advanceStep(ms, state);
      }
      break;
    case 'hold': {
      if (near) {
        ms.holdTimer += dt;
        if (ms.holdTimer >= step.seconds) advanceStep(ms, state);
      } else {
        ms.holdTimer = Math.max(0, ms.holdTimer - dt * 0.5);
      }
      break;
    }
    default:
      break;
  }
}

// The waypoint the HUD and minimap point at right now.
export function missionWaypoint(ms, state) {
  if (ms.active) {
    const step = currentStep(ms);
    if (!step) return null;
    if (step.kind === 'stealCar') {
      // point at the nearest traffic car
      let best = null;
      let bestD = Infinity;
      for (const c of state.traffic) {
        if (c.wrecked) continue;
        const d = Math.hypot(c.x - state.player.x, c.y - state.player.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best ? { x: best.x, y: best.y, label: 'Steal this car' } : null;
    }
    if (step.place) {
      const place = placeById(step.place);
      return { x: place.x, y: place.y, label: step.text };
    }
    return null;
  }
  // Between jobs: point at the garage to start the next one.
  const next = currentMission(ms);
  if (next) return { x: PLACES.garage.x, y: PLACES.garage.y, label: `Next job: ${next.title}` };
  return null;
}

export function missionObjectiveText(ms) {
  const m = currentMission(ms);
  if (!m) return 'Free roam — Solmar Bay is yours';
  if (!ms.active) return `Next job: ${m.title} — go to Kade's Garage (E)`;
  const step = currentStep(ms);
  if (!step) return m.title;
  let text = step.text;
  if (step.kind === 'hold') {
    const left = Math.max(0, Math.ceil(step.seconds - ms.holdTimer));
    text += ` (${left}s)`;
  }
  if (step.time) text += ` — ${Math.ceil(ms.timer)}s left`;
  return text;
}
