import * as Phaser from 'phaser';
import { Depth } from '../config/depths';
import {
  WaveConfig,
  BULLET_TYPE_NONE,
  BULLET_TYPE_SINGLE_DIRECTED,
  BULLET_TYPE_SPREAD,
  BULLET_FREQUENCY_RANDOM,
  BULLET_FREQUENCY_FIXED,
  POSITION_TOP,
  POSITION_MIDDLE,
  POSITION_TOP_MIDDLE,
  POSITION_BOTTOM,
  POSITION_TOP_BOTTOM,
  POSITION_MIDDLE_BOTTOM,
  POSITION_ALL,
  VERTICAL_PLACEMENT_UNSET,
  VERTICAL_BOUNCE_FLOOR,
  VERTICAL_BOUNCE_ROOF,
  VERTICAL_POSITION_TOP,
  VERTICAL_POSITION_MIDDLE,
  VERTICAL_POSITION_BOTTOM,
} from '../data/waves';
import { EnemyType } from '../types/enemies';
import type { ParsedTilemap, SpawnPoint } from './TilemapParser';
import { SpecialPath } from './SpecialPath';
import {
  SOLID_DIAMOND_SPECIAL_PATH,
  FUZZ_TYPE_A_SPECIAL_PATH,
  FUZZ_TYPE_B_SPECIAL_PATH,
} from '../data/paths';

const BITSHIFT = 8;
const PRIVATE_SCALE = 1 << BITSHIFT;
// C++ generic_level_enemy.txt:143-144 — velocities are fixed-point per FRAME
// (x/PRIVATE_SCALE px/frame, so 60/PRIVATE_SCALE gives px/s) but accelerations
// are fixed-point per frame SQUARED, so gravity needs 60^2, not 60.
const GRAVITY_SCALE = 3600 / PRIVATE_SCALE;

const MINIMUM_ENEMY_BULLET_SPEED = 1536;
const MAXIMUM_ENEMY_BULLET_SPEED = 1536;
const ENEMY_BULLET_INACCURACY = 2000;
const MAX_ENEMY_BULLETS = 24;

const PLANE_BEHAVIOUR_DISTANCE_HORIZONTAL = 25600;
const PLANE_BEHAVIOUR_DISTANCE_DIAGONAL = 25600;

const UAD_BEHAVIOUR_DISTANCE_VERTICAL = 25600;
const UAD_BEHAVIOUR_DISTANCE_HORIZONTAL = 25600;
const UAD_BEHAVIOUR_LENGTH_PAUSED = 50;

const LEVEL_HEIGHT = 368;
// C++ constant.txt:185 — player_on_level_number is 0-based, so the divisor is 7.
const CONST_NUMBER_OF_LEVELS_MINUS_ONE = 7;

const SPREAD_ANGLES = [0, 4500, 9000, 13500, 18000, 22500, 27000, 31500];

const MIN_WAVE_SIZE = 8;
const MAX_WAVE_SIZE = 10;

// Paint-bubble tints (0=Red, 1=Green, 2=Blue) — matches GameScene PAINT_FRAME_COLORS.
const PAINT_TINTS = [0xff0000, 0x00ff00, 0x0000ff];
const PAINT_BUBBLE_WAVE_COUNT = 3;

interface WaveSpawnSlot {
  x: number;
  y: number;
  boxStartX: number;
  boxStartY: number;
  boxEndX: number;
  boxEndY: number;
  allowedPositions: number;
}

interface MoleculeSpawnSlot {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const SOLID_DIAMOND_PERCENTAGE_SPEED = 4000;
const SOLID_DIAMOND_START_DISTANCE = 224; // C++ constant.txt:415 — fixed path-base Y
const FUZZ_PERCENTAGE_SPEED = 2000;
const FUZZ_EXIT_SPEED = 5376;
const FUZZ_EXIT_THRESHOLD = 1000000;
// C++ function_normal_enemy_am_i_off_screen — an enemy counts as off-screen once
// it is this far from the camera centre (on-screen re-entry uses 344).
const OFF_SCREEN_DISTANCE = 368;
// C++ function_normal_enemy_am_i_on_screen — HALF_SCREEN_PLUS_ENTRANCE_PHANTOM_ZONE
// plus the vertical phantom zone, used by enemies AND enemy bullets.
const ON_SCREEN_DISTANCE = 344;
const ON_SCREEN_MIN_Y = -16;
const ON_SCREEN_MAX_Y = 432;

// C++ generic_level_enemy.txt:302-325 / 771-833 — every enemy but the fuzz cycles
// through these: hidden at its anchor until it is genuinely off-screen, then armed
// and waiting for the camera to come back, then live.
const LIFECYCLE_WAIT_OFF_SCREEN = 0;
const LIFECYCLE_WAIT_ON_SCREEN = 1;
const LIFECYCLE_ACTIVE = 2;

const BOBBLE_HAT_START_DISTANCE = 128;
const BOBBLE_HAT_GRAVITY = 64;
const BOBBLE_HAT_INITIAL_FIRING_DELAY = 200;
const BOBBLE_HAT_MIN_HORIZONTAL_SPEED = 128;
const BOBBLE_HAT_MAX_HORIZONTAL_SPEED = 256;

// C++ constant.txt:373-378
const CRABBY_BOUNCER_MIN_START_DISTANCE = 96;
const CRABBY_BOUNCER_MAX_START_DISTANCE = 144;
const CRABBY_BOUNCER_FLOOR_BOUNCE_BONUS = 128;
const CRABBY_BOUNCER_MIN_HORIZONTAL_SPEED = 128;
const CRABBY_BOUNCER_MAX_HORIZONTAL_SPEED = 256;
const CRABBY_BOUNCER_GRAVITY = 48;

// C++ constant.txt:382-386
const MOLECULE_BOUNCER_START_DISTANCE = 272;
const MOLECULE_BOUNCER_MIN_HORIZONTAL_SPEED = 128;
const MOLECULE_BOUNCER_MAX_HORIZONTAL_SPEED = 256;
const MOLECULE_BOUNCER_GRAVITY = 48;
const MOLECULE_BOUNCER_INITIAL_FIRING_DELAY = 300;

// C++ constant.txt:406-411
const PAINT_BUBBLE_START_DISTANCE = 272;
const PAINT_BUBBLE_MIN_HORIZONTAL_SPEED = 0;
const PAINT_BUBBLE_MAX_HORIZONTAL_SPEED = 256;
const PAINT_BUBBLE_MIN_GRAVITY = 40;
const PAINT_BUBBLE_MAX_GRAVITY = 56;
const PAINT_BUBBLE_MIDDLE_DEVIATION = 64;

// C++ constant.txt:348-351, 357-361
const UAD_START_DISTANCE = 32;
const UAD_MIN_SPEED = 512;
const UAD_MAX_SPEED = 768;
const UAD_SPEED_PER_LEVEL_INCREASE = 64;
const PLANE_START_DISTANCE = 96;
const PLANE_MIN_SPEED = 512;
const PLANE_MAX_SPEED = 512;
const PLANE_SPEED_PER_LEVEL_INCREASE = 64;
const PLANE_INITIAL_FIRING_DELAY = 200;

// C++ constant.txt:423-424
const SOLID_DIAMOND_DEVIANT_MIN_VERTICAL_SPEED = 512;
const SOLID_DIAMOND_DEVIANT_MAX_VERTICAL_SPEED = 768;
const SOLID_DIAMOND_INITIAL_FIRING_DELAY = 200;

// C++ spawn_molecule_bonus_wave.txt:92-105 — the scatter box is half the spawn
// box on each axis, capped at this.
const BONUS_MOLECULE_MAX_DEVIATION = 96;

interface EnemyData {
  enemyType: EnemyType;
  waveConfig: WaveConfig;
  xVelFixed: number;
  yVelFixed: number;
  gravityFixed: number;
  behaviourState: number;
  behaviourCounter: number;
  storedVerticalSpeed: number;
  storedHorizontalSpeed: number;
  firingBehaviour: number;
  firingFrequency: number;
  firingCooldown: number;
  bulletSpeedPercentage: number;
  skipFirstShot: boolean;
  directionMultiplier: number;
  // C++ lifecycle state (LIFECYCLE_*) plus the anchor and the starting
  // velocity/acceleration it is restored to every time it recycles
  // (generic_level_enemy.txt:284-285, :815-833, :885-891).
  lifecycle: number;
  startingWorldX: number;
  startingWorldY: number;
  startingXVel: number;
  startingYVel: number;
  startingYAcc: number;
  // Path-following fields (solid diamonds, fuzz)
  specialPath: SpecialPath | null;
  pathPercentage: number;
  pathPercentageSpeed: number;
  pathSection: number;
  baseWorldX: number;
  baseWorldY: number;
  // Paint-bubble colour (0=R,1=G,2=B) so the dropped paint matches the bubble.
  paintColor?: number;
}

const BEHAVIOUR_STATE_PAUSED = 0;
const BEHAVIOUR_STATE_VERTICAL = 1;
const BEHAVIOUR_STATE_HORIZONTAL = 2;
const BEHAVIOUR_STATE_DIAGONAL = 3;

export default class EnemySystem {
  private scene: Phaser.Scene;
  private enemyGroup: Phaser.Physics.Arcade.Group;
  private enemies: Phaser.Physics.Arcade.Sprite[] = [];
  private enemyBulletGroup: Phaser.Physics.Arcade.Group;
  private enemyBulletCount: number = 0;
  private playerRef: Phaser.Physics.Arcade.Sprite | null = null;

  private currentLevel: number = 1;
  private waveSpawnSlots: WaveSpawnSlot[] = [];
  private moleculeSpawnSlots: MoleculeSpawnSlot[] = [];
  private moleculePhaseActive: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.enemyGroup = this.scene.physics.add.group();
    this.enemyBulletGroup = this.scene.physics.add.group();
  }

  setPlayerReference(player: Phaser.Physics.Arcade.Sprite): void {
    this.playerRef = player;
  }

  loadEnemyQueues(): void {}

