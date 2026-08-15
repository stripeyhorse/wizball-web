import { EnemyType } from '../types/enemies';

// Firing behavior types from C++ generic_level_enemy.txt
export const BULLET_TYPE_NONE = 0;
export const BULLET_TYPE_SINGLE_DIRECTED = 1;
export const BULLET_TYPE_SPREAD = 2;
export const BULLET_FREQUENCY_RANDOM = 4;
export const BULLET_FREQUENCY_FIXED = 8;

// Spawn position bitflags from C++
export const POSITION_NONE = 0;
export const POSITION_TOP = 1;
export const POSITION_MIDDLE = 2;
export const POSITION_TOP_MIDDLE = 3;
export const POSITION_BOTTOM = 4;
export const POSITION_TOP_BOTTOM = 5;
export const POSITION_MIDDLE_BOTTOM = 6;
export const POSITION_ALL = 7;

// Vertical position constants
export const VERTICAL_POSITION_TOP = 0;
export const VERTICAL_POSITION_BOTTOM = 1;

// Wave sub-types
export const WAVE_SUBTYPE_UNIFORM = 0;
export const WAVE_SUBTYPE_RANDOM = 1;

export interface WaveConfig {
  type: EnemyType;
  count: number;
  xSpread: number;
  ySpread: number;
  // Horizontal speed (fixed-point, 256 = 1 pixel/frame)
  minSpeed: number;
  maxSpeed: number;
  // Vertical speed (fixed-point)
  minVerticalSpeed: number;
  maxVerticalSpeed: number;
  // Gravity (fixed-point)
  gravity: number;
  minGravity: number;
  maxGravity: number;
  // Spawn position
  positionMask: number;
  topOrBottom: 'top' | 'bottom' | 'middle' | 'random';
  // Firing
  firingBehaviour: number;
  firingFrequency: number;
  firingInitialDelay: number;
  // Enemy bullet speed percentage (10000 = 100%)
  bulletSpeedPercentage: number;
  // Behavior
  waveSubType: number;
  // Behavior-specific params
  behaviourType: number;
  startDistance: number;
  // Paint-bubble colour (0=Red, 1=Green, 2=Blue). Only set for PAINT_BUBBLES
  // waves so the dropped paintdrop matches the bubble that was shot.
  paintColor?: number;
  // Paint-bubble vertical variant (C++ top_or_bottom_flag): 'middle' bubbles do
  // a circular wobble with no gravity; 'edge' bubbles gravity-bounce off the
  // floor/ceiling. Only set for PAINT_BUBBLES waves.
  paintVariant?: 'middle' | 'edge';
}

export interface LevelWaves {
  level: number;
  waves: WaveConfig[];
}

