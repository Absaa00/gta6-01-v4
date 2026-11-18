# gta6-01-v4

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Absaa00/gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Absaa00/gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay

An original open-world crime game for the make.fun GTA 6 bounty. Rook, a
wheelman new to town, works jobs for fixer Dalia Voss across the six districts
of Solmar Bay — stealing cars, outrunning the Solmar Bay Police Department,
and climbing from nobody to King of Solmar.

## Run it

```sh
node serve.ts   # then open http://localhost:8080
```

Desktop browser, keyboard + mouse, static files, no network. Progress
(cash, missions, taxi fares) saves to localStorage.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk & drive (Shift = run) |
| E | Steal / exit car, use shops |
| Mouse click | Shoot pistol |
| Space | Punch |
| P | Pause |
| M | Mute |

## Features

- **City:** 6 districts (Crestview Hills, Downtown Solmar, Viceroy Heights,
  Old Harbor, Marina Bay, Palm Court), full day/night cycle, rain at night,
  street lamps, neon downtown, headlight cone.
- **Traffic:** 30 cars in 5 types (sedan, taxi, sport, van, truck) and 52
  pedestrians who flee gunfire; traffic brakes for the player.
- **Stealing & damage:** steal any car (E), including police cruisers in
  spirit — cars take damage, smoke, and explode.
- **Wanted 0–5:** foot cops, police cruisers, helicopter + spotlight at
  5 stars, wanted decay when unseen, Spray Shop ($150) clears it.
- **Story:** 5 missions — First Wheels, Payback Run (timed), Marina Bank
  heist (armed guards), Harbor Hustle (dock crate + thugs), Night Shift
  (drive Dalia to 3 stops at night with 3 stars) — plus the "King of Solmar"
  epilogue.
- **Combat:** punch + pistol, armed guards and thugs shoot back, health
  regen while clean.
- **HUD + minimap:** 180×180 minimap with clock and day/night icon,
  speedometer + car HP, waypoint beam + pulsing diamond, shop/taxi/pickup
  markers, word-wrapped mission banners.
- **Side activities:** taxi fares with speed tips, cash/health/ammo pickups,
  Gun Shop (ammo $60), Garage (repair $80).
- **Sound:** procedural WebAudio — two-tone siren, explosions, mission
  jingle. No audio files.
- **Polish:** skid marks, screen shake, muzzle flash, damage smoke.

## Layout

```
game/
  index.html        page shell + canvas
  src/util.js       seeded RNG, math, collision helpers
  src/audio.js      procedural WebAudio sound bank
  src/city.js       districts, roads, buildings, lamps, shops
  src/traffic.js    traffic cars + pedestrians
  src/police.js     wanted level, cops, cruisers, helicopter
  src/missions.js   5 story missions, taxi fares, pickups, shops
  src/game.js       player, driving, combat, HUD, minimap, save
main.ts             builds /output (game + screenshots + dossier.json)
serve.ts            local static server for play-testing
vendor/             kit's makefun-game.ts (byte-identical copy)
```

## License

MIT — see LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mereum&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
