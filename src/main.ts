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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#000000',
  // C++ remake runs at 60fps (BPS_TO_TIMER(60)) — lock to match
  // Without this, high-refresh monitors (120/144/240hz) run physics too fast
  // forceSetTimeOut: true ensures the cap works (rAF alone doesn't cap)
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
