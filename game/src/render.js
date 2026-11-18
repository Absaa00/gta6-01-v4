// SPDX-License-Identifier: MIT
// Solmar Bay — render: draws the city, cars, people, police, effects and
// the whole HUD (health, cash, ammo, wanted stars, objective, speedometer,
// clock, minimap) plus the title, pause, busted and wasted screens.

import { WORLD, PALETTE, PLACES, VEHICLES, TUNE } from './config.js';
import { daylight, isNight } from './world.js';
import { currentMission, missionObjectiveText, missionWaypoint } from './missions.js';

const MINIMAP = 180;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Mix a hex colour toward black by factor t (0 = colour, 1 = black).
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - t));
  const g = Math.round(((n >> 8) & 255) * (1 - t));
  const b = Math.round((n & 255) * (1 - t));
  return `rgb(${r},${g},${b})`;
}

// ---- world -----------------------------------------------------------------

function drawGround(ctx, city, cam, vw, vh, light) {
  const { w, h } = WORLD;
  // base grass
  ctx.fillStyle = shade(PALETTE.grass, 1 - light);
  ctx.fillRect(cam.x, cam.y, vw, vh);
  // ocean west + east
  ctx.fillStyle = shade(PALETTE.ocean, 1 - light);
  ctx.fillRect(cam.x, cam.y, Math.max(0, 44 - cam.x), vh);
  ctx.fillRect(Math.max(cam.x, 2596), cam.y, vw, vh);
  ctx.fillStyle = shade(PALETTE.oceanDeep, 1 - light);
  ctx.fillRect(cam.x, cam.y, Math.max(0, 18 - cam.x), vh);
  // sand
  ctx.fillStyle = shade(PALETTE.sand, 1 - light);
  ctx.fillRect(Math.max(cam.x, 44), cam.y, Math.min(vw, 96 - Math.max(cam.x, 44)), vh);
  // harbor water + docks
  ctx.fillStyle = shade('#6a6a60', 1 - light);
  ctx.fillRect(Math.max(cam.x, 2560), cam.y, vw, vh);
  // park
  const p = city.park;
  ctx.fillStyle = shade(PALETTE.parkGrass, 1 - light);
  ctx.fillRect(p.x, p.y, p.w, p.h);
  // pond
  ctx.fillStyle = shade('#3a8ac6', 1 - light);
  ctx.beginPath();
  ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, 34, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  // roads
  ctx.fillStyle = shade(PALETTE.road, 1 - light);
  for (const ax of WORLD.avenues) ctx.fillRect(ax - WORLD.roadHalf, cam.y, WORLD.roadHalf * 2, vh);
  for (const sy of WORLD.streets) ctx.fillRect(cam.x, sy - WORLD.roadHalf, vw, WORLD.roadHalf * 2);
  // sidewalks
  ctx.fillStyle = shade(PALETTE.sidewalk, 1 - light);
  for (const ax of WORLD.avenues) {
    ctx.fillRect(ax - WORLD.roadHalf - 12, cam.y, 10, vh);
    ctx.fillRect(ax + WORLD.roadHalf + 2, cam.y, 10, vh);
  }
  for (const sy of WORLD.streets) {
    ctx.fillRect(cam.x, sy - WORLD.roadHalf - 12, vw, 10);
    ctx.fillRect(cam.x, sy + WORLD.roadHalf + 2, vw, 10);
  }
  // lane dashes
  ctx.fillStyle = shade(PALETTE.lane, 1 - light);
  for (const ax of WORLD.avenues) {
    for (let y = Math.floor(cam.y / 48) * 48; y < cam.y + vh; y += 48) ctx.fillRect(ax - 2, y, 4, 22);
  }
  for (const sy of WORLD.streets) {
    for (let x = Math.floor(cam.x / 48) * 48; x < cam.x + vw; x += 48) ctx.fillRect(x, sy - 2, 22, 4);
  }
  // crosswalks at intersections
  ctx.fillStyle = 'rgba(240,240,230,0.75)';
  for (const ax of WORLD.avenues) {
    for (const sy of WORLD.streets) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(ax - 26 + i * 8, sy - WORLD.roadHalf - 2, 4, 8);
      }
    }
  }
  void w;
  void h;
}

