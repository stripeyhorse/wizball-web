import type {
  ActionName, GameSettings, KeyBinding, TouchControlsMode,
} from '../types/settings';
import { CRT_MODES, TOUCH_CONTROL_MODES } from '../types/settings';
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from './DefaultSettings';

const STORAGE_KEY = 'wizball_settings';

// The background-music tracks (source of truth: MUSIC_URLS in
// src/systems/MusicManager.ts — kept as a local copy so config/ does not have to
// import systems/, which would make an import cycle once MusicManager asks this
// module for its gain). Everything else in the audio cache is a one-shot SFX.
//
// Music currently streams through a bare <audio> element outside Phaser's sound
// manager, so this routing is a safety net for any music key that does go
// through `sound.add()`; the live music level comes from musicGain() below.
const MUSIC_KEYS = new Set([
  'wizball_title',
  'wizball_in_game',
  'wizball_laboratory',
  'wizball_bonus',
  'wizball_pre_life',
  'wizball_completion',
  'wizball_game_over',
  'wizball_hi_score',
]);

type Bus = 'music' | 'sfx';

// Bookkeeping stashed on each Sound so a later volume change can be re-applied
// to something already playing. `config`/`volume` live on the concrete Sound
// classes (WebAudioSound / HTML5AudioSound), not on the BaseSound type.
interface BusSound extends Phaser.Sound.BaseSound {
  config?: Phaser.Types.Sound.SoundConfig;
  volume?: number;
  __wizBus?: Bus;
  __wizBase?: number;
}

// Likewise `sounds` is declared on the concrete managers. NoAudioSoundManager
// has no list at all, hence the optional — applyAudio() checks before iterating.
interface BusSoundManager extends Phaser.Sound.BaseSoundManager {
  sounds?: Phaser.Sound.BaseSound[];
}

