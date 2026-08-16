import Phaser from 'phaser';
import { WeaponFlag, MAXIMUM_POSSIBLE_SCORE } from '../types/game';
import { playSceneMusic } from '../systems/MusicManager';

/**
 * BonusLevelScene - Wave-survival shooter.
 *
 * Faithful remake of the original Wizball bonus level (see C++ reference:
 *   wizball/wizball/scripts/main_game_controller.txt  (bonus_level_handler, L325-470)
 *   wizball/wizball/scripts/bonus_wave_spawner.txt    (spawn cadence + the pause gate)
 *   wizball/wizball/scripts/bonus_wave_enemy.txt      (per-enemy motion / scoring / collision)
 *   wizball/wizball/datatables/bonus_wave_order.txt   (the wave sequence)
 *
 * Wizball is spun off into space at (320,208) carrying his CURRENT LOADOUT
 * (wizball.txt:183-189, which then runs pre_equip_wizball :904-957 to hang the
 * catellite and shields off him), and must survive a fixed sequence of waves.
 *
 * Touching ANY enemy ends the round (wizball.txt:698-712): it costs no life, but
 * the ball explodes and the controller jumps straight to the summary
 * (main_game_controller.txt:403-404, 409-440). Surviving the whole table instead
 * drops out to the laboratory with no summary at all (main_game_controller.txt:452-453).
 *
 * Per-kill score (bonus_wave_enemy.txt:789-795):
 *     score += 20 + floor(wave_number_in_bonus_level / 3) * 10
 * End-of-round summary bonus (main_game_controller.txt:419, 427-431):
 *     score += enemies_killed * 40
 */

// Wave type ids mirror the CONST_BONUS_WAVE_TYPE_* constants referenced in
// bonus_wave_order.txt. Exact sprite-level behaviour is approximated here with
// simple moving enemies, but the NUMBER and ORDER of waves is preserved 1:1.
enum WaveType {
  SLOW_PLANES,
  REGULAR_PAINTBALL_BOUNCE,
  RANDOM_ASTEROIDS,
  RANDOM_CIRCLES,
  RANDOM_PAINTBALL_BOUNCE,
  FILTH,
  BONUS_LIFE,
  NEW_8_WAY_SHOOTERS,
  NEW_ROTATE_SHOOTERS,
  UP_AND_DOWNERS,
  SLOW_STARS, // pacing-only marker wave: spawns no enemies, just slows the stars
  FINISHED
}

// Column 3 of bonus_wave_order.txt — when the wave's spawner is allowed to tell
// the controller to move on (bonus_wave_spawner.txt:106, 167-172, 183-192).
enum PauseCond {
  WAIT_UNTIL_LAST_DEAD,
  WAIT_UNTIL_LAST_SPAWNED,
  DO_NOT_WAIT
}

// Column 2 of bonus_wave_order.txt. The invert bits pick the spawn side/height
// (bonus_wave_enemy.txt:196-560), the toggle bits flip them between enemies
// (bonus_wave_spawner.txt:156-164) and SIMULTANEOUS/ALTERNATE_MODE_1 change the
// spawn cadence (bonus_wave_spawner.txt:64-71, 78-86, 122-133).
enum WaveFlag {
  NONE = 0,
  X_INVERT = 1,
  Y_INVERT = 2,
  X_TOGGLE = 4,
  Y_TOGGLE = 8,
  SIMULTANEOUS = 16,
  ALTERNATE_MODE_1 = 32
}

interface WaveDef {
  type: WaveType;
  /** Column 2 "modifier" flags. */
  flags: number;
  /** Column 3 "pause condition". */
  pause: PauseCond;
  /** Number of enemies in this wave (col 4 "total wave size"). */
  size: number;
  /** Frames to wait after this wave before advancing (col 5 "after wave wait"). */
  afterWait: number;
}

// Direct transcription of datatables/bonus_wave_order.txt (rows in order).
// wave index (0-based) here == wave_number_in_bonus_level used for scoring.
const WAVE_ORDER: WaveDef[] = [
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 0
  { type: WaveType.REGULAR_PAINTBALL_BOUNCE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 1
  { type: WaveType.RANDOM_CIRCLES, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 21, afterWait: 0 }, // 2
  { type: WaveType.RANDOM_ASTEROIDS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 15, afterWait: 50 }, // 3
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_INVERT, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 4
  { type: WaveType.REGULAR_PAINTBALL_BOUNCE, flags: WaveFlag.X_INVERT | WaveFlag.Y_INVERT, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 5
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 6
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 7
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 8
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 9
  { type: WaveType.RANDOM_ASTEROIDS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 21, afterWait: 50 }, // 10
  { type: WaveType.RANDOM_CIRCLES, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 48, afterWait: 50 }, // 11
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 75 }, // 12
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 75 }, // 13
  { type: WaveType.RANDOM_PAINTBALL_BOUNCE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 75 }, // 14
  { type: WaveType.RANDOM_CIRCLES, flags: WaveFlag.NONE, pause: PauseCond.DO_NOT_WAIT, size: 30, afterWait: 0 }, // 15
  { type: WaveType.RANDOM_ASTEROIDS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 15, afterWait: 50 }, // 16
  { type: WaveType.RANDOM_ASTEROIDS, flags: WaveFlag.NONE, pause: PauseCond.DO_NOT_WAIT, size: 8, afterWait: 50 }, // 17
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 18
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 19
  { type: WaveType.SLOW_PLANES, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 20
  { type: WaveType.FILTH, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 21
  { type: WaveType.FILTH, flags: WaveFlag.X_INVERT | WaveFlag.Y_INVERT, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 22
  { type: WaveType.BONUS_LIFE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 1, afterWait: 50 }, // 23
  { type: WaveType.SLOW_STARS, flags: WaveFlag.NONE, pause: PauseCond.DO_NOT_WAIT, size: 0, afterWait: 150 }, // 24
  { type: WaveType.NEW_8_WAY_SHOOTERS, flags: WaveFlag.Y_TOGGLE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 25
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 1, afterWait: 20 }, // 26
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 2, afterWait: 20 }, // 27
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 3, afterWait: 20 }, // 28
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 4, afterWait: 20 }, // 29
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 5, afterWait: 20 }, // 30
  { type: WaveType.NEW_ROTATE_SHOOTERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 20 }, // 31
  { type: WaveType.FILTH, flags: WaveFlag.Y_TOGGLE | WaveFlag.ALTERNATE_MODE_1, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 32
  { type: WaveType.NEW_8_WAY_SHOOTERS, flags: WaveFlag.Y_TOGGLE | WaveFlag.ALTERNATE_MODE_1, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 22, afterWait: 50 }, // 33
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 34
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_INVERT | WaveFlag.Y_INVERT, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 6, afterWait: 50 }, // 35
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 36
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 37
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 38
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 39
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 40
  { type: WaveType.UP_AND_DOWNERS, flags: WaveFlag.X_TOGGLE | WaveFlag.Y_TOGGLE | WaveFlag.SIMULTANEOUS, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 6, afterWait: 100 }, // 41
  { type: WaveType.BONUS_LIFE, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_DEAD, size: 1, afterWait: 50 }, // 42
  { type: WaveType.FINISHED, flags: WaveFlag.NONE, pause: PauseCond.WAIT_UNTIL_LAST_SPAWNED, size: 0, afterWait: 50 } // 43
];

const SCREEN_W = 640;
const SCREEN_H = 368;

// The original bonus field is 640x416 (constant.txt:215 BONUS_LEVEL_HEIGHT) while
// our window is 368 tall, so C++ y coordinates are quoted verbatim below and run
// through fieldY()/FIELD_SCALE_Y to land in our field.
const BONUS_FIELD_H = 416;
const FIELD_SCALE_Y = SCREEN_H / BONUS_FIELD_H;
const fieldY = (y: number): number => y * FIELD_SCALE_Y;

// Horizontal retirement edges (constant.txt:477-478).
const LEFT_SIDE_BASE_X = -24;
const RIGHT_SIDE_BASE_X = 664;

// C++ velocities/accelerations are 8-bit fixed point per frame (BITSHIFT 8).
const VEL_TO_PX_S = 60 / 256;
const ACC_TO_PX_S2 = 3600 / 256;