function drawBuildings(ctx, city, cam, vw, vh, light, night) {
  for (const b of city.buildings) {
    if (b.x > cam.x + vw + 80 || b.x + b.w < cam.x - 80 || b.y > cam.y + vh + 80 || b.y + b.h < cam.y - 80) continue;
    // height shadow to the south-east
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + b.height * 0.35, b.y + b.height * 0.35, b.w, b.h);
    ctx.fillStyle = shade(b.color, 1 - light);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // roof inset
    ctx.fillStyle = shade(b.roof, 1 - light);
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    // windows
    ctx.fillStyle = night ? '#ffe98a' : shade('#2a3a4a', 1 - light);
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (((i * 7 + j * 13 + b.x) % 5) < 2) continue;
        ctx.fillRect(b.x + 9 + i * 24, b.y + 9 + j * 24, 10, 12);
      }
    }
    // neon sign on downtown towers
    if (b.neon) {
      ctx.fillStyle = b.neon;
      ctx.globalAlpha = night ? 1 : 0.55;
      ctx.fillRect(b.x + b.w / 2 - 14, b.y - 4, 28, 7);
      ctx.globalAlpha = 1;
    }
  }
  // named-place markers (bank, garage, shops) get a small sign
  for (const [id, place] of Object.entries(PLACES)) {
    if (place.x < cam.x - 60 || place.x > cam.x + vw + 60 || place.y < cam.y - 60 || place.y > cam.y + vh + 60) continue;
    ctx.fillStyle = '#222';
    ctx.fillRect(place.x - 26, place.y - 34, 52, 14);
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(place.name.toUpperCase().slice(0, 12), place.x, place.y - 24);
  }
}

