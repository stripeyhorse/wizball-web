import Phaser from 'phaser';
import { GAME, PAUSE } from '../types/game';
import { WeaponFlag } from '../types/game';
import { InputManager } from '../systems/InputManager';
import { getCauldronTarget, MAX_CAULDRON_CAPACITY, STAGES_PER_LEVEL } from '../data/cauldronTargets';
import { Depth, TILEMAP_LAYER_DEPTH } from '../config/depths';

enum SpecialPaintballType {
  EXTRA_LIFE = 0,
  FILTH_RAID = 1,
  FREAKY_BITS = 2,
  INDESTRUCTACAT = 3,
  MUTANT_CAT = 4
}

// Sync text fetch via XHR (for tilemap loading fallback in Vite)
function syncFetchText(url: string): string | undefined {
  try {
    const req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send(null);
    if (req.status === 200 || req.status === 0) return req.responseText;
  } catch (_) { /* ignore */ }
  return undefined;
}
import { getLevelData } from '../data/levels';
import { parseTilemap, BOOL_DEADLY, BOOL_HARMFUL, BOOL_CONVEY, BOOL_ACCELLERATE, BOOL_WATER } from '../systems/TilemapParser';
import type { ParsedTilemap, TileDefinition } from '../systems/TilemapParser';
import WorldCollisionMap, {
  COLLISION_HORIZONTAL_WORLD_EDGE_SOLID,
  COLLISION_ITERATE_MOVEMENT,
  COLLISION_USE_EXTRA_TEST_POINTS,
  COLLISION_VERTICAL_WORLD_EDGE_SOLID,
  COLL_TYPE_SLIDING_HORIZONTAL
} from '../systems/WorldCollision';
import BonusSelectionPanelSystem from '../systems/BonusSelectionPanelSystem';
import CauldronSystem from '../systems/CauldronSystem';
import EnemySystem from '../systems/EnemySystem';
import HUDSystem, { HUDState } from '../systems/HUDSystem';
import HiScoreSystem from '../systems/HiScoreSystem';
import WarpTubeSystem from '../systems/WarpTubeSystem';
import { playSceneMusic } from '../systems/MusicManager';

// Wizball constants from C++ code (fixed point math, scaled by 256)
// In C++, all velocity/acceleration values are in fixed-point (1/256 pixel units)
// WIZBALL_X_RESPONSIVENESS = 64 means 64/256 = 0.25 pixels/frame acceleration
const WIZBALL_RADIUS = 24;
const COLLISION_RADIUS = 16;
// C++ wizball.txt:138-149. `LET RADIUS = 16` only writes ENT_RADIUS, which is the
// circle used for OBJECT collision — it never reaches the world box. The world box
// comes from SET_COLLISION_FROM_FRAME, which reads the SPRITE FRAME
// (output.cpp:5259-5265: UPPER = pivot, LOWER = (size - 1) - pivot), so
// wizball[set][48][48][24][24] gives UPPER 24 / LOWER 23.
// SET_WORLD_COLLISION_FROM_OBJECT copies those across (scripting.cpp:7940-7945) and
// the four "- 8" lines then leave a 32×32 world box, not 16×16.
// Corroboration: WIZBALL_START_Y = 32 puts the ball's top edge at exactly y = 16
// with UPPER = 16, which is what keeps `s = y - (START_Y << 8)` non-negative in
// hit_floor_or_roof (wizball.txt:767-771).
const WIZBALL_FRAME_SIZE = 48;
const WIZBALL_FRAME_PIVOT = 24;
const WORLD_COLLISION_UPPER = WIZBALL_FRAME_PIVOT - 8; // 16
const WORLD_COLLISION_LOWER = (WIZBALL_FRAME_SIZE - 1 - WIZBALL_FRAME_PIVOT) - 8; // 15
const WIZBALL_MAX_PIXEL_X_VEL = 3;
// All values below are raw fixed-point (as in C++ constant.txt)
const WIZBALL_X_RESPONSIVENESS = 64;
const WIZBALL_Y_RESPONSIVENESS = 96;
const WIZBALL_X_DAMPING = 64;
const WIZBALL_Y_DAMPING = 64;
const WIZBALL_GRAVITY_STRENGTH = 48;
const WIZBALL_START_Y = 32; // C++ constant: distance from top where Wizball starts
const WIZBALL_FRAME_COUNT = 64;
const WIZBALL_WOBBLE_DELAY = 30;
const WIZBALL_BONUS_SELECTION_WOBBLE_THRESHOLD = 4;
const WORLD_BITMASK_PLAYER_COLLIDES = 17;
const PLAYER_WORLD_COLLISION_LAYER = 1;
const PLAYER_WORLD_COLLISION_BEHAVIOUR =
  COLLISION_USE_EXTRA_TEST_POINTS |
  COLLISION_ITERATE_MOVEMENT |
  COLLISION_HORIZONTAL_WORLD_EDGE_SOLID |
  COLLISION_VERTICAL_WORLD_EDGE_SOLID |
  COLL_TYPE_SLIDING_HORIZONTAL; // C++ wizball.txt:160 — slide along corners, don't dead-stop

const BITSHIFT = 8;
const PRIVATE_SCALE = 1 << BITSHIFT; // 256

const GAME_WIDTH = 640;
const GAME_HEIGHT = 368;
const TILE_SIZE = 16;
const WARP_MOUND_SIZE = TILE_SIZE;

// ---------------- Level backdrop ----------------
// background_level_N.png is NOT a picture, it is a 512×512 sprite atlas. Its
// frame table lives in C++ sprites/background_level_N[arb].txt and every level
// declares the same first four rects:
//   0 = greyscale start  0,8,512,208      1 = greyscale end
//   2 = colour start     0,224,512,208    3 = colour end
// (levels 1 and 2 add a 5th frame, the 510×62 "GET READY"/"GAME OVER" banner at
// 1,441 — GetReadyScene/GameOverScene's business, not ours).
const BACKDROP_FRAME_WIDTH = 512;
const BACKDROP_FRAME_HEIGHT = 208;
const BACKDROP_FRAME_Y_GREY = 8;     // frame 0
const BACKDROP_FRAME_Y_COLOUR = 224; // frame 2
const BACKDROP_FRAME_GREY = 'wiz_bg_grey';
const BACKDROP_FRAME_COLOUR = 'wiz_bg_colour';
// C++ scripts/background.txt:39-40 — opengl_scale_x = 12600, opengl_scale_y = 12500.
const BACKDROP_SCALE_X = 1.26;
const BACKDROP_SCALE_Y = 1.25;
// C++ background.txt:31 + :60-61 + :111-112: the "end" frame is base_frame + 1 and
// OPENGL_BOOLEAN_INTERPOLATED lerps the drawn UVs from the start rect to the end
// rect by INTERPOLATION_X_PERCENTAGE (output.cpp:4090-4093, GL_REPEAT wrap at
// :2425). The end rect is offset horizontally by this many texels, so that is how
// far the backdrop pans, wrapping, across the whole level: 512 for most levels but
// 64 for level 4 and 128 for levels 7-8 (sprites/background_level_{4,7,8}[arb].txt).
const BACKDROP_PARALLAX_TEXELS: Record<number, number> = { 4: 64, 7: 128, 8: 128 };

// Bullet constants from C++
const BULLET_SPEED = 720; // px/s (192 bitshift 4)
const NORMAL_FIRE_RATE = 20; // frames
const DOUBLE_FIRE_RATE = 10; // frames
// C++ wizball_normal_bullet.txt:180-186 — bullet_type picks the atlas frame:
// 1 = normal, 2 = powered-up (DOUBLE_FIRE), 3 = little (spread fan).
const BULLET_FRAME_NORMAL = 'bullets_1';
const BULLET_FRAME_POWERED = 'bullets_3';
const BULLET_FRAME_LITTLE = 'bullets_4';
// C++ function_normal_enemy_am_i_on_screen.txt — a player bullet dies once it is
// HALF_SCREEN_PLUS_ENTRANCE_PHANTOM_ZONE (344) from the camera centre, or leaves
// the -16..432 vertical band.
const BULLET_RETIRE_DISTANCE = 344;
const BULLET_RETIRE_TOP = -16;
const BULLET_RETIRE_BOTTOM = 432;
// C++ constant.txt:511 — every score add in the C++ is clamped to this.
const MAXIMUM_POSSIBLE_SCORE = 9999999;
// C++ constant.txt:233 — enemies_shot_in_a_row rolls over into a bonus pearl here.
const ENEMIES_KILLED_PER_BONUS_ICON = 10;

// C++ wizball_alternate_shield_bullet_core.txt:41-49 — the two shield cores sit
// at a fixed (0, ±15) from the ball, and their (never-stretched) collision box
// reaches from 16 to 48 px further out, 24 px either side.
const SHIELD_CORE_OFFSET = 15;
const SHIELD_CORE_NEAR_EDGE = 16;
const SHIELD_CORE_FAR_EDGE = 48;
const SHIELD_CORE_HALF_WIDTH = 24;
const SHIELD_CORE_LIFETIME = 20;    // frames it survives after FIRE is released (:81, 115-123)
const SHIELD_CORE_WAVE_PERIOD = 10; // a visual wave child every 10 frames (:95-108)

// C++ smart_bomb_shockwave.txt: two ENT_TYPE_PLAYER_BULLET waves pinned to
// world_y 208, 56×416 collision from frame, sweeping outward at ±8 px/frame and
// dying 32 px behind / 672 px ahead of the camera's left edge (:16, 34-39, 77-89).
const SMART_BOMB_WAVE_Y = 208;
const SMART_BOMB_WAVE_WIDTH = 56;
const SMART_BOMB_WAVE_HEIGHT = 416;
const SMART_BOMB_WAVE_SPEED = 8 * 60; // 8 px/frame -> px/s

// Catellite Constants from C++
const CATELLITE_CONTROLLED_HORIZONTAL_SPEED = 6;
const CATELLITE_CONTROLLED_VERTICAL_SPEED = 6;
const CATELLITE_FOLLOWING_HORIZONTAL_SPEED = 4;
const CATELLITE_CONTROL_THRESHOLD = 25;
// C++ catellite.txt:15 — the cat runs its OWN fire timer; it never sees DOUBLE_FIRE.
const CATELLITE_FIRING_RATE = 20;
// C++ catellite.txt:126-128 — a freshly (re)collected cat flies in from off-screen.
const CATELLITE_SPAWN_X_OFFSET = -332;
const CATELLITE_SPAWN_Y = 16;
// C++ catellite.txt:164-190 — the cat is kept inside the camera window, never the
// whole level, so it can't be stranded off-screen.
const CATELLITE_WINDOW_MIN_X = 16;
const CATELLITE_WINDOW_MAX_X = 624;
const CATELLITE_MAX_Y = 356;
// C++ catellite.txt:304-307 — the mutant cat picks a random spot near the wizball
// every 60-120 frames and drifts to it.
const MUTANT_CAT_X_RANGE = 256;
const MUTANT_CAT_MIN_Y = 24;
const MUTANT_CAT_MAX_Y = 344;
const MUTANT_CAT_MIN_DECISION_FRAMES = 60;
const MUTANT_CAT_MAX_DECISION_FRAMES = 120;

// C++ main_game_controller.txt:166-167 / 1067-1093 — only a three-level window is
// warp-reachable at any time; it opens up as levels are completed.
const LEVEL_COUNT = 8;
const STARTING_MAX_OPEN_LEVEL = 3; // C++ max_open_level = 2, 0-indexed
const OPEN_LEVEL_WINDOW = 2;       // C++ min_open_level = max_open_level - 2
const FUZZ_COUNTER_START = 2700; // C++ FUZZ_COUNTER_START_VALUE — frames of no kills before a Fuzz spawns
const CATELLITE_STARTING_ENERGY = 9; // C++ CATELLITE_STARTING_ENERGY — hits the cat takes before destruction
const SHIELD_STARTING_ENERGY = 2100; // C++ SHIELD_STARTING_ENERGY — shield lasts 2100 frames (~30s)
const SHIELD_HIT_PENALTY = 420;      // C++ SHIELD_HIT_PENALTY — shield frames lost per hit absorbed

// Paint colors (R/G/B tints for paintdrops, bullets and the paint indicator)
const PAINT_FRAME_COLORS = [0xff0000, 0x00ff00, 0x0000ff];

enum MovementStyle {
  BASIC_BOUNCE = 0,
  CONTROLLED_BOUNCE = 1,
  FULL_CONTROLLED = 2
}