// Enemy constants from C++ constant.txt
const ENEMY_CONSTANTS: Record<number, Partial<WaveConfig>> = {
  [EnemyType.PAINT_BUBBLES]: {
    minSpeed: 0,
    maxSpeed: 256,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 48, // mid-range default
    minGravity: 40,
    maxGravity: 56,
    positionMask: POSITION_ALL,
    firingBehaviour: BULLET_TYPE_NONE, // conditional on level >= 3
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 272,
  },
  [EnemyType.HOLLOW_DIAMONDS]: {
    minSpeed: 256,
    maxSpeed: 512,
    minVerticalSpeed: 256,
    maxVerticalSpeed: 768,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_RANDOM,
    startDistance: 0,
  },
  [EnemyType.CRABBY_BOUNCERS]: {
    minSpeed: 128,
    maxSpeed: 256,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 48,
    minGravity: 48,
    maxGravity: 48,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_NONE,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_RANDOM,
    startDistance: 120, // mid of 96-144
  },
  [EnemyType.MOLECULE_BOUNCERS]: {
    minSpeed: 128,
    maxSpeed: 256,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 48,
    minGravity: 48,
    maxGravity: 48,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED, // 50% chance of spread
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 272,
  },
  [EnemyType.BONUS_MOLECULE]: {
    // C++ spawn_molecule_bonus_wave.txt: a stationary pearl-dropper — zero
    // speed/gravity, no firing (matches EnemySystem.createWaveConfig). The old
    // moving+firing config contradicted the runtime one.
    minSpeed: 0,
    maxSpeed: 0,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_NONE,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 0,
  },
  [EnemyType.HOLLOW_CIRCLES]: {
    minSpeed: 256,
    maxSpeed: 512,
    minVerticalSpeed: 256,
    maxVerticalSpeed: 768,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_NONE,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_RANDOM,
    startDistance: 0,
  },
  [EnemyType.SOLID_DIAMONDS]: {
    minSpeed: 0,
    maxSpeed: 0,
    minVerticalSpeed: 256,
    maxVerticalSpeed: 256,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_MIDDLE_BOTTOM,
    firingBehaviour: BULLET_TYPE_NONE,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 224,
  },
  [EnemyType.BOBBLE_HATS]: {
    minSpeed: 128,
    maxSpeed: 256,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 64,
    minGravity: 64,
    maxGravity: 64,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_RANDOM,
    startDistance: 128,
  },
  [EnemyType.PLANES]: {
    minSpeed: 512,
    maxSpeed: 512,
    minVerticalSpeed: 0, // calculated as speed/2 at runtime
    maxVerticalSpeed: 0,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP,
    firingBehaviour: BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED, // 50% chance
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 96,
  },
  [EnemyType.UP_AND_DOWNERS]: {
    minSpeed: 512,
    maxSpeed: 768,
    minVerticalSpeed: 512, // same as horizontal
    maxVerticalSpeed: 768,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_SPREAD, // 50% chance
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 32,
  },
  [EnemyType.SOLID_DIAMONDS_DEVIANT]: {
    minSpeed: 0,
    maxSpeed: 0,
    minVerticalSpeed: 512,
    maxVerticalSpeed: 768,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_TOP_BOTTOM,
    firingBehaviour: BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_RANDOM,
    startDistance: 0,
  },
  [EnemyType.FUZZ]: {
    minSpeed: 0,
    maxSpeed: 0,
    minVerticalSpeed: 0,
    maxVerticalSpeed: 0,
    gravity: 0,
    minGravity: 0,
    maxGravity: 0,
    positionMask: POSITION_ALL,
    firingBehaviour: BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED,
    bulletSpeedPercentage: 10000,
    waveSubType: WAVE_SUBTYPE_UNIFORM,
    startDistance: 0,
  },
};

// Enemy queue: which types can spawn at each position
// From C++ enemy_queues.txt
// Regular-enemy queues per screen position, transcribed from the C++
// datatables/enemy_queues.txt (sizes from enemy_queue_sizes.txt: 0,7,2,7,6,5,7,8).
// PAINT_BUBBLES is the leading element of each C++ row but is NOT part of the
// regular queue (it's the separate bubble-wave path), so it's excluded here.
const ENEMY_QUEUES: Record<number, EnemyType[]> = {
  [POSITION_TOP]: [ // 1
    EnemyType.HOLLOW_DIAMONDS, EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES, EnemyType.BOBBLE_HATS, EnemyType.PLANES, EnemyType.UP_AND_DOWNERS
  ],
  [POSITION_MIDDLE]: [ // 2
    EnemyType.HOLLOW_DIAMONDS, EnemyType.HOLLOW_CIRCLES
  ],
  [POSITION_TOP_MIDDLE]: [ // 3
    EnemyType.HOLLOW_DIAMONDS, EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES, EnemyType.BOBBLE_HATS, EnemyType.PLANES, EnemyType.UP_AND_DOWNERS
  ],
  [POSITION_BOTTOM]: [ // 4 (no planes)
    EnemyType.HOLLOW_DIAMONDS, EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES, EnemyType.BOBBLE_HATS, EnemyType.UP_AND_DOWNERS
  ],
  [POSITION_TOP_BOTTOM]: [ // 5 (no hollow diamonds/circles)
    EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.BOBBLE_HATS, EnemyType.PLANES, EnemyType.UP_AND_DOWNERS
  ],
  [POSITION_MIDDLE_BOTTOM]: [ // 6 (solid diamonds appear)
    EnemyType.HOLLOW_DIAMONDS, EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES, EnemyType.SOLID_DIAMONDS, EnemyType.BOBBLE_HATS, EnemyType.UP_AND_DOWNERS
  ],
  [POSITION_ALL]: [ // 7 (all)
    EnemyType.HOLLOW_DIAMONDS, EnemyType.CRABBY_BOUNCERS, EnemyType.MOLECULE_BOUNCERS,
    EnemyType.HOLLOW_CIRCLES, EnemyType.SOLID_DIAMONDS, EnemyType.BOBBLE_HATS,
    EnemyType.PLANES, EnemyType.UP_AND_DOWNERS
  ],
};

