export const BOOT = 'Boot';
export const PRELOAD = 'Preload';
export const GAME = 'Game';
export const TITLE = 'Title';
export const SETTINGS = 'Settings';
export const PAUSE = 'Pause';

/**
 * C++ constant.txt:511. Every score add in the scripts carries the
 * `!> MAXIMUM_POSSIBLE_SCORE` clamp — the in-level awards, the laboratory entry
 * bonus (main_game_controller.txt:509), the decline bonus
 * (lab_manage_permanent_upgrade_icons.txt:166) and the fly-through
 * (flythru.txt:35) alike. It lives here so every scene that awards points clamps
 * against the same number instead of keeping a private copy.
 */
export const MAXIMUM_POSSIBLE_SCORE = 9999999;

export enum PaintColor {
  RED = 0,
  GREEN = 1,
  BLUE = 2,
  YELLOW = 3
}

export enum MovementStyle {
  BASIC_BOUNCE = 0,
  CONTROLLED_BOUNCE = 1,
  FULL_CONTROL = 2
}

export enum WeaponFlag {
  LATERAL_CONTROL = 1,
  VERTICAL_CONTROL = 2,
  SHIELD_FIRE = 4,
  REAR_FIRE = 8,
  CATELLITE = 16,
  DOUBLE_FIRE = 32,
  WIZ_SPREAD_FIRE = 64,
  CAT_SPREAD_FIRE = 128,
  SMART_BOMB = 256,
  INVULNERABILITY = 512,
  CATELLITE_INVULNERABILITY = 1024,
  // Timed powerup flags
  FREAKY_BITS = 2048,
  FILTH_RAID = 4096,
  MUTANT_CAT = 8192,
  INDESTRUCTACAT = 16384
}

export interface RoomData {
  id: number;
  width: number;
  height: number;
  tilemap: string;
  exits: Exit[];
  spawnPoint: { x: number; y: number };
  paintPercentageRequired: number;
}

export interface Exit {
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  targetRoom: number;
}
