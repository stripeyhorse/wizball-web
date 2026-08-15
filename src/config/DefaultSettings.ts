import Phaser from 'phaser';
import type { GameSettings } from '../types/settings';

// v2: added `audio` + `ui`, dropped the broken `graphics.resolutionScale` and
// the never-re-applied `graphics.fullscreen`. Settings.load() version-gates on
// this, so a stored v1 blob is simply ignored and defaults are used.
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    pixelArtSmoothing: false,
    showFPS: false,
    crtMode: 'amiga', // tasteful Amiga-500 CRT on by default; 'off' / 'c64' in Settings
  },
  audio: {
    // Deliberately below full scale: the title music autoplays the moment the
    // page loads, so the first impression should not be a full-volume tab.
    master: 0.6,
    music: 1,
    sfx: 1,
    muted: false,
  },
  ui: {
    touchControls: 'auto',
  },
  bindings: {
    // Gamepad indices are the W3C "standard mapping" button numbers:
    // 12=D-Up, 13=D-Down, 14=D-Left, 15=D-Right (11 is R3, the right stick click).
    moveLeft:  { keyboard: Phaser.Input.Keyboard.KeyCodes.LEFT,  gamepadButton: 14 },  // D-pad left
    moveRight: { keyboard: Phaser.Input.Keyboard.KeyCodes.RIGHT, gamepadButton: 15 },  // D-pad right
    moveUp:    { keyboard: Phaser.Input.Keyboard.KeyCodes.UP,    gamepadButton: 12 },  // D-pad up
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