// Wave size constants from C++
const MIN_WAVE_SIZE = 8;
const MAX_WAVE_SIZE = 10;
const PAINTBALL_WAVE_COUNT_C64 = 3;

function createWaveConfig(type: EnemyType, level: number, count: number): WaveConfig {
  const defaults = ENEMY_CONSTANTS[type] ?? {};
  const levelSpeedBonus = (type === EnemyType.PLANES || type === EnemyType.UP_AND_DOWNERS)
    ? level * 64
    : 0;

  // Calculate firing frequency (decreases with level = fires more often)
  let firingFreq = 300;
  let firingDelay = 75;
  let firingBehaviour = defaults.firingBehaviour ?? BULLET_TYPE_NONE;

  switch (type) {
    case EnemyType.PAINT_BUBBLES:
      // Only fires from level 3+
      if (level >= 3) {
        firingBehaviour = BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_RANDOM;
      } else {
        firingBehaviour = BULLET_TYPE_NONE;
      }
      firingFreq = 300 - (level * 35);
      firingDelay = firingFreq;
      break;
    case EnemyType.HOLLOW_DIAMONDS:
      firingFreq = 300 - (level * 5);
      firingDelay = 75;
      break;
    case EnemyType.CRABBY_BOUNCERS:
      firingFreq = 120 - (level * 5);
      firingDelay = firingFreq;
      firingBehaviour = BULLET_TYPE_NONE; // crabbies don't fire
      break;
    case EnemyType.MOLECULE_BOUNCERS:
      firingFreq = 120 - (level * 5);
      firingDelay = 300;
      // 50% chance of spread or single directed
      firingBehaviour = Math.random() > 0.5
        ? (BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED)
        : (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED);
      break;
    case EnemyType.BONUS_MOLECULE:
      // Stationary pearl-dropper — never fires (C++ spawn_molecule_bonus_wave.txt).
      firingFreq = 120 - (level * 5);
      firingDelay = 300;
      firingBehaviour = BULLET_TYPE_NONE;
      break;
    case EnemyType.BOBBLE_HATS:
      firingFreq = 120 - (level * 5);
      firingDelay = 200;
      break;
    case EnemyType.PLANES:
      firingFreq = 120 - (level * 5);
      firingDelay = 200;
      // 50% chance of firing
      firingBehaviour = Math.random() > 0.5
        ? (BULLET_TYPE_SINGLE_DIRECTED | BULLET_FREQUENCY_FIXED)
        : BULLET_TYPE_NONE;
      break;
    case EnemyType.UP_AND_DOWNERS:
      firingFreq = 120 - (level * 5);
      firingDelay = 0;
      // 50% chance of spread
      firingBehaviour = Math.random() > 0.5
        ? (BULLET_TYPE_SPREAD | BULLET_FREQUENCY_FIXED)
        : BULLET_TYPE_NONE;
      break;
    case EnemyType.SOLID_DIAMONDS_DEVIANT:
      firingFreq = 300 - (level * 5);
      firingDelay = 200;
      break;
    case EnemyType.FUZZ:
      firingFreq = 60 - (level * 3);
      firingDelay = 0;
      break;
    default:
      firingFreq = 300;
      firingDelay = 100;
  }

  // xSpread varies by type
  let xSpread = 24;
  switch (type) {
    case EnemyType.PAINT_BUBBLES:
    case EnemyType.HOLLOW_DIAMONDS:
    case EnemyType.HOLLOW_CIRCLES:
    case EnemyType.PLANES:
      xSpread = 16 + Math.random() * 16; // rand(16, 32)
      break;
    case EnemyType.CRABBY_BOUNCERS:
    case EnemyType.BOBBLE_HATS:
    case EnemyType.UP_AND_DOWNERS:
      xSpread = 16 + Math.random() * 32; // rand(16, 48)
      break;
    case EnemyType.MOLECULE_BOUNCERS:
    case EnemyType.BONUS_MOLECULE:
    case EnemyType.SOLID_DIAMONDS:
    case EnemyType.SOLID_DIAMONDS_DEVIANT:
      xSpread = 32 + Math.random() * 16; // rand(32, 48)
      break;
    default:
      xSpread = 24;
  }

  // Determine topOrBottom from positionMask
  let topOrBottom: 'top' | 'bottom' | 'middle' | 'random' = 'random';
  const mask = defaults.positionMask ?? POSITION_ALL;
  if (mask === POSITION_TOP) topOrBottom = 'top';
  else if (mask === POSITION_BOTTOM) topOrBottom = 'bottom';
  else if (mask === POSITION_MIDDLE) topOrBottom = 'middle';
  else if (mask === POSITION_TOP_BOTTOM) topOrBottom = Math.random() > 0.5 ? 'top' : 'bottom';
  else topOrBottom = 'random';

  return {
    type,
    count,
    xSpread,
    ySpread: 0,
    minSpeed: (defaults.minSpeed ?? 128) + levelSpeedBonus,
    maxSpeed: (defaults.maxSpeed ?? 256) + levelSpeedBonus,
    minVerticalSpeed: defaults.minVerticalSpeed ?? 0,
    maxVerticalSpeed: defaults.maxVerticalSpeed ?? 0,
    gravity: defaults.gravity ?? 0,
    minGravity: defaults.minGravity ?? 0,
    maxGravity: defaults.maxGravity ?? 0,
    positionMask: mask,
    topOrBottom,
    firingBehaviour,
    firingFrequency: Math.max(30, firingFreq),
    firingInitialDelay: Math.max(0, firingDelay),
    bulletSpeedPercentage: defaults.bulletSpeedPercentage ?? 10000,
    waveSubType: defaults.waveSubType ?? WAVE_SUBTYPE_UNIFORM,
    behaviourType: 0,
    startDistance: defaults.startDistance ?? 0,
  };
}

