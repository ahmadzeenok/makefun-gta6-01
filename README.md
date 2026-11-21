[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ahmadzeenok/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/ahmadzeenok/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Palmera Bay — an open-world crime game

An original 2D top-down open-world crime game built for the make.fun gta6-01 bounty. Rico Vega owes the Dockside crew $4,000 and works it off across a seeded coastal city — Marina, Old Town, Palm Heights, Dockside, Coral Bay, Southside, The Strip — with a beach, harbour, parks, and a lighthouse.

## What is in the game

- A city to explore on foot and by car, with traffic and pedestrians.
- Cars to steal and drive (press E near a car).
- A 0–5 star wanted level, with police who chase, ram, and shoot.
- 6 story missions with pay and ammo rewards:
  1. Wheels
  2. The Courier
  3. Dockside Crates
  4. Hot Cargo
  5. The Rival Crew
  6. The Last Run
- Combat (pistol and punch), particles, screen shake, and a day/night tint.
- A HUD with a live minimap, cash/health/ammo, wanted stars, an objective line and timer, and an off-screen objective arrow.
- Start screen, pause, wasted/busted screens, and save/load (auto-saves per mission).
- Keyboard + mouse controls.
- Synthesised WebAudio sound (sirens, engine, effects) — no external assets, no network requests.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see LICENSE
