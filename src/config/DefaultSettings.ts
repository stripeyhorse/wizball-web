import Phaser from 'phaser';
import type { GameSettings } from '../types/settings';

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    resolutionScale: 1,
    fullscreen: false,
    pixelArtSmoothing: false,
    showFPS: false,
    crtMode: 'amiga', // tasteful Amiga-500 CRT on by default; 'off' / 'c64' in Settings
  },
  bindings: {
    moveLeft:  { keyboard: Phaser.Input.Keyboard.KeyCodes.LEFT,  gamepadButton: 14 },  // D-pad left
    moveRight: { keyboard: Phaser.Input.Keyboard.KeyCodes.RIGHT, gamepadButton: 12 },  // D-pad right
    moveUp:    { keyboard: Phaser.Input.Keyboard.KeyCodes.UP,    gamepadButton: 11 },  // D-pad up
    moveDown:  { keyboard: Phaser.Input.Keyboard.KeyCodes.DOWN,  gamepadButton: 13 },  // D-pad down
    fire:      { keyboard: Phaser.Input.Keyboard.KeyCodes.SPACE, gamepadButton: 0 },   // A / Cross
    altFire:   { keyboard: Phaser.Input.Keyboard.KeyCodes.Z,     gamepadButton: 2 },   // X / Square (bonus select)
    pause:     { keyboard: Phaser.Input.Keyboard.KeyCodes.ESC,   gamepadButton: 9 },   // Start
  },
  gamepad: {
    deadzone: 0.15,
    analogMovement: true,
  },
  version: SETTINGS_VERSION,
};
