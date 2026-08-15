export type ActionName =
  | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown'
  | 'fire' | 'altFire' | 'pause';

export interface KeyBinding {
  keyboard: number | null;     // Phaser.Input.Keyboard.KeyCodes value
  gamepadButton: number | null; // Gamepad button index
}

export interface GamepadConfig {
  deadzone: number;            // 0.0–1.0, default 0.15
  analogMovement: boolean;     // true = use stick axes, false = digital
}

export type CrtMode = 'off' | 'c64' | 'amiga';
export const CRT_MODES: readonly CrtMode[] = ['off', 'c64', 'amiga'];

// 'auto' = show only on a coarse pointer (real touchscreen phone/tablet).
// 'on'/'off' let a touchscreen laptop user force the overlay either way.
export type TouchControlsMode = 'auto' | 'on' | 'off';
export const TOUCH_CONTROL_MODES: readonly TouchControlsMode[] = ['auto', 'on', 'off'];

export interface AudioSettings {
  master: number;   // 0–1, drives Phaser's global sound-manager volume
  music: number;    // 0–1, multiplier applied to background-music tracks
  sfx: number;      // 0–1, multiplier applied to one-shot sound effects
  muted: boolean;   // global mute (Phaser sound-manager mute)
}

export interface GraphicsSettings {
  pixelArtSmoothing: boolean;  // inverts pixelArt flag (requires restart)
  showFPS: boolean;
  crtMode: CrtMode;            // CRT post-processing filter preset
}

export interface UISettings {
  touchControls: TouchControlsMode;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  ui: UISettings;
  bindings: Record<ActionName, KeyBinding>;
  gamepad: GamepadConfig;
  version: number;
}
