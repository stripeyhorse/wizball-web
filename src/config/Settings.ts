import type { ActionName, GameSettings, GraphicsSettings, KeyBinding } from '../types/settings';
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from './DefaultSettings';

const STORAGE_KEY = 'wizball_settings';

export class Settings {
  private static instance: Settings;
  private settings: GameSettings;

  private constructor() {
    this.settings = structuredClone(DEFAULT_SETTINGS);
  }

  static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GameSettings;
      if (parsed.version !== SETTINGS_VERSION) return;
      this.settings = this.merge(DEFAULT_SETTINGS, parsed);
    } catch {
      // localStorage unavailable or corrupt — use defaults
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // localStorage unavailable
    }
  }

  get(): GameSettings {
    return this.settings;
  }

  update(partial: Partial<GameSettings>): void {
    if (partial.graphics) {
      Object.assign(this.settings.graphics, partial.graphics);
    }
    if (partial.bindings) {
      Object.assign(this.settings.bindings, partial.bindings);
    }
    if (partial.gamepad) {
      Object.assign(this.settings.gamepad, partial.gamepad);
    }
    this.save();
  }

  applyGraphics(game: Phaser.Game): void {
    const g = this.settings.graphics;
    const baseW = 640;
    const baseH = 416;

    // Resolution scale
    game.scale.setGameSize(baseW * g.resolutionScale, baseH * g.resolutionScale);

    // Fullscreen
    if (g.fullscreen && !game.scale.isFullscreen) {
      game.scale.startFullscreen();
    } else if (!g.fullscreen && game.scale.isFullscreen) {
      game.scale.stopFullscreen();
    }
  }

  getPixelArt(): boolean {
    return !this.settings.graphics.pixelArtSmoothing;
  }

  private merge(defaults: GameSettings, saved: GameSettings): GameSettings {
    const result = structuredClone(defaults);

    // Merge graphics
    for (const key of Object.keys(defaults.graphics) as (keyof GraphicsSettings)[]) {
      if (key in saved.graphics) {
        (result.graphics as any)[key] = saved.graphics[key];
      }
    }

    // Merge bindings
    for (const action of Object.keys(defaults.bindings) as ActionName[]) {
      if (saved.bindings[action]) {
        result.bindings[action] = { ...defaults.bindings[action], ...saved.bindings[action] } as KeyBinding;
      }
    }

    // Merge gamepad
    for (const key of Object.keys(defaults.gamepad) as (keyof typeof defaults.gamepad)[]) {
      if (key in saved.gamepad) {
        (result.gamepad as any)[key] = saved.gamepad[key];
      }
    }

    result.version = SETTINGS_VERSION;
    return result;
  }
}
