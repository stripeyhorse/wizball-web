import * as Phaser from 'phaser';
import { Depth } from '../config/depths';
import {
  generateLevelWaves,
  WaveConfig,
  BULLET_TYPE_NONE,
  BULLET_TYPE_SINGLE_DIRECTED,
  BULLET_TYPE_SPREAD,
  BULLET_FREQUENCY_RANDOM,
  BULLET_FREQUENCY_FIXED,
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

const SPREAD_ANGLES = [0, 4500, 9000, 13500, 18000, 22500, 27000, 31500];

const MIN_WAVE_SIZE = 8;
const MAX_WAVE_SIZE = 10;

// Paint-bubble tints (0=Red, 1=Green, 2=Blue) — matches GameScene PAINT_FRAME_COLORS.
const PAINT_TINTS = [0xff0000, 0x00ff00, 0x0000ff];
const PAINT_BUBBLE_WAVE_COUNT = 3;
const POSITION_ALL = 7;

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

const BOBBLE_HAT_START_DISTANCE = 128;
const BOBBLE_HAT_GRAVITY = 64;
const BOBBLE_HAT_INITIAL_FIRING_DELAY = 200;

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
  patrolStartX: number;
  patrolStartY: number;
  // Path-following fields (solid diamonds, fuzz)
  specialPath: SpecialPath | null;
  pathPercentage: number;
  pathPercentageSpeed: number;
  pathSection: number;
  baseWorldX: number;
  baseWorldY: number;
  // Bobble hat bounce fields
  startY: number;
  bounceFromFloor: boolean;
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
  private currentLevelWidth: number = 640;
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
    this.currentLevelWidth = this.scene.cameras.main.getBounds().right;
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
    this.currentLevelWidth = this.scene.cameras.main.getBounds().right;
    this.moleculePhaseActive = false;
    this.spawnRegularEnemies(level);
  }

  private spawnRegularEnemies(level: number): void {
    this.currentLevel = level;
    this.currentLevelWidth = this.scene.cameras.main.getBounds().right;

    if (this.waveSpawnSlots.length > 0) {
      this.spawnConfiguredWaveSet(level);
      return;
    }

    const fallbackWaves = generateLevelWaves(level);
    fallbackWaves.waves.forEach((wave, index) => {
      const fallbackSlot: WaveSpawnSlot = {
        x: 200 + index * 220,
        y: LEVEL_HEIGHT / 2,
        boxStartX: 80 + index * 220,
        boxStartY: 48,
        boxEndX: Math.min(this.currentLevelWidth - 80, 320 + index * 220),
        boxEndY: LEVEL_HEIGHT - 48,
        allowedPositions: POSITION_ALL,
      };
      this.spawnWave(wave, fallbackSlot, level);
    });
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

      const body = molecule.body as Phaser.Physics.Arcade.Body;
      body.setSize(32, 32);
      body.setCircle(16, 8, 8);
      body.setAllowGravity(false);
      body.setCollideWorldBounds(false);
      body.moves = false;

      (molecule as any)._isMolecule = true;

      this.enemyGroup.add(molecule);
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
      let wave: WaveConfig;
      if (bubbleIndices.has(index)) {
        if (Math.random() < (1 / 13)) {
          wave = this.createWaveConfig(EnemyType.BONUS_MOLECULE, level, slot.allowedPositions);
        } else {
          wave = this.createWaveConfig(EnemyType.PAINT_BUBBLES, level, slot.allowedPositions);
          wave.paintColor = levelPaintColor;
          wave.paintVariant = this.pickPaintBubbleVariant(slot.allowedPositions);
        }
      } else {
        wave = this.createWaveConfig(this.pickRegularEnemyType(slot.allowedPositions), level, slot.allowedPositions);
      }

      this.spawnWave(wave, slot, level);
    });
  }

  private spawnWave(wave: WaveConfig, slot: WaveSpawnSlot, level: number): void {
    const minX = Math.min(slot.boxStartX, slot.boxEndX);
    const maxX = Math.max(slot.boxStartX, slot.boxEndX);
    const minY = Math.min(slot.boxStartY, slot.boxEndY);
    const maxY = Math.max(slot.boxStartY, slot.boxEndY);
    const boxWidth = Math.max(1, maxX - minX);
    let xSpread = wave.xSpread;

    while (xSpread > 1 && (xSpread * Math.max(1, wave.count - 1)) > boxWidth) {
      xSpread -= 1;
    }

    const centerX = (minX + maxX) / 2;

    for (let i = 0; i < wave.count; i++) {
      const x = Phaser.Math.Clamp(centerX + (i - (wave.count - 1) / 2) * xSpread, minX, maxX);
      const y = this.pickSpawnY(wave, minY, maxY);
      this.spawnEnemyFromWave(x, y, wave, level);
    }
  }

  private pickSpawnY(wave: WaveConfig, minY: number, maxY: number): number {
    if (minY === maxY) {
      return minY;
    }

    switch (wave.type) {
      case EnemyType.HOLLOW_DIAMONDS:
      case EnemyType.HOLLOW_CIRCLES:
      case EnemyType.PLANES:
      case EnemyType.UP_AND_DOWNERS:
        return Phaser.Math.Between(minY, maxY);
      case EnemyType.PAINT_BUBBLES:
        // Middle bubbles wobble in the mid-field; edge bubbles bounce from the
        // roof/floor (C++ spawn_paintball_wave top_or_bottom_flag → start height).
        return wave.paintVariant === 'middle'
          ? Phaser.Math.Between(minY, maxY)
          : (Math.random() > 0.5 ? minY : maxY);
      default:
        return maxY;
    }
  }

  // C++ spawn_paintball_wave.txt switch on the wave's allowed position (1=T, 2=M,
  // 3=TM, 4=B, 5=TB, 6=MB, 7=TMB): decides whether this paint-bubble wave does
  // the mid-field circular wobble ('middle') or a roof/floor gravity bounce ('edge').
  private pickPaintBubbleVariant(allowedPositions: number): 'middle' | 'edge' {
    switch (allowedPositions) {
      case 2: // M
        return 'middle';
      case 1: // T
      case 4: // B
      case 5: // TB
        return 'edge';
      case 3: // TM → roof or middle
      case 6: // MB → floor or middle
        return Math.random() < 0.5 ? 'middle' : 'edge';
      case 7: // TMB → floor / roof / middle
      default:
        return Math.random() < (1 / 3) ? 'middle' : 'edge';
    }
  }

  private pickRegularEnemyType(allowedPositions: number): EnemyType {
    const queue = REGULAR_ENEMY_QUEUES[allowedPositions] ?? REGULAR_ENEMY_QUEUES[POSITION_ALL];
    let type = Phaser.Math.RND.pick(queue);

    if (type === EnemyType.SOLID_DIAMONDS && Math.random() > 0.5) {
      type = EnemyType.SOLID_DIAMONDS_DEVIANT;
    }

    return type;
  }

  private createWaveConfig(type: EnemyType, level: number, allowedPositions: number): WaveConfig {
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

    switch (type) {
      case EnemyType.PAINT_BUBBLES:
        minSpeed = 0;
        maxSpeed = 256;
        minGravity = 40;
        maxGravity = 56;
        gravity = Phaser.Math.Between(minGravity, maxGravity);
        xSpread = Phaser.Math.Between(16, 32);
        if (level >= 3) {
          firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_RANDOM;
        }
        firingFrequency = Math.max(30, 300 - (level * 35));
        firingInitialDelay = firingFrequency;
        break;

      case EnemyType.HOLLOW_DIAMONDS:
        minSpeed = 256;
        maxSpeed = 512;
        minVerticalSpeed = 256;
        maxVerticalSpeed = 768;
        xSpread = Phaser.Math.Between(16, 32);
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 300 - (level * 5));
        firingInitialDelay = 75;
        break;

      case EnemyType.CRABBY_BOUNCERS:
        minSpeed = 128;
        maxSpeed = 256;
        gravity = minGravity = maxGravity = 48;
        xSpread = Phaser.Math.Between(16, 48);
        firingFrequency = Math.max(30, 120 - (level * 5));
        firingInitialDelay = firingFrequency;
        break;

      case EnemyType.MOLECULE_BOUNCERS:
        minSpeed = 128;
        maxSpeed = 256;
        gravity = minGravity = maxGravity = 48;
        xSpread = Phaser.Math.Between(32, 48);
        firingBehaviour = Math.random() > 0.5
          ? (BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED)
          : (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED);
        firingFrequency = Math.max(30, 120 - (level * 5));
        firingInitialDelay = 300;
        break;

      case EnemyType.BONUS_MOLECULE:
        // C++ spawn_molecule_bonus_wave.txt:119-131 — zero horizontal/vertical
        // speed, zero gravity, no firing. They sit still (animated), scattered
        // in a box around the spawn centre, and drop a bonus pearl when killed.
        minSpeed = maxSpeed = 0;
        minVerticalSpeed = maxVerticalSpeed = 0;
        gravity = minGravity = maxGravity = 0;
        xSpread = Phaser.Math.Between(0, 96);   // SPECIAL_RAND(±box_width/2), capped 96
        // firingBehaviour stays BULLET_TYPE_NONE
        break;

      case EnemyType.HOLLOW_CIRCLES:
        minSpeed = 256;
        maxSpeed = 512;
        minVerticalSpeed = 256;
        maxVerticalSpeed = 768;
        xSpread = Phaser.Math.Between(16, 32);
        break;

      case EnemyType.SOLID_DIAMONDS:
        minVerticalSpeed = maxVerticalSpeed = 256;
        xSpread = Phaser.Math.Between(32, 48);
        break;

      case EnemyType.BOBBLE_HATS:
        minSpeed = 128;
        maxSpeed = 256;
        gravity = minGravity = maxGravity = 64;
        xSpread = Phaser.Math.Between(16, 48);
        firingBehaviour = BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 120 - (level * 5));
        firingInitialDelay = 200;
        break;

      case EnemyType.PLANES:
        minSpeed = maxSpeed = 512 + level * 64;
        xSpread = Phaser.Math.Between(16, 32);
        firingBehaviour = Math.random() > 0.5
          ? (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED)
          : BULLET_TYPE_NONE;
        firingFrequency = Math.max(30, 120 - (level * 5));
        firingInitialDelay = 200;
        break;

      case EnemyType.UP_AND_DOWNERS:
        minSpeed = 512 + level * 64;
        maxSpeed = 768 + level * 64;
        minVerticalSpeed = 512;
        maxVerticalSpeed = 768;
        xSpread = Phaser.Math.Between(16, 48);
        firingBehaviour = Math.random() > 0.5
          ? (BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED)
          : BULLET_TYPE_NONE;
        firingFrequency = Math.max(30, 120 - (level * 5));
        break;

      case EnemyType.SOLID_DIAMONDS_DEVIANT:
        minVerticalSpeed = 512;
        maxVerticalSpeed = 768;
        xSpread = Phaser.Math.Between(32, 48);
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(30, 300 - (level * 5));
        firingInitialDelay = 200;
        break;

      case EnemyType.FUZZ:
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED;
        firingFrequency = Math.max(20, 60 - (level * 3));
        break;
    }

    return {
      type,
      count,
      xSpread,
      ySpread: 0,
      minSpeed,
      maxSpeed,
      minVerticalSpeed,
      maxVerticalSpeed,
      gravity,
      minGravity,
      maxGravity,
      positionMask: allowedPositions,
      topOrBottom: 'random',
      firingBehaviour,
      firingFrequency,
      firingInitialDelay,
      bulletSpeedPercentage: 10000,
      waveSubType: 0,
      behaviourType: 0,
      startDistance: 0,
    };
  }

  private randomWaveSize(): number {
    const minSquared = MIN_WAVE_SIZE * MIN_WAVE_SIZE;
    const maxSquared = MAX_WAVE_SIZE * MAX_WAVE_SIZE;
    return Math.max(1, Math.round(Math.sqrt(minSquared + Math.random() * (maxSquared - minSquared))));
  }

  private spawnEnemyFromWave(x: number, y: number, wave: WaveConfig, _level: number): void {
    const spriteKey = wave.type < 8 ? 'enemies' : 'enemies02';
    const frame = wave.type % 8;

    const enemy = this.scene.physics.add.sprite(x, y, spriteKey, frame);
    enemy.setDisplaySize(48, 48);
    enemy.setDepth(Depth.ENEMY);
    enemy.setAlpha(1);
    enemy.setVisible(true);

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setCircle(16, 8.5);
    body.setCollideWorldBounds(true);
    body.setBounce(1, 1);

    const speedScale = 60 / PRIVATE_SCALE;

    let hSpeed = wave.minSpeed + Math.random() * (wave.maxSpeed - wave.minSpeed);
    let vSpeed = wave.minVerticalSpeed + Math.random() * (wave.maxVerticalSpeed - wave.minVerticalSpeed);

    let gravity = wave.gravity;
    if (wave.minGravity !== wave.maxGravity) {
      gravity = wave.minGravity + Math.random() * (wave.maxGravity - wave.minGravity);
    }

    // C++ start_movement (generic_level_enemy.txt:895-904): each enemy initially
    // heads TOWARD the player (if the ball is to its left, it goes left) rather
    // than a random direction.
    const towardPlayer = (this.playerRef && this.playerRef.x < x) ? -1 : 1;

    const data: EnemyData = {
      enemyType: wave.type,
      waveConfig: wave,
      xVelFixed: towardPlayer * hSpeed,
      yVelFixed: 0,
      gravityFixed: gravity,
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
      patrolStartX: x,
      patrolStartY: y,
      specialPath: null,
      pathPercentage: 0,
      pathPercentageSpeed: 0,
      pathSection: -1,
      baseWorldX: x,
      baseWorldY: y,
      startY: y,
      bounceFromFloor: true,
    };

    switch (wave.type) {
      case EnemyType.HOLLOW_DIAMONDS:
      case EnemyType.HOLLOW_CIRCLES:
        data.yVelFixed = (Math.random() > 0.5 ? 1 : -1) * vSpeed;
        data.gravityFixed = 0;
        break;

      case EnemyType.PAINT_BUBBLES: {
        data.yVelFixed = 0;
        // Middle bubbles wobble with NO gravity (the updatePaintBubbleBehaviour
        // wobble branch keys off gravityFixed === 0); edge bubbles keep gravity.
        if (wave.paintVariant === 'middle') {
          data.gravityFixed = 0;
        }
        // Tint the bubble its paint colour and remember it so the dropped
        // paintdrop matches (C++ paintdrop inherits paint_bubble_colour_flag).
        const pc = wave.paintColor ?? 0;
        data.paintColor = pc;
        enemy.setTint(PAINT_TINTS[pc] ?? PAINT_TINTS[0]);
        break;
      }

      case EnemyType.CRABBY_BOUNCERS:
      case EnemyType.MOLECULE_BOUNCERS:
        data.yVelFixed = 0;
        break;

      case EnemyType.BONUS_MOLECULE:
        // Stationary pearl-dropper: no velocity, no gravity (animates in place).
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        data.gravityFixed = 0;
        break;

      case EnemyType.BOBBLE_HATS:
        data.yVelFixed = 0;
        // C++ bobble hats: spawn near floor or ceiling, gravity-based bounce
        data.gravityFixed = BOBBLE_HAT_GRAVITY;
        data.startY = BOBBLE_HAT_START_DISTANCE;
        data.bounceFromFloor = Math.random() > 0.5;
        if (data.bounceFromFloor) {
          data.baseWorldY = LEVEL_HEIGHT - BOBBLE_HAT_START_DISTANCE;
        } else {
          data.baseWorldY = BOBBLE_HAT_START_DISTANCE;
          data.gravityFixed = -BOBBLE_HAT_GRAVITY;
        }
        data.firingCooldown = BOBBLE_HAT_INITIAL_FIRING_DELAY;
        break;

      case EnemyType.PLANES:
        data.storedVerticalSpeed = vSpeed;
        data.yVelFixed = 0;
        data.behaviourState = BEHAVIOUR_STATE_HORIZONTAL;
        data.behaviourCounter = Math.floor(PLANE_BEHAVIOUR_DISTANCE_HORIZONTAL / hSpeed);
        break;

      case EnemyType.UP_AND_DOWNERS:
        data.storedHorizontalSpeed = data.xVelFixed;
        data.storedVerticalSpeed = (Math.random() > 0.5 ? 1 : -1) * vSpeed;
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        data.behaviourState = BEHAVIOUR_STATE_PAUSED;
        data.behaviourCounter = UAD_BEHAVIOUR_LENGTH_PAUSED;
        data.skipFirstShot = true;
        break;

      case EnemyType.SOLID_DIAMONDS:
        // C++ solid diamonds follow a special path (parametric datatable)
        // They don't use velocity-based movement - position is set directly
        data.yVelFixed = 0;
        data.xVelFixed = 0;
        data.specialPath = new SpecialPath(SOLID_DIAMOND_SPECIAL_PATH);
        data.pathPercentage = 0;
        data.pathPercentageSpeed = SOLID_DIAMOND_PERCENTAGE_SPEED;
        data.pathSection = -1;
        data.baseWorldX = x;
        // C++ spawn_solid_diamond_wave.txt:97-100 anchors the path base Y to a
        // FIXED SOLID_DIAMOND_START_DISTANCE (224, top), not the spawn-slot Y, so
        // diamonds always ride at the correct height regardless of spawn box.
        data.baseWorldY = SOLID_DIAMOND_START_DISTANCE;
        // C++ start_movement mirrors the path toward the player (the case below
        // can't, since xVel is 0 here). PATH_CURRENT_OFFSET_X * direction_multiplier.
        data.directionMultiplier = towardPlayer;
        // Solid diamonds don't collide with world bounds - path controls position
        body.setCollideWorldBounds(false);
        body.setAllowGravity(false);
        body.setVelocity(0, 0);
        break;

      case EnemyType.SOLID_DIAMONDS_DEVIANT:
        data.xVelFixed = 0;
        data.yVelFixed = (Math.random() > 0.5 ? 1 : -1) * vSpeed;
        break;

      case EnemyType.FUZZ:
        // C++ fuzz follows a special path (randomly chosen A or B)
        data.gravityFixed = 0;
        data.xVelFixed = 0;
        data.yVelFixed = 0;
        data.specialPath = new SpecialPath(
          Math.random() > 0.5 ? FUZZ_TYPE_A_SPECIAL_PATH : FUZZ_TYPE_B_SPECIAL_PATH
        );
        data.pathPercentage = 0;
        data.pathPercentageSpeed = FUZZ_PERCENTAGE_SPEED;
        data.pathSection = -1;
        data.baseWorldX = x;
        data.baseWorldY = y;
        // Fuzz ignores world collision entirely
        body.setCollideWorldBounds(false);
        body.setAllowGravity(false);
        body.setVelocity(0, 0);
        break;

      default:
        break;
    }

    const phaserVelX = data.xVelFixed * speedScale;
    const phaserVelY = data.yVelFixed * speedScale;
    enemy.setVelocity(phaserVelX, phaserVelY);

    if (data.gravityFixed > 0) {
      body.setGravityY(data.gravityFixed * speedScale);
    }

    if (data.xVelFixed < 0) {
      enemy.setFlipX(true);
      data.directionMultiplier = -1;
    }

    (enemy as any)._data = data;

    this.enemyGroup.add(enemy);
    this.enemies.push(enemy);
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

    const wave = this.createWaveConfig(EnemyType.FUZZ, level, 0);
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
          this.updateBasicBounce(enemy, data, body, speedScale);
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

        if (data.firingBehaviour !== BULLET_TYPE_NONE) {
          if (!data.skipFirstShot) {
            this.fireBulletAtPlayer(enemy, data);
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
      // Exit: straight-line velocity (C++ uses direction_multiplier * 5376)
      const exitVelX = data.directionMultiplier * FUZZ_EXIT_SPEED * speedScale;
      enemy.setVelocity(exitVelX, 0);

      // C++ generic_level_enemy.txt:321-325 + 775-779 — once the Fuzz leaves the
      // screen it removes itself from the level count and kills itself. Without
      // this it flies off forever with collideWorldBounds disabled, so the active
      // enemy count never reaches zero, maybeSpawnReplacementWave() never fires
      // again, and the level runs out of paint bubbles permanently.
      const camCentreX = this.scene.cameras.main.scrollX + this.scene.cameras.main.width / 2;
      if (Math.abs(enemy.x - camCentreX) >= OFF_SCREEN_DISTANCE) {
        enemy.destroy();
      }
    }
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
    // C++ bounce_vertically_by_set_power formula:
    // Uses s = (a * t^2) / 2  =>  t = sqrt(2s/a)
    // Then y_vel = a * t * direction
    // This gives a physics-accurate bounce that returns to the start height

    if (data.bounceFromFloor) {
      if (body.blocked.down) {
        // Calculate bounce velocity from distance fallen
        const dist = Math.abs(enemy.y - data.baseWorldY);
        const gravity = Math.abs(data.gravityFixed);
        if (gravity > 0 && dist > 0) {
          const s = dist * 2;
          const a = gravity;
          const t = Math.sqrt(s / a);
          const bounceVel = -(a * t);
          // Ensure minimum bounce
          data.yVelFixed = Math.min(bounceVel, -768);
          enemy.setVelocityY(data.yVelFixed * speedScale);
        }
      }
    } else {
      if (body.blocked.up) {
        // Bouncing from ceiling
        const dist = Math.abs(data.baseWorldY - enemy.y);
        const gravity = Math.abs(data.gravityFixed);
        if (gravity > 0 && dist > 0) {
          const s = dist * 2;
          const a = gravity;
          const t = Math.sqrt(s / a);
          const bounceVel = a * t;
          data.yVelFixed = Math.max(bounceVel, 768);
          enemy.setVelocityY(data.yVelFixed * speedScale);
        }
      }
    }

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
    // C++ paint bubbles have two variants:
    // Middle position: circular wobble (sin/cos pattern)
    // Top/bottom: gravity bounce with squash/stretch
    // Since we don't track spawn position variant, use gravity bounce
    // but add the C++ middle deviation wobble for variety
    if (data.gravityFixed > 0) {
      // Gravity-based bounce (standard paint bubble)
      if (body.blocked.left) {
        data.xVelFixed = Math.abs(data.xVelFixed);
        enemy.setVelocityX(data.xVelFixed * speedScale);
      } else if (body.blocked.right) {
        data.xVelFixed = -Math.abs(data.xVelFixed);
        enemy.setVelocityX(data.xVelFixed * speedScale);
      }
      if (body.blocked.down) {
        // C++ bounce: recalculate y_vel from energy conservation
        const startY = 48; // approximate top start Y
        const dist = Math.abs(enemy.y - startY);
        const s = dist * 2;
        const a = data.gravityFixed;
        if (a > 0 && s > 0) {
          const t = Math.sqrt(s / a);
          data.yVelFixed = -Math.trunc(a * t);
          const minBounce = 768;
          if (Math.abs(data.yVelFixed) < minBounce) {
            data.yVelFixed = -minBounce;
          }
          enemy.setVelocityY(data.yVelFixed * speedScale);
        }
      }
    } else {
      // Middle variant: circular wobble. C++ generic_level_enemy.txt:524-527 —
      // x_vel = 768·sin(angle)·dir, y_vel = -768·cos(angle), angle += 250.
      data.behaviourCounter = (data.behaviourCounter + 250) % 36000;
      const angle = (data.behaviourCounter / 36000) * Math.PI * 2;
      data.xVelFixed = Math.sin(angle) * 768 * data.directionMultiplier;
      data.yVelFixed = -Math.cos(angle) * 768;
      enemy.setVelocity(data.xVelFixed * speedScale, data.yVelFixed * speedScale);
    }
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

  private updateFiring(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    if (data.firingBehaviour === BULLET_TYPE_NONE) return;
    if (!this.playerRef || !this.playerRef.active) return;
    if (this.enemyBulletCount >= MAX_ENEMY_BULLETS) return;

    // C++ firing frequency logic:
    // BULLET_FREQUENCY_RANDOM: SPECIAL_RAND(0, firingFrequency) - fires when result is 0
    // BULLET_FREQUENCY_FIXED: countdown timer, fires when reaches 0
    if ((data.firingBehaviour & BULLET_FREQUENCY_FIXED) !== 0) {
      data.firingCooldown--;
      if (data.firingCooldown > 0) return;
      data.firingCooldown = data.firingFrequency;
    } else {
      // Random frequency: C++ fires when SPECIAL_RAND(0, freq) == 0
      // This gives a 1/freq chance per frame
      if (Math.floor(Math.random() * data.firingFrequency) !== 0) return;
    }

    // C++ bullet speed modifier: (10000 / CONST_NUMBER_OF_LEVELS_MINUS_ONE) * player_level % bulletSpeedPercentage
    // CONST_NUMBER_OF_LEVELS_MINUS_ONE = 7
    const levelSpeedMod = Math.floor((10000 / 7) * this.currentLevel) % data.bulletSpeedPercentage;
    const bulletSpeedFixed = Phaser.Math.Linear(
      MINIMUM_ENEMY_BULLET_SPEED,
      MAXIMUM_ENEMY_BULLET_SPEED,
      levelSpeedMod / 10000
    );
    const bulletSpeedPxSec = (bulletSpeedFixed / PRIVATE_SCALE) * 60;

    if ((data.firingBehaviour & BULLET_TYPE_SPREAD) !== 0) {
      this.fireSpreadBullets(enemy, bulletSpeedPxSec);
    } else if ((data.firingBehaviour & BULLET_TYPE_SINGLE_DIRECTED) !== 0) {
      this.fireDirectedBullet(enemy, bulletSpeedPxSec);
    }
  }

  private fireBulletAtPlayer(enemy: Phaser.Physics.Arcade.Sprite, data: EnemyData): void {
    const bulletSpeedFixed = Phaser.Math.Linear(
      MINIMUM_ENEMY_BULLET_SPEED,
      MAXIMUM_ENEMY_BULLET_SPEED,
      data.bulletSpeedPercentage / 10000
    );
    const bulletSpeedPxSec = (bulletSpeedFixed / PRIVATE_SCALE) * 60;

    if ((data.firingBehaviour & BULLET_TYPE_SPREAD) !== 0) {
      this.fireSpreadBullets(enemy, bulletSpeedPxSec);
    } else if ((data.firingBehaviour & BULLET_TYPE_SINGLE_DIRECTED) !== 0) {
      this.fireDirectedBullet(enemy, bulletSpeedPxSec);
    }
  }

  private fireDirectedBullet(enemy: Phaser.Physics.Arcade.Sprite, speedPxSec: number): void {
    if (!this.playerRef) return;

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

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setCircle(4);
    body.setVelocity(vx, vy);
    body.setGravityY(0);
    body.setCollideWorldBounds(false);

    (bullet as any)._isEnemyBullet = true;
    this.enemyBulletGroup.add(bullet);
    this.enemyBulletCount++;

    this.scene.time.delayedCall(3000, () => {
      if (bullet.active) {
        this.releaseEnemyBullet(bullet);
      }
    });
  }

  private cleanupBullets(): void {
    const bounds = this.scene.cameras.main.getBounds();
    const padding = 100;

    this.enemyBulletGroup.children.each((child: Phaser.GameObjects.GameObject) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.x < bounds.x - padding || bullet.x > bounds.right + padding ||
          bullet.y < bounds.y - padding || bullet.y > bounds.bottom + padding) {
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
