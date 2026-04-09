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

export interface GraphicsSettings {
  resolutionScale: number;     // 1 | 1.5 | 2
  fullscreen: boolean;
  pixelArtSmoothing: boolean;  // inverts pixelArt flag (requires restart)
  showFPS: boolean;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  bindings: Record<ActionName, KeyBinding>;
  gamepad: GamepadConfig;
  version: number;
}
