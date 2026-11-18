// SPDX-License-Identifier: MIT
// Solmar Bay — config: world size, palette, districts, vehicles, missions.
// All names, places and people here are invented for this game.

// World geometry (pixels). Roads form a grid; blocks sit between them.
export const WORLD = {
  w: 2640,
  h: 1980,
  roadHalf: 34,
  avenues: [120, 420, 720, 1020, 1320, 1620, 1920, 2220, 2520],
  streets: [120, 420, 720, 1020, 1320, 1620, 1860],
  beachX: 96, // sand starts west of here; ocean west of x = 44
  harborX: 2560, // docks start east of here; water east of x = 2596
};

// Day length: one full in-game day = 8 real minutes. Clock starts 09:00.
export const DAY = { secondsPerHour: 20, startHour: 9 };

export const PALETTE = {
  grass: '#5da24a',
  grassDark: '#4c8a3d',
  parkGrass: '#67b354',
  sand: '#e8d28a',
  ocean: '#2f7fb8',
  oceanDeep: '#256a9e',
  road: '#3a3a40',
  roadEdge: '#2c2c31',
  lane: '#d8c95a',
  sidewalk: '#9a9a92',
  blockBase: '#8a8a80',
  building: ['#c96a4a', '#d8a04a', '#7a9cc6', '#b06a8a', '#6aa88a', '#c6c6b8', '#e07a5a', '#5a7aa8', '#a8b06a', '#d8b06a'],
  buildingRoof: ['#8a4a34', '#a87a34', '#4a6a8a', '#7a4a64', '#4a7a64', '#8a8a7a'],
  neon: ['#ff4ad8', '#3ae0ff', '#ffe14a', '#7aff5a', '#ff7a3a'],
  car: ['#d84a4a', '#4a7ad8', '#e8c84a', '#6ad8a8', '#c8c8c8', '#8a5ad8', '#e88a3a', '#3ad8d8', '#f0f0e8', '#4a4a52'],
  taxi: '#f2c200',
  police: '#2f6fd8',
  pedShirt: ['#e84a6a', '#4ad8a8', '#f2e14a', '#7a6ad8', '#e8e8e8', '#ff8a4a', '#4ac8e8', '#a8d84a'],
  pedSkin: ['#f2c89a', '#c89a6a', '#8a5a3a', '#f2d8b8'],
};

// Named places the missions and HUD point at.
export const PLACES = {
  garage: { x: 720, y: 1620, name: "Kade's Garage" },
  bank: { x: 1320, y: 1020, name: 'Marina Bank' },
  docks: { x: 2560, y: 720, name: 'East Docks' },
  hideout: { x: 180, y: 420, name: 'Beach Hideout' },
  gunShop: { x: 1620, y: 420, name: 'Gun Shop' },
  sprayShop: { x: 420, y: 1320, name: 'Spray Shop' },
  park: { x: 1170, y: 570, name: 'Palm Park' },
  plaza: { x: 1620, y: 1020, name: 'Solmar Plaza' },
  motel: { x: 2220, y: 1620, name: 'Sunset Motel' },
  diner: { x: 1020, y: 1860, name: 'Harbor Diner' },
};

// Vehicle kinds: size, handling and look.
export const VEHICLES = {
  sedan: { w: 46, h: 22, accel: 210, top: 330, grip: 2.6, hp: 100 },
  taxi: { w: 46, h: 22, accel: 200, top: 320, grip: 2.6, hp: 100 },
  sport: { w: 48, h: 21, accel: 300, top: 430, grip: 3.4, hp: 80 },
  van: { w: 54, h: 24, accel: 160, top: 270, grip: 2.2, hp: 140 },
  truck: { w: 62, h: 26, accel: 140, top: 250, grip: 2.0, hp: 180 },
  cruiser: { w: 48, h: 22, accel: 280, top: 400, grip: 3.2, hp: 120 },
};

// The five-job story. Each mission: id, title, briefing, pay, steps.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Dalia Kade',
    brief: 'Steal any car on the street and bring it to my garage. No questions, no cops.',
    pay: 250,
    steps: [
      { kind: 'stealCar', text: 'Steal a car (walk up to traffic and press E)' },
      { kind: 'goto', place: 'garage', text: "Drive it to Kade's Garage" },
    ],
  },
  {
    id: 'harbor-hustle',
    title: 'Harbor Hustle',
    giver: 'Dalia Kade',
    brief: 'A crate is waiting at the East Docks. Grab it on foot, then drive it to the Beach Hideout. The docks are watched — expect heat.',
    pay: 450,
    steps: [
      { kind: 'goto', place: 'docks', text: 'Reach the East Docks' },
      { kind: 'pickup', place: 'docks', text: 'Grab the crate (press E at the docks)' },
      { kind: 'goto', place: 'hideout', text: 'Deliver the crate to the Beach Hideout', wanted: 2 },
    ],
  },
  {
    id: 'payback-run',
    title: 'Payback Run',
    giver: 'Dalia Kade',
    brief: 'A debtor owes us. Run the package through four drops across town before the clock runs out. Fast car, faster hands.',
    pay: 700,
    steps: [
      { kind: 'checkpoint', place: 'plaza', text: 'Drop 1/4 — Solmar Plaza', time: 150 },
      { kind: 'checkpoint', place: 'motel', text: 'Drop 2/4 — Sunset Motel' },
      { kind: 'checkpoint', place: 'diner', text: 'Drop 3/4 — Harbor Diner' },
      { kind: 'checkpoint', place: 'garage', text: "Drop 4/4 — Kade's Garage" },
    ],
  },
  {
    id: 'marina-bank',
    title: 'Marina Bank',
    giver: 'Dalia Kade',
    brief: 'High noon. Walk into Marina Bank, hold the lobby until the vault opens, then lose the cops and vanish at the Beach Hideout.',
    pay: 1500,
    steps: [
      { kind: 'goto', place: 'bank', text: 'Reach Marina Bank' },
      { kind: 'hold', place: 'bank', seconds: 18, text: 'Hold the lobby — stay inside the bank!' },
      { kind: 'goto', place: 'hideout', text: 'Escape to the Beach Hideout', wanted: 4 },
    ],
  },
  {
    id: 'night-shift',
    title: 'Night Shift',
    giver: 'Dalia Kade',
    brief: 'Tonight I ride with you. Three stops, one very hot night. Drive smooth, drive fast, and do not stop for anyone in blue.',
    pay: 2000,
    steps: [
      { kind: 'goto', place: 'garage', text: "Pick up Dalia at Kade's Garage", night: true },
      { kind: 'checkpoint', place: 'diner', text: 'Stop 1/3 — Harbor Diner', wanted: 3 },
      { kind: 'checkpoint', place: 'plaza', text: 'Stop 2/3 — Solmar Plaza' },
      { kind: 'checkpoint', place: 'hideout', text: 'Stop 3/3 — Beach Hideout' },
    ],
  },
];

// Tuning for the wanted system, traffic, police and economy.
export const TUNE = {
  trafficCars: 30,
  pedestrians: 52,
  maxPolice: 6,
  wantedDecaySeconds: 14,
  crimeSteal: 1,
  crimeHitPed: 1,
  crimeShoot: 1,
  crimeKillCop: 2,
  ammoPrice: 60,
  ammoAmount: 24,
  sprayPrice: 150,
  repairPrice: 80,
  taxiFare: 120,
  taxiTip: 60,
  pickupCash: 40,
  playerHp: 100,
  punchDamage: 12,
  bulletDamage: 34,
  copHp: 60,
  thugHp: 50,
};