// Copy only keys that exist in the defaults AND whose stored value has the same
// primitive type. A corrupt or hand-edited blob can therefore add junk keys, or
// swap a number for a string, without any of it reaching the running game.
function mergeFlat<T extends object>(target: T, saved: unknown): void {
  if (!saved || typeof saved !== 'object') return;
  const src = saved as Record<string, unknown>;
  for (const key of Object.keys(target) as (keyof T & string)[]) {
    const value = src[key];
    if (value !== undefined && typeof value === typeof target[key]) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export class Settings {
  private static instance: Settings;
  private settings: GameSettings;
  private audioHooked = false;
  // Hand-off from the decorated play() to the decorated add(). Phaser's
  // BaseSoundManager.play() builds the Sound with a bare `this.add(key)` and
  // applies the caller's volume only afterwards, via `sound.play(extra)`
  // (node_modules/phaser/src/sound/BaseSoundManager.js:326-341) — so without
  // this, every SFX started through `sound.play(key, { volume })` would record
  // a base of 1 and applyAudio() would re-scale it to full bus level.
  private pendingBase: number | null = null;

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
      const parsed = JSON.parse(raw) as Partial<GameSettings> | null;
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.version !== SETTINGS_VERSION) return; // older/newer shape — start clean
      this.settings = this.merge(parsed);
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
    if (partial.graphics) Object.assign(this.settings.graphics, partial.graphics);
    if (partial.audio) Object.assign(this.settings.audio, partial.audio);
    if (partial.ui) Object.assign(this.settings.ui, partial.ui);
    if (partial.bindings) Object.assign(this.settings.bindings, partial.bindings);
    if (partial.gamepad) Object.assign(this.settings.gamepad, partial.gamepad);
    this.save();
  }

  getPixelArt(): boolean {
    return !this.settings.graphics.pixelArtSmoothing;
  }

  // ---- Applying settings to the live game -----------------------------------

  /** Everything that is safe to (re)apply outside a user gesture. */
  apply(game: Phaser.Game): void {
    this.applyAudio(game);
    this.applyTouchControls();
  }

  /**
   * Install the music/SFX volume buses on Phaser's sound manager.
   *
   * Phaser only has a single global volume, so master + mute go straight onto
   * the sound manager and the two buses are applied per sound instead: `add()`
   * scales the requested volume, and `play(key, { volume })` — the shortcut most
   * SFX use — gets the same treatment. Doing it here means no scene has to know
   * a mixer exists. Call once, after the game has booted (game.sound is created
   * during boot, so Phaser.Core.Events.READY is the earliest safe point).
   */
  attachAudio(game: Phaser.Game): void {
    const mgr = game.sound as Phaser.Sound.BaseSoundManager | undefined;
    if (!mgr || this.audioHooked) return;
    this.audioHooked = true;

    const originalAdd = mgr.add.bind(mgr);
    mgr.add = (key: string, config?: Phaser.Types.Sound.SoundConfig): Phaser.Sound.BaseSound => {
      const bus: Bus = MUSIC_KEYS.has(key) ? 'music' : 'sfx';
      const base = config?.volume ?? this.pendingBase ?? 1;
      // Scale the config object Phaser keeps as `sound.config`: BaseSound.play()
      // resets currentConfig back to it, so scaling here survives every replay.
      const sound = originalAdd(key, { ...config, volume: base * this.busVolume(bus) }) as BusSound;
      sound.__wizBus = bus;
      sound.__wizBase = base;
      return sound;
    };

    const originalPlay = mgr.play.bind(mgr);
    mgr.play = (key: string, extra?: Phaser.Types.Sound.SoundConfig | Phaser.Types.Sound.SoundMarker): boolean => {
      const gain = this.busVolume(MUSIC_KEYS.has(key) ? 'music' : 'sfx');
      let base = 1;
      if (extra && typeof extra === 'object') {
        if ('config' in extra && extra.config) {
          const marker = extra as Phaser.Types.Sound.SoundMarker;
          base = marker.config?.volume ?? 1;
          extra = { ...marker, config: { ...marker.config, volume: base * gain } };
        } else {
          const cfg = extra as Phaser.Types.Sound.SoundConfig;
          base = cfg.volume ?? 1;
          extra = { ...cfg, volume: base * gain };
        }
      }
      // originalPlay() calls add() synchronously, so the Sound it creates picks
      // this up as its base and a later slider move re-scales from the volume
      // this call actually asked for, not from 1.
      this.pendingBase = base;
      try {
        return originalPlay(key, extra);
      } finally {
        this.pendingBase = null;
      }
    };

    this.applyAudio(game);
  }

  /** Master volume + mute, and a re-scale of anything already playing. */
  applyAudio(game: Phaser.Game): void {
    const mgr = game.sound as BusSoundManager | undefined;
    if (!mgr) return;

    mgr.mute = this.settings.audio.muted;
    mgr.volume = this.settings.audio.master;

    for (const sound of (mgr.sounds ?? []) as BusSound[]) {
      if (!sound.__wizBus) continue;
      const level = (sound.__wizBase ?? 1) * this.busVolume(sound.__wizBus);
      if (sound.config) sound.config.volume = level;
      sound.volume = level;
    }
  }

  /**
   * The factor background music should multiply its own track volume by.
   *
   * MusicManager streams the soundtrack through a bare <audio> element so the
   * eight MP3s are never decoded into RAM (src/systems/MusicManager.ts) — that
   * element is invisible to Phaser's sound manager, so master/mute cannot reach
   * it automatically. It has to apply this factor itself on play and re-apply it
   * when the game emits 'settings:changed'. This is the one definition of the
   * formula; MusicManager imports this class already, so it can call it here
   * rather than keeping a copy that can drift.
   */
  musicGain(): number {
    const a = this.settings.audio;
    return a.muted ? 0 : a.master * a.music;
  }

  /** Show/hide the index.html on-screen touch overlay. */
  applyTouchControls(): void {
    this.touchUI()?.setMode(this.settings.ui.touchControls);
  }

  /**
   * Stow the touch overlay while a full-screen menu owns the display. The D-pad
   * and FIRE do nothing in a menu and they sit on top of it, so leaving them up
   * just invites taps that go nowhere. Does not change the stored preference.
   */
  setTouchOverlayHidden(hidden: boolean): void {
    this.touchUI()?.setHidden(hidden);
  }

  private touchUI() {
    return (window as unknown as {
      __wizTouchUI?: {
        setMode(mode: TouchControlsMode): void;
        setHidden(hidden: boolean): void;
      };
    }).__wizTouchUI;
  }

  /**
   * Toggle fullscreen. MUST be called from inside a real user-gesture handler
   * (a pointerdown/keydown listener). Browsers reject requestFullscreen() from
   * a requestAnimationFrame tick and Phaser swallows the rejection — which is
   * why driving this from a scene's update() silently did nothing.
   */
  toggleFullscreen(game: Phaser.Game): void {
    if (game.scale.isFullscreen) {
      game.scale.stopFullscreen();
    } else {
      game.scale.startFullscreen();
    }
  }

  private busVolume(bus: Bus): number {
    return bus === 'music' ? this.settings.audio.music : this.settings.audio.sfx;
  }

  // ---- Persistence ----------------------------------------------------------

  private merge(saved: Partial<GameSettings>): GameSettings {
    const result = structuredClone(DEFAULT_SETTINGS);

    mergeFlat(result.graphics, saved.graphics);
    mergeFlat(result.audio, saved.audio);
    mergeFlat(result.ui, saved.ui);
    mergeFlat(result.gamepad, saved.gamepad);

    const savedBindings = saved.bindings as Partial<Record<ActionName, Partial<KeyBinding>>> | undefined;
    if (savedBindings && typeof savedBindings === 'object') {
      for (const action of Object.keys(result.bindings) as ActionName[]) {
        const b = savedBindings[action];
        if (!b || typeof b !== 'object') continue;
        const merged: KeyBinding = { ...result.bindings[action] };
        if (typeof b.keyboard === 'number' || b.keyboard === null) merged.keyboard = b.keyboard;
        if (typeof b.gamepadButton === 'number' || b.gamepadButton === null) merged.gamepadButton = b.gamepadButton;
        result.bindings[action] = merged;
      }
    }

    this.sanitise(result);
    result.version = SETTINGS_VERSION;
    return result;
  }

  // Type-correct but out-of-range values (volume: 12, crtMode: 'banana') would
  // still break things, so every constrained field is re-checked here.
  private sanitise(s: GameSettings): void {
    const d = DEFAULT_SETTINGS;
    s.audio.master = clamp(s.audio.master, 0, 1, d.audio.master);
    s.audio.music = clamp(s.audio.music, 0, 1, d.audio.music);
    s.audio.sfx = clamp(s.audio.sfx, 0, 1, d.audio.sfx);
    s.gamepad.deadzone = clamp(s.gamepad.deadzone, 0, 0.5, d.gamepad.deadzone);
    if (!CRT_MODES.includes(s.graphics.crtMode)) s.graphics.crtMode = d.graphics.crtMode;
    if (!TOUCH_CONTROL_MODES.includes(s.ui.touchControls)) s.ui.touchControls = d.ui.touchControls;
  }
}
