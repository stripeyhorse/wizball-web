import Phaser from 'phaser';
import { Settings } from './config/Settings';
import BootScene from './scenes/BootScene';
import PreloadScene from './scenes/PreloadScene';
import TitleScene from './scenes/TitleScene';
import GetReadyScene from './scenes/GetReadyScene';
import GameScene from './scenes/GameScene';
import LaboratoryScene from './scenes/LaboratoryScene';
import BonusLevelScene from './scenes/BonusLevelScene';
import GameOverScene from './scenes/GameOverScene';
import GameCompleteScene from './scenes/GameCompleteScene';
import SettingsScene from './scenes/SettingsScene';
import PauseScene from './scenes/PauseScene';

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
  scene: [BootScene, PreloadScene, TitleScene, GetReadyScene, GameScene, LaboratoryScene, BonusLevelScene, GameCompleteScene, GameOverScene, SettingsScene, PauseScene],
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

// Expose the game instance for debugging / automated verification.
(window as unknown as { game: Phaser.Game }).game = game;