  configureLevel(parsedTilemap: ParsedTilemap | null): void {
    this.waveSpawnSlots = [];
    this.moleculeSpawnSlots = [];

    if (!parsedTilemap) {
      return;
    }

    const spawnPoints = parsedTilemap.spawnPoints;
    const childrenByParent = new Map<number, SpawnPoint[]>();

    spawnPoints.forEach(spawnPoint => {
      if (spawnPoint.parentUid < 0) {
        return;
      }

      const siblings = childrenByParent.get(spawnPoint.parentUid) ?? [];
      siblings.push(spawnPoint);
      childrenByParent.set(spawnPoint.parentUid, siblings);
    });

    spawnPoints.forEach(spawnPoint => {
      if (spawnPoint.idType !== 'C64_MAIN_LEVEL_ENEMY' || spawnPoint.script !== 'RANDOM_ENEMY_WAVE_SELECTION') {
        return;
      }

      const child = (childrenByParent.get(spawnPoint.uid) ?? []).find(
        candidate => candidate.script === 'RANDOM_ENEMY_WAVE_SELECTION_DUMMY'
      );

      this.waveSpawnSlots.push({
        x: spawnPoint.x,
        y: spawnPoint.y,
        boxStartX: spawnPoint.x,
        boxStartY: spawnPoint.y,
        boxEndX: child?.x ?? spawnPoint.x,
        boxEndY: child?.y ?? spawnPoint.y,
        allowedPositions: spawnPoint.parameters[0] || POSITION_ALL,
      });
    });

    spawnPoints.forEach(spawnPoint => {
      if (spawnPoint.idType !== 'C64_PRE_LEVEL_ENEMY' || spawnPoint.script !== 'MOLECULE_START_POSITION' || spawnPoint.parentUid >= 0) {
        return;
      }

      const child = (childrenByParent.get(spawnPoint.uid) ?? []).find(
        candidate => candidate.script === 'MOLECULE_START_POSITION'
      );

      this.moleculeSpawnSlots.push({
        minX: Math.min(spawnPoint.x, child?.x ?? spawnPoint.x),
        minY: Math.min(spawnPoint.y, child?.y ?? spawnPoint.y),
        maxX: Math.max(spawnPoint.x, child?.x ?? spawnPoint.x),
        maxY: Math.max(spawnPoint.y, child?.y ?? spawnPoint.y),
      });
    });
  }

  spawnInitialEnemies(level: number): void {
    this.clearEnemies();
    this.currentLevel = level;
    this.moleculePhaseActive = level <= 3 && this.moleculeSpawnSlots.length > 0;

    if (this.moleculePhaseActive) {
      this.spawnConfiguredMolecules();
      return;
    }

    this.spawnRegularEnemies(level);
  }

  spawnEnemies(level: number): void {
    this.clearEnemies();
    this.currentLevel = level;
    this.moleculePhaseActive = false;
    this.spawnRegularEnemies(level);
  }

  private spawnRegularEnemies(level: number): void {
    this.currentLevel = level;
    // Every shipped tilemap carries RANDOM_ENEMY_WAVE_SELECTION spawn points; if
    // one somehow doesn't, the C++ simply has no waves on that level.
    this.spawnConfiguredWaveSet(level);
  }

  maybeSpawnReplacementWave(level: number): boolean {
    if (this.getActiveEnemyCount() > 0) {
      return false;
    }

    this.spawnEnemies(level);
    return true;
  }

  isInMoleculePhase(): boolean {
    return this.moleculePhaseActive;
  }

  private spawnConfiguredMolecules(): void {
    this.moleculeSpawnSlots.forEach(slot => {
      const x = Phaser.Math.Between(slot.minX, slot.maxX);
      const y = Phaser.Math.Between(slot.minY, slot.maxY);
      const molecule = this.scene.physics.add.sprite(x, y, 'enemies', 0);
      molecule.setDisplaySize(48, 48);
      molecule.setDepth(Depth.ENEMY);

      // Same PhysicsGroup.defaults hazard as spawnEnemyFromWave — add() replays
      // setAllowGravity(true)/setCollideWorldBounds(false) over anything set
      // first, so join the group before configuring the body. The
      // collideWorldBounds value happens to match the default, but allowGravity
      // does not: these were coming out gravity-enabled.
      this.enemyGroup.add(molecule);

      const body = molecule.body as Phaser.Physics.Arcade.Body;
      body.setSize(32, 32);
      body.setCircle(16, 8, 8);
      body.setAllowGravity(false);
      body.setCollideWorldBounds(false);
      body.moves = false;

      (molecule as any)._isMolecule = true;
      this.enemies.push(molecule);
    });
  }

  private spawnConfiguredWaveSet(level: number): void {
    if (this.waveSpawnSlots.length === 0) {
      return;
    }

    const bubbleIndices = new Set<number>();
    while (bubbleIndices.size < Math.min(PAINT_BUBBLE_WAVE_COUNT, this.waveSpawnSlots.length)) {
      bubbleIndices.add(Math.floor(Math.random() * this.waveSpawnSlots.length));
    }

    // C++ spawn_paintball_wave.txt:148-149 — every paint bubble on a level is a
    // SINGLE colour: (player_on_level_number) mod 3. The completion targets need
    // other colours too, which you gather by warping to adjacent levels (each a
    // different colour); the cauldrons persist across levels. 0-indexed: port
    // level 1 -> RED, 2 -> GREEN, 3 -> BLUE, 4 -> RED, ...
    const levelPaintColor = ((level - 1) % 3 + 3) % 3;

    this.waveSpawnSlots.forEach((slot, index) => {
      const boxMinY = Math.min(slot.boxStartY, slot.boxEndY);
      const boxMaxY = Math.max(slot.boxStartY, slot.boxEndY);

      let wave: WaveConfig;
      if (bubbleIndices.has(index)) {
        if (Math.random() < (1 / 13)) {
          wave = this.createWaveConfig(EnemyType.BONUS_MOLECULE, level, slot.allowedPositions, boxMinY, boxMaxY);
        } else {
          wave = this.createWaveConfig(EnemyType.PAINT_BUBBLES, level, slot.allowedPositions, boxMinY, boxMaxY);
          wave.paintColor = levelPaintColor;
        }
      } else {
        const type = this.pickRegularEnemyType(slot.allowedPositions);
        wave = this.createWaveConfig(type, level, slot.allowedPositions, boxMinY, boxMaxY);
      }

      this.spawnWave(wave, slot, level);
    });
  }

  private spawnWave(wave: WaveConfig, slot: WaveSpawnSlot, level: number): void {
    if (wave.type === EnemyType.BONUS_MOLECULE) {
      this.spawnBonusMoleculeWave(wave, slot, level);
      return;
    }

    // C++ random_enemy_wave_selection.txt:38-45 — the spawner entity sits at the
    // box's top-left corner and every child is placed relative to IT, so the row
    // is centred on the corner and is allowed to spill outside the box.
    const boxWidth = Math.abs(slot.boxEndX - slot.boxStartX);
    let xSpread = wave.xSpread;

    // C++ spawn_plane_wave.txt:78-96 (and every sibling script): the starting
    // deviation is computed from the UNSHRUNK spread, and only the per-child step
    // is then shrunk to fit the box. The shrink test uses wave_size, not size-1.
    let xDeviation = Math.trunc(-(wave.count * xSpread) / 2);
    while (xSpread > 1 && (xSpread * wave.count) > boxWidth) {
      xSpread -= 1;
    }

    for (let i = 0; i < wave.count; i++) {
      const x = slot.boxStartX + xDeviation;
      const y = this.pickSpawnY(wave, slot.boxStartY);
      this.spawnEnemyFromWave(x, y, wave, level);
      xDeviation += xSpread;
    }
  }

  // C++ spawn_molecule_bonus_wave.txt:71-113 — the bonus-molecule spawner first
  // re-centres itself on the box midpoint, then scatters each child by a random
  // deviation on BOTH axes (half the box, capped at ±96): a cloud, not a row.
  private spawnBonusMoleculeWave(wave: WaveConfig, slot: WaveSpawnSlot, level: number): void {
    const centreX = Math.trunc((slot.boxStartX + slot.boxEndX) / 2);
    const centreY = Math.trunc((slot.boxStartY + slot.boxEndY) / 2);

    const halfWidth = Math.min(
      BONUS_MOLECULE_MAX_DEVIATION,
      Math.trunc(Math.abs(slot.boxEndX - slot.boxStartX) / 2)
    );
    const halfHeight = Math.min(
      BONUS_MOLECULE_MAX_DEVIATION,
      Math.trunc(Math.abs(slot.boxEndY - slot.boxStartY) / 2)
    );

    for (let i = 0; i < wave.count; i++) {
      const x = centreX + Phaser.Math.Between(-halfWidth, halfWidth);
      const y = centreY + Phaser.Math.Between(-halfHeight, halfHeight);
      this.spawnEnemyFromWave(x, y, wave, level);
    }
  }

  // C++ generic_level_enemy.txt:247-282 — passed_in_*_height is a DISTANCE, not a
  // Y: temp_1 = rand(min,max); TOP_START_Y = temp_1; BOTTOM_START_Y = level_height
  // - temp_1; then top_or_bottom_flag picks which of those becomes WORLD_Y. With
  // no flag set (hollow diamonds/circles, solid-diamond deviants, bonus molecules)
  // the child simply stays where the spawner put it.
  private pickSpawnY(wave: WaveConfig, anchorY: number): number {
    const height = Phaser.Math.Between(
      Math.min(wave.minHeight, wave.maxHeight),
      Math.max(wave.minHeight, wave.maxHeight)
    );

    switch (wave.verticalPlacement) {
      case VERTICAL_BOUNCE_FLOOR:
      case VERTICAL_POSITION_BOTTOM:
        return LEVEL_HEIGHT - height;
      case VERTICAL_BOUNCE_ROOF:
      case VERTICAL_POSITION_TOP:
        return height;
      case VERTICAL_POSITION_MIDDLE:
        return LEVEL_HEIGHT / 2;
      default:
        return anchorY;
    }
  }