/**
 * Generate waves for a level using the C++ wave selection algorithm.
 * - Total wave count comes from spawn points (we use a reasonable default)
 * - Some waves are paint bubble waves, rest are random enemy types
 * - Paint bubble waves have 1/13 chance of bonus molecule
 * - Regular waves select from enemy queue based on position constraints
 */
export function generateLevelWaves(level: number, waveCount?: number): LevelWaves {
  // C++ gets wave count from spawn points. Use reasonable defaults per level.
  const totalWaves = waveCount ?? (6 + Math.floor(level * 1.5));
  const paintBubbleCount = PAINTBALL_WAVE_COUNT_C64;

  // Wave size: sqrt(rand(MIN^2, MAX^2))
  const waveSize = () => {
    const minSq = MIN_WAVE_SIZE * MIN_WAVE_SIZE;
    const maxSq = MAX_WAVE_SIZE * MAX_WAVE_SIZE;
    return Math.round(Math.sqrt(minSq + Math.random() * (maxSq - minSq)));
  };

  const waves: WaveConfig[] = [];

  // Create bitflag to determine which waves are paint vs regular
  // C++ randomly assigns paintBubbleCount waves as paint
  const paintIndices = new Set<number>();
  while (paintIndices.size < Math.min(paintBubbleCount, totalWaves)) {
    paintIndices.add(Math.floor(Math.random() * totalWaves));
  }

  // Available position mask - use ALL for simplicity (C++ derives from spawn point zone data)
  const positionMask = POSITION_ALL;
  const availableQueue = ENEMY_QUEUES[positionMask] ?? ENEMY_QUEUES[POSITION_ALL];

  for (let i = 0; i < totalWaves; i++) {
    const count = waveSize();

    if (paintIndices.has(i)) {
      // Paint bubble wave (1/13 chance of bonus molecule)
      const isBonusMolecule = Math.random() < (1 / 13);
      if (isBonusMolecule) {
        waves.push(createWaveConfig(EnemyType.BONUS_MOLECULE, level, count));
      } else {
        waves.push(createWaveConfig(EnemyType.PAINT_BUBBLES, level, count));
      }
    } else {
      // Regular enemy wave - pick random type from queue
      let enemyType = availableQueue[Math.floor(Math.random() * availableQueue.length)];

      // Solid diamonds: 50/50 chance of deviant
      if (enemyType === EnemyType.SOLID_DIAMONDS && Math.random() > 0.5) {
        enemyType = EnemyType.SOLID_DIAMONDS_DEVIANT;
      }

      waves.push(createWaveConfig(enemyType, level, count));
    }
  }

  return { level, waves };
}

// Legacy API for compatibility
export function getLevelWaves(level: number): LevelWaves | undefined {
  return generateLevelWaves(level);
}
