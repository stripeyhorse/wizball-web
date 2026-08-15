import Phaser from 'phaser';
import { Settings } from '../config/Settings';

export interface MusicOptions {
  loop?: boolean;
  volume?: number;
}

const DEFAULT_MUSIC_VOLUME = 0.35;

export interface SceneMusic {
  /** The shared streaming element the track is playing through. */
  audio: HTMLAudioElement;
  stop: () => void;
}

// --- Why music does NOT go through Phaser's loader / Sound Manager ----------
// Phaser 3.90 decodes every `this.load.audio()` file into an in-memory float32
// AudioBuffer at load time (node_modules/phaser/src/loader/filetypes/AudioFile.js
// `onProcess` -> `decodeAudioData`). For these eight MP3s that is ~346 MB of
// resident RAM — a realistic tab-kill on iOS Safari and low-end Android, and
// 17.9 MB of it had to download before the title screen appeared.
//
// There is no per-file escape hatch in 3.90: the `stream` hint is commented out
// in `AudioFile.create` ("// var stream = GetFastValue(config, 'stream', false);")
// and the only other lever, `audio.disableWebAudio`, is game-wide — it would
// drag the 53 SFX WAVs onto HTML5 audio too, which we do not want for latency
// and concurrency reasons.
//
// So the music streams through a single plain <audio> element instead. The
// browser buffers a bounded window rather than holding the whole decoded
// waveform, nothing is fetched until the scene that needs it asks (including
// wizball_completion.mp3, 4.25 MB, only heard if you finish the game), and one
// shared element means iOS only has to unlock a single media element.
const MUSIC_URLS: Record<string, string> = {
  wizball_title: 'assets/wizball_title.mp3',
  wizball_in_game: 'assets/wizball_in_game.mp3',
  wizball_laboratory: 'assets/wizball_laboratory.mp3',
  wizball_bonus: 'assets/wizball_bonus.mp3',
  wizball_pre_life: 'assets/wizball_pre_life.mp3',
  wizball_completion: 'assets/wizball_completion.mp3',
  wizball_game_over: 'assets/wizball_game_over.mp3',
  wizball_hi_score: 'assets/wizball_hi_score.mp3'
};

/**
 * Canonical list of background-music tracks. These are the keys PreloadScene
 * must NOT push through this.load.audio(), and the ones Settings' SFX bus
 * should not try to route (they never reach Phaser's sound manager).
 */
export const MUSIC_KEYS: readonly string[] = Object.keys(MUSIC_URLS);

let el: HTMLAudioElement | null = null;
let loadedUrl: string | null = null;
/** The track's own volume, before the Settings master/music bus is applied. */
let baseVolume = DEFAULT_MUSIC_VOLUME;
let currentKey: string | null = null;
let currentHandle: SceneMusic | null = null;
/** Removes the owning scene's SHUTDOWN/DESTROY listeners. */
let detachOwner: (() => void) | null = null;
let pendingStop: ReturnType<typeof setTimeout> | null = null;
let unlockArmed = false;
let gameHooked = false;
let pausedByBlur = false;

// Settings.attachAudio() mixes the SFX bus by wrapping game.sound.add/play, and
// applyAudio() puts master + mute on the sound manager. Music no longer passes
// through any of that, so reproduce the same gain here: effective volume =
// track volume x music bus x master, and mute wins outright.
// (Settings.ts:194 `busVolume`, Settings.ts:157-166 `applyAudio`.)
function musicGain(): number {
  const audio = Settings.getInstance().get().audio;
  if (audio.muted) return 0;
  return Phaser.Math.Clamp(audio.master, 0, 1) * Phaser.Math.Clamp(audio.music, 0, 1);
}

function applyVolume(): void {
  if (!el) return;
  el.volume = Phaser.Math.Clamp(baseVolume * musicGain(), 0, 1);
}

function getElement(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.autoplay = false;
    // Swapping src aborts the previous fetch, which fires an `error` event on
    // some browsers. Swallow it so it never surfaces as an uncaught media error.
    el.addEventListener('error', () => { /* ignored */ });
  }
  return el;
}

// Phaser attaches its own touch/mouse/keydown handlers to unlock the WebAudio
// context; a bare <audio> element needs the equivalent. If play() is rejected
// by the autoplay policy we retry on the next user gesture, which is also what
// unlocks the element for good on iOS.
function armUnlock(): void {
  if (unlockArmed) return;
  unlockArmed = true;

  const disarm = (): void => {
    unlockArmed = false;
    window.removeEventListener('pointerdown', retry, true);
    window.removeEventListener('touchend', retry, true);
    window.removeEventListener('keydown', retry, true);
  };

  function retry(): void {
    if (!el || !currentKey) {
      disarm();
      return;
    }
    const playing = el.play();
    if (playing) {
      playing.then(disarm).catch(() => { /* still blocked — wait for the next gesture */ });
    } else {
      disarm();
    }
  }

  window.addEventListener('pointerdown', retry, true);
  window.addEventListener('touchend', retry, true);
  window.addEventListener('keydown', retry, true);
}

