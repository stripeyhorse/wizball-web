import { EnemyType } from '../types/enemies';

// Firing behavior types from C++ generic_level_enemy.txt:92-96
export const BULLET_TYPE_NONE = 0;
export const BULLET_TYPE_SINGLE_DIRECTED = 1;
export const BULLET_TYPE_SPREAD = 2;
export const BULLET_FREQUENCY_RANDOM = 4;
export const BULLET_FREQUENCY_FIXED = 8;

// Spawn position bitflags from C++ constant.txt:221-227
export const POSITION_NONE = 0;
export const POSITION_TOP = 1;
export const POSITION_MIDDLE = 2;
export const POSITION_TOP_MIDDLE = 3;
export const POSITION_BOTTOM = 4;
export const POSITION_TOP_BOTTOM = 5;
export const POSITION_MIDDLE_BOTTOM = 6;
export const POSITION_ALL = 7;

// Vertical placement (C++ top_or_bottom_flag, generic_level_enemy.txt:86-90).
// The spawn scripts roll ONE of these per wave and hand it to every child; the
// child then uses it to turn passed_in_*_height into a world Y and to pick the
// sign of its gravity (generic_level_enemy.txt:254-282).
export const VERTICAL_PLACEMENT_UNSET = 0;
export const VERTICAL_BOUNCE_FLOOR = 1;
export const VERTICAL_BOUNCE_ROOF = 2;
export const VERTICAL_POSITION_TOP = 3;
export const VERTICAL_POSITION_MIDDLE = 4;
export const VERTICAL_POSITION_BOTTOM = 5;

export interface WaveConfig {
  type: EnemyType;
  count: number;
  xSpread: number;
  // Horizontal speed (fixed-point, 256 = 1 pixel/frame). For WAVE_SUB_TYPE_UNIFORM
  // waves the spawn script rolls one value and min === max.
  minSpeed: number;
  maxSpeed: number;
  // Vertical speed (fixed-point)
  minVerticalSpeed: number;
  maxVerticalSpeed: number;
  // Gravity (fixed-point). Unsigned — the sign comes from verticalPlacement.
  gravity: number;
  minGravity: number;
  maxGravity: number;
  // C++ passed_in_min_height / passed_in_max_height. Usually a DISTANCE from
  // the roof/floor rather than an absolute Y — see verticalPlacement.
  minHeight: number;
  maxHeight: number;
  verticalPlacement: number;
  // Spawn position bitflag the slot allows
  positionMask: number;
  // Firing
  firingBehaviour: number;
  firingFrequency: number;
  firingInitialDelay: number;
  // Enemy bullet speed percentage (10000 = 100%)
  bulletSpeedPercentage: number;
  // Paint-bubble colour (0=Red, 1=Green, 2=Blue). Only set for PAINT_BUBBLES
  // waves so the dropped paintdrop matches the bubble that was shot.
  paintColor?: number;
}
