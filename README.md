# Wizball

A browser port of **Wizball** (Ocean / Sensible Software, 1987), built on Phaser 3 and
TypeScript.

It is a port of the C++ Retrospec remake that lives at `../wizball-remake/wizball`. That
project's behaviour scripts and datatables are the spec for this one — when the two
disagree, the C++ is right. Code here cites the C++ source in comments (file and line) at
every point where behaviour was transcribed.

## Running it

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev      # Vite dev server
bun run build    # tsc --noEmit-style typecheck, then a production build into dist/
bun run preview  # serve the production build
```

The build uses a relative base path, so `dist/` can be dropped on any static host or
opened from a subdirectory.

## Hosting

Deployed on [Vercel](https://vercel.com) as a static build straight off `main`. `vercel.json`
pins the whole thing: `bun install --frozen-lockfile`, `bun run build`, serve `dist/`. There is
no server side — it's the Vite output and the files under `public/`.

`dist/` is **not** committed; Vercel builds it. Import the repo once at
vercel.com/new (the defaults in `vercel.json` are picked up automatically) and every push to
`main` ships, with preview deploys per branch.

## Layout

```
index.html          Page shell: canvas host, on-screen touch controls, rotate prompt
src/
├── main.ts         Phaser game config, audio mixer wiring, FPS readout, CRT pipeline
├── config/         Settings singleton (localStorage-backed), defaults, draw-order depths
├── data/           Transcribed datatables: levels, waves, paths, cauldron targets
├── scenes/         Boot, Preload, Intro, Title, GetReady, Game, Laboratory,
│                   BonusLevel, GameOver, GameComplete, Settings, Pause
├── systems/        Gameplay systems: enemies, collision, tilemap/atlas parsing, warp
│                   tubes, cauldron, HUD, hi-scores, input, music, CRT shader
└── types/          Shared enums, scene keys, settings schema
public/assets/      Sprites, tilemaps, audio (WAV effects, MP3 music)
```

There is no entity-per-file layer: `GameScene` owns the ball, Catellite, bullets and
paint, and the `systems/` modules operate on that state. This mirrors how the C++ scripts
are organised.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrow keys | Left stick / D-pad | On-screen D-pad |
| Fire | Space | A / Cross | FIRE |
| Alt fire, bonus select | Z | X / Square | Z |
| Pause | Esc | Start | Pause button |

Everything is rebindable in Settings → Controls. Settings also has volume and mute,
a CRT filter, and a manual override for whether the touch overlay is shown.

## Reference material

The C++ remake is the source of truth:

- `wizball/wizball/scripts/*.txt` — per-entity behaviour (the real spec)
- `wizball/wizball/datatables/` — wave, path and level tables
- `wizball/wizball/constant.txt` — tuning constants and draw orders
- `wizball/wizball/sprites/*.txt` — sprite atlas definitions

`PARITY_PLAN.md` tracks how far the port has got against it.

Sprite sheets and atlases are converted straight out of that tree's `sprites/` directory
(`magick '<name>.bmp' -transparent '#FF00FF' PNG32:<name>.png`), and the arbitrary-layout
atlases get their Phaser JSON from `generate-atlas-json.js`, which reads the original
`[arb].txt` frame lists. Both are kept next to the PNG so the mapping stays checkable.

## Credits

**Wizball** (1987) — designed by Jon Hare and Chris Yates, programmed by Chris Yates,
graphics by Jon Hare, music by Martin Galway.

**The 2007 Retrospec remake**, which this port follows — programming by Graham Goring,
graphics by Trevor "Smila" Storey, music and arrangements by Infamous (Chris Nunn), Mac
conversion by Peter Hull, Linux conversion by Scott Wightman. Its source was recovered and
revived in 2026 by [Craig Chandler](https://github.com/craigchandler/wizball-remake) —
that archive is where this port's C++ reference, art and audio all come from.

## Licence

This port's own code is MIT — see [LICENSE](LICENSE).

The game content (sprites, tilemaps and audio under `public/assets/`, and the datatables
transcribed into `src/data/`) comes from the Retrospec remake source archive, which is
itself MIT licensed. That notice is reproduced in `LICENSE`, as MIT requires.

Wizball itself is nobody in that chain's to license. This is a non-commercial fan port,
published in the same spirit as the archive it builds on. If a rights holder would rather
it weren't up, it comes down.