enum WobbleDirection {
  EITHER = 0,
  LEFT = 1,
  RIGHT = 2
}

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private inputManager!: InputManager;

  // Wizball physics state (in fixed-point units scaled by 256)
  private xVel: number = 0;
  private yVel: number = 0;
  private idealXVel: number = 0;
  private spinAngle: number = 0;
  private topSpinAngle: number = 0;
  private spinAngleToFrameDivider: number = 0;

  private movementStyle: MovementStyle = MovementStyle.BASIC_BOUNCE;
  // C++ keeps TWO loadouts: wizball_starting_loadout is the PERMANENT one, written
  // only by the laboratory (lab_manage_permanent_upgrade_icons.txt:170), and
  // wizball_current_loadout is the in-level one. Every new life / lab exit copies
  // starting -> current (wizball.txt:177-179), wiping pearl-selected upgrades.
  private startingLoadout: number = 0;
  private weaponCollection: number = 0;
  private lastMovementDirection: number = 1;

  // Catellite state
  // Consecutive frames FIRE has been held — the Catellite hands control to the
  // player once this reaches CATELLITE_CONTROL_THRESHOLD (C++ wizball.txt:389).
  private fireHeldFrames: number = 0;
  private catellitePreviousYPositions: number[] = [];
  private catelliteIsPlayerControlled: boolean = false;
  private mutantCatelliteActive: boolean = false;
  private catelliteEnergy: number = CATELLITE_STARTING_ENERGY; // C++ catellite_energy (9 hits)
  private catelliteHitThisFrame: boolean = false;              // once-per-frame energy-loss latch
  private catelliteFireCooldown: number = 0;                   // C++ catellite fire_delay_counter
  private catelliteFiringDirection: number = 1;                // C++ catellite firing_direction (v10)
  private catelliteOverrideReverseFire: boolean = false;       // C++ override_reverse_fire (v37)
  private catelliteFollowingState: boolean = false;            // C++ catellite_following_state
  private catSpreadFlipSide: boolean = false;                  // C++ catellite flip_vertical_firing_side (v8)
  // C++ catellite.txt:303-311 — mutant drift target, re-rolled every 60-120 frames.
  private mutantCatXOffset: number = 0;
  private mutantCatTargetY: number = MUTANT_CAT_MIN_Y;
  private mutantCatDecisionCounter: number = 0;

  // Game objects
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private warpMounds!: Phaser.Physics.Arcade.StaticGroup;
  private paintGroup!: Phaser.Physics.Arcade.Group;
  private bulletGroup!: Phaser.Physics.Arcade.Group;
  private bonusPearlGroup!: Phaser.Physics.Arcade.Group;
  private specialPaintballGroup!: Phaser.Physics.Arcade.Group;
  private catellite!: Phaser.Physics.Arcade.Sprite;
  private catelliteBubble!: Phaser.GameObjects.Graphics;
  private enemySystem!: EnemySystem;
  private cauldronSystem!: CauldronSystem;
  private bonusSelectionPanel!: BonusSelectionPanelSystem;
  private warpTubeSystem!: WarpTubeSystem;

  // Game state
  private lives: number = 2;
  private displayScore: number = 0; // C++ player_display_score: rolls toward score
  private lastScoreSector: number = 0; // C++ awards a life each 100k crossed (on display score)
  private respawnInvulnFrames: number = 0; // post-death grace window (new-life appear)
  private paintColor: number = 0;
  private hasPaint: boolean = false;
  private fireCooldown: number = 0;
  private catelliteHasShield: boolean = false;
  private catShieldEnergy: number = 0;     // C++ cat_shield_stored_health countdown
  private wizballShieldEnergy: number = 0; // C++ wizball_shield_stored_health countdown
  private score: number = 0;
  private currentLevel: number = 1;     // the level you're PHYSICALLY on (changes when you warp)
  // The level whose colour-targets you're completing. You stay anchored to it
  // while you warp to adjacent levels to gather the other paint colours (C++:
  // each level is one colour, the cauldrons persist across levels). Returns here
  // after every stage. Advances 1->8 as the game progresses.
  private homeLevel: number = 1;
  private currentPickupCount: number = 0;
  private cauldronFill: number[] = [0, 0, 0, 0];
  // C++ level_progress (main_game_controller.txt): 0..2, which of the 3 colour
  // targets the player is currently mixing toward. Reaches 3 => level complete.
  private levelProgress: number = 0;
  private stageTransitioning: boolean = false; // guards the stage→bonus→lab handoff
  private enemiesKilledThisLevel: number = 0;
  private consecutiveEnemyKills: number = 0; // C++: tracks kills for bonus pearl (every 10)
  private fuzzCounter: number = FUZZ_COUNTER_START; // counts down each frame; spawns a Fuzz at 0
  // C++ shared_next_bullet_alternator (wizball.txt:199, 617-618; catellite.txt:534-551):
  // ONE alternator shared by the wizball and the cat, so with REAR_FIRE the pair
  // fire in opposite directions and swap over on every shot.
  private sharedNextBulletAlternator: number = 1;
  private spreadFlipSide: boolean = false; // C++ flip_vertical_firing_side: alternates spread fan up/down
  private shieldCores: Phaser.Physics.Arcade.Sprite[] = []; // SHIELD_FIRE upper/lower cores
  private shieldCoreLifetime: number = 0;  // C++ core lifetime, 20 frames past FIRE release
  private shieldCoreWaveCounter: number = 0;
  private shieldCoreGfx: Phaser.GameObjects.Graphics | null = null;
  // C++ main_game_controller.txt LEVEL_COMPLETION_ARRAY_ID — colour stages (0..3)
  // banked per level, plus the derived warp-reachable window.
  private levelCompletion: number[] = new Array(LEVEL_COUNT).fill(0);
  private minOpenLevel: number = STARTING_MAX_OPEN_LEVEL - OPEN_LEVEL_WINDOW;
  private maxOpenLevel: number = STARTING_MAX_OPEN_LEVEL;
  // C++ spawn_paintball_wave.txt:151-158 — the special paintball is decided ONCE
  // PER WAVE (1 in 6) and carried by exactly one bubble of that wave.
  private waveSpecialState: WeakMap<object, { rolled: boolean; specialIndex: number; killIndex: number }> =
    new WeakMap();
  private worldWidth: number = GAME_WIDTH;
  private worldHeight: number = GAME_HEIGHT;
  private levelVisuals: Phaser.GameObjects.GameObject[] = [];
  // The two camera-pinned copies of the backdrop frame that give it its wrapping
  // parallax pan, plus the frame they are currently showing (grey vs colour).
  private backdropTiles: Phaser.GameObjects.Image[] = [];
  private backdropFrame: string = BACKDROP_FRAME_GREY;
  private tilemapLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private worldCollisionMap: WorldCollisionMap | null = null;
  private currentParsedTilemap: ParsedTilemap | null = null;
  private worldColliders: Phaser.Physics.Arcade.Collider[] = [];
  private wobbleResetCountdown: number = 0;
  private wobbleCounter: number = 0;
  private wobbleNextDirection: WobbleDirection = WobbleDirection.EITHER;
  private playerXFixed: number = 0;
  private playerYFixed: number = 0;

  // HUD
  private hudText!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;
  private hudSystem!: HUDSystem;

  // Sounds
  private bounceSound!: Phaser.Sound.BaseSound;
  private fireSound!: Phaser.Sound.BaseSound;
  private pickupSound!: Phaser.Sound.BaseSound;

  constructor() {
    super({ key: GAME });
  }

  init(data: {
    level?: number; score?: number; weaponCollection?: number; lives?: number;
    levelProgress?: number; cauldronFill?: number[];
    startingLoadout?: number; levelCompletion?: number[];
    minOpenLevel?: number; maxOpenLevel?: number;
  } = {}): void {
    // C++ main_game_controller.txt:166-167 / 1067-1093 — only a three-level window
    // is warp-reachable, and it widens as levels are completed. A fresh game opens
    // levels 1-3.
    const arrivalLevel = Phaser.Math.Clamp(data.level ?? 1, 1, LEVEL_COUNT);
    if (data.levelCompletion && data.levelCompletion.length === LEVEL_COUNT) {
      this.levelCompletion = [...data.levelCompletion];
    } else {
      // No window state threaded in (a fresh game, or a caller that predates it):
      // reconstruct it from where we arrived — getting to level N means levels
      // 1..N-1 were completed — so the window can never be narrower than the level
      // we're standing on.
      this.levelCompletion = new Array(LEVEL_COUNT).fill(0);
      for (let i = 0; i < arrivalLevel - 1; i++) this.levelCompletion[i] = STAGES_PER_LEVEL;
      this.levelCompletion[arrivalLevel - 1] = Math.min(data.levelProgress ?? 0, STAGES_PER_LEVEL);
    }

    if (data.maxOpenLevel !== undefined) {
      this.maxOpenLevel = Phaser.Math.Clamp(data.maxOpenLevel, 1, LEVEL_COUNT);
      this.minOpenLevel = Phaser.Math.Clamp(
        data.minOpenLevel ?? (this.maxOpenLevel - OPEN_LEVEL_WINDOW), 1, this.maxOpenLevel
      );
    } else {
      this.recomputeOpenLevelWindow();
    }

    // Levels outside the window are unreachable in the C++ (main_game_controller.txt:809
    // clamps every warp), so an arrival level outside it can only be a caller bug.
    this.currentLevel = Phaser.Math.Clamp(arrivalLevel, this.minOpenLevel, this.maxOpenLevel);
    this.homeLevel = this.currentLevel; // you start anchored to the level you arrive on
    this.score = data.score ?? 0;
    // C++ wizball.txt:177-179 — every entry into a level from the lab/bonus loop
    // (and every new life) is a wizball_new_life_appear: the current loadout is
    // reset to the permanent one. Tolerate a caller that only knows the old single
    // `weaponCollection` field by treating that as the permanent loadout.
    this.startingLoadout = data.startingLoadout ?? data.weaponCollection ?? 0;
    this.weaponCollection = this.startingLoadout;
    // New-game entries (Title→GetReady, GameOver restart) pass no lives, so a
    // fresh game must start at WIZBALL_START_LIVES (2). Only mid-game
    // transitions (Laboratory, bonus loop) carry an explicit lives value.
    // Using `?? this.lives` here re-used the stale 0 left on the reused scene
    // instance after a game over → instant death loop on restart (C++
    // start_game.txt resets player_lives every game start).
    this.lives = data.lives ?? 2;
    this.displayScore = this.score; // start the rolling display at the carried score
    this.lastScoreSector = Math.floor(this.score / 100000); // don't re-award on continue
    // levelProgress + cauldronFill resume across bonus→lab→same-level (C++ colour
    // stages); a fresh level starts both at zero.
    this.levelProgress = data.levelProgress ?? 0;
    this.cauldronFill = data.cauldronFill ? [...data.cauldronFill] : [0, 0, 0, 0];
    this.stageTransitioning = false;
    this.respawnInvulnFrames = 0;
    this.catShieldEnergy = 0;
    this.wizballShieldEnergy = 0;
    // Phaser reuses the scene instance across scene.start(), so field initialisers
    // do NOT run again — every piece of per-life state has to be cleared here or it
    // leaks into the next level (a mad cat, a stale kill streak, dead orb refs...).
    this.catelliteEnergy = CATELLITE_STARTING_ENERGY;
    this.catelliteHasShield = false;
    this.catelliteHitThisFrame = false;
    this.catelliteIsPlayerControlled = false;
    this.catelliteFollowingState = false;
    this.catelliteFireCooldown = 0;
    this.catelliteFiringDirection = 1;
    this.catelliteOverrideReverseFire = false;
    this.catSpreadFlipSide = false;
    this.mutantCatelliteActive = false;
    this.mutantCatDecisionCounter = 0;
    this.catellitePreviousYPositions = [];
    this.fireHeldFrames = 0;
    this.fireCooldown = 0;
    this.consecutiveEnemyKills = 0;
    this.fuzzCounter = FUZZ_COUNTER_START;
    this.currentPickupCount = 0;
    this.hasPaint = false;
    this.paintColor = 0;
    this.lastMovementDirection = 1;
    this.sharedNextBulletAlternator = 1; // C++ wizball.txt:199
    this.spreadFlipSide = false;
    this.shieldCores = [];
    this.shieldCoreGfx = null;
    this.shieldCoreLifetime = 0;
    this.shieldCoreWaveCounter = 0;
    this.waveSpecialState = new WeakMap();
    this.resetWobbleState();
    this.applyWeaponMovementStyle();
  }

  create(): void {
    this.cameras.main.roundPixels = true;

    // Setup input FIRST so update() can always access it even if later init fails
    // InputManager self-registers shutdown cleanup
    this.inputManager = new InputManager(this);

    // C++ spin calculation: top_spin_angle = (wizball_radius << bitshift) % two_pi_percent
    // In the C++ scripting language, % is MATH_ADAPT_BY_PERCENTAGE = a * b / 10000
    // = (24 << 8) * 62831 / 10000 = 6144 * 62831 / 10000 = 38590
    // This equals the circumference in fixed-point units (2*PI*24*256/10000 scaled)
    this.topSpinAngle = Math.trunc(((WIZBALL_RADIUS << BITSHIFT) * 62831) / 10000);
    // wizball.txt:108 divides in the C++ scripting language's integer arithmetic
    // (scripting.cpp:5949), so 38603 / 64 is 603, not 603.171875.
    this.spinAngleToFrameDivider = Math.trunc(this.topSpinAngle / WIZBALL_FRAME_COUNT);

    // Create sounds safely
    this.bounceSound = this.safeAddSound('wizball_bounce', 0.5);
    this.fireSound = this.safeAddSound('wizball_or_cat_fire_normal', 0.4);
    this.pickupSound = this.safeAddSound('bonus_pearl_pickup', 0.6);

    // Create paint drop textures (generated, not loaded from files)
    this.createPaintTextures();

    // Create warp tube system (before createLevel which uses it)
    this.warpTubeSystem = new WarpTubeSystem(this);

    // Create player
    this.createPlayer();

    // Create enemy system before level setup so level parsing can configure it immediately.
    this.enemySystem = new EnemySystem(this);
    this.enemySystem.setPlayerReference(this.player);

    // Build the level
    this.createLevel();
    // Phaser's Systems.shutdown() only removes its own TRANSITION listeners — the
    // scene EventEmitter itself survives every restart. Registering here without
    // clearing first stacks one handler per restart, so a single warp tube would
    // fire warpToAdjacentLevel() N times and jump N levels.
    this.events.off('warp-activate');
    this.events.on('warp-activate', (data: { levelDelta: number }) => {
      // The emitter outlives the scene's running state, so ignore anything that
      // arrives after shutdown — rebuilding a level on a torn-down scene hits a
      // null this.physics.
      if (!this.scene.isActive()) return;
      this.warpToAdjacentLevel(data.levelDelta);
    });

    // Create catellite (follower)
    this.createCatellite();

    // Create paint drops
    this.createPaintSystem();

    // Create bullet group
    this.bulletGroup = this.physics.add.group({
      runChildUpdate: true
    });
    this.bonusPearlGroup = this.physics.add.group();
    this.specialPaintballGroup = this.physics.add.group();

    this.enemySystem.loadEnemyQueues();
    this.enemySystem.configureLevel(this.currentParsedTilemap);
    this.enemySystem.spawnInitialEnemies(this.currentLevel);

    // Setup collisions
    this.setupCollisions();

    // Create HUD
    this.createHUD();

    this.bonusSelectionPanel = new BonusSelectionPanelSystem(this);
    this.bonusSelectionPanel.update(this.weaponCollection, this.currentPickupCount);

    this.cauldronSystem = new CauldronSystem(this);
    this.cauldronSystem.setupCauldrons(this.homeLevel, this.levelProgress);
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    // No FPS counter here. Settings > Graphics > Show FPS is served by the DOM
    // overlay in src/main.ts, which is gated on the setting, re-syncs on
    // 'settings:changed' and survives every scene transition. A second, always-on
    // in-canvas readout drew over the HUD whether the toggle said ON or OFF.

    // Initial velocity - C++ starts with a small downward push
    this.yVel = 0; // C++ spawns with y_vel = 0; gravity ramps it (wizball.txt)
    this.idealXVel = 0;

    playSceneMusic(this, 'wizball_in_game');
  }

  private safeAddSound(key: string, volume: number): Phaser.Sound.BaseSound {
    try {
      if (this.cache.audio.exists(key)) {
        return this.sound.add(key, { volume });
      }
    } catch (_) { /* ignore */ }
    // Return a no-op sound that won't crash when played
    return { play: () => {}, isPlaying: false, destroy: () => {} } as any;
  }

  private createPaintTextures(): void {
    const defs = [
      { key: 'paint_red',   color: 0xff2222 },
      { key: 'paint_green', color: 0x22ff22 },
      { key: 'paint_blue',  color: 0x2266ff },
    ];
    for (const { key, color } of defs) {
      if (this.textures.exists(key)) continue;
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillCircle(8, 8, 6);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }

    // Special-paintball pickups (EXTRA_LIFE, FILTH_RAID, FREAKY_BITS, INDESTRUCTACAT, MUTANT_CAT).
    // Original C++ uses sprite atlas frames; we synthesise readable emblem textures so
    // each pickup type is visually distinct and always renders even if atlas assets
    // haven't been converted.
    const specials: Array<{ key: string; bg: number; rim: number; glyph: number; letter: string }> = [
      { key: 'sp_extra_life',     bg: 0xff2255, rim: 0xffccdd, glyph: 0xffffff, letter: '+1' },
      { key: 'sp_filth_raid',     bg: 0x885522, rim: 0xffaa55, glyph: 0xffffff, letter: 'F'  },
      { key: 'sp_freaky_bits',    bg: 0xaa22ff, rim: 0xddaaff, glyph: 0xffffff, letter: '?'  },
      { key: 'sp_indestructacat', bg: 0x22aaff, rim: 0xaaddff, glyph: 0xffffff, letter: 'I'  },
      { key: 'sp_mutant_cat',     bg: 0x22ff66, rim: 0xaaffcc, glyph: 0x003311, letter: 'M'  },
    ];

    const size = 32;
    for (const { key, bg, rim, glyph, letter } of specials) {
      if (this.textures.exists(key)) continue;
      const rt = this.make.renderTexture({ width: size, height: size }, false);
      const g = this.add.graphics();
      g.fillStyle(bg, 1);
      g.fillCircle(size / 2, size / 2, size / 2 - 2);
      g.lineStyle(2, rim, 1);
      g.strokeCircle(size / 2, size / 2, size / 2 - 2);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(size / 2 - 6, size / 2 - 6, 4);
      rt.draw(g);
      g.destroy();
      const text = this.make.text({
        x: 0, y: 0, text: letter,
        style: { fontFamily: 'monospace', fontSize: letter.length > 1 ? '12px' : '16px', color: '#' + glyph.toString(16).padStart(6, '0'), fontStyle: 'bold' },
      }, false);
      rt.draw(text, (size - text.width) / 2, (size - text.height) / 2);
      text.destroy();
      rt.saveTexture(key);
      rt.destroy();
    }

    // C++ smart_bomb_shockwave uses title_screen_and_large_bits frame 4 (56x416,
    // anchored at 28,208). We synthesise an equivalent additive vertical wavefront.
    if (!this.textures.exists('smart_bomb_wave')) {
      const g = this.add.graphics();
      for (let i = 0; i < SMART_BOMB_WAVE_WIDTH / 2; i++) {
        const t = i / (SMART_BOMB_WAVE_WIDTH / 2);
        g.fillStyle(0xffffff, 0.10 + 0.5 * t * t);
        g.fillRect(SMART_BOMB_WAVE_WIDTH / 2 - i - 1, 0, 1, SMART_BOMB_WAVE_HEIGHT);
        g.fillRect(SMART_BOMB_WAVE_WIDTH / 2 + i, 0, 1, SMART_BOMB_WAVE_HEIGHT);
      }
      g.generateTexture('smart_bomb_wave', SMART_BOMB_WAVE_WIDTH, SMART_BOMB_WAVE_HEIGHT);
      g.destroy();
    }

    // C++ wizball_alternate_shield_bullet_core draws player_bullets frame 2 (the
    // 78x32 "Alternate Shield" bar) stretched toward the floor / ceiling.
    if (!this.textures.exists('shield_fire_bar')) {
      const g = this.add.graphics();
      g.fillStyle(0x66ccff, 0.85);
      g.fillRect(0, 0, SHIELD_CORE_HALF_WIDTH * 2, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(SHIELD_CORE_HALF_WIDTH - 6, 0, 12, 8);
      g.generateTexture('shield_fire_bar', SHIELD_CORE_HALF_WIDTH * 2, 8);
      g.destroy();
    }
  }

  private hitEnemy(_bullet: any, enemy: any): void {
    const bullet = _bullet as Phaser.Physics.Arcade.Sprite;
    // Shield-fire cores and smart-bomb shockwaves persist (they have no
    // entity_hitline of their own — wizball_alternate_shield_bullet_core.txt:141-145,
    // smart_bomb_shockwave.txt has none); only real bullets are spent.
    if (!(bullet as any)._isShieldOrb && !(bullet as any)._isSmartBombWave) bullet.destroy();
    const e = enemy as Phaser.Physics.Arcade.Sprite;
    // Guard against re-killing during the death tween (a persistent orb or a
    // second bullet can overlap the same enemy across frames before it's gone).
    if ((e as any)._dying) return;
    (e as any)._dying = true;
    this.fuzzCounter = FUZZ_COUNTER_START; // C++: any enemy kill resets the fuzz timer
    const enemyData = (e as any)._data;
    const isPaintBubble = enemyData?.enemyType === 0; // EnemyType.PAINT_BUBBLES
    const isBonusMolecule = enemyData?.enemyType === 9; // EnemyType.BONUS_MOLECULE
    const isMolecule = Boolean((e as any)._isMolecule);
    // The lurking molecule and the bonus-wave molecules are both dedicated
    // pearl sources; neither rolls the generic special/streak-pearl drops.
    const dropsPearl = isMolecule || isBonusMolecule;

    // Explosion death animation: scale up + fade out
    this.tweens.add({
      targets: e,
      scale: 1.5,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.addScore(50); // C++ generic_level_enemy.txt:588/605/622 — +50 per kill
        this.enemiesKilledThisLevel++;

        if (dropsPearl) {
          this.spawnBonusPearl(e.x, e.y);
        } else if (isPaintBubble) {
          // C++ generic_level_enemy.txt:578-600 — the bubble drops a paintdrop
          // carrying its own colour, and (for the one pre-chosen bubble of the
          // wave) the wave's special bonus. Specials come ONLY from paint bubbles.
          if (this.paintBubbleCarriesSpecial(enemyData)) {
            this.spawnSpecialPaintball(e.x, e.y, this.pickSpecialBonusType());
          } else {
            const color = enemyData?.paintColor ?? 0;
            this.spawnPaintDrop(color, e.x, e.y);
          }
        } else {
          // C++ function_kill_normal_enemy — ONLY plain enemies feed
          // enemies_shot_in_a_row (paint bubbles and bonus molecules return
          // before it is called), and the counter resets on each pearl.
          this.consecutiveEnemyKills++;
          if (this.consecutiveEnemyKills >= ENEMIES_KILLED_PER_BONUS_ICON) {
            this.consecutiveEnemyKills = 0;
            this.spawnBonusPearl(e.x, e.y);
          }
        }

        if (this.cache.audio.exists('enemy_explode')) {
          this.sound.play('enemy_explode', { volume: 0.5 });
        }

        e.destroy();
        this.handlePostEnemyRemoval();
      }
    });
  }

  // C++ clamps every score add to MAXIMUM_POSSIBLE_SCORE (constant.txt:511), e.g.
  // generic_level_enemy.txt:587-589, check_enemy_count (main_game_controller.txt:1170).
  private addScore(amount: number): void {
    this.score = Math.min(MAXIMUM_POSSIBLE_SCORE, this.score + amount);
  }

  /**
   * C++ spawn_paintball_wave.txt:151-158 — a wave rolls rand(0,5) ONCE; on a 0 it
   * picks one bubble index in [0, wave_size) to carry the special bonus, and that
   * single bubble drops it. All the other bubbles of the wave drop plain paint.
   * The wave config object is shared by every enemy of the wave, so it doubles as
   * the wave identity here.
   */
  private paintBubbleCarriesSpecial(enemyData: any): boolean {
    // C++ generic_level_enemy.txt:583-589 — no specials during a freak out.
    if ((this.weaponCollection & WeaponFlag.FREAKY_BITS) !== 0) return false;

    const wave = enemyData?.waveConfig;
    if (!wave) return false;

    let state = this.waveSpecialState.get(wave);
    if (!state) {
      const waveSize = Math.max(1, wave.count ?? 1);
      const hasSpecial = Math.floor(Math.random() * 6) === 0; // SPECIAL_RAND (0, 0,5) = 0
      state = {
        rolled: true,
        // SPECIAL_RAND (0, 1,wave_size) - 1 => a 0-based index into the wave
        specialIndex: hasSpecial ? Math.floor(Math.random() * waveSize) : -1,
        killIndex: 0
      };
      this.waveSpecialState.set(wave, state);
    }

    const isSpecial = state.killIndex === state.specialIndex;
    state.killIndex++;
    return isSpecial;
  }

  // Single death/respawn path (C++ reset_due_to_life_loss): explode, lose a life,
  // game over at 0, else respawn at the start with a brief Get-Ready grace window.
  private loseLife(): void {
    // The ball is being sucked into hyperspace during a warp — not vulnerable
    // (C++ replaces the control routine entirely with do_warp_out). The
    // post-death grace window is also fully protective.
    if (this.stageTransitioning || this.warpTubeSystem?.isActive() || this.respawnInvulnFrames > 0) return;

    // C++ wizball_shield_bubble_layer.txt:138 — a hit while shielded is absorbed
    // but drains SHIELD_HIT_PENALTY (420) frames; when the shield runs dry the
    // INVULNERABILITY flag drops and the next hit lands.
    if ((this.weaponCollection & WeaponFlag.INVULNERABILITY) !== 0) {
      this.wizballShieldEnergy = Math.max(0, this.wizballShieldEnergy - SHIELD_HIT_PENALTY);
      if (this.wizballShieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;
      return;
    }

    if (this.cache.audio.exists('wizball_explode')) {
      this.sound.play('wizball_explode', { volume: 0.6 });
    }
    // C++ main_game_controller.txt:673-681 — temp_1 = player_lives - 1, and it's
    // GAME OVER only once that drops BELOW -1... i.e. the counter itself may reach
    // -1 first. With WIZBALL_START_LIVES = 2 that is three deaths, not two.
    this.lives--;
    if (this.lives < 0) {
      this.scene.start('GameOver', { score: this.score, level: this.currentLevel, weaponCollection: this.weaponCollection, lives: this.lives });
      return;
    }

    const spawn = this.getSpawnPosition();
    this.player.setPosition(spawn.x, spawn.y);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    (this.player.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    this.xVel = 0;
    this.yVel = 0;
    this.idealXVel = 0;
    this.respawnInvulnFrames = 120; // ~2s grace so the new life isn't instantly lost

    // C++ wizball.txt:177-179 (wizball_new_life_appear) — the new life is equipped
    // from the PERMANENT loadout, so every pearl-selected upgrade is lost. The
    // catellite is respawned fresh alongside it (:943-957), after the ball has
    // been placed so it flies in relative to the new position.
    this.weaponCollection = this.startingLoadout;
    this.applyWeaponMovementStyle();
    this.resetPerLifeCatelliteState();
    // Timed shields die with the old life (they live on wizball_current_loadout).
    this.wizballShieldEnergy = 0;
    this.catShieldEnergy = 0;
    this.catelliteHasShield = (this.weaponCollection & WeaponFlag.CATELLITE_INVULNERABILITY) !== 0;
    this.shieldCoreLifetime = 0;
    this.clearShieldCores();
    this.catellitePreviousYPositions = [];

    // C++ wizball.txt .player_deaded: losing a life wipes any partially
    // accumulated bonus-pearl selection.
    this.currentPickupCount = 0;
    this.resetWobbleState();

    // Pre-life cue + Get-Ready flash/overlay during the grace window. (The 2s
    // invulnerability is what protects the new life; we deliberately don't dump a
    // fresh full-level wave on death — spawnEnemies would spawn the whole
    // allotment at once and skip the molecule phase.)
    if (this.cache.audio.exists('wizball_new_life_appear_sound')) {
      this.sound.play('wizball_new_life_appear_sound', { volume: 0.5 });
    }
    this.tweens.add({ targets: this.player, alpha: 0.3, duration: 120, yoyo: true, repeat: 8, onComplete: () => this.player.setAlpha(1) });
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'GET READY', {
      fontSize: '28px', color: '#ffff66', fontFamily: 'monospace',
      backgroundColor: '#00000088', padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    this.time.delayedCall(1200, () => msg.destroy());
  }

  // C++ generic_level_enemy.txt:166-167 — an enemy's COLLIDE_WITH includes
  // ENT_TYPE_PLAYER, so a contact kill runs the SAME .object_interaction_routine
  // (:576-639) as a bullet kill: score, fuzz reset, paintdrop/pearl drops.
  private playerCollideWithEnemy(_player: any, _enemy: any): void {
    const enemy = _enemy as Phaser.Physics.Arcade.Sprite;

    // Player takes damage (unless invulnerable / in respawn grace).
    this.loseLife();

    // Reuse the shared kill path with a persistent fake "bullet".
    this.hitEnemy({ _isShieldOrb: true, active: true, destroy() {} }, enemy);
  }

  // C++ catellite.txt:109-110 / :601-624 — the cat's COLLIDE_WITH covers enemy
  // BULLETS as well as enemies, and either one decrements catellite_energy.
  private catelliteHitByEnemyBullet(_catellite: any, bullet: any): void {
    if ((this.weaponCollection & WeaponFlag.CATELLITE) === 0 || !this.catellite.visible) return;
    this.enemySystem.releaseEnemyBullet(bullet as Phaser.Physics.Arcade.Sprite);
    this.damageCatellite();
  }

  // C++: catellite touching an enemy costs the cat energy and kills the enemy
  private catelliteCollideWithEnemy(_catellite: any, _enemy: any): void {
    // No catellite owned (or already destroyed this life) → no contact.
    if ((this.weaponCollection & WeaponFlag.CATELLITE) === 0 || !this.catellite.visible) return;
    const enemy = _enemy as Phaser.Physics.Arcade.Sprite;

    this.damageCatellite();

    // Enemy dies on contact — reuse the bullet path with a persistent fake "bullet"
    // (the _isShieldOrb flag keeps hitEnemy from destroying it) so kills score,
    // drop pearls/paint, and reset the fuzz counter consistently.
    this.hitEnemy({ _isShieldOrb: true, active: true, destroy() {} }, enemy);
  }

  /**
   * C++ catellite.txt:592-630 — one energy point per frame at most, skipped
   * entirely while CATELLITE_INVULNERABILITY is up; at 0 the cat self-destructs.
   * (Indestructacat is not a flag: paintdrop.txt:137-140 just sets the cat's
   * stored health to 128, which is handled in collectSpecialPaintball.)
   */
  private damageCatellite(): void {
    if (this.catelliteHitThisFrame) return;
    this.catelliteHitThisFrame = true;

    if ((this.weaponCollection & WeaponFlag.CATELLITE_INVULNERABILITY) !== 0) {
      this.catShieldEnergy = Math.max(0, this.catShieldEnergy - SHIELD_HIT_PENALTY);
      if (this.catShieldEnergy === 0) {
        this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
        this.catelliteHasShield = false;
      }
      return;
    }

    this.catelliteEnergy--;
    if (this.cache.audio.exists('catellite_hit')) {
      this.sound.play('catellite_hit', { volume: 0.5 });
    }
    if (this.catelliteEnergy <= 0) {
      this.destroyCatellite();
    } else {
      // Hit feedback flash (warns more strongly when nearly dead).
      this.tweens.add({ targets: this.catellite, alpha: 0.3, duration: 60, yoyo: true });
      if (this.catelliteEnergy <= 1) this.catellite.setTint(0xff8866);
    }
  }

  /**
   * C++ wizball.txt:943-957 / :1015-1018 — a cat that appears with a new life or
   * is freshly (re)collected is reset: full energy, not mad, back off-screen at
   * wizball.world_x - 332 / world_y 16 (catellite.txt:126-128) so it flies in.
   */
  private resetPerLifeCatelliteState(): void {
    this.catelliteEnergy = CATELLITE_STARTING_ENERGY;
    this.catelliteIsPlayerControlled = false;
    this.catelliteFollowingState = false;
    this.catelliteFireCooldown = 0;
    this.fireHeldFrames = 0;
    this.mutantCatelliteActive = false;
    this.mutantCatDecisionCounter = 0;
    this.weaponCollection &= ~WeaponFlag.MUTANT_CAT;
    // A destroyCatellite() shrink tween may still be running from the cat we just
    // lost; it would drag the replacement back to scale 0.
    this.tweens.killTweensOf(this.catellite);
    this.catellite.setScale(1).setAlpha(1).clearTint();
    this.catellite.setPosition(this.player.x + CATELLITE_SPAWN_X_OFFSET, CATELLITE_SPAWN_Y);
    (this.catellite.body as Phaser.Physics.Arcade.Body).reset(this.catellite.x, this.catellite.y);
  }

  private destroyCatellite(): void {
    this.weaponCollection &= ~WeaponFlag.CATELLITE;
    this.catelliteIsPlayerControlled = false;
    if (this.cache.audio.exists('catellite_zoom_off_screen')) {
      this.sound.play('catellite_zoom_off_screen', { volume: 0.6 });
    }
    this.tweens.add({
      targets: this.catellite,
      scale: 0,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.catellite.setVisible(false);
        this.catellite.setScale(1);
        this.catellite.setAlpha(1);
        this.catellite.clearTint();
      }
    });
  }

  private hitByEnemyBullet(_player: any, bullet: any): void {
    const b = bullet as Phaser.Physics.Arcade.Sprite;
    this.enemySystem.releaseEnemyBullet(b);
    this.loseLife();
  }

  /** Level is finished once all three colour-match stages are cleared. */
  private isLevelComplete(): boolean {
    return this.levelProgress >= STAGES_PER_LEVEL;
  }

  private checkLevelCompletion(): void {
    // C++ main_game_controller.txt:1009-1057 — a "stage" is matched when EVERY
    // primary cauldron (R,G,B) meets-or-exceeds its target for the current
    // level_progress (target row in level_completion_colours). Each level has 3
    // such stages; clearing all 3 completes the level.
    // The C++ hands control to the main_game_controller the moment a stage matches
    // (LEVEL_RESET_FLAG_GET_READY_FOR_BONUS) and stops running this check; the port
    // instead waits 1500 ms on-screen, so the handoff has to be latched or further
    // pickups during that window can bank extra stages for free.
    if (this.stageTransitioning || this.isLevelComplete()) return;

    // Completion is judged against the HOME level's target (the level you're
    // progressing), not whatever level you may have warped to while gathering.
    const target = getCauldronTarget(this.homeLevel, this.levelProgress);
    const matched =
      this.cauldronFill[0] >= target[0] &&
      this.cauldronFill[1] >= target[1] &&
      this.cauldronFill[2] >= target[2];

    if (!matched) return;

    // Stage cleared. Consume the paint that was used to hit the target (the C++
    // gradually drains the cauldrons toward the next colour in the lab; we
    // subtract the matched amount so any surplus carries to the next stage).
    for (let i = 0; i < 3; i++) {
      this.cauldronFill[i] = Math.max(0, this.cauldronFill[i] - target[i]);
    }
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    this.levelProgress++;

    // C++ main_game_controller.txt:556-565 — the stage is banked into
    // LEVEL_COMPLETION_ARRAY and, once a level hits 3, the reachable window is
    // recomputed by find_highest_accessable_level (:1067-1093).
    this.levelCompletion[this.homeLevel - 1] = this.levelProgress;
    if (this.levelProgress >= STAGES_PER_LEVEL) {
      this.recomputeOpenLevelWindow();
    }

    if (this.cache.audio.exists('cauldron_full_burst')) {
      this.sound.play('cauldron_full_burst', { volume: 0.6 });
    }

    // C++ main_game_controller.txt:1043-1052 — EVERY colour-stage match fires
    // GET_READY_FOR_BONUS → bonus level → laboratory. The lab then decides whether
    // to return to this level (stages 1-2) or advance (after the 3rd stage).
    this.startStageTransition();
  }

  /**
   * C++ main_game_controller.txt:1067-1093 (find_highest_accessable_level): walk
   * up from level 0 while each level is fully complete, then open two more levels
   * above the first incomplete one (capped at the last level), with the bottom of
   * the window two below the top.
   */
  private recomputeOpenLevelWindow(): void {
    let highest = 0; // C++ max_open_level, 0-indexed
    while (highest < LEVEL_COUNT - 1 && this.levelCompletion[highest] === STAGES_PER_LEVEL) {
      highest++;
    }
    const maxOpen = Math.min(highest + OPEN_LEVEL_WINDOW, LEVEL_COUNT - 1);
    this.maxOpenLevel = maxOpen + 1;                       // back to the port's 1-based levels
    this.minOpenLevel = Math.max(1, this.maxOpenLevel - OPEN_LEVEL_WINDOW);
  }

  private handlePostEnemyRemoval(): void {
    this.checkLevelCompletion();

    if (!this.isLevelComplete() && this.enemySystem.maybeSpawnReplacementWave(this.currentLevel)) {
      if (this.enemySystem.isInMoleculePhase()) {
        return;
      }

      this.addScore(1000);

      if (this.cache.audio.exists('spawn_new_wave_sound')) {
        this.sound.play('spawn_new_wave_sound', { volume: 0.5 });
      }
    }
  }

  private startStageTransition(): void {
    if (this.stageTransitioning) return;
    this.stageTransitioning = true;

    const complete = this.isLevelComplete();
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      complete ? 'LEVEL COMPLETE!' : 'COLOUR MATCHED!', {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5);
    text.setScrollFactor(0);
    text.setDepth(200);

    // C++: a matched colour heads to the bonus level (then the laboratory). State
    // is threaded through so the lab can resume this level or advance it.
    this.time.delayedCall(1500, () => {
      text.destroy();
      this.scene.start('BonusLevel', {
        level: this.homeLevel, // return to / advance from the home level, not a warped-to one
        score: this.score,
        weaponCollection: this.weaponCollection,
        // The laboratory offers upgrades against (and writes back to) the PERMANENT
        // loadout — lab_manage_permanent_upgrade_icons.txt:28, :170.
        startingLoadout: this.startingLoadout,
        lives: this.lives,
        levelProgress: this.levelProgress,
        cauldronFill: this.cauldronFill,
        levelCompletion: this.levelCompletion,
        minOpenLevel: this.minOpenLevel,
        maxOpenLevel: this.maxOpenLevel
      });
    });
  }

  private warpToAdjacentLevel(levelDelta: number): void {
    // C++ main_game_controller.txt:809 —
    //   current_level = current_level + level_direction !> max_open_level !< 0
    // Only the window opened by find_highest_accessable_level is reachable; the
    // port used to clamp to the full 1..8, which put level 8 one tube away from
    // the start.
    const nextLevel = Phaser.Math.Clamp(this.currentLevel + levelDelta, 1, this.maxOpenLevel);
    if (nextLevel === this.currentLevel) {
      this.player.setAlpha(1);
      this.player.setScale(1);
      this.warpTubeSystem.resetWarping();
      return;
    }

    const preservedCauldronFill = [...this.cauldronFill];
    const preservedPickupCount = this.currentPickupCount;
    const preservedHasPaint = this.hasPaint;
    const preservedPaintColor = this.paintColor;
    const preservedKillStreak = this.consecutiveEnemyKills;

    this.currentLevel = nextLevel;
    this.createLevel();

    const spawn = this.getSpawnPosition();
    this.player.setPosition(spawn.x, spawn.y);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    (this.player.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    this.xVel = 0;
    this.yVel = 0; // C++ spawns with y_vel = 0; gravity ramps it (wizball.txt)
    this.idealXVel = 0;

    this.cauldronSystem.setupCauldrons(this.homeLevel, this.levelProgress);
    this.cauldronFill = preservedCauldronFill;
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    this.paintGroup.clear(true, true);
    this.bulletGroup.clear(true, true);
    this.bonusPearlGroup.clear(true, true);
    this.specialPaintballGroup.clear(true, true);

    this.enemySystem.configureLevel(this.currentParsedTilemap);
    this.enemySystem.spawnInitialEnemies(this.currentLevel);

    this.currentPickupCount = preservedPickupCount;
    this.hasPaint = preservedHasPaint;
    this.paintColor = preservedPaintColor;
    this.consecutiveEnemyKills = preservedKillStreak;
    this.catelliteFireCooldown = 0;

    if (this.hasPaint) {
      this.paintIndicator.fillColor = PAINT_FRAME_COLORS[this.paintColor];
      this.paintIndicator.setAlpha(1);
    } else {
      this.paintIndicator.setAlpha(0.3);
    }

    this.player.setAlpha(1);
    this.player.setScale(1);
    this.warpTubeSystem.resetWarping();

    if (this.cache.audio.exists('warp_tube_deposit')) {
      this.sound.play('warp_tube_deposit', { volume: 0.5 });
    }
  }

  /**
   * Return a usable static group, reusing `group` only if it survived the last
   * scene shutdown. Phaser destroys a scene's groups on shutdown but leaves the
   * scene's fields pointing at them, and a destroyed group's `children` Set is
   * gone — so `clear()` on one throws `Cannot read properties of undefined`.
   */
  private reuseOrCreateStaticGroup(
    group: Phaser.Physics.Arcade.StaticGroup | undefined
  ): Phaser.Physics.Arcade.StaticGroup {
    if (group && group.children) {
      group.clear(true, true);
      return group;
    }
    return this.physics.add.staticGroup();
  }

  private createLevel(): void {
    this.clearLevelVisuals();
    this.tilemapLayers.forEach(layer => layer.destroy());
    this.tilemapLayers = [];
    this.collisionLayer = null;
    this.worldCollisionMap = null;
    this.currentParsedTilemap = null;

    // Phaser reuses the scene instance across restarts and DESTROYS these groups
    // on shutdown, but the fields keep pointing at the dead objects. A destroyed
    // group has `children === undefined`, so testing for `undefined` is not enough
    // — `.clear()` on one throws and kills the scene mid-create(). Re-create
    // whenever the group is missing OR already torn down.
    this.walls = this.reuseOrCreateStaticGroup(this.walls);
    this.warpMounds = this.reuseOrCreateStaticGroup(this.warpMounds);

    // Warp zones are re-registered per level below; drop the previous level's
    // tubes (and their particle emitters) or they stay armed and leak.
    this.warpTubeSystem.clear();

    const levelData = getLevelData(this.currentLevel);
    const tilesetIndex = levelData?.tilesetIndex ?? Math.max(0, this.currentLevel - 1);

    // Try Phaser cache first (populated by PreloadScene), fall back to fetch-based sync load via XHR
    let tilemapText = this.cache.text.get(`tilemap_${this.currentLevel}`) as string | undefined;
    let tilesetText = this.cache.text.get(`tileset_${tilesetIndex}`) as string | undefined;

    // If cache miss, synchronously fetch the files
    if (!tilemapText || !tilesetText) {
      const base = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname.replace(/\/[^/]*$/, '/') : '/';
      const tmPath = `${base}assets/tilemaps/LEVEL_${this.currentLevel}_TILEMAP.txt`;
      const tsPath = `${base}assets/tilesets/TILESET_${String(tilesetIndex).padStart(3, '0')}.TXT`;
      try {
        if (!tilemapText) tilemapText = document.location.protocol !== 'file:' ? syncFetchText(tmPath) : undefined;
        if (!tilesetText) tilesetText = document.location.protocol !== 'file:' ? syncFetchText(tsPath) : undefined;
      } catch (_) { /* ignore */ }
    }

    if (!tilemapText || !tilesetText) {
      console.warn(`[GameScene] Failed to load tilemap/tileset for level ${this.currentLevel}, using fallback.`);
      this.createFallbackLevel();
      return;
    }

    const parsedTilemap = parseTilemap(tilemapText, tilesetText);
    this.currentParsedTilemap = parsedTilemap;
    const tilesKey = `level_${parsedTilemap.tilesetIndex + 1}_tiles`;
    this.textures.get(tilesKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.worldWidth = parsedTilemap.width * TILE_SIZE;
    // C++ constants: LEVEL_HEIGHT = 368, BONUS_LEVEL_HEIGHT = 416.
    // Tilemap is 416 tall but the bottom 48px are the status-panel tile zone
    // (not part of the accessible play area). Constrain the world so the player
    // and enemies can't enter the HUD strip.
    this.worldHeight = 368;

    const tilemap = this.make.tilemap({
      width: parsedTilemap.width,
      height: parsedTilemap.height,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE
    });
    const tileset = tilemap.addTilesetImage(tilesKey, tilesKey, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      console.warn(`Failed to create tileset ${tilesKey}, using fallback arena.`);
      // createFallbackLevel() builds its own backdrop, so bail out before ours.
      this.createFallbackLevel();
      return;
    }

    this.createBackdrop();

    parsedTilemap.layers.forEach((layerData, layerIndex) => {
      const layer = tilemap.createBlankLayer(`level_layer_${layerIndex}`, tileset, 0, 0);
      if (!layer) return;

      for (let y = 0; y < parsedTilemap.height; y++) {
        for (let x = 0; x < parsedTilemap.width; x++) {
          const tileId = layerData[y * parsedTilemap.width + x];
          if (tileId > 0) {
            layer.putTileAt(tileId, x, y);
          }
        }
      }

      // C++ draw orders: layer 0 = BG (behind entities), layers 1 & 2 = FG/SFG
      // (in front of the ball/enemies). main_game_controller.txt:868-880.
      layer.setDepth(TILEMAP_LAYER_DEPTH[layerIndex] ?? Depth.SFG_TILEMAP);
      layer.setCullPadding(1, 1);
      if (layerIndex === 1) {
        layer.setCollision(Array.from(parsedTilemap.solidTiles.values()));
        this.collisionLayer = layer;
      }
      this.tilemapLayers.push(layer);
      this.levelVisuals.push(layer);
    });

    this.worldCollisionMap = new WorldCollisionMap(parsedTilemap, TILE_SIZE);

    parsedTilemap.warpZones.forEach(warpZone => {
      // Keep warp mound as invisible physics collider (warpTubeSystem handles visuals)
      const mound = this.add.rectangle(
        warpZone.x,
        warpZone.y,
        WARP_MOUND_SIZE,
        WARP_MOUND_SIZE
      );
      mound.setVisible(false);
      this.physics.add.existing(mound, true);
      this.warpMounds.add(mound);

      this.warpTubeSystem.addWarpTube({
        x: warpZone.x,
        y: warpZone.y,
        width: WARP_MOUND_SIZE,
        height: WARP_MOUND_SIZE,
        direction: warpZone.script === 'WARP_ZONE_DOWN' ? 'down' : 'up'
      });
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    // C++ camera is a rigid horizontal centre-lock (player.x - 320, instant),
    // no smoothing/deadzone — the world is exactly one screen tall so there is
    // no vertical scroll. Lerp 1.0 + no deadzone reproduces that feel.
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.cameras.main.setDeadzone(0, 0);

    this.rebuildWorldColliders();
  }

  private createFallbackLevel(): void {
    this.worldWidth = GAME_WIDTH;
    this.worldHeight = GAME_HEIGHT;
    this.collisionLayer = null;
    this.worldCollisionMap = null;

    this.warpMounds = this.reuseOrCreateStaticGroup(this.warpMounds);

    this.createBackdrop();

    const addTile = (tx: number, ty: number, frame: number) => {
      const tile = this.add.image(tx, ty, `level_${this.currentLevel}_tiles`, frame);
      tile.setDepth(1);
      this.levelVisuals.push(tile);

      const wall = this.add.rectangle(tx, ty, TILE_SIZE, TILE_SIZE);
      wall.setVisible(false);
      this.physics.add.existing(wall, true);
      this.walls.add(wall);
    };

    for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE) {
      addTile(x + TILE_SIZE / 2, GAME_HEIGHT - TILE_SIZE / 2, 9);
      addTile(x + TILE_SIZE / 2, TILE_SIZE / 2, 9);
    }

    for (let y = TILE_SIZE; y < GAME_HEIGHT - TILE_SIZE; y += TILE_SIZE) {
      addTile(TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
      addTile(GAME_WIDTH - TILE_SIZE / 2, y + TILE_SIZE / 2, 9);
    }

    const platforms = [
      { x: 120, y: 100, w: 80 },
      { x: 280, y: 140, w: 80 },
      { x: 440, y: 100, w: 80 },
      { x: 80, y: 200, w: 64 },
      { x: 200, y: 260, w: 96 },
      { x: 380, y: 220, w: 80 },
      { x: 500, y: 280, w: 80 },
    ];

    platforms.forEach(p => {
      for (let tx = 0; tx < p.w; tx += TILE_SIZE) {
        addTile(p.x + tx + TILE_SIZE / 2, p.y, 41);
      }
    });

    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.player, true, 1, 1); // rigid centre-lock (C++)
    this.cameras.main.setDeadzone(0, 0);
    this.rebuildWorldColliders();
  }

  private clearLevelVisuals(): void {
    this.levelVisuals.forEach(obj => obj.destroy());
    this.levelVisuals = [];
    this.backdropTiles = [];
  }

  /**
   * Carve the two usable backdrop rects out of the flat 512×512 PNG that
   * PreloadScene loaded with `load.image`. C++ sprites/background_level_N[arb].txt
   * lists them as frames 0 (greyscale) and 2 (colour); frames 1/3 are the parallax
   * "end" rects, which we express as a UV pan rather than as real frames because
   * three of the eight levels point them off the right-hand edge of the sheet.
   */
  private ensureBackdropFrames(bgKey: string): boolean {
    if (!this.textures.exists(bgKey)) return false;
    const texture = this.textures.get(bgKey);
    if (!texture || texture.key === '__MISSING') return false;
    if (!texture.has(BACKDROP_FRAME_GREY)) {
      texture.add(BACKDROP_FRAME_GREY, 0, 0, BACKDROP_FRAME_Y_GREY,
        BACKDROP_FRAME_WIDTH, BACKDROP_FRAME_HEIGHT);
    }
    if (!texture.has(BACKDROP_FRAME_COLOUR)) {
      texture.add(BACKDROP_FRAME_COLOUR, 0, 0, BACKDROP_FRAME_Y_COLOUR,
        BACKDROP_FRAME_WIDTH, BACKDROP_FRAME_HEIGHT);
    }
    // C++ background.txt:30 adds OPENGL_BOOLEAN_FILTERED to this sprite (GL_LINEAR,
    // output.cpp:2412-2418) — it is soft painted art upscaled by a non-integer
    // 1.26x, so NEAREST would give it uneven pixel doubling the original never had.
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return true;
  }

  /**
   * C++ scripts/background.txt:53-58 — the backdrop is drawn greyscale until this
   * level's LEVEL_COMPLETION_ARRAY entry passes 1, then in colour:
   *   `if progress > 1 then base_frame = 2 else base_frame = 0`.
   * This is the backdrop ONLY; the tilesets are already coloured per level and no
   * script greyscales them.
   */
  private backdropFrameForProgress(): string {
    const progress = this.levelCompletion[this.currentLevel - 1] ?? 0;
    return progress > 1 ? BACKDROP_FRAME_COLOUR : BACKDROP_FRAME_GREY;
  }

  /**
   * C++ scripts/background.txt:34-40 — ONE sprite per level (`level_number +
   * background_level_1[arb]`) drawn at 126%/125% and pinned to the camera
   * (`world_x = left_of_window`, `world_y = 0`, :100-109) — one screen wide, NOT
   * stretched across the whole level. Two copies side by side reproduce the
   * wrap-around of the GL_REPEAT UV pan at :111-112 (the original's own texture
   * seam included — it is the same edge, in the same place).
   */
  private createBackdrop(): void {
    this.backdropTiles = [];
    const bgKey = `background_level_${this.currentLevel}`;

    if (!this.ensureBackdropFrames(bgKey)) {
      const fallbackBg = this.add.rectangle(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0a1a
      );
      fallbackBg.setScrollFactor(0);
      fallbackBg.setDepth(Depth.PARALLAX_BG);
      this.levelVisuals.push(fallbackBg);
      return;
    }

    this.backdropFrame = this.backdropFrameForProgress();
    for (let i = 0; i < 2; i++) {
      const tile = this.add.image(0, 0, bgKey, this.backdropFrame);
      tile.setOrigin(0, 0); // the C++ frames have pivot 0,0 (output.cpp:4110-4118)
      tile.setScale(BACKDROP_SCALE_X, BACKDROP_SCALE_Y);
      tile.setScrollFactor(0);
      tile.setDepth(Depth.PARALLAX_BG);
      this.levelVisuals.push(tile);
      this.backdropTiles.push(tile);
    }

    this.updateBackdrop();
  }

  /**
   * C++ background.txt:100-112 — left_of_window = wizball.world_x - 320 clamped to
   * [0, map_width - 640], and
   *   INTERPOLATION_X_PERCENTAGE = left_of_window * 10000 / map_width_minus_window
   * drives the UV lerp toward the "end" rect, i.e. the backdrop pans (and wraps)
   * by BACKDROP_PARALLAX_TEXELS over the length of the level.
   */
  private updateBackdrop(): void {
    if (this.backdropTiles.length === 0) return;

    const wanted = this.backdropFrameForProgress();
    if (wanted !== this.backdropFrame) {
      this.backdropFrame = wanted;
      for (const tile of this.backdropTiles) tile.setFrame(wanted);
    }

    const mapWidthMinusWindow = Math.max(1, this.worldWidth - GAME_WIDTH);
    const leftOfWindow = Phaser.Math.Clamp(
      this.player.x - GAME_WIDTH / 2, 0, mapWidthMinusWindow
    );
    const interpolation = leftOfWindow / mapWidthMinusWindow;

    const tileWidth = BACKDROP_FRAME_WIDTH * BACKDROP_SCALE_X;
    const panTexels = BACKDROP_PARALLAX_TEXELS[this.currentLevel] ?? BACKDROP_FRAME_WIDTH;
    const pan = (panTexels * interpolation * BACKDROP_SCALE_X) % tileWidth;

    this.backdropTiles[0].x = -pan;
    this.backdropTiles[1].x = -pan + tileWidth;
  }

  private getSpawnPosition(): { x: number; y: number } {
    const levelData = getLevelData(this.currentLevel);
    if (!levelData || levelData.startX.length === 0) {
      return { x: GAME_WIDTH / 2, y: 32 };
    }

    return {
      x: Phaser.Math.RND.pick(levelData.startX),
      y: levelData.startY
    };
  }

  private createPlayer(): void {
    const spawn = this.getSpawnPosition();

    // Create Wizball — frame size is 48×48 (from wizball[set][48][48][24][24].bmp)
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'wizball', 0);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // Circle collider centered in the 48×48 frame
    body.setCircle(COLLISION_RADIUS, (48 - COLLISION_RADIUS * 2) / 2, (48 - COLLISION_RADIUS * 2) / 2);
    body.setCollideWorldBounds(false);
    body.onWorldBounds = false;
    body.setBounce(0, 0); // We handle bounce ourselves
    body.setGravityY(0);  // We handle gravity ourselves
    body.setMaxVelocity(9999, 9999); // Don't let Arcade clamp our velocities
    body.moves = false;

    this.player.setDepth(Depth.WIZBALL);
    this.playerXFixed = spawn.x * PRIVATE_SCALE;
    this.playerYFixed = spawn.y * PRIVATE_SCALE;
    body.updateFromGameObject();
  }

  private createCatellite(): void {
    this.catellite = this.physics.add.sprite(280, 150, 'catellite');
    this.catellite.setDepth(Depth.CATELLITE);
    this.catellite.setDisplaySize(24, 24);
    this.catellite.setVisible(false);
    const body = this.catellite.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24);
    body.setCircle(12, 0, 0);
    body.setCollideWorldBounds(false);
    body.setGravityY(0);
    body.enable = false; // no cat owned yet — don't leave a ghost collider parked here

    this.catelliteBubble = this.add.graphics();
    this.catelliteBubble.setDepth(Depth.CATELLITE_SHIELD);
  }

  private createPaintSystem(): void {
    // C++: paint comes ONLY from shot paint bubbles (the paintdrop is spawned in
    // generic_level_enemy.txt's object_interaction_routine). There is no ambient
    // "sky" paint — the old 8s timer + initial drops have been removed so paint
    // is sourced entirely from paint bubbles, in the bubble's colour.
    this.paintGroup = this.physics.add.group();
  }

  private spawnPaintDrop(color: number, spawnX?: number, spawnY?: number): void {
    const x = spawnX ?? (50 + Math.random() * Math.max(1, this.worldWidth - 100));
    const y = spawnY ?? 30;

    // C++ paintballs_and_drips atlas frames 3/4/5 are R/G/B teardrop drips (16×32).
    // Fall back to the procedural paint_* circle if the atlas isn't available.
    const dripFrames = ['paintballs_3', 'paintballs_4', 'paintballs_5'];
    const fallbackKeys = ['paint_red', 'paint_green', 'paint_blue'];
    const useAtlas = this.textures.exists('paintballs');
    const sprite = useAtlas
      ? this.physics.add.sprite(x, y, 'paintballs', dripFrames[color])
      : this.physics.add.sprite(x, y, fallbackKeys[color]);
    sprite.setDepth(Depth.PAINT);
    if (useAtlas) {
      sprite.setDisplaySize(12, 24); // teardrop, taller than wide
    } else {
      sprite.setDisplaySize(16, 16);
    }

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    // Hitbox matches the drip's bulb (bottom of the teardrop)
    body.setCircle(6, useAtlas ? 0 : 2, useAtlas ? 8 : 2);
    body.setCollideWorldBounds(false);
    body.setAllowGravity(true);
    body.setGravityY(160); // original drips fall quickly toward the floor
    body.setVelocity((Math.random() - 0.5) * 30, 0);
    body.setBounce(0.2, 0.1);

    (sprite as any).paintColor = color;

    this.paintGroup.add(sprite);
  }

  private setupCollisions(): void {
    // Player vs bonus pearls
    this.physics.add.overlap(this.player, this.bonusPearlGroup, this.collectBonusPearl, undefined, this);

    // C++ paintdrop.txt:55 — COLLIDE_WITH = ENT_TYPE_CATELLITE + ENT_TYPE_PLAYER_BULLET
    // (no ENT_TYPE_PLAYER), and :108 only acts on ENT_TYPE_CATELLITE. The wizball
    // CANNOT collect paint: without a cat the drop falls and splats (:180-201).
    // That risk/reward — needing the cat alive to bank paint — is the game.
    this.physics.add.overlap(this.catellite, this.paintGroup, this.collectPaint, undefined, this);

    // Bullets vs enemies
    this.physics.add.overlap(this.bulletGroup, this.enemySystem.getEnemyGroup(), this.hitEnemy, undefined, this);

    // Enemy bullets vs player
    this.physics.add.overlap(
      this.player,
      this.enemySystem.getEnemyBulletGroup(),
      this.hitByEnemyBullet,
      undefined,
      this
    );

    // Special paintballs vs player (extra life, filth raid, etc.)
    this.physics.add.overlap(
      this.player,
      this.specialPaintballGroup,
      this.collectSpecialPaintball,
      undefined,
      this
    );

    // Player vs enemies (C++: destroys enemy and damages player)
    this.physics.add.overlap(
      this.player,
      this.enemySystem.getEnemyGroup(),
      this.playerCollideWithEnemy,
      undefined,
      this
    );

    // Catellite vs enemies (C++: catellite loses energy, enemy dies on contact)
    this.physics.add.overlap(
      this.catellite,
      this.enemySystem.getEnemyGroup(),
      this.catelliteCollideWithEnemy,
      undefined,
      this
    );

    // Catellite vs enemy bullets — C++ catellite.txt:109-110 puts
    // ENT_TYPE_ENEMY_BULLET in the cat's COLLIDE_WITH, and :601-624 takes energy
    // off for either. The port only had the enemy-contact half.
    this.physics.add.overlap(
      this.catellite,
      this.enemySystem.getEnemyBulletGroup(),
      this.catelliteHitByEnemyBullet,
      undefined,
      this
    );

    this.rebuildWorldColliders();
  }

  // C++ spawn_paintball_wave special_bonus_type_selector (SPECIAL_RAND 0..9):
  // 0=extra-life, 1=indestructacat, 2-4=filth-raid, 5-6=mutant-cat, 7-9=freaky-bits.
  private pickSpecialBonusType(): SpecialPaintballType {
    const sel = Math.floor(Math.random() * 10);
    if (sel === 0) return SpecialPaintballType.EXTRA_LIFE;
    if (sel === 1) return SpecialPaintballType.INDESTRUCTACAT;
    if (sel < 5) return SpecialPaintballType.FILTH_RAID;
    if (sel < 7) return SpecialPaintballType.MUTANT_CAT;
    return SpecialPaintballType.FREAKY_BITS;
  }

  private spawnSpecialPaintball(x: number, y: number, type: SpecialPaintballType): void {
    const textureMap: Record<SpecialPaintballType, string> = {
      [SpecialPaintballType.EXTRA_LIFE]: 'sp_extra_life',
      [SpecialPaintballType.FILTH_RAID]: 'sp_filth_raid',
      [SpecialPaintballType.FREAKY_BITS]: 'sp_freaky_bits',
      [SpecialPaintballType.INDESTRUCTACAT]: 'sp_indestructacat',
      [SpecialPaintballType.MUTANT_CAT]: 'sp_mutant_cat',
    };

    const textureKey = textureMap[type] ?? textureMap[SpecialPaintballType.EXTRA_LIFE];
    const sprite = this.physics.add.sprite(x, y, textureKey);
    sprite.setDepth(Depth.PEARL);
    sprite.setDisplaySize(32, 32);
    sprite.setBounce(0.5, 0.5);
    sprite.body.setCircle(12, 4, 4);
    (sprite as any).specialType = type;

    // Bobbing animation
    this.tweens.add({
      targets: sprite,
      y: sprite.y - 8,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.specialPaintballGroup.add(sprite);
  }

  private collectSpecialPaintball(_player: any, paintball: any): void {
    const sprite = paintball as Phaser.Physics.Arcade.Sprite;
    const type = (sprite as any).specialType as SpecialPaintballType;

    // Visual pickup effect
    this.tweens.add({
      targets: sprite,
      scale: 2,
      alpha: 0,
      duration: 200,
      onComplete: () => sprite.destroy()
    });

    switch (type) {
      case SpecialPaintballType.EXTRA_LIFE:
        this.lives = Math.min(9, this.lives + 1); // C++ caps lives at 9
        if (this.cache.audio.exists('wizball_new_life_appear_sound')) {
          this.sound.play('wizball_new_life_appear_sound', { volume: 0.6 });
        }
        this.showExtraLifeText();
        break;

      case SpecialPaintballType.FILTH_RAID:
        // Filth Raid: temporarily boosts enemy spawn rate by setting fuzz counter
        // When it hits 0, spawn_fuzz is triggered. This effectively doubles spawn rate.
        // C++ sets passed_param_1 = 1 (1 enemy at a time, faster trigger)
        this.weaponCollection |= WeaponFlag.FILTH_RAID;
        if (this.cache.audio.exists('special_paintball_pickup_filth_raid')) {
          this.sound.play('special_paintball_pickup_filth_raid', { volume: 0.6 });
        }
        // Effect lasts ~20 seconds then wears off
        this.time.delayedCall(20000, () => {
          this.weaponCollection &= ~WeaponFlag.FILTH_RAID;
        });
        break;

      case SpecialPaintballType.FREAKY_BITS:
        // Freaky Bits: wizball becomes invulnerable and enemies drop bonus items
        // C++: spawn_entity (freakout_effect_manager) — screen warps + rapid fire
        this.weaponCollection |= WeaponFlag.FREAKY_BITS;
        if (this.cache.audio.exists('special_paintball_pickup_freaky_bits')) {
          this.sound.play('special_paintball_pickup_freaky_bits', { volume: 0.6 });
        }
        // Flash screen effect (colour cycling tint)
        this.cameras.main.flash(200, 255, 100, 255, false);
        // Freaky bits lasts 15 seconds
        this.time.delayedCall(15000, () => {
          this.weaponCollection &= ~WeaponFlag.FREAKY_BITS;
        });
        break;

      case SpecialPaintballType.INDESTRUCTACAT:
        // C++ paintdrop.txt: set_global_flag(catellite_stored_health, 128) — the
        // cat now soaks 128 hits (its energy HP), effectively indestructible for
        // the rest of the level. (NOT the timed CATELLITE_INVULNERABILITY shield.)
        if ((this.weaponCollection & WeaponFlag.CATELLITE) !== 0) {
          this.catelliteEnergy = 128;
          this.catellite.clearTint();
          if (this.cache.audio.exists('special_paintball_pickup_indestructacat')) {
            this.sound.play('special_paintball_pickup_indestructacat', { volume: 0.6 });
          }
        }
        break;

      case SpecialPaintballType.MUTANT_CAT:
        // C++ paintdrop.txt:142-145 — set_global_flag (mutant_cat_flag, TRUE). The
        // cat stops obeying the player and drifts around at random (catellite.txt:283-321).
        this.mutantCatelliteActive = true;
        this.mutantCatDecisionCounter = 0; // re-roll a drift target immediately
        this.catelliteIsPlayerControlled = false;
        this.weaponCollection |= WeaponFlag.MUTANT_CAT;
        if (this.cache.audio.exists('special_paintball_pickup_mutant_cat')) {
          this.sound.play('special_paintball_pickup_mutant_cat', { volume: 0.6 });
        }
        // Mutant cat is permanent until lost
        break;
    }
  }

  private showExtraLifeText(): void {
    const text = this.add.text(this.player.x, this.player.y - 40, '+1 UP', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 4
    });
    text.setDepth(100);
    text.setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: text.y - 50,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => text.destroy()
    });
  }

  private rebuildWorldColliders(): void {
    this.worldColliders.forEach(collider => collider.destroy());
    this.worldColliders = [];

    if (!this.paintGroup || !this.enemySystem) {
      return;
    }

    const worldTargets: Phaser.Physics.Arcade.StaticGroup[] = [this.walls];
    const includePlayerArcadeCollision = this.worldCollisionMap === null;

    worldTargets.forEach(target => {
      if (includePlayerArcadeCollision) {
        this.worldColliders.push(
          this.physics.add.collider(this.player, target, this.handleWallHit, undefined, this)
        );
      }
      this.worldColliders.push(
        this.physics.add.collider(this.paintGroup, target)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyGroup(), target)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.bulletGroup, target, this.handleBulletWallHit, this.bulletCollidesWithTerrain, this)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyBulletGroup(), target, this.handleBulletWallHit, undefined, this)
      );
    });

    if (this.collisionLayer) {
      if (includePlayerArcadeCollision) {
        this.worldColliders.push(
          this.physics.add.collider(this.player, this.collisionLayer, this.handleWallHit, undefined, this)
        );
      }
      this.worldColliders.push(
        this.physics.add.collider(this.paintGroup, this.collisionLayer)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyGroup(), this.collisionLayer)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.bulletGroup, this.collisionLayer, this.handleBulletWallHit, this.bulletCollidesWithTerrain, this)
      );
      this.worldColliders.push(
        this.physics.add.collider(this.enemySystem.getEnemyBulletGroup(), this.collisionLayer, this.handleBulletWallHit, undefined, this)
      );
    }
  }

  private handleWallHit(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    this.applyPlayerBounce(body.blocked.up, body.blocked.down, body.blocked.left, body.blocked.right);
  }

  /**
   * Arcade process callback: returning false skips the SEPARATION as well as the
   * collide callback. The shield-fire cores are pinned to the ball and the
   * smart-bomb shockwaves sweep straight across the level — neither declares a
   * world_hitline in the C++, so terrain must not shove them around.
   */
  private bulletCollidesWithTerrain(bullet: any, _wall: any): boolean {
    return !(bullet as any)._isShieldOrb && !(bullet as any)._isSmartBombWave;
  }

  private handleBulletWallHit(bullet: any, _wall: any): void {
    if (bullet.active) {
      if ((bullet as any)._isShieldOrb || (bullet as any)._isSmartBombWave) {
        // Shield cores are pinned to the ball and the smart-bomb shockwaves sweep
        // straight through the level; neither has a world_hitline in the C++.
        return;
      } else if ((bullet as any)._isEnemyBullet) {
        this.enemySystem.releaseEnemyBullet(bullet as Phaser.Physics.Arcade.Sprite);
      } else {
        bullet.destroy();
      }
    }
  }

  private applyWeaponMovementStyle(): void {
    if ((this.weaponCollection & WeaponFlag.LATERAL_CONTROL) === 0) {
      this.movementStyle = MovementStyle.BASIC_BOUNCE;
    } else if ((this.weaponCollection & WeaponFlag.VERTICAL_CONTROL) === 0) {
      this.movementStyle = MovementStyle.CONTROLLED_BOUNCE;
    } else {
      this.movementStyle = MovementStyle.FULL_CONTROLLED;
    }
  }

  private spawnBonusPearl(x: number, y: number): void {
    const pearl = this.physics.add.sprite(x, y, 'pickup', 'pickup_0');
    pearl.setDepth(Depth.PEARL);
    pearl.setDisplaySize(32, 32);

    const body = pearl.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 4, 4);
    body.setAllowGravity(false);
    body.setVelocity(0, 0);

    this.tweens.add({
      targets: pearl,
      angle: 8,
      scaleX: 1.04,
      scaleY: 0.96,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.bonusPearlGroup.add(pearl);
  }

  private collectBonusPearl(_player: unknown, pearl: unknown): void {
    (pearl as Phaser.GameObjects.GameObject).destroy();
    this.currentPickupCount = this.currentPickupCount >= 7 ? 1 : this.currentPickupCount + 1;
    this.addScore(100);

    if (this.cache.audio.exists('bonus_pearl_pickup')) {
      this.sound.play('bonus_pearl_pickup', { volume: 0.6 });
    }
  }

  private updateBonusSelectionWobble(): void {
    if (this.currentPickupCount === 0) {
      this.resetWobbleState();
      return;
    }

    // C++ also allows FIRE_2 (secondary fire) to trigger bonus selection
    if (this.inputManager.justDown('altFire')) {
      this.selectCurrentBonus();
      this.resetWobbleState();
      return;
    }

    // C++ wizball.txt:848 — the whole LEFT/RIGHT wobble block sits inside
    // `if allow_movement = true`, and allow_movement is false while the player is
    // piloting the Catellite (:382-394). Steering the cat must not build a
    // selection. (FIRE_2 above and the countdown below stay outside the gate.)
    if (!this.catelliteIsPlayerControlled) {
      // Use JustDown to detect single key presses (C++ IF_INPUT_PLAYER_CONTROL_HIT)
      const leftPressed = this.inputManager.justDown('moveLeft');
      const rightPressed = this.inputManager.justDown('moveRight');

      if (leftPressed) {
        if (this.wobbleNextDirection === WobbleDirection.EITHER || this.wobbleNextDirection === WobbleDirection.LEFT) {
          this.wobbleNextDirection = WobbleDirection.RIGHT;
          this.wobbleCounter++;
          this.wobbleResetCountdown = WIZBALL_WOBBLE_DELAY;
        } else {
          this.resetWobbleState();
        }
      }

      if (rightPressed) {
        if (this.wobbleNextDirection === WobbleDirection.EITHER || this.wobbleNextDirection === WobbleDirection.RIGHT) {
          this.wobbleNextDirection = WobbleDirection.LEFT;
          this.wobbleCounter++;
          this.wobbleResetCountdown = WIZBALL_WOBBLE_DELAY;
        } else {
          this.resetWobbleState();
        }
      }

      if (this.wobbleCounter >= WIZBALL_BONUS_SELECTION_WOBBLE_THRESHOLD) {
        this.selectCurrentBonus();
        this.resetWobbleState();
        return;
      }
    }

    this.wobbleResetCountdown = Math.max(0, this.wobbleResetCountdown - 1);
    if (this.wobbleResetCountdown === 0) {
      this.resetWobbleState();
    }
  }

  private resetWobbleState(): void {
    this.wobbleResetCountdown = 0;
    this.wobbleCounter = 0;
    this.wobbleNextDirection = WobbleDirection.EITHER;
  }

  private selectCurrentBonus(): void {
    let applied = false;

    switch (this.currentPickupCount) {
      case 1:
        if ((this.weaponCollection & WeaponFlag.LATERAL_CONTROL) === 0) {
          this.weaponCollection |= WeaponFlag.LATERAL_CONTROL;
          applied = true;
        } else if ((this.weaponCollection & WeaponFlag.VERTICAL_CONTROL) === 0) {
          this.weaponCollection |= WeaponFlag.VERTICAL_CONTROL;
          applied = true;
        }
        break;
      case 2:
        if ((this.weaponCollection & WeaponFlag.SHIELD_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.SHIELD_FIRE;
          applied = true;
        } else if ((this.weaponCollection & WeaponFlag.REAR_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.REAR_FIRE;
          applied = true;
        }
        break;
      case 3:
        if ((this.weaponCollection & WeaponFlag.CATELLITE) === 0) {
          this.weaponCollection |= WeaponFlag.CATELLITE;
          // C++ select_icon case 3 (wizball.txt:1006-1018) spawns a BRAND NEW
          // catellite entity: full energy, mutant flag cleared, and (per
          // catellite.txt:126-128) positioned at wizball.world_x - 332, world_y 16
          // so it flies in from off-screen instead of popping in at its old spot.
          this.resetPerLifeCatelliteState();
          this.catellite.setVisible(true);
          // C++ select_icon case 3 (wizball.txt:1002): a cat collected while the
          // wizball shield is already up immediately gets its own shield.
          if ((this.weaponCollection & WeaponFlag.INVULNERABILITY) !== 0) {
            this.weaponCollection |= WeaponFlag.CATELLITE_INVULNERABILITY;
            this.catelliteHasShield = true;
            this.catShieldEnergy = SHIELD_STARTING_ENERGY;
          }
          applied = true;
        }
        break;
      case 4:
        if ((this.weaponCollection & WeaponFlag.DOUBLE_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.DOUBLE_FIRE;
          applied = true;
        }
        break;
      case 5:
        if ((this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) === 0) {
          this.weaponCollection |= WeaponFlag.WIZ_SPREAD_FIRE;
          this.weaponCollection &= ~WeaponFlag.CAT_SPREAD_FIRE;
        } else {
          this.weaponCollection |= WeaponFlag.CAT_SPREAD_FIRE;
          this.weaponCollection &= ~WeaponFlag.WIZ_SPREAD_FIRE;
        }
        applied = true;
        break;
      case 6:
        this.triggerSmartBomb();
        applied = true;
        break;
      case 7:
        // C++ select_icon case 7: the wizball shield is TIMED (2100 frames) and
        // expires — it is not a permanent upgrade. If a cat is owned it gets its
        // own, independently-timed shield.
        this.weaponCollection |= WeaponFlag.INVULNERABILITY;
        this.wizballShieldEnergy = SHIELD_STARTING_ENERGY;
        if ((this.weaponCollection & WeaponFlag.CATELLITE) !== 0) {
          this.weaponCollection |= WeaponFlag.CATELLITE_INVULNERABILITY;
          this.catelliteHasShield = true;
          this.catShieldEnergy = SHIELD_STARTING_ENERGY;
        }
        applied = true;
        break;
      default:
        break;
    }

    if (!applied) {
      return;
    }

    this.applyWeaponMovementStyle();
    this.currentPickupCount = 0;

    if (this.cache.audio.exists('bonus_selection')) {
      this.sound.play('bonus_selection', { volume: 0.6 });
    }
  }

  /**
   * C++ wizball.txt:1047-1056 (select_icon case 6): the smart bomb is not an
   * instant screen-clear — it spawns two smart_bomb_shockwave entities with
   * x_vel = -8 / +8. Each is an ENT_TYPE_PLAYER_BULLET pinned to world_y 208 with
   * a 56x416 hitbox, so enemies die through the ORDINARY bullet path and still
   * drop their paint / pearls and feed the streak.
   */
  private triggerSmartBomb(): void {
    if (this.cache.audio.exists('smart_bomb')) {
      this.sound.play('smart_bomb', { volume: 0.7 });
    }

    this.spawnSmartBombWave(-SMART_BOMB_WAVE_SPEED);
    this.spawnSmartBombWave(SMART_BOMB_WAVE_SPEED);
  }

  private spawnSmartBombWave(velocityX: number): void {
    const wave = this.physics.add.sprite(this.player.x, SMART_BOMB_WAVE_Y, 'smart_bomb_wave');
    wave.setDepth(Depth.WIZBALL_BULLET);
    wave.setBlendMode(Phaser.BlendModes.ADD);
    wave.setAlpha(0.85);
    if (velocityX < 0) wave.setFlipX(true);

    (wave as any)._isSmartBombWave = true;

    const body = wave.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(SMART_BOMB_WAVE_WIDTH, SMART_BOMB_WAVE_HEIGHT);
    body.setVelocity(velocityX, 0);

    this.bulletGroup.add(wave);
    // group.add can reset the body, so re-assert the sweep velocity.
    body.setVelocity(velocityX, 0);
  }

  private applyPlayerBounce(touchingUp: boolean, touchingDown: boolean, touchingLeft: boolean, touchingRight: boolean): void {
    // ORDER MATTERS. The C++ engine resolves the X axis first and fires hit_side
    // from inside that phase (world_collision.cpp:3109-3141), and only then runs
    // the Y phase and hit_floor_or_roof (:3196-3231). Doing the vertical response
    // first meant that on a corner hit the `x_vel = ideal_x_vel` in
    // hit_floor_or_roof pre-loaded x_vel, so BASIC_BOUNCE's "opposite signs" test
    // below was always true and every corner flipped ideal_x_vel, throwing away
    // spin the original keeps.

    if (touchingLeft || touchingRight) {
      // C++ engine reverses x_vel FIRST (coef = -100%), then script runs
      // Simulate the engine reversal
      this.xVel = -this.xVel;

      if (this.movementStyle === MovementStyle.BASIC_BOUNCE) {
        // C++ basic_bounce: check if ideal and (now-reversed) x_vel have opposite signs
        const idealFixed = Math.trunc(this.idealXVel);
        const product = idealFixed * this.xVel;

        if (product < 0) {
          // Opposite signs: invert ideal
          this.xVel = -idealFixed;
          this.idealXVel = this.xVel;
        } else {
          // Same sign: use ideal
          this.xVel = idealFixed;
        }
      } else {
        // Controlled/full: ensure minimum horizontal bounce speed
        const minBounceFixed = 512; // WIZBALL_MINIMUM_HORIZONTAL_BOUNCE_SPEED
        if (Math.abs(this.xVel) < minBounceFixed) {
          // C++ wizball.txt:824-825 is sgn(x_vel), which is 0 for a stationary
          // ball — not the +1 a `>= 0` test would give it.
          this.xVel = Math.sign(this.xVel) * minBounceFixed;
        }
        this.idealXVel = this.xVel;
      }

      if (this.bounceSound && !this.bounceSound.isPlaying) {
        this.bounceSound.play();
      }
    }

    if (touchingDown || touchingUp) {
      if (this.movementStyle !== MovementStyle.FULL_CONTROLLED) {
        // C++ bounce: snap x_vel to ideal, then recalculate y_vel from distance
        this.xVel = Math.trunc(this.idealXVel);

        // C++ engine reverses velocity BEFORE calling hit_floor_or_roof
        // sgn(y_vel) after reversal gives bounce direction
        const bounceDirection = touchingDown ? -1 : 1;

        // C++ wizball.txt:764-776 — s = (a*t^2)/2 solved for t, then v = a*t. Note
        // `s` is SIGNED there (`temp_2 = y - (WIZBALL_START_Y << bitshift)`), the
        // divide is C integer division and `sqr` is int(sqrt(x))
        // (scripting.cpp:5890), so both truncate before multiplying back up.
        const startYFixed = WIZBALL_START_Y * PRIVATE_SCALE;
        const gravFixed = WIZBALL_GRAVITY_STRENGTH; // y_acc = 48 (raw fixed-point)
        const sFixed = Math.trunc(((this.playerYFixed - startYFixed) * 2) / gravFixed);
        // int(sqrt(negative)) is undefined in the C++; with the correct 32×32 world
        // box the ball's top edge cannot rise above y = 16 so s can't go negative.
        const t = sFixed > 0 ? Math.trunc(Math.sqrt(sFixed)) : 0;

        // C++ does NOT apply minimum bounce speed in basic/controlled modes
        // The distance formula naturally maintains bounce height
        this.yVel = gravFixed * t * bounceDirection;
      } else {
        // Full controlled: C++ engine reverses velocity, then script ensures minimum
        // We reverse ourselves since there's no engine pre-reversal
        this.yVel = -this.yVel;

        // C++ only applies minimum bounce speed in full_controlled mode
        const minBounceFixed = 768; // WIZBALL_MINIMUM_VERTICAL_BOUNCE_SPEED
        if (Math.abs(this.yVel) < minBounceFixed) {
          this.yVel = (touchingDown ? -1 : 1) * minBounceFixed;
        }
      }

      if (this.bounceSound && !this.bounceSound.isPlaying) {
        this.bounceSound.play();
      }
    }
  }

  private collectPaint(_collector: any, paint: any): void {
    // C++ paintdrop.txt:108 — only an ENT_TYPE_CATELLITE collects. Belt-and-braces
    // in case the cat's body is still live for a frame after it is lost.
    if ((this.weaponCollection & WeaponFlag.CATELLITE) === 0 || !this.catellite.visible) return;

    const paintSprite = paint as Phaser.Physics.Arcade.Sprite;
    // Guard against the same drop being collected twice in one frame.
    if ((paintSprite as any)._collected) return;
    (paintSprite as any)._collected = true;

    const color = (paintSprite as any).paintColor || 0;

    this.paintColor = color;
    this.hasPaint = true;

    // C++ main_game_controller.txt:248-255 — on paint-drop pickup the matching
    // cauldron is incremented by 1, capped at MAX_CAULDRON_CAPACITY.
    this.cauldronFill[color] = Math.min(this.cauldronFill[color] + 1, MAX_CAULDRON_CAPACITY);
    this.cauldronSystem.setFillLevels(this.cauldronFill);

    // Visual feedback
    this.tweens.add({
      targets: paint,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 200,
      onComplete: () => paint.destroy()
    });

    // Update HUD paint indicator
    this.paintIndicator.fillColor = PAINT_FRAME_COLORS[color];
    this.paintIndicator.setAlpha(1);

    // C++ paintdrop pickup SFX (falls back to the generic pickup if absent).
    if (this.cache.audio.exists('paintdrop_collection')) {
      this.sound.play('paintdrop_collection', { volume: 0.5 });
    } else {
      this.pickupSound.play();
    }

    // A fresh deposit may complete the current colour-match stage.
    this.checkLevelCompletion();
  }

  private fireBullet(): void {
    // fireCooldown and input checks are now handled in update() to match C++ pattern
    // This function only handles actual bullet spawning

    const hasDouble = (this.weaponCollection & WeaponFlag.DOUBLE_FIRE) !== 0;
    const hasSpread = (this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) !== 0;
    const hasRearFire = (this.weaponCollection & WeaponFlag.REAR_FIRE) !== 0;

    // C++ wizball.txt:528-535 — firing_rate depends ONLY on DOUBLE_FIRE.
    // Spread fire is fired ON TOP of the normal shot and does not change the
    // rate (the old code gave spread its own rate AND replaced the forward shot).
    this.fireCooldown = hasDouble ? DOUBLE_FIRE_RATE : NORMAL_FIRE_RATE;

    const dir = this.lastMovementDirection;
    const paintTint = this.hasPaint ? PAINT_FRAME_COLORS[this.paintColor] : undefined;

    // Muzzle flash so firing is clearly visible (rendered above the foreground
    // tilemap layers, unlike the bullets which faithfully sit behind them).
    this.spawnMuzzleFlash(this.player.x + dir * 18, this.player.y, paintTint ?? 0xffffaa);

    // C++ fire dispatch (wizball.txt:545-546) ALWAYS does:
    //   gosub wizball_normal_fire   (the forward/rear single or double shot)
    //   gosub wizball_spread_fire   (the 3-bullet fan, IF spread is owned)
    // i.e. with spread you get 4 bullets (forward + fan), not 3. Previously the
    // port fired the fan INSTEAD of the forward shot, so picking up spread
    // actually reduced forward firepower.

    // --- wizball_normal_fire: ONE forward shot (rear fire alternates direction) ---
    let fireDir = dir;
    if (hasRearFire) {
      // C++ shared_next_bullet_alternator (wizball.txt:616-619): the single shot
      // ALTERNATES direction each press, it does NOT add a rear bullet. The
      // alternator is shared with the Catellite (catellite.txt:534-535).
      fireDir = this.sharedNextBulletAlternator;
      this.sharedNextBulletAlternator = -fireDir;
    }

    // C++ wizball_normal_fire (wizball.txt:614-637) contains exactly ONE
    // spawn_entity. DOUBLE_FIRE means double RATE, not double bullets — it only
    // sets bullet_type = 2, which picks the beefier sprite
    // (wizball_normal_bullet.txt:180-186, base_frame 3).
    this.spawnBullet(
      this.player.x + fireDir * 8, this.player.y,
      fireDir * BULLET_SPEED, 0,
      paintTint,
      hasDouble ? BULLET_FRAME_POWERED : BULLET_FRAME_NORMAL
    );

    // --- wizball_spread_fire: the 3-bullet fan, added on top of the forward shot ---
    if (hasSpread) {
      // C++ wizball_spread_fire (wizball.txt:643-665): 3 bullets at ABSOLUTE
      // angles, alternating each shot between an upper fan (45/90/135°) and a
      // lower fan (225/270/315°). Screen-y points down, so vy = -sin(angle).
      const fan = this.spreadFlipSide ? [225, 270, 315] : [45, 90, 135];
      this.spreadFlipSide = !this.spreadFlipSide;
      for (const deg of fan) {
        const rad = (deg * Math.PI) / 180;
        this.spawnBullet(
          this.player.x, this.player.y,
          Math.cos(rad) * BULLET_SPEED, -Math.sin(rad) * BULLET_SPEED,
          paintTint,
          BULLET_FRAME_LITTLE // bullet_type 3
        );
      }
    }

    // C++ wizball.txt: fire SFX varies by weapon (normal / blazers / three-way).
    const fireSoundKey = hasSpread
      ? 'wizball_or_cat_fire_three_way'
      : hasDouble
        ? 'wizball_or_cat_fire_blazers'
        : 'wizball_or_cat_fire_normal';
    if (this.cache.audio.exists(fireSoundKey)) {
      this.sound.play(fireSoundKey, { volume: 0.4 });
    } else {
      this.fireSound.play();
    }

    if (this.hasPaint) {
      this.hasPaint = false;
      this.paintIndicator.setAlpha(0.3);
    }
    // The Catellite is NOT fired from here: catellite.txt:15/:230-276 gives it its
    // own catellite_firing_rate (20) and fire_delay_counter, so it never inherits
    // the wizball's DOUBLE_FIRE rate. See updateCatelliteFiring().
  }

  private spawnMuzzleFlash(x: number, y: number, color: number): void {
    const flash = this.add.circle(x, y, 7, color, 0.9);
    // Above SFG tilemap (85) so it's always visible at the moment of firing.
    flash.setDepth(Depth.SFG_TILEMAP + 1);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 90,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy()
    });
  }

  private spawnBullet(
    x: number, y: number, vx: number, vy: number,
    paintTint?: number, frame: string = BULLET_FRAME_NORMAL
  ): void {
    // C++ wizball_normal_bullet.txt:180-186 — bullet_type chooses the frame:
    // 1 = normal (48x8), 2 = powered-up (48x8), 3 = little (24x8).
    const bullet = this.physics.add.sprite(x, y, 'bullets', frame);
    bullet.setDepth(Depth.WIZBALL_BULLET);
    bullet.setDisplaySize(frame === BULLET_FRAME_LITTLE ? 24 : 48, 8);

    if (paintTint !== undefined) {
      bullet.setTint(paintTint);
    }

    (bullet as any).isPaintBullet = paintTint !== undefined;
    (bullet as any).paintColor = this.paintColor;

    // Orient the (horizontal) bullet sprite along its travel direction so
    // angled spread shots don't look like sideways bars. (C++ opengl_angle.)
    bullet.setRotation(Math.atan2(vy, vx));

    // Add to group BEFORE setting velocity (group.add can reset body properties)
    this.bulletGroup.add(bullet);

    // Use the true velocity vector (do NOT clamp vx to ±speed — that would flatten
    // diagonal spread bullets). Callers pass vectors already scaled to BULLET_SPEED.
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    bullet.setVelocity(vx, vy);
  }

  /**
   * C++ catellite.txt:230-276 — the Catellite runs its OWN fire timer at
   * catellite_firing_rate (20), doubled to 40 while it's mad, and it always calls
   * catellite_normal_fire THEN catellite_spread_fire (:240-241): the fan is added
   * to the plain shot, never a replacement for it.
   */
  private updateCatelliteFiring(): void {
    if (this.catelliteFireCooldown > 0) {
      this.catelliteFireCooldown--;
      return;
    }
    if (this.warpTubeSystem.isActive()) return; // getting_sucked_into_a_hole_flag (:232)

    if (this.mutantCatelliteActive) {
      // C++ :260-265 — a mad cat fires on its own, at half the rate.
      this.fireCatelliteBullet();
      this.catelliteFireCooldown = CATELLITE_FIRING_RATE * 2;
      return;
    }

    // C++ :238-258 — FIRE_1 hit, or held down while a cat is owned. FIRE_2 is
    // never a fire button.
    if (!this.inputManager.isDown('fire')) return;

    this.fireCatelliteBullet();
    this.catelliteFireCooldown = CATELLITE_FIRING_RATE;
  }

  private fireCatelliteBullet(): void {
    // --- catellite_normal_fire (catellite.txt:530-557) ---
    // firing_direction was set this frame from the player's steering (with
    // override_reverse_fire) or from the wizball's own direction; REAR_FIRE reads
    // the SHARED alternator and puts it straight back (:534-535, :549-551), so
    // the cat fires opposite to the wizball's current shot without advancing it.
    let dir = this.catelliteFiringDirection;
    if (!this.catelliteOverrideReverseFire && (this.weaponCollection & WeaponFlag.REAR_FIRE) !== 0) {
      dir = this.sharedNextBulletAlternator;
    }

    this.spawnCatBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, 0);

    if (this.cache.audio.exists('wizball_or_cat_fire_normal')) {
      this.sound.play('wizball_or_cat_fire_normal', { volume: 0.25 });
    }

    // --- catellite_spread_fire (catellite.txt:563-587) ---
    // The SAME absolute vertical fan the wizball uses (45/90/135 <-> 225/270/315),
    // flipped each shot by the cat's own flip_vertical_firing_side.
    if ((this.weaponCollection & WeaponFlag.CAT_SPREAD_FIRE) !== 0) {
      const fan = this.catSpreadFlipSide ? [225, 270, 315] : [45, 90, 135];
      this.catSpreadFlipSide = !this.catSpreadFlipSide;
      for (const deg of fan) {
        const rad = (deg * Math.PI) / 180;
        this.spawnCatBullet(
          this.catellite.x, this.catellite.y,
          Math.cos(rad) * BULLET_SPEED, -Math.sin(rad) * BULLET_SPEED
        );
      }
      if (this.cache.audio.exists('wizball_or_cat_fire_three_way')) {
        this.sound.play('wizball_or_cat_fire_three_way', { volume: 0.25 });
      }
    }
  }

  private spawnCatBullet(x: number, y: number, vx: number, vy: number): void {
    // C++ catellite.txt:140 — the cat's bullet_type is fixed at 1 for its whole
    // life; it never sees DOUBLE_FIRE's type 2.
    const bullet = this.physics.add.sprite(x, y, 'bullets', BULLET_FRAME_LITTLE);
    bullet.setDepth(Depth.WIZBALL_BULLET);
    bullet.setDisplaySize(24, 8);
    bullet.setTint(0x88aaff);
    bullet.setRotation(Math.atan2(vy, vx));
    bullet.setVelocity(vx, vy);

    (bullet as any).isPaintBullet = false;
    (bullet as any).paintColor = undefined;

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(24, 8);

    this.bulletGroup.add(bullet);
  }

  private createHUD(): void {
    // Main HUD text (hidden, used for internal state tracking)
    this.hudText = this.add.text(-100, -100, '', { fontSize: '1px' });
    this.hudText.setVisible(false);

    // Paint indicator (managed by HUDSystem now, but GameScene still references it)
    this.paintIndicator = this.add.rectangle(-100, -100, 1, 1, 0x666666);
    this.paintIndicator.setVisible(false);

    // Initialize HUD system (draws top and bottom bars)
    const hiScore = new HiScoreSystem().getTopScore();
    const initialState: HUDState = {
      score: this.score,
      hiScore,
      lives: this.lives,
      cauldronFill: this.cauldronFill,
      currentPaintColor: this.paintColor,
      hasPaint: this.hasPaint,
      hasCatellite: (this.weaponCollection & WeaponFlag.CATELLITE) !== 0,
      catelliteHasShield: this.catelliteHasShield,
      currentLevel: this.currentLevel,
      weaponCollection: this.weaponCollection,
    };
    this.hudSystem = new HUDSystem(this, initialState);

    // Add mode switch keys for testing
  }

  // C++ wizball.txt:389 / catellite.txt:327 — holding FIRE for
  // CATELLITE_CONTROL_THRESHOLD (25) frames hands d-pad control of the Catellite
  // to the player and disables Wizball movement (allow_movement = false). Mutant
  // Cat ignores player control (it auto-hunts), and control needs an owned cat.
  private updateCatelliteControlState(): void {
    this.catelliteHitThisFrame = false; // fresh each frame for the energy-loss latch
    const hasCatellite = (this.weaponCollection & WeaponFlag.CATELLITE) !== 0 && this.catellite.visible;
    // C++ wizball.txt:389 / catellite.txt:327 test FIRE_1 only. FIRE_2 appears in
    // exactly one place in the whole C++ — update_wobble (wizball.txt:843).
    const fireHeld = this.inputManager.isDown('fire');

    this.fireHeldFrames = fireHeld ? this.fireHeldFrames + 1 : 0;

    this.catelliteIsPlayerControlled =
      hasCatellite &&
      !this.mutantCatelliteActive &&
      this.fireHeldFrames >= CATELLITE_CONTROL_THRESHOLD;
  }

  // Wizball movement input — suppressed while the player is piloting the
  // Catellite (the d-pad then steers the Catellite, not the ball).
  private wizballInput(action: 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown'): boolean {
    return !this.catelliteIsPlayerControlled && this.inputManager.isDown(action);
  }

  /**
   * C++ Shield Fire (wizball.txt:574-600 + wizball_alternate_shield_bullet_core.txt).
   * FIRE_1 spawns exactly two cores at FIXED offsets (0, +15) and (0, -15). They
   * do not orbit: they stay pinned above and below the ball, and their damaging
   * rectangle sits 16..48 px further out, 24 px either side (:41-49 — note the
   * stretch code at :168-189 that would have resized the box is commented out, so
   * only the DRAWN bar stretches toward the floor/ceiling). The cores outlive the
   * button by 20 frames (:81, :115-123) and pulse a wave every 10 (:95-108).
   */
  private updateShieldFire(): void {
    const hasShield = (this.weaponCollection & WeaponFlag.SHIELD_FIRE) !== 0;
    const fireHeld = this.inputManager.isDown('fire'); // FIRE_1 only (:578)

    if (hasShield && fireHeld) {
      this.shieldCoreLifetime = SHIELD_CORE_LIFETIME;
    } else if (this.shieldCoreLifetime > 0) {
      this.shieldCoreLifetime--;
    }

    if (!hasShield || this.shieldCoreLifetime <= 0) {
      this.clearShieldCores();
      return;
    }

    // Drop any cores destroyed externally (e.g. bulletGroup cleared on a warp).
    this.shieldCores = this.shieldCores.filter(o => o.active);
    if (this.shieldCores.length < 2) {
      this.clearShieldCores();
      for (let i = 0; i < 2; i++) {
        const core = this.physics.add.sprite(this.player.x, this.player.y, 'shield_fire_bar');
        core.setDepth(Depth.WIZBALL_SHIELD);
        core.setVisible(false); // the visible part is drawn in shieldCoreGfx below
        (core as Phaser.Physics.Arcade.Sprite & { _isShieldOrb: boolean })._isShieldOrb = true;
        const body = core.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.setSize(SHIELD_CORE_HALF_WIDTH * 2, SHIELD_CORE_FAR_EDGE - SHIELD_CORE_NEAR_EDGE);
        this.bulletGroup.add(core); // reuse the bullet->enemy overlap (hitEnemy)
        this.shieldCores.push(core);
      }
      this.shieldCoreWaveCounter = 0;
      if (this.cache.audio.exists('wizball_up_down_shield_pulse')) {
        this.sound.play('wizball_up_down_shield_pulse', { volume: 0.13 });
      }
    }

    // C++ :95-108 — a wave child every 10 frames, with the pulse SFX on alternate
    // spawns from the lower core.
    this.shieldCoreWaveCounter = (this.shieldCoreWaveCounter + 1) % SHIELD_CORE_WAVE_PERIOD;
    const pulse = this.shieldCoreWaveCounter === 0;
    if (pulse && this.cache.audio.exists('wizball_up_down_shield_pulse')) {
      this.sound.play('wizball_up_down_shield_pulse', { volume: 0.13 });
    }

    if (!this.shieldCoreGfx) {
      this.shieldCoreGfx = this.add.graphics();
      this.shieldCoreGfx.setDepth(Depth.WIZBALL_SHIELD);
      this.shieldCoreGfx.setBlendMode(Phaser.BlendModes.ADD);
    }
    this.shieldCoreGfx.clear();

    // sign -1 = the upper core (spawned at y-15), +1 = the lower one (y+15).
    [-1, 1].forEach((sign, index) => {
      const core = this.shieldCores[index];
      if (!core) return;

      const coreY = this.player.y + sign * SHIELD_CORE_OFFSET;
      // The damaging box is fixed: 16..48 px beyond the core.
      core.setPosition(
        this.player.x,
        coreY + sign * (SHIELD_CORE_NEAR_EDGE + (SHIELD_CORE_FAR_EDGE - SHIELD_CORE_NEAR_EDGE) / 2)
      );
      (core.body as Phaser.Physics.Arcade.Body).reset(core.x, core.y);

      // C++ :155-166 — the DRAWN bar reaches out to the nearest tile in that
      // direction, capped at ideal_world_collision_height (48).
      const reach = this.distanceToSolidTile(this.player.x, coreY, sign, SHIELD_CORE_FAR_EDGE);
      const top = sign < 0 ? coreY - reach : coreY;
      this.shieldCoreGfx!.fillStyle(0x66ccff, pulse ? 0.75 : 0.5);
      this.shieldCoreGfx!.fillRect(this.player.x - SHIELD_CORE_HALF_WIDTH, top, SHIELD_CORE_HALF_WIDTH * 2, reach);
      this.shieldCoreGfx!.fillStyle(0xffffff, 0.55);
      this.shieldCoreGfx!.fillRect(this.player.x - 6, top, 12, reach);
    });
  }

  private clearShieldCores(): void {
    if (this.shieldCores.length > 0) {
      this.shieldCores.forEach(o => o.destroy());
      this.shieldCores = [];
    }
    this.shieldCoreGfx?.clear();
  }

  /**
   * C++ GET_DISTANCE_TO_TILE — how far you can travel vertically from (x, y)
   * before hitting a solid tile, capped at `max`.
   */
  private distanceToSolidTile(x: number, y: number, dirY: number, max: number): number {
    const map = this.currentParsedTilemap;
    if (!map) return max;
    const tileX = Math.floor(x / TILE_SIZE);
    if (tileX < 0 || tileX >= map.width) return max;

    for (let d = 4; d <= max; d += 4) {
      const probeY = y + dirY * d;
      if (probeY < 0 || probeY >= this.worldHeight) return Math.max(0, d - 4);
      const tileY = Math.floor(probeY / TILE_SIZE);
      const tileId = map.layers[1]?.[tileY * map.width + tileX] ?? 0;
      if (tileId > 0 && map.solidTiles.has(tileId)) return Math.max(0, d - 4);
    }
    return max;
  }

  // C++ main_game_controller.txt:265-274 — the fuzz counter counts down every
  // frame and resets whenever an enemy is killed. If it reaches zero (you've gone
  // ~45s without a kill) a Fuzz spawns from the side you're heading toward, to
  // nudge you along.
  // C++ manage_score_and_enemy_display.txt:30-50 — the displayed score rolls
  // toward the real score in +10/+100/+500 steps with three tiers of tick sound.
  private updateDisplayScore(): void {
    if (this.displayScore >= this.score) { this.displayScore = this.score; return; }
    const gap = this.score - this.displayScore;
    // C++ manage_score_and_enemy_display.txt:36-49 — add +10/+100/+500 per frame
    // keyed on the remaining gap (<200 / <2000 / else), with low/medium/high tick.
    const step = gap >= 2000 ? 500 : gap >= 200 ? 100 : 10;
    this.displayScore = Math.min(this.score, this.displayScore + step);
    // C++ plays a tick every roll frame at a low volume (32/255 ≈ 0.13) — the
    // quiet volume, not a throttle, is what keeps a big jump from being harsh.
    const key = step === 500 ? 'score_counter_high_tick'
      : step === 100 ? 'score_counter_medium_tick' : 'score_counter_low_tick';
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume: 0.13 });
  }

  // C++ manage_score_and_enemy_display.txt: a life is granted each time the DISPLAY
  // score crosses a 100,000 boundary (capped at 9 by function_gain_life).
  private checkExtraLife(): void {
    const sector = Math.floor(this.displayScore / 100000);
    if (sector > this.lastScoreSector) {
      this.lives = Math.min(9, this.lives + (sector - this.lastScoreSector));
      this.lastScoreSector = sector;
      if (this.cache.audio.exists('special_paintball_pickup_extra_life')) {
        this.sound.play('special_paintball_pickup_extra_life', { volume: 0.6 });
      }
    }
  }

  private updateFuzzCounter(): void {
    this.fuzzCounter--;
    if (this.fuzzCounter <= 0) {
      this.enemySystem.spawnFuzz(this.lastMovementDirection, this.currentLevel);
      if (this.cache.audio.exists('special_paintball_pickup_filth_raid')) {
        this.sound.play('special_paintball_pickup_filth_raid', { volume: 0.5 });
      }
      this.fuzzCounter = FUZZ_COUNTER_START;
    }
  }

  private updateMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Track last movement direction
    if (this.movementStyle === MovementStyle.FULL_CONTROLLED) {
      if (this.xVel < 0) this.lastMovementDirection = -1;
      else if (this.xVel > 0) this.lastMovementDirection = 1;
    } else {
      if (this.idealXVel < 0) this.lastMovementDirection = -1;
      else if (this.idealXVel > 0) this.lastMovementDirection = 1;
    }

    // Handle input based on movement style
    switch (this.movementStyle) {
      case MovementStyle.BASIC_BOUNCE:
        this.updateBasicMovement();
        break;
      case MovementStyle.CONTROLLED_BOUNCE:
        this.updateControlledMovement();
        break;
      case MovementStyle.FULL_CONTROLLED:
        this.updateFullControlled();
        break;
    }

    // C++ top_private_vel = WIZBALL_MAX_PIXEL_X_VEL << Bitshift = 3 << 8 = 768
    // Input functions clamp idealXVel and x_vel to ±768 via !> and !< operators
    // y_vel is NOT clamped by the script — only by the engine's internal limits
    // The bounce formula can produce y_vel of ~2800 for full-height bounces

    // CRITICAL: disable arcade physics BEFORE custom physics update runs
    // Otherwise arcade physics applies its own velocity on top of the custom physics
    body.moves = false;

    if (this.worldCollisionMap) {
      const moved = this.worldCollisionMap.moveEntity(
        {
          worldX: this.playerXFixed >> BITSHIFT,
          worldY: this.playerYFixed >> BITSHIFT,
          upperWorldWidth: WORLD_COLLISION_UPPER,
          lowerWorldWidth: WORLD_COLLISION_LOWER,
          upperWorldHeight: WORLD_COLLISION_UPPER,
          lowerWorldHeight: WORLD_COLLISION_LOWER,
          worldCollisionLayer: PLAYER_WORLD_COLLISION_LAYER,
          worldCollisionBitmask: WORLD_BITMASK_PLAYER_COLLIDES,
          worldCollisionBehaviour: PLAYER_WORLD_COLLISION_BEHAVIOUR
        },
        this.playerXFixed,
        this.playerYFixed,
        this.xVel,
        this.yVel
      );

      this.playerXFixed = moved.xFixed;
      this.playerYFixed = moved.yFixed;
      this.player.setPosition(this.playerXFixed / PRIVATE_SCALE, this.playerYFixed / PRIVATE_SCALE);
      body.updateFromGameObject();

      if (moved.result.hitUp || moved.result.hitDown || moved.result.hitLeft || moved.result.hitRight) {
        this.applyPlayerBounce(
          moved.result.hitUp,
          moved.result.hitDown,
          moved.result.hitLeft,
          moved.result.hitRight
        );
      }
    } else {
      // Arcade physics fallback - re-enable so physics handles movement and collisions
      body.moves = true;
      // Convert fixed-point velocity (px/frame * 256) to px/sec for Arcade:
      // px/frame = xVel / 256, px/sec = px/frame * 60
      body.setVelocity(
        (this.xVel / PRIVATE_SCALE) * 60,
        (this.yVel / PRIVATE_SCALE) * 60
      );
    }

    // Update spin animation
    this.updateSpin();
  }

  private updateBasicMovement(): void {
    // C++ basic_bounce: ideal_x_vel is in fixed-point (0-768), input adds 64 per frame
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    if (this.wizballInput('moveRight')) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.wizballInput('moveLeft')) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }

    // C++ applies gravity as y_acc = 48 (raw fixed-point) each frame in non-full-controlled modes
    this.yVel += WIZBALL_GRAVITY_STRENGTH;
  }

  private updateControlledMovement(): void {
    const maxVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    if (this.wizballInput('moveRight')) {
      this.idealXVel = Math.min(this.idealXVel + WIZBALL_X_RESPONSIVENESS, maxVel);
    }
    if (this.wizballInput('moveLeft')) {
      this.idealXVel = Math.max(this.idealXVel - WIZBALL_X_RESPONSIVENESS, -maxVel);
    }

    // C++ controlled_bounce: x_vel = ideal_x_vel (both in fixed-point). This line
    // lives INSIDE `if allow_movement = true` (wizball.txt:422-436), and
    // allow_movement is false while FIRE is held to pilot the cat (:381-393) —
    // running it unconditionally kept steering the ball during catellite control.
    if (!this.catelliteIsPlayerControlled) {
      this.xVel = this.idealXVel;
    }

    // C++ applies gravity in controlled bounce mode too
    this.yVel += WIZBALL_GRAVITY_STRENGTH;
  }

  private updateFullControlled(): void {
    const topPrivateVel = WIZBALL_MAX_PIXEL_X_VEL * PRIVATE_SCALE; // 768

    // X movement - C++ has TWO SEPARATE IF BLOCKS that BOTH run each frame
    // First block: RIGHT handling
    if (this.wizballInput('moveRight')) {
      this.xVel = Math.min(this.xVel + WIZBALL_X_RESPONSIVENESS, topPrivateVel);
    } else {
      if (this.wizballInput('moveLeft')) {
        // x_vel = x_vel (do nothing)
      } else {
        if (this.xVel > 0) {
          this.xVel = Math.max(this.xVel - WIZBALL_X_DAMPING, 0);
        }
      }
    }

    // Second block: LEFT handling
    if (this.wizballInput('moveLeft')) {
      this.xVel = Math.max(this.xVel - WIZBALL_X_RESPONSIVENESS, -topPrivateVel);
    } else {
      if (this.wizballInput('moveRight')) {
        // x_vel = x_vel (do nothing)
      } else {
        if (this.xVel < 0) {
          this.xVel = Math.min(this.xVel + WIZBALL_X_DAMPING, 0);
        }
      }
    }

    // Y movement - C++ has TWO SEPARATE IF BLOCKS that BOTH run each frame
    // First block: DOWN handling
    if (this.wizballInput('moveDown')) {
      this.yVel = Math.min(this.yVel + WIZBALL_Y_RESPONSIVENESS, topPrivateVel);
    } else {
      if (this.yVel > 0) {
        this.yVel = Math.max(this.yVel - WIZBALL_Y_DAMPING, 0);
      }
    }

    // Second block: UP handling
    if (this.wizballInput('moveUp')) {
      this.yVel = Math.max(this.yVel - WIZBALL_Y_RESPONSIVENESS, -topPrivateVel);
    } else {
      if (this.yVel < 0) {
        this.yVel = Math.min(this.yVel + WIZBALL_Y_DAMPING, 0);
      }
    }

    // C++ full_controlled: ideal_x_vel = x_vel (sync for spin)
    this.idealXVel = this.xVel;

    // No gravity in full controlled mode
  }

  private updateSpin(): void {
    // C++ spin: spin_angle += ideal_x_vel (fixed-point) clamped to [0, top_spin_angle]
    // In basic/controlled modes, spin is driven by ideal_x_vel
    // In full_controlled mode, spin is driven by x_vel
    const velocityForSpin = this.movementStyle === MovementStyle.FULL_CONTROLLED
      ? this.xVel
      : this.idealXVel;

    this.spinAngle += velocityForSpin;

    // Wrap angle
    while (this.spinAngle < 0) this.spinAngle += this.topSpinAngle;
    while (this.spinAngle >= this.topSpinAngle) this.spinAngle -= this.topSpinAngle;

    // Convert to animation frame
    const frame = Math.floor(this.spinAngle / this.spinAngleToFrameDivider) % WIZBALL_FRAME_COUNT;
    this.player.setFrame(frame);
  }

  private updateCatellite(): void {
    // C++ wizball.txt:214-217 — the wizball writes its Y into the shared lag
    // buffer EVERY frame, cat or no cat, so a newly collected cat has a real
    // 10-frame history to chase instead of lunging at stale positions.
    this.catellitePreviousYPositions.push(this.player.y);
    if (this.catellitePreviousYPositions.length > 10) {
      this.catellitePreviousYPositions.shift();
    }

    const catelliteBody = this.catellite.body as Phaser.Physics.Arcade.Body;

    if (!(this.weaponCollection & WeaponFlag.CATELLITE)) {
      this.catellite.setVisible(false);
      // No cat = no collider. Leaving the body enabled left an invisible ghost
      // parked at the cat's last position, still collecting paint and soaking hits.
      catelliteBody.enable = false;
      this.catelliteBubble.clear();
      return;
    }

    this.catellite.setVisible(true);
    catelliteBody.enable = true;

    this.updateCatelliteFiring();

    // catelliteIsPlayerControlled is set each frame by updateCatelliteControlState()
    // (FIRE held >= threshold), called before updateMovement() in update().

    // C++ catellite target: 64px behind wizball on the horizontal axis
    const catelliteHorizontalLagDistance = 64;
    const controlledSpeed = CATELLITE_CONTROLLED_HORIZONTAL_SPEED; // 6 px/frame
    const followingSpeed = CATELLITE_FOLLOWING_HORIZONTAL_SPEED; // 4 px/frame

    // C++ catellite.txt:280 — cleared at the top of the movement block, and only
    // the LEFT/RIGHT steering branches set it. (The firing routine above runs
    // first, so it reads last frame's value — exactly as the C++ does.)
    this.catelliteOverrideReverseFire = false;

    if (this.mutantCatelliteActive) {
      // C++ catellite.txt:283-321 — a mad cat does NOT hunt. It picks a random
      // spot (±256 px around the wizball, y 24..344) every 60-120 frames and
      // drifts there at the controlled speeds, firing straight ahead.
      this.mutantCatDecisionCounter = Math.max(0, this.mutantCatDecisionCounter - 1);
      if (this.mutantCatDecisionCounter === 0) {
        this.mutantCatXOffset = Phaser.Math.Between(-MUTANT_CAT_X_RANGE, MUTANT_CAT_X_RANGE);
        this.mutantCatTargetY = Phaser.Math.Between(MUTANT_CAT_MIN_Y, MUTANT_CAT_MAX_Y);
        this.mutantCatDecisionCounter =
          Phaser.Math.Between(MUTANT_CAT_MIN_DECISION_FRAMES, MUTANT_CAT_MAX_DECISION_FRAMES);
      }

      const cvx = Phaser.Math.Clamp(
        (this.player.x + this.mutantCatXOffset) - this.catellite.x, -controlledSpeed, controlledSpeed
      );
      const cvy = Phaser.Math.Clamp(
        this.mutantCatTargetY - this.catellite.y,
        -CATELLITE_CONTROLLED_VERTICAL_SPEED, CATELLITE_CONTROLLED_VERTICAL_SPEED
      );

      // C++ :319-321 — it shoots the way it's drifting.
      if (cvx !== 0) this.catelliteFiringDirection = Math.sign(cvx);

      this.catellite.x += cvx;
      this.catellite.y += cvy;
    } else if (this.catelliteIsPlayerControlled) {
      // C++ catellite.txt:327-364 — direct d-pad control.
      let cvx = 0;
      let cvy = 0;

      // C++ :336-346 — steering sets the firing direction (override_reverse_fire),
      // so a piloted cat shoots the way YOU are pushing it, not where the ball faces.
      if (this.inputManager.isDown('moveLeft')) {
        cvx = -controlledSpeed;
        this.catelliteOverrideReverseFire = true;
        this.catelliteFiringDirection = -1;
      }
      if (this.inputManager.isDown('moveRight')) {
        cvx = controlledSpeed;
        this.catelliteOverrideReverseFire = true;
        this.catelliteFiringDirection = 1;
      }
      if (this.inputManager.isDown('moveUp')) {
        cvy = -controlledSpeed;
      }
      if (this.inputManager.isDown('moveDown')) {
        cvy = controlledSpeed;
      }

      this.catelliteFollowingState = false; // C++ :331

      // C++ :356-362 — with no horizontal push the cat borrows the wizball's
      // firing direction, and with no push at all it drifts back to heel.
      if (cvx === 0) {
        this.catelliteFiringDirection = this.lastMovementDirection;
        if (cvy === 0) {
          const wizballSide = this.xVel < 0 ? 1 : this.xVel > 0 ? -1 : -this.lastMovementDirection;
          const targetX = this.player.x + wizballSide * catelliteHorizontalLagDistance;
          const targetY = this.catellitePreviousYPositions[0] ?? this.player.y;
          cvx = Phaser.Math.Clamp(targetX - this.catellite.x, -controlledSpeed, controlledSpeed);
          cvy = Phaser.Math.Clamp(targetY - this.catellite.y, -CATELLITE_CONTROLLED_VERTICAL_SPEED, CATELLITE_CONTROLLED_VERTICAL_SPEED);
        }
      }

      this.catellite.x += cvx;
      this.catellite.y += cvy;
    } else {
      // Following mode - trail behind wizball (C++ catellite.txt:366-396)
      this.catelliteFiringDirection = this.lastMovementDirection; // C++ :368
      const wizballSide = this.xVel < 0 ? 1 : this.xVel > 0 ? -1 : -this.lastMovementDirection;
      const targetX = this.player.x + wizballSide * catelliteHorizontalLagDistance;
      const targetY = this.catellitePreviousYPositions[0] ?? this.player.y;

      // C++ following state logic:
      // Returning state (far from target): clamp both axes to controlledSpeed (6)
      // Following state (at target): clamp horizontal to followingSpeed (4), vertical unclamped
      const dx = targetX - this.catellite.x;
      const dy = targetY - this.catellite.y;

      if (!this.catelliteFollowingState) {
        // Returning to wizball's side - faster speed, both axes clamped
        this.catellite.x += Phaser.Math.Clamp(dx, -controlledSpeed, controlledSpeed);
        this.catellite.y += Phaser.Math.Clamp(dy, -CATELLITE_CONTROLLED_VERTICAL_SPEED, CATELLITE_CONTROLLED_VERTICAL_SPEED);
        // C++ :384-394 — it only latches into "at heel" once it actually arrives.
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) this.catelliteFollowingState = true;
      } else {
        // Already at heel - slower horizontal, instant vertical tracking
        this.catellite.x += Phaser.Math.Clamp(dx, -followingSpeed, followingSpeed);
        this.catellite.y += dy; // C++: no clamp on vertical in following state
      }
    }

    // C++ catellite.txt:164-190 — the cat is clamped to the CAMERA WINDOW
    // (camera_x + 16 .. camera_x + 624) and world_y <= 356, with no top clamp, so
    // it can never be stranded off-screen. Clamping to the whole level instead let
    // it fall a screen behind and become unreachable.
    const cam = this.cameras.main;
    this.catellite.x = Phaser.Math.Clamp(
      this.catellite.x, cam.scrollX + CATELLITE_WINDOW_MIN_X, cam.scrollX + CATELLITE_WINDOW_MAX_X
    );
    if (this.catellite.y > CATELLITE_MAX_Y) this.catellite.y = CATELLITE_MAX_Y;

    // Update the physics body position
    catelliteBody.reset(this.catellite.x, this.catellite.y);

    // Update shield bubble visual
    if (this.catelliteHasShield) {
      this.catelliteBubble.clear();
      this.catelliteBubble.lineStyle(2, 0x88ccff);
      this.catelliteBubble.strokeCircle(this.catellite.x, this.catellite.y, 18);
      this.catelliteBubble.lineStyle(1, 0xaaddff);
      this.catelliteBubble.strokeCircle(this.catellite.x, this.catellite.y, 14);
    } else {
      this.catelliteBubble.clear();
    }
  }

  private updateHUD(): void {
    // Update HUD system (draws score, lives, paint, catellite in top/bottom bars)
    this.hudSystem.setState({
      score: this.displayScore, // rolling display score (C++ player_display_score)
      lives: this.lives,
      cauldronFill: this.cauldronFill,
      currentPaintColor: this.paintColor,
      hasPaint: this.hasPaint,
      hasCatellite: (this.weaponCollection & WeaponFlag.CATELLITE) !== 0,
      catelliteHasShield: this.catelliteHasShield,
      currentLevel: this.currentLevel,
      weaponCollection: this.weaponCollection,
      enemyCount: this.enemySystem.getActiveEnemyCount(),
    });

    this.cauldronSystem.setFillLevels(this.cauldronFill);
    this.bonusSelectionPanel.update(this.weaponCollection, this.currentPickupCount);
  }

  /**
   * Get tile properties at a world position from the current parsed tilemap.
   * Returns null if no tilemap or position is out of bounds.
   */
  private getTilePropertiesAt(worldX: number, worldY: number, layer: number = 1): TileDefinition | null {
    if (!this.currentParsedTilemap) return null;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (tileX < 0 || tileX >= this.currentParsedTilemap.width ||
        tileY < 0 || tileY >= this.currentParsedTilemap.height) {
      return null;
    }

    const tileId = this.currentParsedTilemap.layers[layer]?.[tileY * this.currentParsedTilemap.width + tileX] ?? 0;
    if (tileId === 0) return null;

    return this.currentParsedTilemap.tileDefinitions[tileId] ?? null;
  }

  /**
   * Check tile effects at the player's position and apply them.
   * Handles: deadly tiles, conveyor belts, acceleration zones, water.
   */
  private checkTileEffects(): void {
    const playerWorldX = this.playerXFixed >> BITSHIFT;
    const playerWorldY = this.playerYFixed >> BITSHIFT;

    // Check the tile the player's center is on
    const tile = this.getTilePropertiesAt(playerWorldX, playerWorldY);
    if (!tile) return;

    const props = tile.booleanProperties;

    // Deadly tiles kill the player
    if ((props & BOOL_DEADLY) !== 0 || (props & BOOL_HARMFUL) !== 0) {
      {
        this.loseLife();
        return;
      }
    }

    // Conveyor belt tiles push the player
    if ((props & BOOL_CONVEY) !== 0) {
      this.xVel += tile.conveyX;
      this.yVel += tile.conveyY;
    }

    // Acceleration tiles (slopes, force fields)
    if ((props & BOOL_ACCELLERATE) !== 0) {
      this.xVel += tile.accelX;
      this.yVel += tile.accelY;
    }

    // Water tiles apply drag/friction
    if ((props & BOOL_WATER) !== 0) {
      this.xVel = Math.trunc(this.xVel * 0.95);
      this.yVel = Math.trunc(this.yVel * 0.95);
    }
  }

  // C++ bonus_pearl.txt: a pearl removes itself once the player wanders ~344px
  // away, so uncollected pearls don't clutter the level indefinitely.
  private cleanupBonusPearls(): void {
    const RETIRE_DISTANCE = 344;
    this.bonusPearlGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const pearl = child as Phaser.Physics.Arcade.Sprite;
      if (!pearl.active) return true;
      if (Phaser.Math.Distance.Between(pearl.x, pearl.y, this.player.x, this.player.y) > RETIRE_DISTANCE) {
        pearl.destroy();
      }
      return true;
    });
  }

  private cleanupPaintDrops(): void {
    this.paintGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      if (!sprite.active || (sprite as any)._collected) return true;
      // C++ paintdrop.world_interaction_routine: a drop that hits the ground
      // splats into a fading colour stain, then dies (it's no longer collectable).
      const body = sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body && body.blocked.down) {
        this.spawnPaintStain(sprite.x, sprite.y + 6, (sprite as any).paintColor ?? 0);
        sprite.destroy();
        return true;
      }
      if (sprite.y > this.worldHeight + 30 || sprite.x < -30 || sprite.x > this.worldWidth + 30) {
        sprite.destroy();
      }
      return true;
    });
  }

  // A short-lived colour splat where a missed paintdrop hit the floor
  // (C++ paintdrop_stain.txt: a multiply-blended stain that grows then fades).
  private spawnPaintStain(x: number, y: number, color: number): void {
    const stain = this.add.ellipse(x, y, 14, 6, PAINT_FRAME_COLORS[color] ?? 0xffffff, 0.55);
    stain.setDepth(Depth.PAINT - 1);
    this.tweens.add({
      targets: stain,
      scaleX: 2.4,
      scaleY: 1.5,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeOut',
      onComplete: () => stain.destroy()
    });
  }

  private checkBulletCollisions(): void {
    // Bullet-enemy collision is handled by the physics overlap in setupCollisions();
    // this only retires bullets that have left the play window.
    const cam = this.cameras.main;
    const camCentreX = cam.scrollX + cam.width / 2;

    this.bulletGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return true;

      // Shield-fire cores are pinned to the ball and owned by updateShieldFire().
      if ((bullet as any)._isShieldOrb) return true;

      if ((bullet as any)._isSmartBombWave) {
        // C++ smart_bomb_shockwave.txt:77-89 — measured from the camera's LEFT edge.
        const movingLeft = ((bullet.body as Phaser.Physics.Arcade.Body)?.velocity.x ?? 0) < 0;
        if (movingLeft ? bullet.x < cam.scrollX - 32 : bullet.x > cam.scrollX + 672) {
          bullet.destroy();
        }
        return true;
      }

      // C++ wizball_normal_bullet.txt:81-85 -> function_normal_enemy_am_i_on_screen:
      // a bullet dies at 344 px from the camera centre, or outside y -16..432 — NOT
      // at the far edges of the whole scrolling level.
      if (Math.abs(bullet.x - camCentreX) >= BULLET_RETIRE_DISTANCE ||
          bullet.y < BULLET_RETIRE_TOP || bullet.y > BULLET_RETIRE_BOTTOM) {
        bullet.destroy();
      }

      return true;
    });
  }

  update(): void {
    // Pause
    if (this.inputManager.justDown('pause')) {
      this.scene.pause(GAME);
      this.scene.launch(PAUSE);
      return;
    }

    this.checkBulletCollisions();

    // C++ wizball.txt:223-246 — while warping (getting_sucked_into_a_hole_flag)
    // the whole control branch is replaced by do_warp_out, which forces velocity
    // to 0 every frame. The warp system owns the ball's position; suppress fire,
    // bonus selection, shield fire, movement and tile effects until it finishes.
    const warping = this.warpTubeSystem.isActive();

    if (!warping) {
      // C++ main loop order (wizball.txt:225-236): movement_routine (which sets
      // allow_movement) -> firing_routine -> update_wobble. The port's
      // updateCatelliteControlState() is what computes allow_movement, so it has
      // to run BEFORE the wobble reads it — it used to run after, one frame stale.
      this.updateCatelliteControlState();

      // C++ pattern: check fire_delay_counter FIRST, then handle input based on catellite presence
      if (this.fireCooldown > 0) {
        this.fireCooldown--;
      } else {
        const hasCatellite = (this.weaponCollection & WeaponFlag.CATELLITE) !== 0 && this.catellite.visible;
        // FIRE_1 only — the C++ firing_routine (wizball.txt:539, 552) never looks
        // at FIRE_2, which exists solely to confirm a bonus selection (:843).
        const firePressed = this.inputManager.justDown('fire');
        const fireHeld = this.inputManager.isDown('fire');

        if (!hasCatellite) {
          // Without catellite: fire once per key press (HIT = JustDown)
          if (firePressed) {
            this.fireBullet();
          }
        } else {
          // With catellite: auto-fire while held down (DOWN = isDown)
          if (fireHeld) {
            this.fireBullet();
          }
        }
      }

      this.updateBonusSelectionWobble();
      this.updateShieldFire();
      this.updateMovement();
      this.checkTileEffects();
    } else {
      // do_warp_out: velocity forced to 0 (wizball.txt:273-274), and the shield is
      // torn down on the way through (:294 player_warping_destroy_shield).
      this.xVel = 0;
      this.yVel = 0;
      this.idealXVel = 0;
      this.shieldCoreLifetime = 0;
      this.clearShieldCores();
    }

    this.updateCatellite();
    this.enemySystem.update();
    this.updateFuzzCounter();
    this.updateDisplayScore();
    this.checkExtraLife();
    if (this.respawnInvulnFrames > 0) this.respawnInvulnFrames--;
    // C++ update_shield_counter (wizball.txt:1118-1138): the wizball and cat
    // shields tick down independently; each drops its own flag when it hits 0.
    if (this.wizballShieldEnergy > 0 && --this.wizballShieldEnergy <= 0) {
      this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;
    }
    if (this.catShieldEnergy > 0 && --this.catShieldEnergy <= 0) {
      this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
      this.catelliteHasShield = false;
    }
    this.warpTubeSystem.update();
    if (warping) {
      // Keep the fixed-point position in lockstep with the warp lerp so control
      // resumes without a snap once the warp completes / teleports.
      this.playerXFixed = this.player.x * PRIVATE_SCALE;
      this.playerYFixed = this.player.y * PRIVATE_SCALE;
    } else {
      this.warpTubeSystem.checkWarp(this.player);
    }
    // C++ background.txt runs its `start` block every frame: the backdrop tracks
    // the camera, pans, and flips greyscale→colour the moment progress passes 1.
    this.updateBackdrop();
    this.updateHUD();
    this.cleanupPaintDrops();
    this.cleanupBonusPearls();

    // Must be last — stores previous frame's button state for justDown detection
    this.inputManager.update();
  }

}