const PLAYER_SPEED = 220;

// Firing constants, matching GameScene (which keeps private copies at
// src/scenes/GameScene.ts:117-119 — nothing exports them yet, so they are
// duplicated here rather than diverging as they did before).
const BULLET_SPEED = 720;            // px/s — C++ 192 >> 4
const NORMAL_FIRE_RATE = 20;         // frames — C++ wizball.txt:511
const DOUBLE_FIRE_RATE = 10;         // frames — C++ wizball.txt:512
const SHIELD_STARTING_ENERGY = 2100; // frames — C++ constant.txt:217
const SHIELD_HIT_PENALTY = 420;      // frames — C++ constant.txt:218
const CATELLITE_FOLLOW_SPEED = 4;    // px/frame — C++ CATELLITE_FOLLOWING_HORIZONTAL_SPEED
const CATELLITE_LAG_DISTANCE = 64;   // px behind the ball

const MAX_LIVES = 9; // C++ function_gain_life.txt (temp_1 + 1 !> 9)

// Shield remainders arrive in the scene payload, i.e. from code this scene does
// not own, so treat them as untrusted. Every C++ write to a *_shield_stored_health
// global is either the SHIELD_STARTING_ENERGY constant or a `!< 0` decrement
// (wizball.txt:914, :920, :1067-1098, :1122-1132), so [0, SHIELD_STARTING_ENERGY]
// is the invariant to hold. The old init did a bare Math.min, which is one-sided:
// a negative — or a NaN, which loses every comparison — survived it with the
// INVULNERABILITY bitflag still set, i.e. a shield that never expires.
const clampShieldEnergy = (v: number | undefined): number =>
  Number.isFinite(v) ? Math.min(Math.max(v as number, 0), SHIELD_STARTING_ENERGY) : 0;

const FRAME_MS = 1000 / 60; // C++ waits are in 60Hz frames
const MAX_FRAME_STEPS = 4;  // never simulate more than this per rendered frame

/** bonus_wave_spawner.txt:26-28 — how the spawner paces its own enemies. */
enum SpawnPacing {
  WAIT_SET_TIME,
  WAIT_UNTIL_LOW_ENOUGH_COUNT
}

enum SpawnerState {
  COUNTDOWN,
  DECISION,
  WAIT_LAST_DEAD
}

/** One live bonus_wave_spawner entity (several can run at once). */
interface WaveSpawner {
  type: WaveType;
  flags: number;
  pause: PauseCond;
  waveIndex: number;
  /** total_wave_size — enemies still to spawn. */
  remaining: number;
  pacing: SpawnPacing;
  /** wave_spawn_continue_mode_timer */
  timer: number;
  /** wave_spawn_continue_mode_counter */
  threshold: number;
  counter: number;
  state: SpawnerState;
  /** total_alive_children — only maintained for WAIT_UNTIL_LAST_DEAD waves. */
  alive: number;
}

/** Per-enemy state (one object rather than a pile of setData keys). */
interface BonusEnemy {
  type: WaveType;
  waveIndex: number;
  spawner: WaveSpawner | null;
  /** Whether this enemy is counted in its spawner's total_alive_children. */
  counted: boolean;
  dying: boolean;
  invertX: boolean;
  invertY: boolean;
  startY: number;
  bounceY: boolean;
  fadeIn: boolean;
  /** behaviour_counter */
  counter: number;
  /** velocity_counter (planes) / sine_wave_counter (up-and-downers), hundredths of a degree */
  angleCounter: number;
  rotationSpeed: number;
  storedVx: number;
  storedVy: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
}

export default class BonusLevelScene extends Phaser.Scene {
  // --- init-data contract (matches GameScene / LaboratoryScene conventions) ---
  private level: number = 1;
  private score: number = 0;
  private weaponCollection: number = 0;
  private startingLoadout: number | undefined = undefined;
  private lives: number = 2; // C++ WIZBALL_START_LIVES (always overridden by carried lives)
  private levelProgress: number = 0;
  private cauldronFill: number[] = [0, 0, 0, 0];

  // Carried through untouched on the way to the laboratory. This scene has no use
  // for them, but the banked colour-stage array is authoritative persistent state
  // in the C++ (LEVEL_COMPLETION_ARRAY_ID, main_game_controller.txt:1075) and has
  // to survive the level -> bonus -> lab -> level round trip rather than being
  // re-derived at the other end.
  private levelCompletion: number[] | undefined = undefined;
  private minOpenLevel: number | undefined = undefined;
  private maxOpenLevel: number | undefined = undefined;

  // --- gameplay state ---
  private enemiesKilled: number = 0;
  private waveIndex: number = -1; // advanced to 0 on the first go-ahead (mirrors wave_number)
  private waveWaitFrames: number = 0;
  private pendingWave: WaveDef | null = null;
  private goAheadQueue: number = 0; // LEVEL_RESET_FLAG_MOVE_TO_NEXT_BONUS_WAVE events
  private spawners: WaveSpawner[] = [];
  private spawningEnabled: boolean = false;
  private finished: boolean = false;
  private leaving: boolean = false;
  private summaryCounter: number = 0; // C++ bonus_level_summary_counter
  private frameAccumulator: number = 0;

  private player: Phaser.Physics.Arcade.Sprite | null = null;
  private catellite: Phaser.Physics.Arcade.Sprite | null = null;
  private catellitePrevY: number[] = [];
  private bullets: Phaser.Physics.Arcade.Group | null = null;
  private enemies: Phaser.Physics.Arcade.Group | null = null;
  private stars: Star[] = [];
  private starGfx!: Phaser.GameObjects.Graphics;
  private shieldGfx!: Phaser.GameObjects.Graphics;
  private starSpeedMul: number = 1;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private firePrevDown: boolean = false;
  private firePending: boolean = false; // latched FIRE press edge
  private fireDelay: number = 0; // C++ fire_delay_counter, in frames
  private lastMovementDirection: number = 1;
  private rearFireToggle: boolean = false;
  private spreadFlipSide: boolean = false;

  private shieldEnergy: number = 0;
  private shieldHitThisFrame: boolean = false;
  // C++ cat_shield_stored_health — the catellite's bubble runs on its OWN counter
  // and its OWN bitflag (wizball.txt:917-923, :1130-1136), independent of the
  // ball's.
  private catShieldEnergy: number = 0;
  private catShieldHitThisFrame: boolean = false;

