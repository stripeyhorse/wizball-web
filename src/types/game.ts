export const BOOT = 'Boot';
export const PRELOAD = 'Preload';
export const GAME = 'Game';
export const MAIN_MENU = 'MainMenu';
export const GAME_SCENE = 'GameScene';

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
  INVULNERABILITY = 256,
  CATELLITE_INVULNERABILITY = 512
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