  // C++ spawn_paintball_wave.txt:102-135 — switch on the slot's allowed positions
  // (1=T, 2=M, 3=TM, 4=B, 5=TB, 6=MB, 7=TMB). Every shipped slot is 7, which rolls
  // floor-bounce / roof-bounce / mid-field wobble evenly.
  private pickPaintBubblePlacement(allowedPositions: number): number {
    switch (allowedPositions & POSITION_ALL) {
      case POSITION_TOP:
        return VERTICAL_BOUNCE_ROOF;
      case POSITION_MIDDLE:
        return VERTICAL_POSITION_MIDDLE;
      case POSITION_TOP_MIDDLE:
        return Math.random() < 0.5 ? VERTICAL_BOUNCE_ROOF : VERTICAL_POSITION_MIDDLE;
      case POSITION_BOTTOM:
        return VERTICAL_BOUNCE_FLOOR;
      case POSITION_TOP_BOTTOM:
        return Math.random() < 0.5 ? VERTICAL_BOUNCE_FLOOR : VERTICAL_BOUNCE_ROOF;
      case POSITION_MIDDLE_BOTTOM:
        return Math.random() < 0.5 ? VERTICAL_BOUNCE_FLOOR : VERTICAL_POSITION_MIDDLE;
      case POSITION_ALL:
      default:
        return Phaser.Math.RND.pick([
          VERTICAL_BOUNCE_FLOOR,
          VERTICAL_BOUNCE_ROOF,
          VERTICAL_POSITION_MIDDLE,
        ]);
    }
  }

  // C++ spawn_crabby_bouncer_wave.txt:113-121 / spawn_bobble_hat_wave.txt:95-103 /
  // spawn_molecule_bouncer_wave.txt:98-108 — the gravity bouncers test the slot
  // against POSITION_5_TB and roll floor-bounce or roof-bounce 50/50 when both are
  // allowed (every shipped slot is POSITION 7, so both always are).
  private pickBouncePlacement(allowedPositions: number): number {
    const tb = allowedPositions & POSITION_TOP_BOTTOM;

    if (tb === POSITION_TOP_BOTTOM) {
      return Math.random() < 0.5 ? VERTICAL_BOUNCE_FLOOR : VERTICAL_BOUNCE_ROOF;
    }
    if (tb === POSITION_BOTTOM) {
      return VERTICAL_BOUNCE_FLOOR;
    }
    return VERTICAL_BOUNCE_ROOF;
  }

  // C++ spawn_up_and_downer_wave.txt:106-114 — the same POSITION_5_TB test, but
  // up-and-downers get a static top/bottom placement rather than a bounce.
  private pickTopOrBottomPlacement(allowedPositions: number): number {
    const tb = allowedPositions & POSITION_TOP_BOTTOM;

    if (tb === POSITION_TOP_BOTTOM) {
      return Math.random() < 0.5 ? VERTICAL_POSITION_TOP : VERTICAL_POSITION_BOTTOM;
    }
    if (tb === POSITION_BOTTOM) {
      return VERTICAL_POSITION_BOTTOM;
    }
    return VERTICAL_POSITION_TOP;
  }

  private pickRegularEnemyType(allowedPositions: number): EnemyType {
    const queue = REGULAR_ENEMY_QUEUES[allowedPositions] ?? REGULAR_ENEMY_QUEUES[POSITION_ALL];
    let type = Phaser.Math.RND.pick(queue);

    if (type === EnemyType.SOLID_DIAMONDS && Math.random() > 0.5) {
      type = EnemyType.SOLID_DIAMONDS_DEVIANT;
    }

    return type;
  }

  private createWaveConfig(
    type: EnemyType,
    level: number,
    allowedPositions: number,
    boxMinY: number,
    boxMaxY: number
  ): WaveConfig {
    // C++ constant.txt:184-185 — player_on_level_number is 0-BASED. The port's
    // currentLevel is 1-based, so every level-scaled formula uses this instead
    // (matching the (level - 1) the paint colour already uses).
    const levelIndex = Math.max(0, level - 1);
    const count = this.randomWaveSize();
    let firingBehaviour = BULLET_TYPE_NONE;
    let firingFrequency = 120;
    let firingInitialDelay = 0;
    let minSpeed = 128;
    let maxSpeed = 256;
    let minVerticalSpeed = 0;
    let maxVerticalSpeed = 0;
    let gravity = 0;
    let minGravity = 0;
    let maxGravity = 0;
    let xSpread = 24;
    // C++ passed_in_min_height / passed_in_max_height + top_or_bottom_flag.
    let minHeight = 0;
    let maxHeight = 0;
    let verticalPlacement = VERTICAL_PLACEMENT_UNSET;
    // WAVE_SUB_TYPE_UNIFORM waves roll ONE speed for the whole wave and hand it
    // to every child — that is what makes a wave read as a formation.
    let uniformSpeed = 0;

    switch (type) {
      case EnemyType.PAINT_BUBBLES:
        // C++ spawn_paintball_wave.txt:143-182 (WAVE_SUB_TYPE_UNIFORM).
        uniformSpeed = Phaser.Math.Between(PAINT_BUBBLE_MIN_HORIZONTAL_SPEED, PAINT_BUBBLE_MAX_HORIZONTAL_SPEED);
        minSpeed = maxSpeed = uniformSpeed;
        minGravity = PAINT_BUBBLE_MIN_GRAVITY;
        maxGravity = PAINT_BUBBLE_MAX_GRAVITY;
        gravity = Phaser.Math.Between(minGravity, maxGravity);
        xSpread = Phaser.Math.Between(16, 32);
        verticalPlacement = this.pickPaintBubblePlacement(allowedPositions);
        if (verticalPlacement === VERTICAL_POSITION_MIDDLE) {
          // :198-200 — mid-field bubbles are seeded anywhere within ±64 of the
          // level's vertical centre.
          minHeight = (LEVEL_HEIGHT / 2) - PAINT_BUBBLE_MIDDLE_DEVIATION;
          maxHeight = (LEVEL_HEIGHT / 2) + PAINT_BUBBLE_MIDDLE_DEVIATION;
        } else {
          minHeight = maxHeight = PAINT_BUBBLE_START_DISTANCE;
        }
        // :166-171 — paint bubbles only shoot from (0-based) level 3 onwards,
        // and even then only on a per-wave rand(0,8) < level roll.
        if (levelIndex >= 3 && Phaser.Math.Between(0, 8) < levelIndex) {
          firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_RANDOM;
        }
        firingFrequency = Math.max(30, 300 - (levelIndex * 35));
        // :246 — the engine's "%" is a percentage multiply, so 20000 = twice.
        firingInitialDelay = firingFrequency * 2;
        break;

      case EnemyType.HOLLOW_DIAMONDS:
        // C++ spawn_hollow_diamond_wave.txt (WAVE_SUB_TYPE_RANDOM): per-enemy
        // speed, and the start height is the raw spawn box.
        minSpeed = 256;
        maxSpeed = 512;
        minVerticalSpeed = 256;
        maxVerticalSpeed = 768;
        minHeight = boxMinY;
        maxHeight = boxMaxY;
        xSpread = Phaser.Math.Between(16, 32);
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 300 - (levelIndex * 5));
        firingInitialDelay = 75;
        break;

      case EnemyType.CRABBY_BOUNCERS:
        // C++ spawn_crabby_bouncer_wave.txt:102-135 (WAVE_SUB_TYPE_RANDOM).
        minSpeed = CRABBY_BOUNCER_MIN_HORIZONTAL_SPEED;
        maxSpeed = CRABBY_BOUNCER_MAX_HORIZONTAL_SPEED;
        gravity = minGravity = maxGravity = CRABBY_BOUNCER_GRAVITY;
        xSpread = Phaser.Math.Between(16, 48);
        verticalPlacement = this.pickBouncePlacement(allowedPositions);
        minHeight = CRABBY_BOUNCER_MIN_START_DISTANCE;
        maxHeight = CRABBY_BOUNCER_MAX_START_DISTANCE;
        if (verticalPlacement === VERTICAL_BOUNCE_FLOOR) {
          // :131-134 — floor bouncers get a bonus so their apex still lands in
          // the same 96..144 band measured from the roof.
          minHeight += CRABBY_BOUNCER_FLOOR_BOUNCE_BONUS;
          maxHeight += CRABBY_BOUNCER_FLOOR_BOUNCE_BONUS;
        }
        // No passed_in_firing_behaviour at all in the script: crabbies never fire.
        firingFrequency = Math.max(30, 120 - (levelIndex * 5));
        firingInitialDelay = firingFrequency;
        break;

      case EnemyType.MOLECULE_BOUNCERS:
        // C++ spawn_molecule_bouncer_wave.txt:110-145 (WAVE_SUB_TYPE_UNIFORM).
        uniformSpeed = Phaser.Math.Between(MOLECULE_BOUNCER_MIN_HORIZONTAL_SPEED, MOLECULE_BOUNCER_MAX_HORIZONTAL_SPEED);
        minSpeed = maxSpeed = uniformSpeed;
        gravity = minGravity = maxGravity = MOLECULE_BOUNCER_GRAVITY;
        xSpread = Phaser.Math.Between(32, 48);
        verticalPlacement = this.pickBouncePlacement(allowedPositions);
        minHeight = maxHeight = MOLECULE_BOUNCER_START_DISTANCE;
        firingBehaviour = Math.random() < 0.5
          ? (BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED)
          : (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED);
        firingFrequency = Math.max(30, 120 - (levelIndex * 5));
        firingInitialDelay = MOLECULE_BOUNCER_INITIAL_FIRING_DELAY;
        break;

      case EnemyType.BONUS_MOLECULE:
        // C++ spawn_molecule_bonus_wave.txt:109-131 — zero horizontal/vertical
        // speed, zero gravity, no firing. They sit still (animated), scattered
        // in a cloud around the box centre, and drop a bonus pearl when killed.
        minSpeed = maxSpeed = 0;
        minVerticalSpeed = maxVerticalSpeed = 0;
        gravity = minGravity = maxGravity = 0;
        xSpread = 0;   // laid out by spawnBonusMoleculeWave, not by a row spread
        // firingBehaviour stays BULLET_TYPE_NONE
        break;

      case EnemyType.HOLLOW_CIRCLES:
        // C++ spawn_hollow_circle_wave.txt (WAVE_SUB_TYPE_RANDOM).
        minSpeed = 256;
        maxSpeed = 512;
        minVerticalSpeed = 256;
        maxVerticalSpeed = 768;
        minHeight = boxMinY;
        maxHeight = boxMaxY;
        xSpread = Phaser.Math.Between(16, 32);
        break;

      case EnemyType.SOLID_DIAMONDS:
        // C++ spawn_solid_diamond_wave.txt:97-100 — VERTICAL_POSITION_TOP at a
        // fixed 224, which is also the parametric path's base Y.
        minVerticalSpeed = maxVerticalSpeed = 256;
        verticalPlacement = VERTICAL_POSITION_TOP;
        minHeight = maxHeight = SOLID_DIAMOND_START_DISTANCE;
        xSpread = Phaser.Math.Between(32, 48);
        break;

      case EnemyType.BOBBLE_HATS:
        // C++ spawn_bobble_hat_wave.txt:105-140 — this one picks its sub-type
        // 50/50, so half the waves fly in formation and half are ragged.
        if (Math.random() < 0.5) {
          uniformSpeed = Phaser.Math.Between(BOBBLE_HAT_MIN_HORIZONTAL_SPEED, BOBBLE_HAT_MAX_HORIZONTAL_SPEED);
          minSpeed = maxSpeed = uniformSpeed;
        } else {
          minSpeed = BOBBLE_HAT_MIN_HORIZONTAL_SPEED;
          maxSpeed = BOBBLE_HAT_MAX_HORIZONTAL_SPEED;
        }
        gravity = minGravity = maxGravity = BOBBLE_HAT_GRAVITY;
        xSpread = Phaser.Math.Between(16, 48);
        verticalPlacement = this.pickBouncePlacement(allowedPositions);
        minHeight = maxHeight = BOBBLE_HAT_START_DISTANCE;
        firingBehaviour = BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 120 - (levelIndex * 5));
        firingInitialDelay = BOBBLE_HAT_INITIAL_FIRING_DELAY;
        break;