function drawParkAndProps(ctx, city, cam, vw, vh, light) {
  for (const t of city.trees) {
    if (t.x < cam.x - 30 || t.x > cam.x + vw + 30 || t.y < cam.y - 30 || t.y > cam.y + vh + 30) continue;
    ctx.fillStyle = shade('#6a4a2a', 1 - light);
    ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
    ctx.fillStyle = shade(t.palm ? '#3a9a4a' : '#2f7a3a', 1 - light);
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const u of city.umbrellas) {
    if (u.x < cam.x - 30 || u.x > cam.x + vw + 30 || u.y < cam.y - 30 || u.y > cam.y + vh + 30) continue;
    ctx.fillStyle = shade(u.color, 1 - light);
    ctx.beginPath();
    ctx.arc(u.x, u.y, 10, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = shade('#e8e8e8', 1 - light);
    ctx.fillRect(u.x - 8, u.y, 16, 5);
  }
  for (const boat of city.boats) {
    ctx.fillStyle = shade(boat.color, 1 - light);
    ctx.fillRect(boat.x, boat.y, 14, boat.len);
    ctx.fillStyle = shade('#2a2a2a', 1 - light);
    ctx.fillRect(boat.x + 3, boat.y + 8, 8, 10);
  }
  // lamps glow at night
  ctx.fillStyle = '#3a3a3a';
  for (const l of city.lamps) {
    if (l.x < cam.x - 20 || l.x > cam.x + vw + 20 || l.y < cam.y - 20 || l.y > cam.y + vh + 20) continue;
    ctx.fillRect(l.x - 2, l.y - 6, 4, 12);
  }
}

function drawCar(ctx, car, light, night) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const spec = car.spec;
  const w = spec.w;
  const h = spec.h;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  const color = car.wrecked ? '#2a2a2a' : car.color;
  // cars keep some of their paint at night so they still read in the dark
  const cs = (1 - light) * 0.55;
  ctx.fillStyle = shade(color, cs);
  // rounded body
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fill();
  // cabin + windows
  ctx.fillStyle = car.wrecked ? '#1a1a1a' : shade('#1e2a38', cs);
  ctx.beginPath();
  ctx.roundRect(-w / 6, -h / 2 + 3, w / 3, h - 6, 3);
  ctx.fill();
  // headlights / taillights
  ctx.fillStyle = night ? '#fff8c8' : '#e8e8c8';
  ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 5);
  ctx.fillRect(w / 2 - 2, h / 2 - 8, 3, 5);
  ctx.fillStyle = '#c82a2a';
  ctx.fillRect(-w / 2, -h / 2 + 3, 3, 5);
  ctx.fillRect(-w / 2, h / 2 - 8, 3, 5);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.fillRect(-6, -h / 2 + 2, 12, 5);
    ctx.fillStyle = '#ffe14a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -h / 2 + 6);
  }
  if (car.isPolice) {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(-w / 4, -h / 2 + 2, w / 2, h - 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    // light bar flashing
    const phase = Math.floor(performance.now() / 180) % 2;
    ctx.fillStyle = phase ? '#ff2a2a' : '#2a6aff';
    ctx.fillRect(-8, -h / 2 - 2, 7, 4);
    ctx.fillStyle = phase ? '#2a6aff' : '#ff2a2a';
    ctx.fillRect(1, -h / 2 - 2, 7, 4);
  }
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(60,60,60,0.8)';
    ctx.beginPath();
    ctx.arc(-w / 4, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // smoke from a damaged car
  if (!car.wrecked && car.hp < car.spec.hp * 0.45) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, 7 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPerson(ctx, x, y, angle, shirt, skin, hair, light, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = shade(shirt, 1 - light);
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = shade(skin, 1 - light);
  ctx.beginPath();
  ctx.arc(6, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(hair, 1 - light);
  ctx.beginPath();
  ctx.arc(5, -2, 5, Math.PI * 0.7, Math.PI * 1.7);
  ctx.fill();
  // facing tick
  ctx.fillStyle = shade(skin, 1 - light);
  ctx.fillRect(10, -2, 4, 4);
  ctx.restore();
}

function drawPlayer(ctx, p, light) {
  if (p.inCar) return; // the car drawing covers the player
  drawPerson(ctx, p.x, p.y, p.angle, '#e84a6a', '#f2c89a', '#2a2a2a', light, 1.15);
  // jacket stripe so the hero reads at a glance
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffd94a';
  ctx.fillRect(-6, -8, 12, 3);
  ctx.restore();
  // punch arc
  if (p.punchCooldown > 0.25) {
    ctx.strokeStyle = 'rgba(255,220,80,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 12, p.angle - 0.9, p.angle + 0.9);
    ctx.stroke();
  }
  // muzzle flash
  if (p.shootCooldown > 0.2) {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- effects ----------------------------------------------------------------

function drawEffects(ctx, state, light) {
  // skid marks
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  ctx.lineWidth = 3;
  for (const s of state.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  // bullets
  ctx.fillStyle = '#ffe14a';
  for (const b of state.bullets) {
    ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
  }
  ctx.fillStyle = '#ff5a4a';
  for (const b of state.enemyBullets) {
    ctx.fillRect(b.x - 3, b.y - 1, 6, 2);
  }
  // particles
  for (const pt of state.particles) {
    const a = 1 - pt.t / 0.6;
    ctx.fillStyle = pt.kind === 'hit' ? `rgba(255,80,60,${a})` : `rgba(255,220,90,${a})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3 + pt.t * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // explosions
  for (const ex of state.explosions) {
    const r = ex.big ? 26 + ex.t * 90 : 14 + ex.t * 50;
    const a = Math.max(0, 1 - ex.t / 0.8);
    ctx.fillStyle = `rgba(255,${Math.floor(140 * a + 40)},30,${a})`;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,240,160,${a})`;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // rain at night
  if (state.raining) {
    ctx.strokeStyle = 'rgba(180,200,255,0.35)';
    ctx.lineWidth = 1;
    for (const drop of state.rain) {
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - 4, drop.y + 12);
      ctx.stroke();
    }
  }
  void light;
}

// ---- HUD --------------------------------------------------------------------

function drawHud(ctx, state, vw, vh) {
  const p = state.player;
  const ms = state.missions;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // top-left: health + cash + ammo
  ctx.fillStyle = 'rgba(10,10,14,0.55)';
  ctx.fillRect(12, 12, 250, 74);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('JUNO REYES', 22, 32);
  // health bar
  ctx.fillStyle = '#333';
  ctx.fillRect(22, 40, 150, 12);
  ctx.fillStyle = p.hp > 50 ? '#4ad85a' : p.hp > 25 ? '#ffb13a' : '#ff4a3a';
  ctx.fillRect(22, 40, 150 * clamp(p.hp / TUNE.playerHp, 0, 1), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`${Math.max(0, Math.ceil(p.hp))} HP`, 180, 51);
  ctx.fillStyle = '#7aff5a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 22, 76);
  ctx.fillStyle = '#ffe14a';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Ammo ${p.ammo}  •  Fares ${state.taxiDone || 0}`, 110, 76);

  // top-right: wanted stars + clock
  const hour = state.hour;
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(10,10,14,0.55)';
  ctx.fillRect(vw - 262, 12, 250, 88);
  ctx.font = 'bold 22px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < state.wanted ? (state.wantedFlash > 0.3 ? '#ff4a3a' : '#ffd94a') : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', vw - 250 + i * 30, 42);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(isNight(hour) ? '🌙 ' : '☀ ', vw - 250, 66);
  ctx.fillText(clock, vw - 228, 66);
  ctx.fillStyle = '#c8c8c8';
  ctx.font = '12px sans-serif';
  ctx.fillText(state.wanted > 0 ? `WANTED — ${state.lastCrime}` : 'Clean — stay out of trouble', vw - 250, 88);

  // mission objective bar (top centre)
  const obj = missionObjectiveText(ms);
  ctx.font = 'bold 14px sans-serif';
  const ow = ctx.measureText(obj).width + 28;
  ctx.fillStyle = 'rgba(10,10,14,0.6)';
  ctx.fillRect((vw - ow) / 2, 12, ow, 30);
  ctx.fillStyle = ms.active ? '#7affd8' : '#ffd94a';
  ctx.textAlign = 'center';
  ctx.fillText(obj, vw / 2, 32);
  ctx.textAlign = 'left';
  if (ms.active && currentMission(ms)) {
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentMission(ms).title} — job ${ms.index + 1} of 5`, vw / 2, 52);
    ctx.textAlign = 'left';
  }

  // mission banner (word-wrapped so long briefings never run off-screen)
  if (ms.bannerTimer > 0) {
    ctx.globalAlpha = clamp(ms.bannerTimer, 0, 1);
    ctx.font = 'bold 15px sans-serif';
    const maxW = Math.min(vw - 160, 860);
    const words = ms.banner.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const bw = Math.min(vw - 80, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 40);
    const bh = 16 + lines.length * 22;
    ctx.fillStyle = 'rgba(10,10,14,0.75)';
    ctx.fillRect((vw - bw) / 2, vh * 0.3, bw, bh);
    ctx.fillStyle = '#ffd94a';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh * 0.3 + 28 + i * 22));
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // toast
  if (state.toastTimer > 0) {
    ctx.fillStyle = 'rgba(10,10,14,0.65)';
    ctx.font = '13px sans-serif';
    const tw = ctx.measureText(state.toast).width + 24;
    ctx.fillRect((vw - tw) / 2, vh - 96, tw, 26);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast, vw / 2, vh - 78);
    ctx.textAlign = 'left';
  }

  // bottom-left: speedometer + car health when driving
  if (p.inCar) {
    const car = p.inCar;
    const kmh = Math.round(Math.abs(car.speed) * 0.55);
    ctx.fillStyle = 'rgba(10,10,14,0.55)';
    ctx.fillRect(12, vh - 96, 190, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`${kmh}`, 24, vh - 58);
    ctx.font = '13px sans-serif';
    ctx.fillText('km/h', 82, vh - 58);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillText(car.kind.toUpperCase(), 24, vh - 36);
    ctx.fillStyle = '#333';
    ctx.fillRect(24, vh - 28, 150, 8);
    ctx.fillStyle = car.hp > 50 ? '#4ad85a' : '#ff4a3a';
    ctx.fillRect(24, vh - 28, 150 * clamp(car.hp / car.spec.hp, 0, 1), 8);
  } else {
    ctx.fillStyle = 'rgba(10,10,14,0.55)';
    ctx.fillRect(12, vh - 96, 210, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('ON FOOT', 24, vh - 66);
    ctx.fillStyle = '#c8c8c8';
    ctx.font = '12px sans-serif';
    ctx.fillText('WASD walk • Shift run', 24, vh - 46);
    ctx.fillText('E steal car • F shoot • Space punch', 24, vh - 28);
  }

  // controls hint, bottom centre
  ctx.fillStyle = 'rgba(10,10,14,0.45)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('P pause • M mute • E interact / enter car', vw / 2, vh - 14);
  ctx.textAlign = 'left';

  drawMinimap(ctx, state, vw, vh);
}

function drawMinimap(ctx, state, vw, vh) {
  const size = MINIMAP;
  const x0 = vw - size - 12;
  const y0 = vh - size - 12;
  const scale = size / WORLD.w;
  const p = state.player;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,14,0.85)';
  ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  // water + land
  ctx.fillStyle = '#1e4a6a';
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = '#3f7a3a';
  ctx.fillRect(x0 + 44 * scale, y0, size, size);
  // roads
  ctx.fillStyle = '#555';
  for (const ax of WORLD.avenues) ctx.fillRect(x0 + ax * scale - 1, y0, 2, size);
  for (const sy of WORLD.streets) ctx.fillRect(x0, y0 + sy * scale - 1, size, 2);
  // park + harbor
  ctx.fillStyle = '#4a9a4a';
  ctx.fillRect(x0 + state.city.park.x * scale, y0 + state.city.park.y * scale, state.city.park.w * scale, state.city.park.h * scale);
  ctx.fillStyle = '#8a8a80';
  ctx.fillRect(x0 + 2560 * scale, y0, size - 2560 * scale, size);
  // places
  ctx.fillStyle = '#ffd94a';
  for (const place of Object.values(PLACES)) {
    ctx.fillRect(x0 + place.x * scale - 2, y0 + place.y * scale - 2, 4, 4);
  }
  // pickups
  ctx.fillStyle = '#7aff5a';
  for (const pk of state.pickups) {
    ctx.fillRect(x0 + pk.x * scale - 1, y0 + pk.y * scale - 1, 2, 2);
  }
  // taxi
  if (state.taxi) {
    ctx.fillStyle = '#f2c200';
    ctx.beginPath();
    ctx.arc(x0 + state.taxi.x * scale, y0 + state.taxi.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    if (state.taxi.state === 'riding') {
      ctx.fillStyle = '#f2c200';
      ctx.fillRect(x0 + state.taxi.dest.x * scale - 2, y0 + state.taxi.dest.y * scale - 2, 4, 4);
    }
  }
  // waypoint (pulsing diamond)
  const wp = missionWaypoint(state.missions, state);
  if (wp) {
    const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
    ctx.fillStyle = '#ff4ad8';
    ctx.save();
    ctx.translate(x0 + wp.x * scale, y0 + wp.y * scale);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  // police
  ctx.fillStyle = '#ff4a3a';
  for (const cop of state.police) {
    ctx.beginPath();
    ctx.arc(x0 + cop.x * scale, y0 + cop.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.heli) {
    ctx.fillStyle = '#ff4a3a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('H', x0 + state.heli.x * scale - 3, y0 + state.heli.y * scale + 3);
  }
  // traffic (faint)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const c of state.traffic) {
    ctx.fillRect(x0 + c.x * scale - 1, y0 + c.y * scale - 1, 2, 2);
  }
  // player arrow
  ctx.save();
  ctx.translate(x0 + p.x * scale, y0 + p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // north + label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('N', x0 + size / 2 - 3, y0 + 12);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#c8c8c8';
  ctx.fillText('SOLMAR BAY', x0 + 6, y0 + size - 6);
  ctx.restore();
}

// ---- screens -----------------------------------------------------------------

function overlay(ctx, vw, vh, alpha) {
  ctx.fillStyle = `rgba(6,8,16,${alpha})`;
  ctx.fillRect(0, 0, vw, vh);
}

function drawTitle(ctx, state, vw, vh) {
  overlay(ctx, vw, vh, 0.72);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLMAR BAY', vw / 2, vh * 0.26);
  ctx.fillStyle = '#ff4ad8';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('AN OPEN-WORLD CRIME STORY', vw / 2, vh * 0.26 + 36);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  const lines = [
    'Juno Reyes came home to Solmar Bay with nothing but a stolen jacket and a debt.',
    'Fixer Dalia Kade offers one way out: five jobs, one bay, no questions.',
    'Steal cars. Outrun the Solmar PD. Rob Marina Bank at high noon.',
    'After the fifth job, the whole city is yours.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh * 0.42 + i * 26));
  ctx.fillStyle = '#7affd8';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Press ENTER to start', vw / 2, vh * 0.62);
  ctx.fillStyle = '#c8c8c8';
  ctx.font = '14px sans-serif';
  ctx.fillText('WASD move / drive   •   E steal car, interact   •   Space punch   •   F shoot', vw / 2, vh * 0.68);
  ctx.fillText('Shift run   •   P pause   •   M mute   •   Progress saves automatically', vw / 2, vh * 0.68 + 24);
  const done = state.missions.done.length;
  if (done > 0) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`Save found: ${done}/5 jobs done, $${state.player.cash} banked — press ENTER to continue`, vw / 2, vh * 0.78);
  }
  ctx.textAlign = 'left';
}

function drawPause(ctx, state, vw, vh) {
  overlay(ctx, vw, vh, 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', vw / 2, vh * 0.36);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#c8c8c8';
  const lines = [
    `Jobs done: ${state.missions.done.length}/5 — ${state.missions.done.join(', ') || 'none yet'}`,
    `Cash $${state.player.cash}   •   Taxi fares ${state.taxiDone || 0}   •   Ammo ${state.player.ammo}`,
    'WASD move / drive — E steal & interact — Space punch — F shoot',
    'Gun Shop sells ammo, Spray Shop loses the cops, Garage repairs your car.',
    'Press P or Esc to resume',
  ];
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh * 0.46 + i * 28));
  ctx.textAlign = 'left';
}

function drawEnd(ctx, state, vw, vh, kind) {
  overlay(ctx, vw, vh, 0.7);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#6ab8ff' : '#ff4a3a';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', vw / 2, vh * 0.4);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText(
    kind === 'busted'
      ? 'The Solmar PD finally caught up with Juno. The jobs wait — the city does not forget.'
      : 'Juno went down in the streets of Solmar Bay. The jobs wait — the city does not forget.',
    vw / 2,
    vh * 0.4 + 36,
  );
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Press ENTER to get back on the streets', vw / 2, vh * 0.55);
  ctx.textAlign = 'left';
}

// ---- main draw ---------------------------------------------------------------

export function draw(ctx, state, vw, vh) {
  const hour = state.hour;
  const light = daylight(hour);
  const night = isNight(hour);
  const cam = state.camera;
  ctx.save();
  if (state.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGround(ctx, state.city, cam, vw, vh, light);
  drawBuildings(ctx, state.city, cam, vw, vh, light, night);
  drawParkAndProps(ctx, state.city, cam, vw, vh, light);
  // waypoint beacon on the ground
  const wp = missionWaypoint(state.missions, state);
  if (wp && state.screen === 'play') {
    const pulse = 18 + Math.sin(performance.now() / 250) * 5;
    ctx.strokeStyle = '#ff4ad8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,74,216,0.25)';
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, pulse * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // vertical beam so the target reads from far away
    ctx.fillStyle = 'rgba(255,74,216,0.18)';
    ctx.fillRect(wp.x - 3, wp.y - 260, 6, 260);
  }
  // pickups
  for (const pk of state.pickups) {
    const bob = Math.sin(pk.bob * 3) * 3;
    ctx.fillStyle = pk.kind === 'cash' ? '#7aff5a' : pk.kind === 'health' ? '#ff5a7a' : '#ffe14a';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + bob + 3);
    ctx.textAlign = 'left';
  }
  // taxi passenger
  if (state.taxi && state.taxi.state === 'waiting') {
    const t = state.taxi;
    drawPerson(ctx, t.x, t.y, -Math.PI / 2, '#f2c200', '#f2c89a', '#6a4a2a', light, 1.1);
    ctx.fillStyle = '#f2c200';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI!', t.x, t.y - 20);
    ctx.textAlign = 'left';
  }
  // thugs
  for (const thug of state.thugs) {
    drawPerson(ctx, thug.x, thug.y, thug.angle, '#3a3a3a', '#c89a6a', '#1a1a1a', light, 1.15);
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(thug.x - 12, thug.y - 20, 24 * clamp(thug.hp / TUNE.thugHp, 0, 1), 3);
  }
  // foot cops
  for (const cop of state.footCops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#2f6fd8', '#f2c89a', '#2a2a2a', light, 1.15);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', cop.x, cop.y - 14);
    ctx.textAlign = 'left';
  }
  // pedestrians
  for (const ped of state.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.hair, light);
  }
  // traffic + police cars
  for (const car of state.traffic) {
    if (car.isPlayer) continue;
    drawCar(ctx, car, light, night);
  }
  for (const cop of state.police) drawCar(ctx, cop, light, night);
  // player car / player
  if (state.player.inCar) drawCar(ctx, state.player.inCar, light, night);
  else drawPlayer(ctx, state.player, light);
  drawEffects(ctx, state, light);
  // helicopter spotlight at 5 stars
  if (state.heli) {
    ctx.fillStyle = 'rgba(255,250,200,0.20)';
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(state.heli.x, state.heli.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(state.heli.x - 8, state.heli.y - 3, 16, 6);
  }
  ctx.restore();
  // night darkness overlay (keeps the world readable, lights pop)
  if (night || light < 0.95) {
    const dark = (1 - light) * 0.42;
    ctx.fillStyle = `rgba(8,10,30,${dark})`;
    ctx.fillRect(0, 0, vw, vh);
    // lamp glow pools
    if (night) {
      for (const l of state.city.lamps) {
        const sx = l.x - cam.x;
        const sy = l.y - cam.y;
        if (sx < -60 || sx > vw + 60 || sy < -60 || sy > vh + 60) continue;
        const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
        g.addColorStop(0, 'rgba(255,220,140,0.20)');
        g.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, 60, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // headlight cone AFTER the dark overlay, so it cuts through the night
  if (night && state.player.inCar) {
    const car = state.player.inCar;
    const sx = car.x - cam.x + Math.cos(car.angle) * 120;
    const sy = car.y - cam.y + Math.sin(car.angle) * 120;
    const grad = ctx.createRadialGradient(sx, sy, 10, sx, sy, 190);
    grad.addColorStop(0, 'rgba(255,248,200,0.35)');
    grad.addColorStop(1, 'rgba(255,248,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, 190, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // screens on top of the world
  if (state.screen === 'title') drawTitle(ctx, state, vw, vh);
  else if (state.screen === 'pause') drawPause(ctx, state, vw, vh);
  else if (state.screen === 'busted' || state.screen === 'wasted') drawEnd(ctx, state, vw, vh, state.screen);
  if (state.screen === 'play') drawHud(ctx, state, vw, vh);
}
