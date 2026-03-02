# Wizball Phaser Port — Implementation Plan

**Project**: `/home/stripeyhorse/private_code/wizball-phaser`
**Reference C++ source**: `/home/stripeyhorse/private_code/wizball-remake/wizball/wizball/`
**Stack**: Phaser 3.90.0, TypeScript, Vite, Arcade physics
**Goal**: Faithful port of the C++ Wizball remake to the browser

---

## Critical Context for AI Agents

### How the C++ Engine Works
The C++ game uses a **script-driven entity system**. All game logic lives in `.txt` script files (not C++ directly). The engine:
1. Loads `global_parameter_list.txt` → discovers all resources
2. Loads all sprites, tilemaps, sounds from compiled `.dat` archives
3. Runs `SCRIPTING_process_entities()` each frame — all entity behavior driven by scripts

**We do NOT need to implement a script interpreter.** We read the scripts as specification documents and port the logic to TypeScript manually.

### Coordinate System
- **Fixed-point math**: The C++ engine scales all velocities by 256 (`PRIVATE_SCALE = 1 << 8`)
- `xVel = 512` means 2 pixels/frame at 60fps
- To convert to Phaser Arcade velocity (pixels/second): `(xVel / 256) * 60`
- GameScene.ts already implements this correctly

### Sprite Frame Format
- `[set][W][H][PX][PY]` = uniform spritesheet, W×H frames, pivot at (PX, PY)
- `[arb]` = arbitrary atlas; frame layout in companion `.txt` file
- `.txt` format: `line 1 = frame count`, then one line per frame: `x,y,w,h,pivot_x,pivot_y`