      case EnemyType.PLANES:
        // C++ spawn_plane_wave.txt:112-147 (WAVE_SUB_TYPE_UNIFORM).
        uniformSpeed = Phaser.Math.Between(PLANE_MIN_SPEED, PLANE_MAX_SPEED)
          + (levelIndex * PLANE_SPEED_PER_LEVEL_INCREASE);
        minSpeed = maxSpeed = uniformSpeed;
        // :146-147 — the diagonal leg's vertical speed is half the horizontal
        // one. Without this the "diagonal" phase is flat.
        minVerticalSpeed = maxVerticalSpeed = Math.trunc(uniformSpeed / 2);
        verticalPlacement = VERTICAL_POSITION_TOP;
        minHeight = maxHeight = PLANE_START_DISTANCE;
        xSpread = Phaser.Math.Between(16, 32);
        firingBehaviour = Math.random() < 0.5
          ? (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED)
          : BULLET_TYPE_NONE;
        firingFrequency = Math.max(30, 120 - (levelIndex * 5));
        firingInitialDelay = PLANE_INITIAL_FIRING_DELAY;
        break;

      case EnemyType.UP_AND_DOWNERS:
        // C++ spawn_up_and_downer_wave.txt:112-140 (WAVE_SUB_TYPE_UNIFORM).
        uniformSpeed = Phaser.Math.Between(UAD_MIN_SPEED, UAD_MAX_SPEED)
          + (levelIndex * UAD_SPEED_PER_LEVEL_INCREASE);
        minSpeed = maxSpeed = uniformSpeed;
        // :139-140 — vertical speed is the SAME rolled value as horizontal
        // (level bonus included); the leg durations are derived from it.
        minVerticalSpeed = maxVerticalSpeed = uniformSpeed;
        verticalPlacement = this.pickTopOrBottomPlacement(allowedPositions);
        minHeight = maxHeight = UAD_START_DISTANCE;
        xSpread = Phaser.Math.Between(16, 48);
        // :117 — SPECIAL_RAND_CHOICE(0, 0, BULLET_TYPE_SPREAD) with NO frequency
        // bit and no frequency/delay, so fire_shots never fires for them: their
        // only shot is the explicit one at the paused->vertical transition.
        firingBehaviour = Math.random() < 0.5 ? BULLET_TYPE_SPREAD : BULLET_TYPE_NONE;
        firingFrequency = 0;
        firingInitialDelay = 0;
        break;

