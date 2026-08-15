import Phaser from 'phaser';
import { Settings } from './config/Settings';
import BootScene from './scenes/BootScene';
import PreloadScene from './scenes/PreloadScene';
import IntroScene from './scenes/IntroScene';
import TitleScene from './scenes/TitleScene';
import GetReadyScene from './scenes/GetReadyScene';
import GameScene from './scenes/GameScene';
import LaboratoryScene from './scenes/LaboratoryScene';
import BonusLevelScene from './scenes/BonusLevelScene';
import GameOverScene from './scenes/GameOverScene';
import GameCompleteScene from './scenes/GameCompleteScene';
import SettingsScene from './scenes/SettingsScene';
import PauseScene from './scenes/PauseScene';
import { CRTPipeline, CRT_PIPELINE_KEY, applyCRTToScene } from './systems/CRTPipeline';

// Game dimensions from C++ constants
const GAME_WIDTH = 640;
const GAME_HEIGHT = 416; // 368 playable + status bar

// Read pixel art setting before game construction (requires restart to change)
const settings = Settings.getInstance();
settings.load();
const usePixelArt = settings.getPixelArt();

// The on-screen touch overlay is owned by index.html; tell it which mode the
// stored settings asked for before the first frame so it never flashes on.
settings.applyTouchControls();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#000000',
  // C++ remake runs at 60fps (BPS_TO_TIMER(60)) — lock to match.
  // Without this, high-refresh monitors (120/144/240hz) run the game too fast:
  // every scene counts frames rather than integrating delta (GameScene.update()
  // takes no delta at all), so *calls per second* is literally the game speed.
  //
  // Do NOT swap this for Phaser 3.60+'s `fps: { limit: 60 }`. That switches the
  // loop to TimeStep.stepLimitFPS (node_modules/phaser/src/core/TimeStep.js:660),
  // which accumulates the rAF delta, calls the game step when it crosses
  // 1000/limit, and then *discards the remainder* (`this.delta = 0`). It can
  // therefore only decimate vsync by a whole number of frames:
  //   120Hz -> every 2nd frame = 60 steps/s, 240Hz -> every 4th = 60 (fine)
  //   144Hz -> every 3rd frame = 48 steps/s, 165Hz -> 55 (game runs ~20% slow)
  //   60Hz  -> one frame is right on the 16.667ms threshold, so float jitter in
  //            the smoothed delta can drop it to every 2nd frame = 30 steps/s
  // No `limit` value avoids this; it is inherent to zeroing the accumulator.
  // forceSetTimeOut instead runs TimeStep.step unconditionally off a 16ms
  // setTimeout (RequestAnimationFrame.js:108), giving ~60 steps/s on any
  // display. It costs vsync alignment, which is the cheaper thing to lose here.
  fps: {
    target: 60,
    forceSetTimeOut: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, PreloadScene, IntroScene, TitleScene, GetReadyScene, GameScene, LaboratoryScene, BonusLevelScene, GameCompleteScene, GameOverScene, SettingsScene, PauseScene],
  pixelArt: usePixelArt,
  input: {
    gamepad: true
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: {
      width: 320,
      height: 208
    },
    max: {
      width: 1280,
      height: 832
    }
  }
};

const game = new Phaser.Game(config);

// --- Audio mixer ------------------------------------------------------------
// game.sound only exists once the game has booted, so install the master/mute +
// music/SFX buses on READY (emitted before the first scene runs, see
// node_modules/phaser/src/core/Game.js:416) and re-apply whenever the Settings
// menu changes something.
game.events.once(Phaser.Core.Events.READY, () => {
  settings.attachAudio(game);
});
game.events.on('settings:changed', () => settings.apply(game));

// --- FPS readout ------------------------------------------------------------
// Settings > Graphics > Show FPS. A DOM overlay rather than a scene object so it
// survives every scene transition without each scene having to draw it.
const fpsReadout = document.createElement('div');
fpsReadout.id = 'fps-readout';
fpsReadout.setAttribute('aria-hidden', 'true');
document.body.appendChild(fpsReadout);

let fpsTimer: number | undefined;
const syncFpsReadout = (): void => {
  const wanted = settings.get().graphics.showFPS;
  fpsReadout.style.display = wanted ? 'block' : 'none';
  if (wanted && fpsTimer === undefined) {
    fpsTimer = window.setInterval(() => {
      fpsReadout.textContent = `${Math.round(game.loop.actualFps)} FPS`;
    }, 250);
  } else if (!wanted && fpsTimer !== undefined) {
    window.clearInterval(fpsTimer);
    fpsTimer = undefined;
  }
};
game.events.on('settings:changed', syncFpsReadout);
syncFpsReadout();

// --- Canvas accessibility ---------------------------------------------------
// Phaser creates the canvas itself, so it can't be named in index.html. Without
// a name a screen reader announces a bare "canvas" and nothing else.
game.events.once(Phaser.Core.Events.READY, () => {
  const canvas = game.canvas;
  if (!canvas) return;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute(
    'aria-label',
    'Wizball game screen. Arrow keys move, Space fires, Z selects, Escape pauses.'
  );
});

// --- CRT post-processing (WebGL only) ---------------------------------------
// Register the pipeline once the renderer is ready, then apply it to every
// scene's main camera as it's created (covers all scene transitions/restarts)
// and whenever the CRT preset is changed in Settings.
game.events.once('ready', () => {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return; // Canvas fallback: no CRT

  renderer.pipelines.addPostPipeline(CRT_PIPELINE_KEY, CRTPipeline);

  const currentMode = () => Settings.getInstance().get().graphics.crtMode;

  // Re-apply to the camera every time a scene runs its create().
  game.scene.scenes.forEach((scene) => {
    scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => applyCRTToScene(scene, currentMode()));
  });

  // Live-update when the preset changes in the Settings menu.
  game.events.on('settings:changed', () => {
    game.scene.getScenes(true).forEach((scene) => applyCRTToScene(scene, currentMode()));
  });

  // Apply to whatever is already on screen at boot.
  game.scene.getScenes(true).forEach((scene) => applyCRTToScene(scene, currentMode()));
});

// Expose the game instance for debugging / automated verification.
(window as unknown as { game: Phaser.Game }).game = game;