// Phaser's Sound Manager pauses everything on window blur (pauseOnBlur, see
// node_modules/phaser/src/sound/BaseSoundManager.js:104) and re-mixes on a
// settings change. Music no longer lives in that manager, so mirror both off
// the same game events.
function installGameHooks(game: Phaser.Game): void {
  if (gameHooked) return;
  gameHooked = true;

  game.events.on(Phaser.Core.Events.BLUR, () => {
    if (el && currentKey && !el.paused) {
      pausedByBlur = true;
      el.pause();
    }
  });

  game.events.on(Phaser.Core.Events.FOCUS, () => {
    if (!pausedByBlur) return;
    pausedByBlur = false;
    if (currentKey) attemptPlay();
  });

  game.events.on('settings:changed', applyVolume);
}

function attemptPlay(): void {
  const playing = getElement().play();
  if (playing && typeof playing.catch === 'function') {
    playing.catch(() => {
      // Blocked by the autoplay policy (or aborted by a src swap). If we still
      // want a track, retry on the next gesture.
      if (currentKey) armUnlock();
    });
  }
}

function cancelPendingStop(): void {
  if (pendingStop !== null) {
    clearTimeout(pendingStop);
    pendingStop = null;
  }
}

// A scene shutting down and the next scene's create() run inside the same
// SceneManager step, so deferring the stop by a tick lets the incoming scene
// claim the same track and keep it playing (Intro and Title both open
// wizball_title — stopping and restarting made an audible jump back to zero).
function schedulePendingStop(): void {
  if (pendingStop !== null) return;
  pendingStop = setTimeout(() => {
    pendingStop = null;
    stopCurrent();
  }, 0);
}

function stopCurrent(): void {
  cancelPendingStop();

  if (detachOwner) {
    detachOwner();
    detachOwner = null;
  }
  currentKey = null;
  currentHandle = null;
  pausedByBlur = false;

  if (!el) return;
  el.pause();
  // Drop the source so the browser releases the buffered stream.
  el.removeAttribute('src');
  el.load();
  loadedUrl = null;
}

function attachOwner(scene: Phaser.Scene, handle: SceneMusic): void {
  if (detachOwner) {
    detachOwner();
    detachOwner = null;
  }

  const release = (): void => {
    if (currentHandle !== handle) return;
    schedulePendingStop();
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
  scene.events.once(Phaser.Scenes.Events.DESTROY, release);

  // Whichever of the two fires, the other stays registered forever unless it is
  // removed explicitly — that was a small but real per-scene-transition leak.
  detachOwner = () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
    scene.events.off(Phaser.Scenes.Events.DESTROY, release);
  };
}

// Attach background music to a scene. Auto-stops on scene shutdown/destroy.
// No-ops safely if the key isn't a known music track (e.g. asset missing).
export function playSceneMusic(
  scene: Phaser.Scene,
  key: string,
  opts: MusicOptions = {}
): SceneMusic | null {
  const url = MUSIC_URLS[key];
  if (!url) return null;

  const loop = opts.loop ?? true;
  baseVolume = Phaser.Math.Clamp(opts.volume ?? DEFAULT_MUSIC_VOLUME, 0, 1);

  installGameHooks(scene.game);

  // The outgoing scene queued a stop on shutdown; this scene is taking over.
  cancelPendingStop();

  const audio = getElement();

  // Already playing this exact track — hand the incoming scene ownership of the
  // running track instead of restarting it from zero.
  if (currentKey === key && currentHandle && !audio.paused && !audio.ended) {
    audio.loop = loop;
    applyVolume();
    attachOwner(scene, currentHandle);
    return currentHandle;
  }

  if (currentKey !== null) stopCurrent();

  const handle: SceneMusic = {
    audio,
    stop: () => {
      if (currentHandle === handle) stopCurrent();
    }
  };

  audio.loop = loop;
  applyVolume();
  audio.src = url;
  loadedUrl = url;
  audio.load(); // starts buffering from the top of the track

  currentKey = key;
  currentHandle = handle;
  attachOwner(scene, handle);
  attemptPlay();

  return handle;
}