      case EnemyType.SOLID_DIAMONDS_DEVIANT:
        // C++ spawn_solid_diamond_wave_deviant_type.txt:99-107 — actual_speed is
        // rolled ONCE for the whole wave, and the height range is the box.
        uniformSpeed = Phaser.Math.Between(
          SOLID_DIAMOND_DEVIANT_MIN_VERTICAL_SPEED,
          SOLID_DIAMOND_DEVIANT_MAX_VERTICAL_SPEED
        );
        minVerticalSpeed = maxVerticalSpeed = uniformSpeed;
        minHeight = boxMinY;
        maxHeight = boxMaxY;
        xSpread = Phaser.Math.Between(32, 48);
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 300 - (levelIndex * 5));
        firingInitialDelay = SOLID_DIAMOND_INITIAL_FIRING_DELAY;
        break;

      case EnemyType.FUZZ:
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(20, 60 - (levelIndex * 3));
        break;
    }

    return {
      type,
      count,
      xSpread,
      minSpeed,
      maxSpeed,
      minVerticalSpeed,
      maxVerticalSpeed,
      gravity,
      minGravity,
      maxGravity,
      minHeight,
      maxHeight,
      verticalPlacement,
      positionMask: allowedPositions,
      firingBehaviour,
      firingFrequency,
      firingInitialDelay,
      bulletSpeedPercentage: 10000,
    };
  }

  private randomWaveSize(): number {
    // C++ spawn_*_wave.txt: sqr(rand(MIN^2, MAX^2)) — the engine's integer sqrt
    // truncates, it doesn't round.
    const minSquared = MIN_WAVE_SIZE * MIN_WAVE_SIZE;
    const maxSquared = MAX_WAVE_SIZE * MAX_WAVE_SIZE;
    return Math.max(1, Math.floor(Math.sqrt(Phaser.Math.Between(minSquared, maxSquared))));
  }

  private spawnEnemyFromWave(x: number, y: number, wave: WaveConfig, _level: number): void {
    const spriteKey = wave.type < 8 ? 'enemies' : 'enemies02';
    const frame = wave.type % 8;

    const enemy = this.scene.physics.add.sprite(x, y, spriteKey, frame);
    enemy.setDisplaySize(48, 48);
    enemy.setDepth(Depth.ENEMY);
    enemy.setAlpha(1);
    enemy.setVisible(true);

    // Join the group BEFORE touching the body. A Phaser PhysicsGroup keeps a
    // `defaults` map (node_modules/phaser/src/physics/arcade/PhysicsGroup.js:165-192)
    // and its createCallbackHandler (:217-229) replays EVERY entry of it onto the
    // body on each add():
    //     for (var key in this.defaults) { body[key](this.defaults[key]); }
    // Those defaults include setCollideWorldBounds(false), setBounceX/Y(0),
    // setAllowGravity(true) and setVelocityX/Y(0). Adding after configuration —
    // which is what this used to do, the add() sat down at the bottom next to the
    // this.enemies.push() — therefore silently threw away the collideWorldBounds,
    // bounce and per-type allowGravity settings below: measured 0 of 235 enemies
    // across levels 1-4 ended up with collideWorldBounds set, all of them had
    // bounce 0,0. That is why roof gravity-bouncers flew clean out of the world
    // (y = -218,101) instead of bouncing off the ceiling — and since
    // updateLifecycle()'s off-screen test is horizontal only they never got
    // culled either, so they pinned getActiveEnemyCount() above zero and
    // suppressed replacement waves for the rest of the level.
    this.enemyGroup.add(enemy);

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setCircle(16, 8.5);
    body.setCollideWorldBounds(true);
    body.setBounce(1, 1);

    // C++ generic_level_enemy.txt:245, :1133-1138 (.choose_random_start_speed) —
    // rolled ONCE here at setup; only the hollow diamonds/circles re-roll it in
    // .start_movement.
    const hSpeed = Phaser.Math.Between(wave.minSpeed, wave.maxSpeed);
    const vSpeed = Phaser.Math.Between(wave.minVerticalSpeed, wave.maxVerticalSpeed);

    let gravity = wave.gravity;
    if (wave.minGravity !== wave.maxGravity) {
      gravity = Phaser.Math.Between(wave.minGravity, wave.maxGravity);
    }

    // C++ :252-282 — the vertical placement flag decides the sign of the
    // acceleration (and, for the BOTTOM case, flips the starting vertical speed).
    let startingYAcc = 0;
    let startingYVel = vSpeed;
    switch (wave.verticalPlacement) {
      case VERTICAL_BOUNCE_FLOOR:
        startingYAcc = gravity;
        break;
      case VERTICAL_BOUNCE_ROOF:
        startingYAcc = -gravity;
        break;
      case VERTICAL_POSITION_BOTTOM:
        startingYVel = -vSpeed;
        break;
      default:
        break;
    }

    const data: EnemyData = {
      enemyType: wave.type,
      waveConfig: wave,
      xVelFixed: 0,
      yVelFixed: 0,
      gravityFixed: 0,
      behaviourState: BEHAVIOUR_STATE_PAUSED,
      behaviourCounter: 0,
      storedVerticalSpeed: 0,
      storedHorizontalSpeed: 0,
      firingBehaviour: wave.firingBehaviour,
      firingFrequency: wave.firingFrequency,
      firingCooldown: wave.firingInitialDelay,
      bulletSpeedPercentage: wave.bulletSpeedPercentage,
      skipFirstShot: true,
      directionMultiplier: 1,
      lifecycle: LIFECYCLE_WAIT_OFF_SCREEN,
      startingWorldX: x,
      startingWorldY: y,
      startingXVel: hSpeed,
      startingYVel,
      startingYAcc,
      specialPath: null,
      pathPercentage: 0,
      pathPercentageSpeed: 0,
      pathSection: -1,
      baseWorldX: x,
      baseWorldY: y,
    };

    switch (wave.type) {
      case EnemyType.HOLLOW_DIAMONDS:
      case EnemyType.HOLLOW_CIRCLES:
        // :852 / :855 — the vertical direction is randomised in .start_movement.
        data.startingYVel = (Math.random() < 0.5 ? -1 : 1) * vSpeed;
        break;

      case EnemyType.PAINT_BUBBLES: {
        // Tint the bubble its paint colour and remember it so the dropped
        // paintdrop matches (C++ paintdrop inherits paint_bubble_colour_flag).
        const pc = wave.paintColor ?? 0;
        data.paintColor = pc;
        enemy.setTint(PAINT_TINTS[pc] ?? PAINT_TINTS[0]);
        break;
      }

      case EnemyType.SOLID_DIAMONDS_DEVIANT:
        data.startingYVel = (Math.random() < 0.5 ? -1 : 1) * vSpeed;
        break;

      case EnemyType.SOLID_DIAMONDS:
        // C++ :193-198 — solid diamonds follow a parametric path, not velocity.
        data.specialPath = new SpecialPath(SOLID_DIAMOND_SPECIAL_PATH);
        data.pathPercentageSpeed = SOLID_DIAMOND_PERCENTAGE_SPEED;
        // C++ spawn_solid_diamond_wave.txt:97-100 anchors the path base Y to a
        // FIXED SOLID_DIAMOND_START_DISTANCE (224, top), not the spawn-slot Y, so
        // diamonds always ride at the correct height regardless of spawn box.
        data.baseWorldY = SOLID_DIAMOND_START_DISTANCE;
        // Solid diamonds don't collide with world bounds - path controls position
        body.setCollideWorldBounds(false);
        body.setAllowGravity(false);
        break;

      case EnemyType.FUZZ:
        // C++ :205-215 — fuzz follows a special path (randomly chosen A or B).
        data.specialPath = new SpecialPath(
          Math.random() > 0.5 ? FUZZ_TYPE_A_SPECIAL_PATH : FUZZ_TYPE_B_SPECIAL_PATH
        );
        data.pathPercentageSpeed = FUZZ_PERCENTAGE_SPEED;
        data.startingXVel = 0;
        data.startingYVel = 0;
        // Fuzz ignores world collision entirely
        body.setCollideWorldBounds(false);
        body.setAllowGravity(false);
        break;

      default:
        break;
    }

    (enemy as any)._data = data;

    // (enemyGroup.add() happens up at sprite-creation time — see the note there.)
    this.enemies.push(enemy);

    // C++ :302-310 — everything below the fuzz starts hidden, non-colliding and
    // parked at its anchor; only the fuzz drops straight into the main loop.
    if (wave.type === EnemyType.FUZZ) {
      data.lifecycle = LIFECYCLE_ACTIVE;
      body.setVelocity(0, 0);
    } else {
      this.enterWaitOffScreen(enemy, data);
    }
  }

  // C++ function_normal_enemy_am_i_on_screen.txt — used by enemies to decide when
  // to wake up and by enemy bullets to decide when to die.
  private isOnScreen(camCentreX: number, x: number, y: number): boolean {
    if (y < ON_SCREEN_MIN_Y || y > ON_SCREEN_MAX_Y) {
      return false;
    }

    return Math.abs(x - camCentreX) < ON_SCREEN_DISTANCE;
  }

  // C++ generic_level_enemy.txt:771-833 (.wait_until_off_screen +
  // .reset_to_base_position_and_wait) — go invisible and non-colliding, dump all
  // movement and snap back to the anchor we were spawned at. The fuzz is the one
  // enemy that leaves for good instead of recycling (:775-779).
  private enterWaitOffScreen(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    if (data.enemyType === EnemyType.FUZZ) {
      // :774 — the departing fuzz calls function_remove_enemy_from_level_count,
      // so its exit can empty the level exactly like the last kill does. The scene
      // polls getActiveEnemyCount() immediately after enemySystem.update(), so the
      // emptied level is picked up on this same frame — see
      // GameScene.checkEnemyCountReachedZero().
      enemy.destroy();
      this.compactEnemyList();
      return;
    }

    const body = enemy.body as Phaser.Physics.Arcade.Body;

    data.lifecycle = LIFECYCLE_WAIT_OFF_SCREEN;
    data.xVelFixed = 0;
    data.yVelFixed = 0;
    data.gravityFixed = 0;

    body.reset(data.startingWorldX, data.startingWorldY);
    body.setGravityY(0);
    body.enable = false;

    enemy.setVisible(false);
    enemy.setScale(1, 1);
  }

  // C++ generic_level_enemy.txt:837-939 (.start_movement) — runs every time the
  // enemy comes back on-screen, not just once at spawn.
  private startMovement(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    const speedScale = 60 / PRIVATE_SCALE;
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const wave = data.waveConfig;

    data.lifecycle = LIFECYCLE_ACTIVE;
    body.enable = true;
    enemy.setVisible(true);

    if (data.enemyType === EnemyType.HOLLOW_DIAMONDS || data.enemyType === EnemyType.HOLLOW_CIRCLES) {
      // :850-855 + :866-869 — these two re-roll their speed, their vertical
      // direction and their height within the spawn box on every re-entry.
      data.startingXVel = Phaser.Math.Between(wave.minSpeed, wave.maxSpeed);
      data.startingYVel = (Math.random() < 0.5 ? -1 : 1)
        * Phaser.Math.Between(wave.minVerticalSpeed, wave.maxVerticalSpeed);
      data.startingWorldY = Phaser.Math.Between(
        Math.min(wave.minHeight, wave.maxHeight),
        Math.max(wave.minHeight, wave.maxHeight)
      );
    } else if (data.enemyType === EnemyType.PAINT_BUBBLES
      && wave.verticalPlacement === VERTICAL_POSITION_MIDDLE) {
      // :856-861 — mid-field bubbles restart their wobble from a fresh height.
      data.behaviourCounter = 0;
      data.startingWorldY = Phaser.Math.Between(
        Math.min(wave.minHeight, wave.maxHeight),
        Math.max(wave.minHeight, wave.maxHeight)
      );
    }
    // (BONUS_MOLECULE re-rolls too at :870-871, but spawn_molecule_bonus_wave.txt
    // :125-126 sets its min/max height to its own scattered spawn Y, so it is a
    // no-op and its cloud position is preserved.)

    body.reset(data.startingWorldX, data.startingWorldY);

    data.xVelFixed = data.startingXVel;
    data.yVelFixed = data.startingYVel;
    data.gravityFixed = data.startingYAcc;

    // :893-910 — head TOWARD the player (if the ball is to our left, go left),
    // then flip the sprite to face the way we're going.
    if (this.playerRef && this.playerRef.x < data.startingWorldX) {
      data.xVelFixed = -data.xVelFixed;
      data.directionMultiplier = -1;
    } else {
      data.directionMultiplier = 1;
    }
    enemy.setFlipX(data.xVelFixed < 0);

    switch (data.enemyType) {
      case EnemyType.UP_AND_DOWNERS:
        // :912-919
        data.storedHorizontalSpeed = data.xVelFixed;
        data.storedVerticalSpeed = data.yVelFixed;
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        data.behaviourState = BEHAVIOUR_STATE_PAUSED;
        data.behaviourCounter = UAD_BEHAVIOUR_LENGTH_PAUSED;
        data.skipFirstShot = true;
        break;

      case EnemyType.PLANES:
        // :920-924
        data.storedVerticalSpeed = data.yVelFixed;
        data.yVelFixed = 0;
        data.behaviourState = BEHAVIOUR_STATE_HORIZONTAL;
        data.behaviourCounter = Math.floor(
          PLANE_BEHAVIOUR_DISTANCE_HORIZONTAL / Math.max(1, Math.abs(data.xVelFixed))
        );
        break;

      case EnemyType.SOLID_DIAMONDS:
        // :925-930 — the path restarts from the top and re-anchors here.
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        data.baseWorldX = data.startingWorldX;
        data.pathPercentage = 0;
        data.pathSection = -1;
        break;

      default:
        break;
    }

    enemy.setVelocity(data.xVelFixed * speedScale, data.yVelFixed * speedScale);
    // y_acc is per-frame-squared, so it needs GRAVITY_SCALE (60^2/PRIVATE_SCALE),
    // not the per-frame velocity scale: 48 fixed = 675 px/s^2, not 11.25.
    body.setGravityY(data.gravityFixed * GRAVITY_SCALE);

    // :937 — restart the firing timer so a re-entering wave doesn't volley at once.
    data.firingCooldown = wave.firingInitialDelay;
  }

  // C++ spawn_fuzz.txt: a single Fuzz enters from the side the player is heading
  // toward (camera centre + dir*HALF_SCREEN_PLUS_ENTRANCE_PHANTOM_ZONE) at mid
  // height, then crosses the screen via its special path. direction_multiplier =
  // -last_movement_direction. Driven by the fuzz counter in GameScene.
  spawnFuzz(playerFacing: number, level: number): void {
    const HALF_SCREEN_PLUS_ENTRANCE = 344; // constant.txt
    const dir = playerFacing >= 0 ? 1 : -1;
    const cam = this.scene.cameras.main;
    const camCentreX = cam.scrollX + cam.width / 2;
    const x = camCentreX + dir * HALF_SCREEN_PLUS_ENTRANCE;
    const y = LEVEL_HEIGHT / 2;

    const wave = this.createWaveConfig(EnemyType.FUZZ, level, 0, y, y);
    this.spawnEnemyFromWave(x, y, wave, level);

    const fuzz = this.enemies[this.enemies.length - 1];
    const data = fuzz ? (fuzz as any)._data as EnemyData : null;
    if (fuzz && data) {
      data.directionMultiplier = -dir;
      fuzz.setFlipX(data.directionMultiplier < 0);
    }
  }

  update(): void {
    this.compactEnemyList();
    const speedScale = 60 / PRIVATE_SCALE;

    this.enemies.forEach(enemy => {
      if (!enemy.active) return;

      const data = (enemy as any)._data as EnemyData;
      if (!data) return;

      // Gate everything below on the on/off-screen lifecycle: an enemy that is
      // waiting to appear (or has just scrolled away) runs no behaviour and,
      // crucially, no firing — so it can't eat the shared 24-bullet pool.
      if (!this.updateLifecycle(enemy, data)) return;

      const body = enemy.body as Phaser.Physics.Arcade.Body;

      switch (data.enemyType) {
        case EnemyType.PLANES:
          this.updatePlaneBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.UP_AND_DOWNERS:
          this.updateUADBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.FUZZ:
          this.updateFuzzBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.CRABBY_BOUNCERS:
          this.updateCrabbyBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.SOLID_DIAMONDS_DEVIANT:
          this.updateSolidDiamondsDeviantBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.BOBBLE_HATS:
          this.updateBobbleHatBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.HOLLOW_DIAMONDS:
          this.updateHollowDiamondBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.HOLLOW_CIRCLES:
          this.updateHollowCircleBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.MOLECULE_BOUNCERS:
          this.updateMoleculeBouncerBehaviour(enemy, data, body, speedScale);
          break;
        case EnemyType.SOLID_DIAMONDS:
          this.updateSolidDiamondBehaviour(enemy, data);
          break;
        case EnemyType.BONUS_MOLECULE:
          // Stationary (C++ generic_level_enemy.txt:547 = animation only). No
          // movement update so it stays where it spawned until shot.
          break;
        case EnemyType.PAINT_BUBBLES:
          this.updatePaintBubbleBehaviour(enemy, data, body, speedScale);
          break;
        default:
          this.updateBasicBounce(enemy, data, body, speedScale);
          break;
      }

      this.updateFiring(enemy, data);
    });

    this.cleanupBullets();
  }

  // C++ generic_level_enemy.txt:302-325 + :771-811 — the on/off-screen lifecycle.
  // Every enemy but the fuzz spawns invisible and non-colliding, waits until it is
  // off-screen, then waits to come back on-screen before it starts moving. BOTH of
  // those waits test function_normal_enemy_am_i_on_screen (:785-789, :804-809), so
  // both use the 344 px ENTRANCE zone; only the ACTIVE main loop's recycle test
  // (:321-325) calls function_normal_enemy_am_i_off_screen and its 368 px EXIT zone
  // (constant.txt:140-141). That deliberate 344/368 gap is the hysteresis, and the
  // recycle is what stops all ~60 of a level's enemies being live at once.
  // Waiting enemies are still ALIVE for the level's enemy count, exactly as in the
  // C++ (function_add_enemy_to_level_count runs at spawn, and only a kill removes
  // them), so getActiveEnemyCount()/maybeSpawnReplacementWave() are unaffected.
  // Returns true when the enemy should run its behaviour and firing this frame.
  private updateLifecycle(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): boolean {
    const cam = this.scene.cameras.main;
    const camCentreX = cam.scrollX + cam.width / 2;

    switch (data.lifecycle) {
      case LIFECYCLE_WAIT_OFF_SCREEN:
        // :785-789
        if (!this.isOnScreen(camCentreX, enemy.x, enemy.y)) {
          data.lifecycle = LIFECYCLE_WAIT_ON_SCREEN;
        }
        return false;

      case LIFECYCLE_WAIT_ON_SCREEN:
        // :804-809
        if (this.isOnScreen(camCentreX, enemy.x, enemy.y)) {
          this.startMovement(enemy, data);
        }
        return false;

      default:
        // :321-325 — off we go again (for the fuzz, this is where it dies).
        if (Math.abs(enemy.x - camCentreX) >= OFF_SCREEN_DISTANCE) {
          this.enterWaitOffScreen(enemy, data);
          return false;
        }
        return true;
    }
  }

  private updatePlaneBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    data.behaviourCounter--;

    if (data.behaviourCounter <= 0) {
      if (data.behaviourState === BEHAVIOUR_STATE_HORIZONTAL) {
        data.behaviourState = BEHAVIOUR_STATE_DIAGONAL;
        const hSpeed = Math.abs(data.xVelFixed);
        data.behaviourCounter = Math.floor(PLANE_BEHAVIOUR_DISTANCE_DIAGONAL / hSpeed);
        data.yVelFixed = data.storedVerticalSpeed;
        enemy.setVelocityY(data.yVelFixed * speedScale);
      } else if (data.behaviourState === BEHAVIOUR_STATE_DIAGONAL) {
        data.behaviourState = BEHAVIOUR_STATE_HORIZONTAL;
        const hSpeed = Math.abs(data.xVelFixed);
        data.behaviourCounter = Math.floor(PLANE_BEHAVIOUR_DISTANCE_HORIZONTAL / hSpeed);
        data.storedVerticalSpeed = data.yVelFixed;
        data.yVelFixed = 0;
        enemy.setVelocityY(0);
      }
    }

    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(false);
      data.directionMultiplier = 1;
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(true);
      data.directionMultiplier = -1;
    }
    if (body.blocked.up) {
      data.yVelFixed = Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    } else if (body.blocked.down) {
      data.yVelFixed = -Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    }
  }

  private updateUADBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    data.behaviourCounter--;

    if (data.behaviourCounter <= 0) {
      if (data.behaviourState === BEHAVIOUR_STATE_PAUSED) {
        data.behaviourState = BEHAVIOUR_STATE_VERTICAL;
        const speed = Math.abs(data.storedVerticalSpeed);
        data.behaviourCounter = Math.floor(UAD_BEHAVIOUR_DISTANCE_VERTICAL / speed);
        data.xVelFixed = 0;
        data.yVelFixed = data.storedVerticalSpeed;
        enemy.setVelocity(0, data.yVelFixed * speedScale);

        // C++ generic_level_enemy.txt:344-350 — this explicit shot is the ONLY
        // one an up-and-downer ever fires (its firing behaviour carries no
        // frequency bit, so .fire_shots is a no-op for it).
        if (data.firingBehaviour !== BULLET_TYPE_NONE) {
          if (!data.skipFirstShot) {
            this.fireShot(enemy, data);
          } else {
            data.skipFirstShot = false;
          }
        }

      } else if (data.behaviourState === BEHAVIOUR_STATE_VERTICAL) {
        data.behaviourState = BEHAVIOUR_STATE_HORIZONTAL;
        const speed = Math.abs(data.storedHorizontalSpeed);
        data.behaviourCounter = Math.floor(UAD_BEHAVIOUR_DISTANCE_HORIZONTAL / speed);
        data.storedVerticalSpeed = data.yVelFixed;
        data.xVelFixed = data.storedHorizontalSpeed;
        data.yVelFixed = 0;
        enemy.setVelocity(data.xVelFixed * speedScale, 0);

        if (data.xVelFixed < 0) {
          enemy.setFlipX(true);
          data.directionMultiplier = -1;
        } else {
          enemy.setFlipX(false);
          data.directionMultiplier = 1;
        }

      } else if (data.behaviourState === BEHAVIOUR_STATE_HORIZONTAL) {
        data.behaviourState = BEHAVIOUR_STATE_PAUSED;
        data.behaviourCounter = UAD_BEHAVIOUR_LENGTH_PAUSED;
        data.storedHorizontalSpeed = data.xVelFixed;
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        enemy.setVelocity(0, 0);
      }
    }

    if (data.behaviourState === BEHAVIOUR_STATE_VERTICAL) {
      if (body.blocked.up) {
        data.yVelFixed = Math.abs(data.yVelFixed);
        enemy.setVelocityY(data.yVelFixed * speedScale);
      } else if (body.blocked.down) {
        data.yVelFixed = -Math.abs(data.yVelFixed);
        enemy.setVelocityY(data.yVelFixed * speedScale);
      }
    } else if (data.behaviourState === BEHAVIOUR_STATE_HORIZONTAL) {
      if (body.blocked.left) {
        data.xVelFixed = Math.abs(data.xVelFixed);
        enemy.setVelocityX(data.xVelFixed * speedScale);
        enemy.setFlipX(false);
        data.directionMultiplier = 1;
      } else if (body.blocked.right) {
        data.xVelFixed = -Math.abs(data.xVelFixed);
        enemy.setVelocityX(data.xVelFixed * speedScale);
        enemy.setFlipX(true);
        data.directionMultiplier = -1;
      }
    }
  }

  private updateSolidDiamondBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData
  ): void {
    if (!data.specialPath) return;

    // C++ generic_level_enemy.txt:463-478
    // GET_SPECIAL_PATH_POSITION_TOTAL_OFFSET gives (offsetX, offsetY, section)
    const result = data.specialPath.getPosition(data.pathPercentage, data.pathSection);
    data.pathSection = result.section;

    // Advance percentage
    data.pathPercentage += data.pathPercentageSpeed;

    // Apply direction multiplier (mirrors the path horizontally)
    const offsetX = result.offsetX * data.directionMultiplier;

    // Set world position = base + offset
    let worldX = data.baseWorldX + offsetX;
    let worldY = data.baseWorldY + result.offsetY;

    // C++ clamps Y to max 344
    if (worldY > 344) {
      worldY = 344;
    }

    enemy.setPosition(worldX, worldY);
  }

  private updateFuzzBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    _body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    if (!data.specialPath) return;

    // C++ generic_level_enemy.txt:499-518
    // Fuzz follows path until percentage >= 1000000, then exits in a straight line
    if (data.pathPercentage < FUZZ_EXIT_THRESHOLD) {
      const result = data.specialPath.getPosition(data.pathPercentage, data.pathSection);
      data.pathSection = result.section;

      data.pathPercentage += data.pathPercentageSpeed;

      // Apply direction multiplier
      const offsetX = result.offsetX * data.directionMultiplier;

      const worldX = data.baseWorldX + offsetX;
      const worldY = data.baseWorldY + result.offsetY;

      enemy.setPosition(worldX, worldY);
    } else {
      // Exit: straight-line velocity (C++ uses direction_multiplier * 5376).
      // Once it passes OFF_SCREEN_DISTANCE the shared lifecycle gate destroys it
      // (C++ generic_level_enemy.txt:321-325 + :775-779): without that it would
      // fly off forever with collideWorldBounds disabled, the active enemy count
      // would never reach zero and the level would run out of paint bubbles.
      const exitVelX = data.directionMultiplier * FUZZ_EXIT_SPEED * speedScale;
      enemy.setVelocity(exitVelX, 0);
    }
  }

  // C++ generic_level_enemy.txt:943-990 (.bounce_vertically_by_set_power) — on a
  // vertical world hit the gravity bouncers recompute their outgoing speed from
  // s = (a * t^2) / 2 so they always come back to exactly their start height.
  // The roof variants (:970-987) mirror it: they are pulled UP and bounce DOWN.
  // BOTH sides of that division live in the entity's private fixed-point space
  // (BITSHIFT = 8, :144), which is why the C++ shifts the start Y in before
  // subtracting: dividing a raw PIXEL distance by a fixed-point acceleration
  // yields a "t" that is sqrt(256) = 16x too small. There is no minimum-speed
  // clamp in the C++ either — a bouncer that lands back on its own start height
  // is meant to come off with nothing.
  //
  // "s" is SIGNED in the C++ and that sign carries meaning; this used to take
  // Math.abs() of it, which is wrong. :959-960 is `temp_2 = y - BOTTOM_START_Y`
  // and :977-978 is `temp_2 = TOP_START_Y - y` — in both cases s is the distance
  // the bouncer FELL AWAY FROM its start line towards the surface it just hit, so
  // s > 0 on any normal bounce. If the contact happens on the far side of the
  // start line (a floor bouncer resting ABOVE its own start height, e.g. sat on a
  // tile) s goes negative, the C++ then divides by the signed y_acc and hands
  // `sqr` a negative.
  //
  // What the reference engine does with THAT is not a graceful "no launch", and
  // this comment used to claim it was. `sqr` is the MATH_SQR opcode, and the
  // interpreter implements it as `result_i = int (sqrt (first_value))` over an
  // `int` (wizball/scripting.cpp:4798 declares first_value; the opcode is at
  // :5890-5891, repeated verbatim at :6314-6315 and :6527-6528). That is
  // int(NaN) — undefined behaviour, which on x86-64 lands on INT_MIN; compiling
  // exactly that expression gives -2147483648 at both -O0 and -O2. So the C++
  // has no defined answer for s < 0, not a zero one. Nor is the ROOF branch's
  // `sqr -temp_2` a guard against it: a roof bouncer's y_acc is negative
  // (STARTING_Y_ACC = -passed_in_gravity, generic_level_enemy.txt:261-263), so
  // temp_2 comes out of the divide negative on a NORMAL roof bounce and the
  // unary minus is only putting it back the right way up.
  //
  // Which is why clamping s <= 0 to t = 0 is a choice about a branch nothing
  // has been seen to reach, rather than a port of a defined behaviour — and it
  // is safe to make on that evidence: a reachability sweep of real floor/roof
  // contacts on levels 4/6/8 found 0 of 229 with s <= 0 (minimum s = 13.6 px,
  // so nowhere near it). Math.abs(), which is what this used
  // to do, is the one demonstrably wrong option, because it hands the bouncer
  // real climb energy out of |s|: measured at a forced s = -48 px contact,
  // Math.abs() launched at -265.2 px/s and rose 50.4 px off the surface, where
  // the clamped signed form launches at 0 and rises 0.4 px. Ordinary s > 0
  // bounces are untouched either way (same contact, launch -388.08 px/s before
  // vs -388.84 after — pure 60Hz jitter).
  //
  // The C++ finishes with `y_vel = y_vel * temp_1` where `temp_1 = sgn y_vel`
  // sampled at :954/:972 — i.e. AFTER .world_interaction_routine's caller has
  // already reflected the velocity off the surface ("the direction we'll be
  // moving off in"). That is always up for a floor bounce and always down for a
  // roof bounce, which is exactly the hard-coded sign on data.yVelFixed below, so
  // there is nothing extra to port there.
  private bounceVerticallyBySetPower(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    const gravity = Math.abs(data.gravityFixed);
    if (gravity === 0) return;

    if (data.waveConfig.verticalPlacement === VERTICAL_BOUNCE_FLOOR) {
      if (!body.blocked.down) return;

      // :956-961 — s = (y - (BOTTOM_START_Y << bitshift)) * 2, signed.
      // body.center.y, not enemy.y: Systems.step (node_modules/phaser/src/scene/
      // Systems.js:356-367) emits UPDATE — where the Arcade world runs its whole
      // step — BEFORE calling Scene.update, and only emits POST_UPDATE, where
      // Body.postUpdate writes the body position back onto the sprite, after it.
      // So at the moment we see blocked.down here, body.position is this frame's
      // and enemy.y is still last frame's; the gap is one frame of travel (9.91 px
      // at 617 px/s) and it leaked straight into the drop distance. Measured over
      // a 15s bouncer: reading enemy.y the hop apex wandered up to 15.06 px (floor)
      // / 16.01 px (roof) off the start line it is supposed to return to; reading
      // body.center.y it is a rock-steady 3.30 px / 3.81 px, which is just the
      // 60Hz Euler quantisation of the contact frame.
      const s = (body.center.y - data.startingWorldY) * PRIVATE_SCALE * 2;
      const t = s > 0 ? Math.sqrt(s / gravity) : 0;
      data.yVelFixed = -(gravity * t);
    } else if (data.waveConfig.verticalPlacement === VERTICAL_BOUNCE_ROOF) {
      if (!body.blocked.up) return;

      // :974-979 — s = ((TOP_START_Y << bitshift) - y) * 2, signed the other way.
      // Same body.center.y-vs-enemy.y and same s <= 0 handling as the floor case.
      const s = (data.startingWorldY - body.center.y) * PRIVATE_SCALE * 2;
      const t = s > 0 ? Math.sqrt(s / gravity) : 0;
      data.yVelFixed = gravity * t;
    } else {
      return;
    }

    enemy.setVelocityY(data.yVelFixed * speedScale);
  }

  // C++ generic_level_enemy.txt:666-668 / :720-722 — molecule bouncers just bounce:
  // a horizontal hit flips them, a vertical hit goes through the set-power bounce.
  private updateMoleculeBouncerBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    }

    this.bounceVerticallyBySetPower(enemy, data, body, speedScale);
  }

  private updateCrabbyBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    }

    // C++ generic_level_enemy.txt:712-718 — crabbies use the set-power bounce too,
    // so roof crabbies bounce along the ceiling instead of falling.
    this.bounceVerticallyBySetPower(enemy, data, body, speedScale);

    // C++ squash/stretch deformation on bounce
    // opengl_scale_x = 10000 + deform_amount * sin(deform_angle)
    // opengl_scale_y = 10000 - deform_amount * sin(deform_angle)
    // deform_angle += abs(y_acc) * 20
    // deform_amount -= abs(y_acc) * 2 (minimum 0)
    const absGravity = Math.abs(data.gravityFixed);
    data.behaviourCounter += absGravity * 20; // deform_angle increment
    data.storedVerticalSpeed = Math.max(0, (data.storedVerticalSpeed || 0) - absGravity * 2); // deform_amount decay

    if (body.blocked.down || body.blocked.up) {
      // Trigger deformation on bounce
      data.storedVerticalSpeed = 3000; // initial deform_amount
    }

    if (data.storedVerticalSpeed > 0) {
      const deformAngle = (data.behaviourCounter / 36000) * Math.PI * 2;
      const deformAmount = data.storedVerticalSpeed;
      const scaleX = (10000 + deformAmount * Math.sin(deformAngle)) / 10000;
      const scaleY = (10000 - deformAmount * Math.sin(deformAngle)) / 10000;
      enemy.setScale(Phaser.Math.Clamp(scaleX, 0.5, 1.5), Phaser.Math.Clamp(scaleY, 0.5, 1.5));
    } else {
      enemy.setScale(1, 1);
    }
  }

  private updateSolidDiamondsDeviantBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    // Vertical-only movement - bounces off top/bottom walls
    // Faster than regular SolidDiamonds
    if (body.blocked.up) {
      data.yVelFixed = Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    } else if (body.blocked.down) {
      data.yVelFixed = -Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    }
  }

  private updateBobbleHatBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    // C++ generic_level_enemy.txt:732-734 — bobble hats bounce off floor OR roof
    // depending on the wave's placement flag.
    this.bounceVerticallyBySetPower(enemy, data, body, speedScale);

    // Bounce off walls horizontally
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(false);
      data.directionMultiplier = 1;
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(true);
      data.directionMultiplier = -1;
    }
  }

  private updateHollowDiamondBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    // Hollow diamonds bounce diagonally - faster than basic bounce
    // Full diagonal movement with bounce
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(false);
      data.directionMultiplier = 1;
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(true);
      data.directionMultiplier = -1;
    }
    if (body.blocked.up) {
      data.yVelFixed = Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    } else if (body.blocked.down) {
      data.yVelFixed = -Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    }

    // Color cycling effect (C++ uses opengl_vertex_blue = 256 sin(animation_counter))
    data.behaviourCounter = (data.behaviourCounter + 750) % 36000;
    const colorPhase = Math.sin((data.behaviourCounter / 36000) * Math.PI * 2);
    const b = Math.floor(256 * colorPhase);
    enemy.setTint(Phaser.Display.Color.GetColor(128, 128, Math.abs(b)));
  }

  private updateHollowCircleBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    // C++ hollow circles: diagonal bounce movement (same as hollow diamonds)
    // They also have color cycling via opengl_vertex_red = 192 sin(animation_counter) + 64
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(false);
      data.directionMultiplier = 1;
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
      enemy.setFlipX(true);
      data.directionMultiplier = -1;
    }
    if (body.blocked.up) {
      data.yVelFixed = Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    } else if (body.blocked.down) {
      data.yVelFixed = -Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    }

    // Color cycling effect (C++ uses opengl_vertex_red = 192 sin(counter) + 64)
    data.behaviourCounter = (data.behaviourCounter + 750) % 36000;
    const colorPhase = Math.sin((data.behaviourCounter / 36000) * Math.PI * 2);
    const r = Math.floor(192 * colorPhase + 64);
    const g = Math.floor(64 * colorPhase + 64);
    const b = Math.floor(128 * colorPhase + 128);
    enemy.setTint(Phaser.Display.Color.GetColor(r, g, b));
  }

  private updatePaintBubbleBehaviour(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    // C++ generic_level_enemy.txt:522-545 — paint bubbles come in two flavours,
    // picked by the wave's top_or_bottom_flag: the mid-field ones do a circular
    // wobble, the roof/floor ones gravity-bounce (with squash/stretch).
    if (data.waveConfig.verticalPlacement === VERTICAL_POSITION_MIDDLE) {
      // :523-528 — x_vel = 768·sin(angle)·dir, y_vel = -768·cos(angle), += 250.
      data.behaviourCounter = (data.behaviourCounter + 250) % 36000;
      const angle = (data.behaviourCounter / 36000) * Math.PI * 2;
      data.xVelFixed = Math.sin(angle) * 768 * data.directionMultiplier;
      data.yVelFixed = -Math.cos(angle) * 768;
      enemy.setVelocity(data.xVelFixed * speedScale, data.yVelFixed * speedScale);
      return;
    }

    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    }

    // :700-706 — the set-power bounce, from whichever surface this wave uses.
    this.bounceVerticallyBySetPower(enemy, data, body, speedScale);
  }

  private updateBasicBounce(
    enemy: Phaser.Physics.Arcade.Sprite,
    data: EnemyData,
    body: Phaser.Physics.Arcade.Body,
    speedScale: number
  ): void {
    if (body.blocked.left) {
      data.xVelFixed = Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    } else if (body.blocked.right) {
      data.xVelFixed = -Math.abs(data.xVelFixed);
      enemy.setVelocityX(data.xVelFixed * speedScale);
    }
    if (body.blocked.up) {
      data.yVelFixed = Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    } else if (body.blocked.down) {
      data.yVelFixed = -Math.abs(data.yVelFixed);
      enemy.setVelocityY(data.yVelFixed * speedScale);
    }
  }

  // C++ generic_level_enemy.txt:997-1030 (.fire_shots) — note that an enemy with
  // NEITHER frequency bit set never fires on a timer at all (that is the case for
  // the up-and-downers, whose only shot is the explicit one they take at the
  // paused->vertical transition). The bullet cap is deliberately NOT tested here:
  // it lives in the bullet itself (enemy_bullet.txt:24-30), so a saturated pool
  // must not stall every enemy's timer and make them all volley on one frame.
  private updateFiring(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    if (data.firingBehaviour === BULLET_TYPE_NONE) return;

    if ((data.firingBehaviour & BULLET_FREQUENCY_RANDOM) !== 0) {
      // :1002-1010 — 1-in-frequency chance per frame.
      if (Phaser.Math.Between(0, Math.max(1, data.firingFrequency)) !== 0) return;
    } else if ((data.firingBehaviour & BULLET_FREQUENCY_FIXED) !== 0) {
      // :1012-1022 — countdown, clamped at zero, reloaded on fire.
      data.firingCooldown = Math.max(0, data.firingCooldown - 1);
      if (data.firingCooldown > 0) return;
      data.firingCooldown = data.firingFrequency;
    } else {
      return;
    }

    this.fireShot(enemy, data);
  }

  // C++ generic_level_enemy.txt:1034-1046 (.fire_shot)
  private fireShot(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    const bulletSpeedPxSec = this.enemyBulletSpeedPxSec(data);

    if ((data.firingBehaviour & BULLET_TYPE_SINGLE_DIRECTED) !== 0) {
      this.fireDirectedBullet(enemy, bulletSpeedPxSec);
    } else if ((data.firingBehaviour & BULLET_TYPE_SPREAD) !== 0) {
      this.fireSpreadBullets(enemy, bulletSpeedPxSec);
    }
  }

  // C++ generic_level_enemy.txt:1107-1111 — bullet_speed_modifier =
  // (10000 / 7) * player_on_level_number, then scaled by the enemy's bullet-speed
  // PERCENTAGE. The engine's "%" is a fixed-point multiply by a 10000-based
  // percentage (see :1089, "speed % 7071" = the diagonal 70.71%), not a remainder.
  private enemyBulletSpeedPxSec(data: EnemyData): number {
    const levelIndex = Math.max(0, this.currentLevel - 1);
    const baseModifier = Math.floor(10000 / CONST_NUMBER_OF_LEVELS_MINUS_ONE) * levelIndex;
    const levelSpeedMod = Math.floor((baseModifier * data.bulletSpeedPercentage) / 10000);

    const bulletSpeedFixed = Phaser.Math.Linear(
      MINIMUM_ENEMY_BULLET_SPEED,
      MAXIMUM_ENEMY_BULLET_SPEED,
      levelSpeedMod / 10000
    );

    return (bulletSpeedFixed / PRIVATE_SCALE) * 60;
  }

  // C++ generic_level_enemy.txt:1096-1114 — only the DIRECTED shot needs a live
  // player (it aims at wizball_entity_id); the spread fires regardless.
  private fireDirectedBullet(enemy: Phaser.Physics.Arcade.Sprite, speedPxSec: number): void {
    if (!this.playerRef || !this.playerRef.active) return;

    const dx = this.playerRef.x - enemy.x;
    const dy = this.playerRef.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const baseAngle = Math.atan2(dy, dx);
    const inaccuracyRadians = ((Math.random() * 2 - 1) * ENEMY_BULLET_INACCURACY / 36000) * Math.PI * 2;
    const angle = baseAngle + inaccuracyRadians;

    const vx = Math.cos(angle) * speedPxSec;
    const vy = Math.sin(angle) * speedPxSec;

    this.spawnEnemyBullet(enemy.x, enemy.y, vx, vy);
  }

  private fireSpreadBullets(enemy: Phaser.Physics.Arcade.Sprite, speedPxSec: number): void {
    for (const engineAngle of SPREAD_ANGLES) {
      if (this.enemyBulletCount >= MAX_ENEMY_BULLETS) {
        break;
      }

      const radians = (engineAngle / 36000) * Math.PI * 2;
      let vx = Math.cos(radians) * speedPxSec;
      let vy = Math.sin(radians) * speedPxSec;

      if (engineAngle % 9000 !== 0) {
        vx *= 0.7071;
        vy *= 0.7071;
      }

      this.spawnEnemyBullet(enemy.x, enemy.y, vx, vy);
    }
  }

  private spawnEnemyBullet(x: number, y: number, vx: number, vy: number): void {
    if (this.enemyBulletCount >= MAX_ENEMY_BULLETS) {
      return;
    }

    const bullet = this.scene.physics.add.sprite(x, y, 'bullets', 'bullets_1');
    bullet.setDepth(Depth.ENEMY_BULLET);
    bullet.setDisplaySize(12, 4);
    bullet.setTint(0xff4444);

    // Join the group FIRST: PhysicsGroup.createCallbackHandler replays
    // `defaults` on every add() (PhysicsGroup.js:165-192, :217-229), and those
    // defaults include setVelocityX/Y(0) and setAllowGravity(true). Adding after
    // the setVelocity() below — the old order — zeroed the shot: measured
    // spawnEnemyBullet(vx=120, vy=-45) producing a body with velocity (0, 0), so
    // enemy fire just hung in the air at the muzzle until the camera scrolled it
    // off screen and cleanupBullets() reaped it.
    this.enemyBulletGroup.add(bullet);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(4);
    body.setVelocity(vx, vy);
    body.setGravityY(0);
    body.setCollideWorldBounds(false);

    (bullet as any)._isEnemyBullet = true;
    this.enemyBulletCount++;
  }

  // C++ enemy_bullet.txt:88-93 — a bullet dies the instant it is not on-screen
  // (the same test the enemies use), not on a timer, and not against the world
  // rect: a bullet that leaves the VIEWPORT is gone even mid-level.
  private cleanupBullets(): void {
    const cam = this.scene.cameras.main;
    const camCentreX = cam.scrollX + cam.width / 2;

    this.enemyBulletGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.active && !this.isOnScreen(camCentreX, bullet.x, bullet.y)) {
        this.releaseEnemyBullet(bullet);
      }
      return true;
    });
  }

  clearEnemies(): void {
    this.compactEnemyList();
    this.enemies.forEach(e => e.destroy());
    this.enemies = [];
    this.enemyGroup.clear(true, true);
    this.enemyBulletGroup.clear(true, true);
    this.enemyBulletCount = 0;
  }

  getEnemyGroup(): Phaser.Physics.Arcade.Group {
    return this.enemyGroup;
  }

  getEnemyBulletGroup(): Phaser.Physics.Arcade.Group {
    return this.enemyBulletGroup;
  }

  releaseEnemyBullet(bullet: Phaser.Physics.Arcade.Sprite): void {
    if (!bullet.active) {
      return;
    }

    bullet.destroy();
    this.enemyBulletCount = Math.max(0, this.enemyBulletCount - 1);
  }

  getEnemies(): Phaser.Physics.Arcade.Sprite[] {
    this.compactEnemyList();
    return this.enemies;
  }

  getActiveEnemyCount(): number {
    this.compactEnemyList();
    return this.enemies.length;
  }

  getNearestEnemy(x: number, y: number): Phaser.Physics.Arcade.Sprite | null {
    this.compactEnemyList();

    let nearest: Phaser.Physics.Arcade.Sprite | null = null;
    let nearestDistanceSquared = Infinity;

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      // Skip enemies that are still waiting to appear — in the C++ they have
      // COLLIDE_TYPE = 0 (generic_level_enemy.txt:819-820), so the mutant cat
      // can't see them, let alone hunt one that is invisible.
      const enemyData = (enemy as any)._data as EnemyData | undefined;
      if (enemyData && enemyData.lifecycle !== LIFECYCLE_ACTIVE) continue;

      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private compactEnemyList(): void {
    this.enemies = this.enemies.filter(enemy => enemy.active);
  }
}

const REGULAR_ENEMY_QUEUES: Record<number, EnemyType[]> = {
  1: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES,
    EnemyType.BOBBLE_HATS,
    EnemyType.PLANES,
    EnemyType.UP_AND_DOWNERS,
  ],
  2: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.HOLLOW_CIRCLES,
  ],
  3: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES,
    EnemyType.BOBBLE_HATS,
    EnemyType.PLANES,
    EnemyType.UP_AND_DOWNERS,
  ],
  4: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES,
    EnemyType.BOBBLE_HATS,
    EnemyType.UP_AND_DOWNERS,
  ],
  5: [
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.BOBBLE_HATS,
    EnemyType.PLANES,
    EnemyType.UP_AND_DOWNERS,
  ],
  6: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES,
    EnemyType.SOLID_DIAMONDS,
    EnemyType.BOBBLE_HATS,
    EnemyType.UP_AND_DOWNERS,
  ],
  7: [
    EnemyType.HOLLOW_DIAMONDS,
    EnemyType.CRABBY_BOUNCERS,
    EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES,
    EnemyType.SOLID_DIAMONDS,
    EnemyType.BOBBLE_HATS,
    EnemyType.PLANES,
    EnemyType.UP_AND_DOWNERS,
  ],
};