  private scoreText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BonusLevel' });
  }

  init(data: {
    level?: number;
    score?: number;
    weaponCollection?: number;
    startingLoadout?: number;
    lives?: number;
    levelProgress?: number;
    cauldronFill?: number[];
    shieldEnergy?: number;
    catShieldEnergy?: number;
    levelCompletion?: number[];
    minOpenLevel?: number;
    maxOpenLevel?: number;
  }): void {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.weaponCollection = data.weaponCollection ?? 0;
    this.startingLoadout = data.startingLoadout;
    this.lives = data.lives ?? 2;
    this.levelProgress = data.levelProgress ?? 0;
    this.cauldronFill = data.cauldronFill ?? [0, 0, 0, 0];
    this.levelCompletion = data.levelCompletion;
    this.minOpenLevel = data.minOpenLevel;
    this.maxOpenLevel = data.maxOpenLevel;

    // C++ wizball.txt:183-189 + pre_equip_wizball :904-957 — the shield comes onto
    // the bonus level with whatever time it had LEFT: only the new-life branch tops
    // wizball_shield_stored_health back up to SHIELD_STARTING_ENERGY (:910-914); the
    // bonus-level entry falls to the else at :926-927, which just re-spawns the
    // bubble over the surviving counter. So never refill here — carry the remainder
    // in and let stepShieldCounter keep burning it down.
    // (Every C++ write to wizball_shield_stored_health is either the constant or a
    // decrement — :914, :1067, :1086, :1124 — so it can never exceed the starting
    // value; the clamp just holds that invariant against a stale payload.)
    this.shieldEnergy = (this.weaponCollection & WeaponFlag.INVULNERABILITY)
      ? clampShieldEnergy(data.shieldEnergy)
      : 0;
    // Keep the bitflag and the counter consistent the way update_shield_counter
    // does (wizball.txt:1126-1128): no stored health means no shield. This also
    // covers the case where the caller has not sent shieldEnergy at all — an
    // unknown remainder must not become a free 2100-frame immunity to the
    // enemy-contact fail state below.
    if (this.shieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;

    // The catellite's bubble is carried over the same way: pre_equip_wizball's
    // bonus-level branch (wizball.txt:926-937) re-spawns catellite_shield_swirl_layer
    // over the SURVIVING cat_shield_stored_health whenever CATELLITE_INVULNERABILITY
    // is in the loadout, and update_shield_counter (:1130-1136) keeps burning that
    // counter down alongside the ball's. Only the wizball's remainder used to be
    // threaded in here, so a cat arrived with the 1024 bitflag set and nothing
    // behind it — a shield the scene claimed but could not spend or expire.
    this.catShieldEnergy = (this.weaponCollection & WeaponFlag.CATELLITE_INVULNERABILITY)
      ? clampShieldEnergy(data.catShieldEnergy)
      : 0;
    if (this.catShieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;

    // reset per-run gameplay state
    this.enemiesKilled = 0;
    this.waveIndex = -1;
    this.waveWaitFrames = 0;
    this.pendingWave = null;
    this.goAheadQueue = 0;
    this.spawners = [];
    this.spawningEnabled = false;
    this.finished = false;
    this.leaving = false;
    this.summaryCounter = 0;
    this.frameAccumulator = 0;
    this.starSpeedMul = 1;
    this.stars = [];
    this.player = null;
    this.catellite = null;
    this.catellitePrevY = [];
    this.firePrevDown = false;
    this.firePending = false;
    this.fireDelay = 0;
    this.lastMovementDirection = 1;
    this.rearFireToggle = false;
    this.spreadFlipSide = false;
    this.shieldHitThisFrame = false;
    this.catShieldHitThisFrame = false;
  }

  create(): void {
    this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x050510).setDepth(-2);
    this.createStarfield();

    this.add.text(SCREEN_W / 2, 18, 'BONUS LEVEL', {
      fontSize: '20px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);

    this.scoreText = this.add.text(8, 6, `SCORE ${this.score}`, {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    }).setDepth(20);

    this.waveText = this.add.text(SCREEN_W - 8, 6, '', {
      fontSize: '14px',
      color: '#88ff88',
      fontFamily: 'monospace'
    }).setOrigin(1, 0).setDepth(20);

    this.killText = this.add.text(8, SCREEN_H - 20, 'KILLS 0', {
      fontSize: '14px',
      color: '#ffaa44',
      fontFamily: 'monospace'
    }).setDepth(20);

    // Input: 8-direction movement + fire (cursors + SPACE), matching sibling scenes.
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    this.createPlayer();
    this.shieldGfx = this.add.graphics().setDepth(11);
    this.createCatellite();

    // Player/catellite bullet hits enemy -> kill + score.
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, undefined, this);

    // C++ wizball.txt:698-712 — enemy contact ENDS the round on the bonus level.
    this.physics.add.overlap(this.player!, this.enemies, this.onPlayerHitEnemy, undefined, this);

    // C++ main_game_controller.txt:363 — the sequence is kicked off by a queued
    // LEVEL_RESET_FLAG_MOVE_TO_NEXT_BONUS_WAVE, which arms the 50-frame pre-delay.
    this.spawningEnabled = true;
    this.goAheadQueue = 1;

    this.playSfx('bonus_selection', 0.5);

    playSceneMusic(this, 'wizball_bonus');
  }

  private playSfx(key: string, volume: number): void {
    // this.sound.play() self-cleans the one-shot; this.sound.add() leaked one
    // Sound object per call for the lifetime of the scene.
    if (this.cache.audio.exists(key)) {
      this.sound.play(key, { volume });
    }
  }

  // --- starfield (one Graphics, redrawn per frame — was 100 Graphics objects) ---
  private createStarfield(): void {
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * SCREEN_W,
        y: Math.random() * SCREEN_H,
        size: Math.random() < 0.5 ? 1 : 2,
        alpha: 0.3 + Math.random() * 0.7,
        speed: 0.5 + Math.random() * 2
      });
    }
    this.starGfx = this.add.graphics().setDepth(-1);
    this.drawStarfield();
  }

  private stepStars(): void {
    for (const star of this.stars) {
      star.y += star.speed * this.starSpeedMul;
      if (star.y > SCREEN_H) {
        star.y -= SCREEN_H;
        star.x = Math.random() * SCREEN_W;
      }
    }
  }

  private drawStarfield(): void {
    const g = this.starGfx;
    g.clear();
    for (const star of this.stars) {
      g.fillStyle(0xffffff, star.alpha);
      g.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
    }
  }

  private createPlayer(): void {
    // C++ main_game_controller.txt:374 — spawn_entity (wizball,320,208) on the
    // 640x416 bonus field, i.e. dead centre of ours.
    this.player = this.physics.add.sprite(SCREEN_W / 2, fieldY(208), 'wizball', 0);
    this.player.setDisplaySize(32, 32);
    this.player.setDepth(10);

    // The spritesheet frame is 48x48 (PreloadScene.ts:60) drawn at 32x32, so body
    // radii/offsets below are in TEXTURE pixels and land on screen at BALL_SCALE.
    const BALL_FRAME = 48;
    const BALL_DISPLAY = 32;
    const BALL_BODY_RADIUS = 12; // texture px -> a 16px circle on screen
    const BALL_SCALE = BALL_DISPLAY / BALL_FRAME;
    // Gap between the drawn ball and its (smaller) collision circle, per side: 8px.
    const BALL_MARGIN = (BALL_DISPLAY - BALL_BODY_RADIUS * 2 * BALL_SCALE) / 2;

    // Every scene gets its own Arcade world and its bounds default to the CANVAS
    // (main.ts:18-19 — 640x416, i.e. 368 playable plus the status-bar strip), not
    // to the playfield. Left unset, the setCollideWorldBounds below would let the
    // ball sit ~48px under the drawn field, off its own starfield and out of reach
    // of nearly every wave. C++ wizball.txt:164-165 makes BOTH world edges solid
    // for the ball, and the bonus field it is bounded against has no out-of-play
    // band, so bound it to exactly the field everything else is mapped into.
    //
    // Bounds constrain the BODY, not the sprite, so bounding it to the bare field
    // still drew the ball outside the field by the margin above — at the floor its
    // visual bottom reached 381.3 against a 368px field, i.e. ~13px of ball smeared
    // into the black HUD strip (and the same overhang off the right edge, where it
    // is clipped by the canvas). Inset the bounds by that margin so the ball is
    // drawn inside its own playfield, which is what a solid world edge means in the
    // C++ — there the ball IS its collision circle (wizball.txt:20, wizball_radius
    // 24 = the full 48px sprite).
    this.physics.world.setBounds(
      BALL_MARGIN, BALL_MARGIN, SCREEN_W - BALL_MARGIN * 2, SCREEN_H - BALL_MARGIN * 2
    );

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // setCircle's offset used to be (4,4) — the value that centres a radius-12
    // circle in a 32px frame, not in this sprite's 48px one — so the hitbox sat
    // 5.3px up and left of the ball actually drawn. Centre it the way GameScene
    // does (GameScene.ts:1472).
    const ballBodyOffset = (BALL_FRAME - BALL_BODY_RADIUS * 2) / 2;
    body.setCircle(BALL_BODY_RADIUS, ballBodyOffset, ballBodyOffset);
    body.setCollideWorldBounds(true);
  }

  private createCatellite(): void {
    // C++ pre_equip_wizball (wizball.txt:942-948) spawns the catellite on the
    // bonus level too, when the loadout has it.
    if (!(this.weaponCollection & WeaponFlag.CATELLITE)) return;

    this.catellite = this.physics.add.sprite(
      SCREEN_W / 2 - CATELLITE_LAG_DISTANCE, fieldY(208), 'catellite'
    );
    this.catellite.setDisplaySize(24, 24);
    this.catellite.setDepth(9);
    const body = this.catellite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    // bonus_wave_enemy.txt:151-152 — enemies collide with ENT_TYPE_CATELLITE too.
    this.physics.add.overlap(this.catellite, this.enemies!, this.onCatelliteHitEnemy, undefined, this);
  }

  // --- firing (C++ wizball.txt firing_routine :517-560) ---
  private stepFiring(fireDown: boolean, firePressed: boolean): void {
    if (this.fireDelay > 0) {
      this.fireDelay -= 1;
      return;
    }

    // wizball.txt:539-560 — a fresh press (HIT) always fires; holding (DOWN)
    // only autofires when the catellite is out.
    const hasCatellite = (this.weaponCollection & WeaponFlag.CATELLITE) !== 0 && this.catellite !== null;
    if (firePressed || (hasCatellite && fireDown)) {
      this.fireBullet();
    }
  }

  private fireBullet(): void {
    if (!this.player) return;

    const hasDouble = (this.weaponCollection & WeaponFlag.DOUBLE_FIRE) !== 0;
    const hasSpread = (this.weaponCollection & WeaponFlag.WIZ_SPREAD_FIRE) !== 0;
    const hasRearFire = (this.weaponCollection & WeaponFlag.REAR_FIRE) !== 0;

    // wizball.txt:529-535 — firing_rate depends ONLY on DOUBLE_FIRE.
    this.fireDelay = hasDouble ? DOUBLE_FIRE_RATE : NORMAL_FIRE_RATE;

    const dir = this.lastMovementDirection;

    // wizball.txt:611-619 — with rear fire the single shot ALTERNATES direction.
    let fireDir = dir;
    if (hasRearFire) {
      fireDir = this.rearFireToggle ? -dir : dir;
      this.rearFireToggle = !this.rearFireToggle;
    }

    if (hasDouble) {
      this.spawnBullet(this.player.x + fireDir * 8, this.player.y - 6, fireDir * BULLET_SPEED, 0);
      this.spawnBullet(this.player.x + fireDir * 8, this.player.y + 6, fireDir * BULLET_SPEED, 0);
    } else {
      this.spawnBullet(this.player.x + fireDir * 8, this.player.y, fireDir * BULLET_SPEED, 0);
    }

    // wizball.txt:640-665 — the 3-bullet fan is fired ON TOP of the forward shot,
    // alternating between the upper (45/90/135) and lower (225/270/315) sides.
    if (hasSpread) {
      const fan = this.spreadFlipSide ? [225, 270, 315] : [45, 90, 135];
      this.spreadFlipSide = !this.spreadFlipSide;
      for (const deg of fan) {
        const rad = (deg * Math.PI) / 180;
        this.spawnBullet(
          this.player.x, this.player.y,
          Math.cos(rad) * BULLET_SPEED, -Math.sin(rad) * BULLET_SPEED
        );
      }
    }

    this.playSfx(
      hasSpread ? 'wizball_or_cat_fire_three_way'
        : hasDouble ? 'wizball_or_cat_fire_blazers'
          : 'wizball_or_cat_fire_normal',
      0.35
    );

    if (this.catellite) this.fireCatelliteBullet();
  }

  private fireCatelliteBullet(): void {
    if (!this.catellite) return;
    const dir = this.lastMovementDirection;
    const hasCatSpread = (this.weaponCollection & WeaponFlag.CAT_SPREAD_FIRE) !== 0;

    this.spawnBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, 0, true);
    if (hasCatSpread) {
      this.spawnBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, -BULLET_SPEED * 0.2, true);
      this.spawnBullet(this.catellite.x + dir * 8, this.catellite.y, dir * BULLET_SPEED, BULLET_SPEED * 0.2, true);
    }
  }

  private spawnBullet(x: number, y: number, vx: number, vy: number, fromCat: boolean = false): void {
    if (!this.bullets) return;
    const bullet = this.bullets.create(
      x, y, 'bullets', fromCat ? 'bullets_4' : 'bullets_1'
    ) as Phaser.Physics.Arcade.Sprite;
    bullet.setDepth(8);
    bullet.setDisplaySize(fromCat ? 24 : 48, 8);
    if (fromCat) bullet.setTint(0x88aaff);
    bullet.setRotation(Math.atan2(vy, vx));
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    bullet.setVelocity(vx, vy);
  }

  // --- collisions ---
  private onBulletHitEnemy(bulletObj: unknown, enemyObj: unknown): void {
    if (this.finished) return;
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const st = enemy.getData('bonus') as BonusEnemy | undefined;
    if (!bullet.active || !enemy.active || !st || st.dying) return;

    // wizball_normal_bullet.txt:126-129 — the bullet always shatters on contact.
    bullet.destroy();

    // bonus_wave_enemy.txt:757-777 — an ASTEROID is not destructible: anything
    // that isn't a shield just knocks it back the way it came.
    if (st.type === WaveType.RANDOM_ASTEROIDS) {
      this.bounceAsteroid(enemy, st);
      return;
    }

    this.killBonusEnemy(enemy, st, true);
  }

  private onCatelliteHitEnemy(_catObj: unknown, enemyObj: unknown): void {
    if (this.finished) return;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const st = enemy.getData('bonus') as BonusEnemy | undefined;
    if (!enemy.active || !st || st.dying) return;

    // With the cat's bubble up it is his SHIELD the enemy touches, not him:
    // catellite_shield_swirl_layer.txt:107-123 charges the contact to
    // cat_shield_stored_health (once per frame, via its own hit_this_frame latch),
    // and bonus_wave_enemy.txt:759-765 has an asteroid blow up on any
    // ENT_TYPE_SHIELD_ENTITY "to avoid depleting it like mad" — scoring nothing
    // and not counting towards bonus_level_enemies_killed. Same shape as the
    // wizball's shield branch in onPlayerHitEnemy above.
    if (this.catShieldEnergy > 0) {
      if (!this.catShieldHitThisFrame) {
        this.catShieldHitThisFrame = true;
        this.catShieldEnergy = Math.max(0, this.catShieldEnergy - SHIELD_HIT_PENALTY);
        this.playSfx('wizball_or_catellite_shield_impact', 0.4);
        if (this.catShieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
      }
      this.killBonusEnemy(enemy, st, st.type !== WaveType.RANDOM_ASTEROIDS);
      return;
    }

    // The bare catellite is not a shield entity, so an asteroid only bounces off
    // it (bonus_wave_enemy.txt:759-777).
    if (st.type === WaveType.RANDOM_ASTEROIDS) {
      this.bounceAsteroid(enemy, st);
      return;
    }
    this.killBonusEnemy(enemy, st, true);
  }

  private onPlayerHitEnemy(_playerObj: unknown, enemyObj: unknown): void {
    if (this.finished) return;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const st = enemy.getData('bonus') as BonusEnemy | undefined;
    if (!enemy.active || !st || st.dying) return;

    // C++ wizball_shield_bubble_layer.txt:76-82, 129-143 — the shield is a
    // radius-36 ENT_TYPE_PLAYER_BULLET wrapped around the ball, so enemies die on
    // it and the ball is never reached; each frame of contact costs the shield
    // SHIELD_HIT_PENALTY frames of life.
    if (this.shieldEnergy > 0) {
      if (!this.shieldHitThisFrame) {
        this.shieldHitThisFrame = true;
        this.shieldEnergy = Math.max(0, this.shieldEnergy - SHIELD_HIT_PENALTY);
        this.playSfx('wizball_or_catellite_shield_impact', 0.4);
        if (this.shieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;
      }
      // bonus_wave_enemy.txt:759-765 — a shield-killed asteroid scores nothing
      // and is not added to bonus_level_enemies_killed.
      this.killBonusEnemy(enemy, st, st.type !== WaveType.RANDOM_ASTEROIDS);
      return;
    }

    // bonus_wave_enemy.txt:768-776 — the rammed asteroid still bounces...
    if (st.type === WaveType.RANDOM_ASTEROIDS) this.bounceAsteroid(enemy, st);

    // ...but the ball is dead either way (wizball.txt:698-712).
    this.killPlayer();
  }

  private bounceAsteroid(enemy: Phaser.Physics.Arcade.Sprite, st: BonusEnemy): void {
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    if (body.velocity.x < 0) {
      enemy.setVelocityX(-body.velocity.x);
      st.rotationSpeed = -st.rotationSpeed;
      this.playSfx('asteroid_scrape', 0.5);
    }
  }

  /**
   * C++ wizball.txt:698-712 — on the bonus level enemy/enemy-bullet contact does
   * NOT cost a life and does NOT go through function_lose_life: it posts
   * LEVEL_RESET_FLAG_WIZBALL_FINISHED, plays wizball_explode_bonus_level, spawns
   * the explosion particles and kills the ball. The controller then runs the
   * summary and drops to the laboratory (main_game_controller.txt:403-404, 409-440).
   */
  private killPlayer(): void {
    if (this.finished) return;
    this.finished = true;
    this.spawningEnabled = false;

    this.playSfx('wizball_explode_bonus_level', 0.7);

    if (this.player) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      body.enable = false;
      // particle_wizball_explode stand-in.
      this.tweens.add({
        targets: this.player,
        scale: this.player.scale * 2.4,
        alpha: 0,
        duration: 320,
        ease: 'Quad.easeOut'
      });
    }
    if (this.catellite) {
      this.tweens.add({ targets: this.catellite, alpha: 0, duration: 320 });
    }
    this.shieldEnergy = 0;
    this.shieldGfx.clear();

    // LEVEL_RESET_FLAG_WIZBALL_FINISHED (main_game_controller.txt:403-404).
    this.summaryCounter = 1;
  }

  private killBonusEnemy(enemy: Phaser.Physics.Arcade.Sprite, st: BonusEnemy, award: boolean): void {
    if (st.dying) return;
    st.dying = true;
    this.releaseFromSpawner(st);

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    if (body) body.enable = false;

    if (award) {
      this.enemiesKilled += 1;

      // Per-kill score: 20 + floor(wave_number_in_bonus_level / 3) * 10
      // (bonus_wave_enemy.txt:789-795), clamped like every other add site
      // (constant.txt:511).
      this.score = Math.min(
        MAXIMUM_POSSIBLE_SCORE, this.score + 20 + Math.floor(st.waveIndex / 3) * 10
      );

      // BONUS_LIFE enemy grants an extra life, capped at 9 by
      // function_gain_life.txt (`temp_1 + 1 !> 9`).
      if (st.type === WaveType.BONUS_LIFE) {
        this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.playSfx('special_paintball_pickup_extra_life', 0.6);
      }

      this.scoreText.setText(`SCORE ${this.score}`);
      this.killText.setText(`KILLS ${this.enemiesKilled}`);
    }

    this.tweens.add({
      targets: enemy,
      scale: enemy.scale * 1.8,
      alpha: 0,
      duration: 150,
      onComplete: () => enemy.destroy()
    });

    this.playSfx('enemy_explode', 0.5);
  }

  /** bonus_wave_enemy.txt:762-763, 781-782, 829-838 — drop out of the child count. */
  private releaseFromSpawner(st: BonusEnemy): void {
    if (st.counted && st.spawner) {
      st.spawner.alive -= 1;
      st.counted = false;
    }
  }

  // --- wave spawner (C++ bonus_wave_spawner.txt) ---
  private createSpawner(def: WaveDef): WaveSpawner {
    // bonus_wave_spawner.txt:36-102 — the per-type spawn cadence.
    let pacing = SpawnPacing.WAIT_SET_TIME;
    let timer = 0;
    let threshold = 0;

    switch (def.type) {
      case WaveType.SLOW_PLANES: timer = 12; break;
      case WaveType.REGULAR_PAINTBALL_BOUNCE: timer = 2; break;
      case WaveType.RANDOM_CIRCLES:
        pacing = SpawnPacing.WAIT_UNTIL_LOW_ENOUGH_COUNT; threshold = 6; timer = 30; break;
      case WaveType.RANDOM_ASTEROIDS: timer = 45; break;
      case WaveType.RANDOM_PAINTBALL_BOUNCE: timer = 20; break;
      case WaveType.FILTH: timer = (def.flags & WaveFlag.ALTERNATE_MODE_1) ? 50 : 8; break;
      case WaveType.BONUS_LIFE: timer = 0; break;
      case WaveType.NEW_8_WAY_SHOOTERS: timer = (def.flags & WaveFlag.ALTERNATE_MODE_1) ? 75 : 30; break;
      case WaveType.NEW_ROTATE_SHOOTERS:
        pacing = SpawnPacing.WAIT_UNTIL_LOW_ENOUGH_COUNT; timer = 5; threshold = 10; break;
      case WaveType.UP_AND_DOWNERS: timer = 15; break;
      default: timer = 12; break;
    }

    const spawner: WaveSpawner = {
      type: def.type,
      flags: def.flags,
      pause: def.pause,
      waveIndex: this.waveIndex,
      remaining: def.size,
      pacing,
      timer,
      threshold,
      counter: 0,
      state: SpawnerState.COUNTDOWN,
      alive: 0
    };

    // bonus_wave_spawner.txt:106-108 — DO_NOT_WAIT releases the controller before
    // a single enemy has been spawned.
    if (spawner.pause === PauseCond.DO_NOT_WAIT) this.goAheadQueue += 1;

    this.spawnFromSpawner(spawner); // falls straight through into .spawn_enemy
    return spawner;
  }

  private spawnFromSpawner(spawner: WaveSpawner): void {
    this.spawnEnemy(spawner);

    spawner.counter = spawner.timer;
    // bonus_wave_spawner.txt:122-133 — SIMULTANEOUS squirts the wave out in pairs
    // by zeroing the gap on every other enemy.
    if ((spawner.flags & WaveFlag.SIMULTANEOUS) && spawner.remaining % 2 === 0) {
      spawner.counter = 0;
    }
    spawner.state = SpawnerState.COUNTDOWN;
  }

  private stepSpawners(): void {
    for (let i = this.spawners.length - 1; i >= 0; i--) {
      const spawner = this.spawners[i];

      switch (spawner.state) {
        case SpawnerState.COUNTDOWN: {
          if (spawner.counter > 0) spawner.counter -= 1;
          if (spawner.counter === 0) {
            // bonus_wave_spawner.txt:135-141 — WAIT_UNTIL_LOW_ENOUGH_COUNT also
            // needs the field to have thinned out first.
            if (spawner.pacing === SpawnPacing.WAIT_UNTIL_LOW_ENOUGH_COUNT &&
              spawner.alive >= spawner.threshold) {
              break;
            }
            spawner.state = SpawnerState.DECISION; // .decision_time opens with `wait 1`
          }
          break;
        }

        case SpawnerState.DECISION: {
          // bonus_wave_spawner.txt:149-180
          spawner.remaining -= 1;
          if (spawner.flags & WaveFlag.X_TOGGLE) spawner.flags ^= WaveFlag.X_INVERT;
          if (spawner.flags & WaveFlag.Y_TOGGLE) spawner.flags ^= WaveFlag.Y_INVERT;

          if (spawner.remaining <= 0) {
            if (spawner.pause === PauseCond.WAIT_UNTIL_LAST_DEAD) {
              spawner.state = SpawnerState.WAIT_LAST_DEAD;
            } else {
              if (spawner.pause === PauseCond.WAIT_UNTIL_LAST_SPAWNED) this.goAheadQueue += 1;
              this.spawners.splice(i, 1);
            }
          } else {
            this.spawnFromSpawner(spawner);
          }
          break;
        }

        case SpawnerState.WAIT_LAST_DEAD: {
          // bonus_wave_spawner.txt:183-192 — the controller is held here until
          // every child of this wave is dead or has left the screen.
          if (spawner.alive <= 0) {
            this.goAheadQueue += 1;
            this.spawners.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  private spawnEnemy(spawner: WaveSpawner): void {
    if (!this.enemies) return;

    const invertX = (spawner.flags & WaveFlag.X_INVERT) !== 0;
    const invertY = (spawner.flags & WaveFlag.Y_INVERT) !== 0;
    const alt1 = (spawner.flags & WaveFlag.ALTERNATE_MODE_1) !== 0;

    // Defaults; each case below follows bonus_wave_enemy.txt:196-560. C++ speeds
    // are fixed point per frame, converted here with VEL_TO_PX_S / ACC_TO_PX_S2.
    let x = RIGHT_SIDE_BASE_X;
    let y = fieldY(208);
    let vx = 0;
    let vy = 0;
    let ax = 0;
    let ay = 0;
    let textureKey = 'enemies02';
    let frame: string | number = 8;
    let size = 28;
    let bounceY = false;
    let fadeIn = false;
    let angleCounter = 0;
    let rotationSpeed = 0;
    let storedVx = 0;
    let storedVy = 0;

    switch (spawner.type) {
      case WaveType.SLOW_PLANES: {
        // bonus_wave_enemy.txt:196-217 — enter from the left edge; the arc and the
        // 0 -> 4px/frame ramp are driven per frame in stepEnemies().
        x = LEFT_SIDE_BASE_X;
        y = invertY ? fieldY(BONUS_FIELD_H - 24) : fieldY(24);
        angleCounter = -18000;
        frame = 8;
        break;
      }

      case WaveType.REGULAR_PAINTBALL_BOUNCE: {
        // bonus_wave_enemy.txt:218-251 — a 3-second crossing, falling/rising under
        // a constant acceleration and bouncing off the field edges.
        x = invertX ? LEFT_SIDE_BASE_X : RIGHT_SIDE_BASE_X;
        vx = (invertX ? 900 : -900) * VEL_TO_PX_S;
        y = invertY ? fieldY(BONUS_FIELD_H - 160) : fieldY(160);
        ay = (invertY ? -120 : 120) * ACC_TO_PX_S2 * FIELD_SCALE_Y;
        textureKey = 'paintballs';
        frame = alt1 ? 'paintballs_1' : 'paintballs_0';
        size = 22;
        bounceY = true;
        break;
      }

      case WaveType.RANDOM_ASTEROIDS: {
        // bonus_wave_enemy.txt:252-276 — 1280-unit drift in from the right at
        // 90 +/- (20..60) degrees, spinning, bouncing off the top/bottom.
        const spread = Phaser.Math.Between(2000, 6000) * (Math.random() < 0.5 ? -1 : 1);
        const angle = ((spread + 9000) / 100) * Math.PI / 180;
        vx = -1280 * Math.sin(angle) * VEL_TO_PX_S;
        vy = 1280 * Math.cos(angle) * VEL_TO_PX_S * FIELD_SCALE_Y;
        x = RIGHT_SIDE_BASE_X;
        y = fieldY(Phaser.Math.Between(24, BONUS_FIELD_H - 24));
        rotationSpeed = Phaser.Math.FloatBetween(-0.06, -0.03);
        frame = 51;
        size = 30;
        bounceY = true;
        break;
      }

      case WaveType.RANDOM_CIRCLES: {
        // bonus_wave_enemy.txt:277-320 — spawn on the top OR bottom edge at least
        // 80px from the ball, then accelerate inwards for 45 frames.
        const edge = Math.random() < 0.5 ? -1 : 1;
        const angle = (Phaser.Math.Between(2000, 7000) / 100) * Math.PI / 180;
        const pos = this.findFreeSpawnPoint(
          () => Phaser.Math.Between(64, 576),
          () => fieldY(208 + edge * Phaser.Math.Between(128, 192))
        );
        x = pos.x;
        y = pos.y;
        ax = 32 * Math.cos(angle) * ACC_TO_PX_S2 * (x > 320 ? -1 : 1);
        ay = -32 * Math.sin(angle) * edge * ACC_TO_PX_S2 * FIELD_SCALE_Y;
        textureKey = 'enemies';
        frame = 49;
        size = 22;
        break;
      }

      case WaveType.RANDOM_PAINTBALL_BOUNCE: {
        // bonus_wave_enemy.txt:321-344 — always from the left, random speed, and a
        // coin-flip on which way it arcs.
        x = LEFT_SIDE_BASE_X;
        const upper = Math.random() < 0.5;
        y = upper ? fieldY(160) : fieldY(BONUS_FIELD_H - 160);
        ay = (upper ? 120 : -120) * ACC_TO_PX_S2 * FIELD_SCALE_Y;
        vx = Phaser.Math.Between(256, 1024) * VEL_TO_PX_S;
        textureKey = 'paintballs';
        frame = 'paintballs_2';
        size = 22;
        bounceY = true;
        break;
      }

      case WaveType.FILTH: {
        // bonus_wave_enemy.txt:345-381 — the filth rides the bonus_level_fuzz
        // special path. That path table is not transcribed in the port yet, so the
        // swoop is approximated with a sine weave across the field.
        x = invertX ? LEFT_SIDE_BASE_X : RIGHT_SIDE_BASE_X;
        y = invertY ? fieldY(BONUS_FIELD_H - 24) : fieldY(24);
        vx = (invertX ? 640 : -640) * VEL_TO_PX_S;
        textureKey = 'enemies02';
        frame = 0;
        size = 32;
        break;
      }

      case WaveType.BONUS_LIFE: {
        // bonus_wave_enemy.txt:382-397 — 6.2s to cross, 1.75s per bounce.
        x = RIGHT_SIDE_BASE_X;
        y = fieldY(BONUS_FIELD_H - 64);
        vx = -440 * VEL_TO_PX_S;
        ay = -70 * ACC_TO_PX_S2 * FIELD_SCALE_Y;
        textureKey = 'wizball';
        frame = 0;
        size = 24;
        bounceY = true;
        break;
      }

      case WaveType.NEW_8_WAY_SHOOTERS: {
        frame = 67;
        size = 28;
        if (alt1) {
          // bonus_wave_enemy.txt:404-459 — fades in away from the ball, sits
          // still, then drifts off at a random slow angle and stops again.
          const pos = this.findFreeSpawnPoint(
            () => Phaser.Math.Between(64, 576),
            () => fieldY(Phaser.Math.Between(64, BONUS_FIELD_H - 64))
          );
          x = pos.x;
          y = pos.y;
          const a = (Phaser.Math.Between(0, 15) * (36000 / 16) / 100) * Math.PI / 180;
          const speed = Phaser.Math.Between(0, 3) * 256;
          storedVx = speed * Math.sin(a) * VEL_TO_PX_S;
          storedVy = speed * Math.cos(a) * VEL_TO_PX_S * FIELD_SCALE_Y;
          fadeIn = true;
        } else {
          // bonus_wave_enemy.txt:460-479 — basic variety: straight across the top
          // or bottom in 3 seconds.
          x = RIGHT_SIDE_BASE_X;
          y = invertY ? fieldY(BONUS_FIELD_H - 24) : fieldY(24);
          vx = -910 * VEL_TO_PX_S;
        }
        break;
      }

      case WaveType.NEW_ROTATE_SHOOTERS: {
        // bonus_wave_enemy.txt:483-519 — fades in at a spot at least 80px from the
        // ball and stays put.
        const pos = this.findFreeSpawnPoint(
          () => Phaser.Math.Between(64, 576),
          () => fieldY(Phaser.Math.Between(64, BONUS_FIELD_H - 64))
        );
        x = pos.x;
        y = pos.y;
        frame = 67;
        size = 28;
        fadeIn = true;
        break;
      }

      case WaveType.UP_AND_DOWNERS: {
        // bonus_wave_enemy.txt:520-560, 726-739 — crosses in 3.25s weaving on a
        // 64px sine (400 hundredths of a degree per frame).
        y = invertY ? fieldY(BONUS_FIELD_H - 112) : fieldY(112);
        x = invertX ? LEFT_SIDE_BASE_X : RIGHT_SIDE_BASE_X;
        vx = (invertX ? 900 : -900) * VEL_TO_PX_S;
        textureKey = 'enemies';
        frame = 51;
        size = 26;
        break;
      }

      default:
        return;
    }

    if (textureKey === 'enemies02' && !this.textures.exists('enemies02')) textureKey = 'enemies';

    const enemy = this.enemies.create(x, y, textureKey, frame) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(6);
    enemy.setDisplaySize(size, size);
    if (fadeIn) enemy.setAlpha(0);

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    enemy.setVelocity(vx, vy);
    enemy.setAcceleration(ax, ay);

    const counted = spawner.pause === PauseCond.WAIT_UNTIL_LAST_DEAD;
    // bonus_wave_enemy.txt:163-165 — only LAST_DEAD waves keep a child count.
    if (counted) spawner.alive += 1;

    const state: BonusEnemy = {
      type: spawner.type,
      waveIndex: spawner.waveIndex,
      spawner,
      counted,
      dying: false,
      invertX,
      invertY,
      startY: y,
      bounceY,
      fadeIn,
      counter: 0,
      angleCounter,
      rotationSpeed,
      storedVx,
      storedVy
    };
    enemy.setData('bonus', state);
  }

  /**
   * bonus_wave_enemy.txt:296-316 — re-roll the spawn point until it is at least
   * 80px away from the wizball (so nothing materialises on top of the player).
   */
  private findFreeSpawnPoint(rollX: () => number, rollY: () => number): { x: number; y: number } {
    let x = rollX();
    let y = rollY();
    for (let tries = 0; tries < 16 && this.player; tries++) {
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= 80) break;
      x = rollX();
      y = rollY();
    }
    return { x, y };
  }

  // --- per-frame enemy behaviour (bonus_wave_enemy.txt main_loop :582-753) ---
  private stepEnemies(): void {
    if (!this.enemies) return;
    const children = this.enemies.getChildren();

    for (let i = children.length - 1; i >= 0; i--) {
      const enemy = children[i] as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const st = enemy.getData('bonus') as BonusEnemy | undefined;
      if (!st || st.dying) continue;
      const body = enemy.body as Phaser.Physics.Arcade.Body;

      if (st.fadeIn && enemy.alpha < 1) {
        enemy.setAlpha(Math.min(1, enemy.alpha + 15 / 255)); // +15 alpha per frame
      }

      switch (st.type) {
        case WaveType.SLOW_PLANES: {
          // bonus_wave_enemy.txt:592-620 — y is a full cosine of the screen width
          // (amplitude 92) and x accelerates from 0 to 4px/frame.
          st.angleCounter = Math.min(0, st.angleCounter + 360);
          const speedUnits = 512 * Math.cos((st.angleCounter / 100) * Math.PI / 180) + 512;
          enemy.setVelocityX(speedUnits * VEL_TO_PX_S);
          const wave = fieldY(92);
          const phase = (enemy.x / 640) * Math.PI * 2;
          enemy.y = st.invertY
            ? st.startY - wave - wave * Math.cos(phase)
            : st.startY + wave + wave * Math.cos(phase);
          break;
        }

        case WaveType.RANDOM_ASTEROIDS: {
          enemy.rotation += st.rotationSpeed; // bonus_wave_enemy.txt:632-639
          break;
        }

        case WaveType.RANDOM_CIRCLES: {
          // bonus_wave_enemy.txt:641-660 — acceleration cuts out after 45 frames.
          st.counter += 1;
          if (st.counter === 45) enemy.setAcceleration(0, 0);
          break;
        }

        case WaveType.FILTH: {
          // Approximated swoop (see spawnEnemy) — the real one is a special path.
          // Kept one-sided so the filth always dives INTO the field, never out of
          // the edge it entered from.
          st.angleCounter += 250;
          const swoop = fieldY(80) * (1 - Math.cos((st.angleCounter / 100) * Math.PI / 180));
          enemy.y = st.invertY ? st.startY - swoop : st.startY + swoop;
          break;
        }

        case WaveType.NEW_8_WAY_SHOOTERS: {
          // bonus_wave_enemy.txt:699-716 — alternate mode drifts for a while, then
          // parks itself again.
          if (st.storedVx !== 0 || st.storedVy !== 0 || st.counter > 0) {
            st.counter += 1;
            if (st.counter === 90) {
              enemy.setVelocity(st.storedVx, st.storedVy);
            } else if (st.counter === 480) {
              st.storedVx = body.velocity.x;
              st.storedVy = body.velocity.y;
              enemy.setVelocity(0, 0);
              st.counter = 0;
            }
          }
          break;
        }

        case WaveType.UP_AND_DOWNERS: {
          // bonus_wave_enemy.txt:726-739 — y = start - 64 * sin(counter).
          st.angleCounter += 400;
          enemy.y = st.startY - fieldY(64) * Math.sin((st.angleCounter / 100) * Math.PI / 180);
          break;
        }

        default:
          break;
      }

      // Vertical world edges are solid with a -100 coefficient for the bouncing
      // types (bonus_wave_enemy.txt:156, 246-247, 273-274, 394-395).
      if (st.bounceY) {
        const half = enemy.displayHeight / 2;
        if (enemy.y < half && body.velocity.y < 0) {
          enemy.y = half;
          enemy.setVelocityY(-body.velocity.y);
          this.playSfx('enemy_bounce', 0.25);
        } else if (enemy.y > SCREEN_H - half && body.velocity.y > 0) {
          enemy.y = SCREEN_H - half;
          enemy.setVelocityY(-body.velocity.y);
          this.playSfx('enemy_bounce', 0.25);
        }
      }

      // check_if_off_screen_and_retire (bonus_wave_enemy.txt:827-845). The C++ only
      // tests x; the y test is a port-side leak guard for anything (circles) that
      // drifts out through the top or bottom instead.
      if (enemy.x < LEFT_SIDE_BASE_X || enemy.x > RIGHT_SIDE_BASE_X ||
        enemy.y < -96 || enemy.y > SCREEN_H + 96) {
        this.releaseFromSpawner(st);
        enemy.destroy();
      }
    }
  }

  private stepBullets(): void {
    if (!this.bullets) return;
    const children = this.bullets.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      const bullet = children[i] as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) continue;
      // wizball_normal_bullet.txt:78-84 — bullets die once off screen.
      if (bullet.x < -64 || bullet.x > SCREEN_W + 64 || bullet.y < -64 || bullet.y > SCREEN_H + 64) {
        bullet.destroy();
      }
    }
  }

  // --- controller (C++ main_game_controller.txt bonus_level_handler :376-470) ---
  private stepController(): void {
    if (!this.spawningEnabled) return;

    // main_game_controller.txt:391-401 — ONE queued event is read per frame; a
    // MOVE_TO_NEXT_BONUS_WAVE arms the PREVIOUS row's "after wave wait" and reads
    // the next row of bonus_wave_order.
    if (this.goAheadQueue > 0) {
      this.goAheadQueue -= 1;
      this.waveWaitFrames = this.waveIndex >= 0 ? WAVE_ORDER[this.waveIndex].afterWait : 50;
      this.waveIndex += 1;

      if (this.waveIndex >= WAVE_ORDER.length) {
        this.goToLaboratory();
        return;
      }
      this.pendingWave = WAVE_ORDER[this.waveIndex];
      this.waveText.setText(`WAVE ${this.waveIndex + 1}/${WAVE_ORDER.length}`);
    }

    if (this.waveWaitFrames > 0) this.waveWaitFrames -= 1; // main_game_controller.txt:442

    // main_game_controller.txt:444-467 — a wave only goes out once the after-wave
    // wait has run down AND a row is armed (wave_type != CONST_UNSET), which only
    // happens after the previous spawner posted its go-ahead.
    if (this.waveWaitFrames === 0 && this.pendingWave) {
      const def = this.pendingWave;
      this.pendingWave = null;

      if (def.type === WaveType.FINISHED) {
        // main_game_controller.txt:452-453 — clearing the table drops straight to
        // the laboratory. The kills*40 summary is the DEATH path only (:403-404).
        this.goToLaboratory();
        return;
      }

      if (def.type === WaveType.SLOW_STARS) {
        // main_game_controller.txt:454-458 — slow the stars and move on at once.
        this.starSpeedMul = 0.35;
        this.goAheadQueue += 1;
        return;
      }

      this.spawners.push(this.createSpawner(def));
    }
  }

  // --- end-of-round summary (main_game_controller.txt:409-440) ---
  private stepSummary(): void {
    if (this.summaryCounter <= 0) return;

    if (this.summaryCounter === 1) {
      this.showSummary();
    } else if (this.summaryCounter === 30) {
      // main_game_controller.txt:425-431 — the bonus is banked 30 frames in, and
      // :430 caps the add with `!> MAXIMUM_POSSIBLE_SCORE` exactly like every
      // other score write (constant.txt:511). This site used to be the one add
      // in the codebase left unclamped, so a near-max score plus a big kill count
      // (9,999,994 + 100 kills) rolled straight past the cap to 10003994 — which
      // is then drawn in the HUD and forwarded verbatim to the laboratory.
      this.score = Math.min(MAXIMUM_POSSIBLE_SCORE, this.score + this.enemiesKilled * 40);
      this.scoreText.setText(`SCORE ${this.score}`);
    }

    this.summaryCounter += 1;

    if (this.summaryCounter === 200) {
      this.goToLaboratory();
    }
  }

  private showSummary(): void {
    this.spawningEnabled = false;
    this.spawners = [];
    // Kill the death tweens first: their onComplete would otherwise fire against
    // an object the group has already destroyed.
    this.enemies?.getChildren().forEach(child => this.tweens.killTweensOf(child));
    this.enemies?.clear(true, true);
    this.bullets?.clear(true, true);

    const summaryBonus = this.enemiesKilled * 40;

    this.add.rectangle(SCREEN_W / 2, SCREEN_H / 2, SCREEN_W, SCREEN_H, 0x000000, 0.6).setDepth(100);

    // textfiles/bonus_level_text.txt — "BONUS = 40 * <killed> = <bonus>".
    this.add.text(SCREEN_W / 2, 150, 'BONUS = 40 *', {
      fontSize: '22px',
      color: '#88ff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);

    this.add.text(SCREEN_W / 2, 186, `${this.enemiesKilled}`, {
      fontSize: '26px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);

    this.add.text(SCREEN_W / 2, 222, `= ${summaryBonus}`, {
      fontSize: '22px',
      color: '#ffff88',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(101);
  }

  private goToLaboratory(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.spawningEnabled = false;
    this.finished = true;

    // Forward the whole init-data contract with the updated score/lives. The
    // level window (levelCompletion/minOpenLevel/maxOpenLevel) is pure
    // pass-through: nothing in this scene reads it, but LaboratoryScene relays it
    // on to GameScene (LaboratoryScene.ts:32-34, :71-73, :264-266) so it survives
    // the trip. The two shield remainders do NOT: the lab neither declares nor
    // relays them yet, so they stop there and the ball/cat arrive back in
    // GameScene with a fresh 0. They are still sent so that relay only has to be
    // added at the lab end — do not "fix" that by reconstructing the counters
    // from the bitflags, which is exactly the guesswork this parity pass removed.
    this.scene.start('Laboratory', {
      level: this.level,
      score: this.score,
      weaponCollection: this.weaponCollection,
      startingLoadout: this.startingLoadout,
      lives: this.lives,
      levelProgress: this.levelProgress,
      cauldronFill: this.cauldronFill,
      shieldEnergy: this.shieldEnergy,
      catShieldEnergy: this.catShieldEnergy,
      levelCompletion: this.levelCompletion,
      minOpenLevel: this.minOpenLevel,
      maxOpenLevel: this.maxOpenLevel
    });
  }

  update(_time: number, delta: number): void {
    // Input is sampled once per rendered frame, then the simulation is advanced in
    // fixed 60Hz frames — every counter borrowed from the C++ is in frames.
    const touch = (window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch || {};
    const fireDown = this.fireKey.isDown || !!touch.fire;
    // The press edge is latched rather than used directly: on a display faster
    // than 60Hz some rendered frames advance no simulation frame at all, and a
    // press sampled on one of those would otherwise be thrown away.
    if (fireDown && !this.firePrevDown) this.firePending = true;
    this.firePrevDown = fireDown;

    if (!this.finished) this.handlePlayerMovement(touch);

    this.frameAccumulator += delta / FRAME_MS;
    let steps = Math.floor(this.frameAccumulator);
    this.frameAccumulator -= steps;
    if (steps > MAX_FRAME_STEPS) steps = MAX_FRAME_STEPS;

    for (let i = 0; i < steps; i++) {
      this.stepFrame(fireDown, this.firePending);
      this.firePending = false; // a HIT is a single-frame edge
    }

    this.drawStarfield();
    this.drawShield();
  }

  private stepFrame(fireDown: boolean, firePressed: boolean): void {
    this.stepStars();

    if (!this.finished) {
      this.shieldHitThisFrame = false;
      this.catShieldHitThisFrame = false;
      this.stepFiring(fireDown, firePressed);
      this.stepCatellite();
      this.stepShieldCounter();
      this.stepEnemies();
      this.stepBullets();
      this.stepSpawners();
      this.stepController();
    }

    this.stepSummary();
  }

  private handlePlayerMovement(touch: Record<string, boolean>): void {
    if (!this.player) return;

    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || touch.moveLeft) vx -= PLAYER_SPEED;
    if (this.cursors.right?.isDown || touch.moveRight) vx += PLAYER_SPEED;
    if (this.cursors.up?.isDown || touch.moveUp) vy -= PLAYER_SPEED;
    if (this.cursors.down?.isDown || touch.moveDown) vy += PLAYER_SPEED;
    this.player.setVelocity(vx, vy);

    // C++ last_movement_direction, which is what firing_direction reads
    // (wizball.txt:525).
    if (vx < 0) this.lastMovementDirection = -1;
    else if (vx > 0) this.lastMovementDirection = 1;
  }

  private stepCatellite(): void {
    if (!this.catellite || !this.player) return;

    // C++ catellite.txt following mode: trail 64px behind the ball on a 10-frame
    // vertical lag buffer (mirrors GameScene.updateCatellite).
    this.catellitePrevY.push(this.player.y);
    if (this.catellitePrevY.length > 10) this.catellitePrevY.shift();

    const targetX = this.player.x - this.lastMovementDirection * CATELLITE_LAG_DISTANCE;
    const targetY = this.catellitePrevY[0] ?? this.player.y;
    this.catellite.x += Phaser.Math.Clamp(
      targetX - this.catellite.x, -CATELLITE_FOLLOW_SPEED, CATELLITE_FOLLOW_SPEED);
    this.catellite.y += Phaser.Math.Clamp(
      targetY - this.catellite.y, -CATELLITE_FOLLOW_SPEED, CATELLITE_FOLLOW_SPEED);
  }

  private stepShieldCounter(): void {
    // C++ update_shield_counter (wizball.txt:1118-1138) — the shield burns one
    // frame of stored health per frame and drops its bitflag when it runs out.
    if (this.shieldEnergy > 0) {
      this.shieldEnergy -= 1;
      if (this.shieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.INVULNERABILITY;
    }

    // :1130-1136 does the identical thing to cat_shield_stored_health right after,
    // dropping CATELLITE_INVULNERABILITY on its own when that counter empties.
    if (this.catShieldEnergy > 0) {
      this.catShieldEnergy -= 1;
      if (this.catShieldEnergy === 0) this.weaponCollection &= ~WeaponFlag.CATELLITE_INVULNERABILITY;
    }
  }

  private drawShield(): void {
    this.shieldGfx.clear();
    if (this.finished) return;

    if (this.shieldEnergy > 0 && this.player) {
      this.strokeShieldBubble(this.player.x, this.player.y, this.shieldEnergy, 24, 19);
    }

    // catellite_shield_swirl_layer.txt:75-77 pins the swirl to parent.world_x/y,
    // so the cat's bubble rides the cat exactly like the ball's rides the ball —
    // drawn a little tighter because the catellite sprite is 24px, not 32.
    if (this.catShieldEnergy > 0 && this.catellite) {
      this.strokeShieldBubble(this.catellite.x, this.catellite.y, this.catShieldEnergy, 19, 15);
    }
  }

  private strokeShieldBubble(x: number, y: number, energy: number, outer: number, inner: number): void {
    // Flicker out over the last second, like the collapsing bubble
    // (SHIELD_DEPLETION_WARNING_THRESHOLD, wizball_shield_bubble_layer.txt /
    // catellite_shield_swirl_layer.txt:81-92).
    const dim = energy < 60 && Math.floor(energy / 4) % 2 === 0;
    const alpha = dim ? 0.2 : 0.6;
    this.shieldGfx.lineStyle(2, 0x88ccff, alpha);
    this.shieldGfx.strokeCircle(x, y, outer);
    this.shieldGfx.lineStyle(1, 0xccf0ff, alpha * 0.7);
    this.shieldGfx.strokeCircle(x, y, inner);
  }
}
