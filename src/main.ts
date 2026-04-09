import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import PreloadScene from './scenes/PreloadScene';
import TitleScene from './scenes/TitleScene';
import GetReadyScene from './scenes/GetReadyScene';
import GameScene from './scenes/GameScene';
import LaboratoryScene from './scenes/LaboratoryScene';
import BonusLevelScene from './scenes/BonusLevelScene';
import GameGameScene from './scenes/GameOverScene';
import GameCompleteScene from './scenes/GameCompleteScene';

// Game dimensions from C++ constants
const GAME_WIDTH = 640;
const GAME_HEIGHT = 416; // 368 playable + status bar

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, PreloadScene, TitleScene, GetReadyScene, GameScene, LaboratoryScene, BonusLevelScene, GameCompleteScene, GameGameScene],
  pixelArt: true,
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

new Phaser.Game(config);
