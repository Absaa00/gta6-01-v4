[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Absaa00/gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Absaa00/gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01)

# Solmar Bay

An original open-world crime game built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). No assets, names, characters, map, art or music from any commercial game — the city, the people and the story are invented here.

**Juno Reyes** came home to Solmar Bay with nothing but a stolen jacket and a debt. Fixer **Dalia Kade** offers one way out: five jobs, one bay, no questions. Steal cars, run the docks, rob Marina Bank at high noon, drive Dalia herself through one very hot night — after that, the whole city is free roam.

## What is in the game

- **A living city** — a grid of avenues and streets across six districts: neon Downtown, Palm Park with its pond, the beach on the west edge, East Docks harbor with boats, Old Town and Uptown. Buildings vary in height, colour and neon; a full day/night cycle changes the light, street lamps glow, headlights cut the dark, and rain sometimes falls at night.
- **On foot and by car** — walk or run with WASD, steal any traffic car with E (sedans, taxis, sports cars, vans, trucks — even a police cruiser), drive with acceleration, braking, steering, skid marks and damage smoke. Cars wreck and explode.
- **Traffic and pedestrians** — 30 traffic cars and 52 pedestrians fill the streets (seeded, deterministic). Pedestrians flee gunfire; traffic brakes for the car ahead.
- **Wanted level 0–5 stars** — stealing cars, hitting pedestrians or firing your pistol raises the heat. Solmar PD cruisers spawn, chase and ram you; foot cops give chase on foot; at 5 stars a police helicopter circles with a spotlight. Lay low and the stars fade — or pay the Spray Shop to lose the cops.
- **5 story missions** — First Wheels, Harbor Hustle, Payback Run (timed checkpoint drops), Marina Bank (hold the lobby against armed guards, then escape at wanted 4) and Night Shift (drive Dalia through three stops while chased). Each pays cash; finishing all five crowns you King of Solmar.
- **Side work** — taxi fares (pick up waving passengers, deliver fast for a tip), street cash, health and ammo pickups, a Gun Shop, a Spray Shop and a Garage that repairs your car.
- **Combat** — punch with Space, shoot with F (limited ammo). Bank guards and thugs shoot back.
- **HUD + minimap** — health, cash, ammo, wanted stars, mission objective with timer, speedometer and car health, a live clock, and a 180×180 minimap with the waypoint, police dots, helicopter, taxi fares and shops.
- **Sound, all procedural** — engine hum, two-tone police siren, gunshots and pickup chimes synthesized with WebAudio. M mutes.
- **Save** — cash, completed missions and taxi fares persist in localStorage.

## How to play

Serve `game/` with any static server (for example `python3 -m http.server` inside `game/`) and open `index.html` in desktop Chrome. Press ENTER on the title screen to start.

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| E | Steal / exit car, interact, buy, pick up |
| Space | Punch |
| F | Shoot |
| P / Esc | Pause |
| M | Mute |

## Screenshots

`1-heist.jpg` is the cover — the Marina Bank escape at dusk, wanted level 4, police in pursuit on the beach road. `2-downtown.jpg` is a daytime taxi fare through downtown traffic, `3-night.jpg` is a wanted-5 night chase under the police helicopter, and `4-park.jpg` shows Juno on foot in Palm Park with pedestrians and the mission waypoint.

## Structure

- `game/index.html` — the page, loads the module scripts
- `game/src/config.js` — constants, palette, districts, vehicles, mission data
- `game/src/random.js` — seeded RNG (mulberry32)
- `game/src/world.js` — city generation and spatial queries, day/night
- `game/src/input.js` — keyboard + mouse input
- `game/src/entities.js` — player, traffic, pedestrians, police, combat, wanted, taxi, shops
- `game/src/missions.js` — the five-job story state machine
- `game/src/audio.js` — procedural WebAudio sound
- `game/src/render.js` — canvas drawing, HUD, minimap, screens
- `game/src/main.js` — game loop, camera, save/load, screenshot staging
- `main.ts` — the entry program: copies `game/` + `screenshots/` to the output dir and writes `dossier.json`