### Transparency
- All BMPs use **magenta (#FF00FF)** as transparency key (Allegro convention)
- Convert: `convert "src.bmp" -fuzz 1% -transparent '#FF00FF' dest.png`
- Tile BMPs use blue: `-transparent '#0000FF'`

---

## Current State (as of last session)

### Done
- [x] `PreloadScene.ts` — correctly loads spritesheets (wizball 48×48, enemies 48×48, tiles 16×16), `[arb]` sprites as plain images, generates `paint_red/green/blue/white` and `bullet` textures programmatically
- [x] `GameScene.ts` — partial: has correct physics constants and movement logic, **but has bugs** (see Phase 0)
- [x] C++ BMP sprites converted to PNG and placed in `public/assets/sprites/`
- [x] All audio WAVs present in `public/assets/` (44 files)

### Not Done
Everything from Phase 1 onward below.

---

## Phase 0: Fix Current Broken GameScene (IMMEDIATE — do this first)

These bugs are causing the "can't fire, level doesn't look right" issues.

### Bug 1: Wall creation crashes silently
**File**: `src/scenes/GameScene.ts`, `createLevel()` (~line 134)
**Problem**: `this.walls.create(x, y, undefined)` — passing `undefined` as texture key causes Phaser StaticGroup.create to fail; entire `createLevel()` silently errors, so player/input/fire are never set up.
**Fix**: Replace every instance of the pattern:
```typescript
// BROKEN:
const wall = this.walls.create(x + TILE_SIZE / 2, y, undefined) as Phaser.Physics.Arcade.Sprite;
wall.setVisible(false);
wall.body!.setSize(TILE_SIZE, TILE_SIZE);
wall.refreshBody();

// CORRECT:
const wallRect = this.add.rectangle(x + TILE_SIZE / 2, y, TILE_SIZE, TILE_SIZE);
this.physics.add.existing(wallRect, true); // true = static
this.walls.add(wallRect);
```
There are 4 wall-creation loops (floor, ceiling, left, right) and 1 platform loop — fix all 5.

### Bug 2: Tile image keys don't exist
**File**: `src/scenes/GameScene.ts`, `createLevel()` — references `'tile_floor'`, `'tile_ceiling'`, `'tile_wall'`, `'tile_platform'` which were procedurally generated in an old PreloadScene version but no longer exist.
**Fix**: Replace all `this.add.image(x, y, 'tile_floor')` etc. with actual tile sprite frames. Use `'tiles'` spritesheet with appropriate frame indices. Until full tilemap system is in (Phase 2), use these placeholders from the tiles spritesheet:
- Floor/ceiling: frame index 9 (first solid tile in level 1 tilemap)
- Left/right walls: frame index 9
- Platforms: frame index 41

### Bug 3: fireBullet() uses wrong texture
**File**: `src/scenes/GameScene.ts`, `fireBullet()` (~line 363)
**Problem**: `this.physics.add.sprite(..., 'paintballs', frame)` — paintballs is loaded as a plain image, not a spritesheet, so frame indices fail.
**Fix**: Use the generated texture: `this.physics.add.sprite(..., 'bullet')` (no frame index). Body size needs adjusting: `body.setSize(12, 6)`.

### Bug 4: spawnPaintDrop() uses wrong texture
**File**: `src/scenes/GameScene.ts`, `spawnPaintDrop()` (~line 244)
**Problem**: `this.physics.add.sprite(x, y, 'paintballs', color)` — same issue as above.
**Fix**: Use generated paint textures:
```typescript
const keys = ['paint_red', 'paint_green', 'paint_blue'];
const sprite = this.physics.add.sprite(x, y, keys[color]);
// Remove setDisplaySize, remove body.setCircle (it's now a 16×16 canvas texture)
const body = sprite.body as Phaser.Physics.Arcade.Body;
body.setCircle(6, 2, 2);
```

### Bug 5: createPlayer() collision body offset wrong
**File**: `src/scenes/GameScene.ts`, `createPlayer()` (~line 202)
**Problem**: `body.setCircle(COLLISION_RADIUS, (64 - COLLISION_RADIUS*2)/2, ...)` — comment says 64×64 frame but wizball is 48×48. Offset calculation is wrong.
**Fix**:
```typescript
// 48×48 frame, COLLISION_RADIUS=20, circle centered in frame:
body.setCircle(COLLISION_RADIUS, (48 - COLLISION_RADIUS * 2) / 2, (48 - COLLISION_RADIUS * 2) / 2);
```
Also remove the `setDisplaySize(48, 48)` call — the frame is already 48×48, display size should match naturally.

### Bug 6: createCatellite() uses frame index on plain image
**File**: `src/scenes/GameScene.ts`, `createCatellite()` (~line 213)
**Problem**: `this.physics.add.sprite(280, 150, 'catellite', 0)` — catellite is a plain image, not spritesheet.
**Fix**: `this.physics.add.sprite(280, 150, 'catellite')` (no frame index). Actual catellite has 17 frames from `catellite[arb].txt` — we'll handle that in Phase 4 when converting to a proper atlas.

---

## Phase 1: Asset Pipeline

### 1a. Convert remaining sprite BMPs to PNG
The C++ sprites dir has 8 level tile sets and 8 background sets not yet converted.

**Source**: `/home/stripeyhorse/private_code/wizball-remake/wizball/wizball/sprites/`
**Destination**: `public/assets/sprites/`

Files to convert (use magenta transparency except tiles use blue):
```bash
# Level tile spritesheets (blue transparency)
for i in 1 2 3 4 5 6 7 8; do
  convert "level_${i}_tiles_new[set][16][16][0][0].bmp" \
    -fuzz 1% -transparent '#0000FF' "tiles_level${i}.png"
done

# Background images (magenta transparency)
for i in 1 2 3 4 5 6 7 8; do
  convert "background_level_${i}[arb].bmp" \
    -fuzz 1% -transparent '#FF00FF' "background_level${i}.png"
done

# enemies02 spritesheet (48×48 frames)
convert "enemies_02[set][48][48][24][24].bmp" -fuzz 1% -transparent '#FF00FF' "enemies2.png"
```

Currently `tiles.png` = level 1 tiles. Copy to `tiles_level1.png` and keep `tiles.png` as alias.

### 1b. Parse [arb] sprite atlas definitions
For each `[arb].txt` file, create a Phaser atlas JSON or parse at runtime.

**Key [arb] sprites we need immediately:**

**`catellite[arb].txt`** → 17 frames (24×24 catellite body + shield frames)
```
Format: x,y,w,h,pivot_x,pivot_y
Frame 0: 0,0,24,24 → catellite body animation
Frames 8-15: 0,65 → catellite glow animation
Frame 16: 72,24,40,40 → catellite shield bubble
```

**`paintballs_and_drips[arb].txt`** → 30 frames
```
Frame 0: 0,0,32,32  → Red paintball
Frame 1: 32,0,32,32 → Green paintball
Frame 2: 64,0,32,32 → Blue paintball
Frame 3: 96,0,16,32 → Red drip
Frame 4: 112,0,16,32 → Green drip
Frame 5: 0,32,16,32 → Blue drip
```

**`player_bullets[arb].txt`** → 5 frames
```
Frame 0: 1,1,78,54   → Shield
Frame 1: 80,0,48,8   → Normal Bullet Horizontal (wizball_normal_bullet uses this)
Frame 2: 1,56,78,32  → Alternate Shield
Frame 3: 80,8,48,8   → Powered-up Bullet Horizontal
```
(4th line in file = frame 3 at 80,8,48,8)

**`pickup[arb].txt`** → 1 frame
```
Frame 0: 8,8,48,48   → Pearl pickup
```

### 1c. Load atlases in PreloadScene
Update `PreloadScene.ts` to load multi-tile and atlas textures:
```typescript
// In preload():
// All 8 level tile spritesheets
for (let i = 1; i <= 8; i++) {
  this.load.spritesheet(`tiles_level${i}`, `assets/sprites/tiles_level${i}.png`, {
    frameWidth: 16, frameHeight: 16
  });
}

// All 8 background images
for (let i = 1; i <= 8; i++) {
  this.load.image(`background_level${i}`, `assets/sprites/background_level${i}.png`);
}

// enemies02 spritesheet
this.load.spritesheet('enemies2', 'assets/sprites/enemies2.png', {
  frameWidth: 48, frameHeight: 48
});

// All remaining sounds (add to existing list)
this.load.audio('paintball_explode', 'assets/paintball_explode.wav');
// ... etc
```

---

## Phase 2: Tilemap System (CRITICAL PATH)

This is the most complex piece. The game is a scrolling level 3584–4352px wide.

### 2a. Tilemap Parser
Create `src/systems/TilemapParser.ts`:

**Input format** (`LEVEL_N_TILEMAP.txt`):
```
#DEFAULT TILE SET = TILESET_#000
#MAP WIDTH = 224
#MAP HEIGHT = 26
#MAP LAYERS = 3
#RLE MAP = FALSE
[blank line]
[layer 1 data: 224×26 = 5824 comma-separated integers]
[blank line]
[layer 2 data]
[blank line]
[layer 3 data]
```

Layer 1 = collision layer (tile indices that match TILESET_#N.TXT solid properties)
Layer 2 = background visual tiles
Layer 3 = foreground visual/detail tiles

**Tileset collision data** (`TILESET_#N.TXT`):
```
#TILE NUMBER = 9
  #SOLID SIDES = 15    ← bitmask: 1=top, 2=right, 4=bottom, 8=left; 15=all sides solid
  #COLLISION MASK = 1  ← 1=standard solid tile
```
Tiles with `SOLID SIDES > 0` are collidable.

**Output**: Return structured data:
```typescript
interface ParsedTilemap {
  width: number;      // tiles
  height: number;     // tiles (always 26)
  tilesetIndex: number; // 0-8
  layers: number[][];   // [layer][tileIndex] = tileId
  solidTiles: Set<number>; // tile IDs that are collidable
}
```

### 2b. Level Renderer
Create `src/systems/LevelRenderer.ts`:

- Use `this.make.tilemap({ data: layer, tileWidth: 16, tileHeight: 16 })` for each layer
- For collision layer, add to physics StaticGroup (replace current `createLevel()`)
- Camera: `this.cameras.main.setBounds(0, 0, mapWidth * 16, 416)`
- Camera follows player: `this.cameras.main.startFollow(this.player)`

**Level dimensions:**
| Level | Width (tiles) | Width (px) | Tileset |
|-------|--------------|------------|---------|
| 1 | 224 | 3584 | #000 |
| 2 | 258 | 4128 | #001 |
| 3 | 272 | 4352 | #002 |
| 4 | 260 | 4160 | #003 |
| 5 | 260 | 4160 | #004 |
| 6 | 260 | 4160 | #005 |
| 7 | 256 | 4096 | #006 |
| 8 | 260 | 4160 | #007 |

All levels: 26 tiles × 16 = 416px tall (full game height, no scrolling vertically)

### 2c. Wizball Start Positions
From `datatables/level_start_positions.txt` — pixel X positions (choose random):
```
Level 1: [1112, 1408, 2200, 2544]
Level 2: [768, 1728, 2448, 3152]
Level 3: [832, 1200, 1932, 2560, 3072, 3456]
Level 4: [1072, 1840, 2432, 3280]
Level 5: [688, 1280, 2832]
Level 6: [1504, 1680, 2848, 3040]
Level 7: [1856, 2816, 3008]
Level 8: [736, 1424, 1952, 2480, 3120]
```
Start Y is always near top: `WIZBALL_START_Y = 32` (from wizball.txt)

---

## Phase 3: Accurate Wizball Physics

Current physics is mostly correct. Verify and tune with these C++ constants.

**All constants from** `wizball/scripts/wizball.txt`:
```
WIZBALL_RADIUS = 24              (visual radius)
WIZBALL_COLLISION_RADIUS = 16    (LET RADIUS = 16 in script)
WIZBALL_GRAVITY_STRENGTH = 48    (fixed-point → 48/256 px/frame²)
WIZBALL_MAX_PIXEL_X_VEL = 3
WIZBALL_X_RESPONSIVENESS = 64    (→ 64/256 = 0.25 px/frame per input frame)
WIZBALL_X_DAMPING = 64
WIZBALL_Y_RESPONSIVENESS = 96
WIZBALL_Y_DAMPING = 64
WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED = 512   (→ 2 px/frame)
WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED = 768     (→ 3 px/frame)
WORLD_COLLISION_COEF_HORIZONTAL = -100   (full elastic bounce on X)
WORLD_COLLISION_COEF_VERTICAL = -100     (full elastic bounce on Y)
```

**Movement modes** (controlled by `weapon_collection` bitflags from constant.txt):
- Mode 0 `BASIC_BOUNCE`: No direct control; idealXVel queued, applied on bounce
- Mode 1 `CONTROLLED_BOUNCE`: X velocity directly controllable; Y still bounces
- Mode 2 `FULL_CONTROLLED`: Full X+Y control (catellite mode)

**Firing behavior** (from wizball.txt):
- Without catellite: fire only on button-DOWN (JustDown — one shot per press)
- With catellite: fire on button-HELD (auto-fire while held)
- `bullet_type = 1` → normal; `= 2` → double fire; `= 3` → spread (3-way)
- Bullet speed: 192 fixed-point → 0.75 px/frame → 45 px/sec at 60fps

---

## Phase 4: Enemy System

### Enemy Types (12 total, from constant.txt)
| ID | Name | Script file |
|----|------|-------------|
| 0 | PAINT_BUBBLES | enemy scripts in scripts/ |
| 1 | HOLLOW_DIAMONDS | |
| 2 | CRABBY_BOUNCERS | |
| 3 | MOLECULE_BOUNCERS | |
| 4 | HOLLOW_CIRCLES | |
| 5 | SOLID_DIAMONDS | |
| 6 | BOBBLE_HATS | |
| 7 | PLANES | |
| 8 | UP_AND_DOWNERS | |
| 9 | BONUS_MOLECULE | |
| 10 | SOLID_DIAMONDS_DEVIANT | |
| 11 | FUZZ | |

All enemies use `enemies01[set][48][48][24][24].bmp` (loaded as `enemies.png`) or `enemies_02[...]`.

### Enemy Queues (from datatables/enemy_queues.txt + enemy_queue_sizes.txt)
Queue sizes: `[0, 7, 2, 7, 6, 5, 7, 8]` (per level, 0=level1=no enemies, 7=level2 has 7 enemies in queue)

Enemies spawn in waves; after clearing a wave the next set appears.

### Create `src/systems/EnemySystem.ts`:
- Load `enemy_queues.txt` per level
- Spawn enemies from spawn points in tilemap (tilemap has `#MAP SPAWN POINT` markers)
- Each enemy type has patrol behavior; read `scripts/generic_level_enemy.txt` for base AI

---

## Phase 5: Paint & Cauldron System

This is the core game mechanic.

### Cauldron Data
4 cauldrons per level: Red, Green, Blue, Combination
Max capacity: 20 paint blobs each (`MAX_CAULDRON_CAPACITY = 20`)
Fill rate milestones: 5 (quarter), 10 (half), 15 (three-quarter), 20 (full)

**Per-level cauldron colors** (from `datatables/level_cauldron_colours.txt`):
```
Level 1: R=255,0,0  G=255,0,255  B=0,255,255
Level 2: R=128,64,32  G=255,128,0  B=255,255,0
... (8 levels total)
```

### Paint Drop Flow (from wizball.txt + wizball_normal_bullet.txt):
1. Wizball fires bullet → hits enemy → enemy drops paint of its color
2. Wizball collects paint drop (drives through it)
3. Wizball carries paint → fires at cauldron → fills cauldron
4. Or: enemy drops paintball that falls to floor → creates drip splat

### Create `src/systems/CauldronSystem.ts`:
- Track fill level for each of 4 cauldrons
- Render fill animation (wibbly paint level inside cauldron shape)
- Trigger "level complete" when all 3 color cauldrons are full
- Combination cauldron fills automatically when any 2 others are filled

---

## Phase 6: Catellite

The catellite is Wizball's companion. It's unlocked after collecting the right pearls.

**From `scripts/catellite.txt`:**
- Follows player with a lag/springy movement
- Fires independently when player fires (or auto-fires)
- Has shield bubble power-up
- Has 8 animation frames for body + glow overlay
- Lives behind/beside wizball, adjusting position based on wizball's movement direction

**Sprite data** (from `catellite[arb].txt`):
- Frames 0-7: 24×24 catellite body animation
- Frames 8-15: 32×30 catellite glow
- Frame 16: 40×40 catellite shield bubble

**Upgrade system** (pearls unlock weapons):
Wizball collects "bonus pearls" → screen wobbles → earns upgrade
Upgrades add to `weapon_collection` bitflag:
- Catellite: bitflag 16
- Fire control upgrade 1: grants controlled bounce
- Fire control upgrade 2: grants full control
- Bullet type upgrades: single → double → triple

---

## Phase 7: HUD / Panel

The game HUD is a status bar at the bottom of the screen.

**Layout** (from C++ panel scripts):
- Score display (top-left area)
- Lives indicator
- 4 cauldron fill indicators
- Current paint color indicator
- Pearl/upgrade display

Reference: `scripts/game_window_handler.txt`, `panel_icons[arb].txt`

For now: implement a basic fixed-position HUD with text readout. Replace with proper pixel-art HUD in a later pass.

---

## Phase 8: Scene Flow

### Scene Structure to Build
```
BootScene → PreloadScene → TitleScene → GameScene → LaboratoryScene → GameScene (next level)
                                                        ↓
                                                    BonusLevelScene (optional)
```

### Key Scenes
- **TitleScene**: Load `title_screen_and_large_bits[arb].bmp` + `intro_logos[arb].bmp`
- **GameScene**: Main scrolling level (already exists, needs fixes + full tilemap)
- **LaboratoryScene**: Between levels; shows cauldrons being mixed; wizard upgrades catellite
- **GetReadyScene**: Brief screen before each level (`scripts/get_ready_screen.txt`)
- **GameOverScene**: (`scripts/game_over_screen.txt`)
- **BonusLevelScene**: Collect pearls in scrolling starfield (`scripts/bonus_level_*.txt`)

---

## Phase 9: Audio

All 44 WAV files are already in `public/assets/`. Map them:

| Event | File |
|-------|------|
| Wizball bounce | `wizball_bounce.wav` |
| Wizball explode | `wizball_explode.wav` |
| Normal fire | `wizball_or_cat_fire_normal.wav` |
| 3-way fire | `wizball_or_cat_fire_three_way.wav` |
| Pearl pickup | `bonus_pearl_pickup.wav` |
| Paint drop splash | `paintdrop_splash.wav` |
| Paint drop collected | `paintdrop_collection.wav` |
| Enemy explode | `enemy_explode.wav` |
| Enemy bullet | `enemy_fire_single_bullet.wav` |
| Cauldron full | `cauldron_full_burst.wav` |
| Warp tube | `warp_tube_appear.wav` |

---

## Phase 10: Warp Zones

Between screen sections, warp tubes transport wizball to a different position.
Reference: `scripts/` (no dedicated warp_tube.txt found yet — look for `warp` in sprite/script names)
Warp zones are defined in tilemap zone data (`#MAP ZONE NEXT UID` in tilemap header).

---

## File Structure To Create

```
src/
  scenes/
    BootScene.ts          ✓ exists
    PreloadScene.ts       ✓ exists (fixed)
    GameScene.ts          ✓ exists (needs Phase 0 fixes + Phase 2 tilemap)
    TitleScene.ts         ← create
    LaboratoryScene.ts    ← create
    GetReadyScene.ts      ← create
    GameOverScene.ts      ← create
    BonusLevelScene.ts    ← create
  systems/
    TilemapParser.ts      ← create (Phase 2)
    LevelRenderer.ts      ← create (Phase 2)
    EnemySystem.ts        ← create (Phase 4)
    CauldronSystem.ts     ← create (Phase 5)
    AudioSystem.ts        ← create (Phase 9)
  entities/
    Wizball.ts            (dead code — unused, can delete or refactor)
    PaintDrop.ts          (dead code — unused, can delete or refactor)
    Catellite.ts          ← create (Phase 6)
    Enemy.ts              ← create (Phase 4)
    Bullet.ts             ← create (Phase 3)
  types/
    game.ts               ✓ exists
    level.ts              ← create (tilemap types)
    enemy.ts              ← create (enemy types)
  data/
    levels.ts             ← create (static level config: start positions, cauldron colors)
```

---

## Priority Order (What to Do Next)

1. **Phase 0**: Fix the 6 bugs in GameScene.ts — game is currently broken, nothing works
2. **Phase 1a**: Convert remaining 8 tile BMPs + 8 background BMPs (bash script, 5 minutes)
3. **Phase 2**: Tilemap system — this unlocks the real level layout, scrolling, correct collision
4. **Phase 3**: Verify physics accuracy against C++ constants
5. **Phase 5**: Paint/cauldron system (core mechanic)
6. **Phase 4**: Enemy system
7. **Phase 6**: Catellite
8. **Phase 7**: HUD
9. **Phase 8**: Scene flow (title, lab, game over)
10. **Phase 9**: Audio wiring
11. **Phase 10**: Warp zones, polish, bonus levels

---

## Key Reference Files in C++ Source

| What | Path |
|------|------|
| Physics constants | `wizball/scripts/wizball.txt` |
| Bullet behavior | `wizball/scripts/wizball_normal_bullet.txt` |
| Catellite AI | `wizball/scripts/catellite.txt` |
| Game constants | `wizball/constant.txt` |
| Enemy types | `wizball/constant.txt` (ENEMY_TYPE_*) |
| Enemy queues | `wizball/datatables/enemy_queues.txt` + `enemy_queue_sizes.txt` |
| Level colors | `wizball/datatables/level_cauldron_colours.txt` |
| Level start X | `wizball/datatables/level_start_positions.txt` |
| Level tilemaps | `wizball/tilemaps/LEVEL_N_TILEMAP.txt` |
| Tileset collision | `wizball/tilesets/TILESET_#N.TXT` |
| Sprite frames | `wizball/sprites/[name][arb].txt` |
| All sprites | `wizball/sprites/` |
| All scripts | `wizball/scripts/` (202 files) |
