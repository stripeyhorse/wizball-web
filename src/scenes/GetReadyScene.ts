import Phaser from 'phaser';
import { GAME } from '../types/game';
import { playSceneMusic } from '../systems/MusicManager';

export default class GetReadyScene extends Phaser.Scene {
  private level: number = 1;
  private countdown: number = 20;
  private countdownText!: Phaser.GameObjects.Text;
  private starfield: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: 'GetReady' });
  }

  init(data: { level: number }): void {
    this.level = data.level || 1;
  }

  create(): void {
    this.add.rectangle(320, 184, 640, 368, 0x0a0a2a).setDepth(-1);

    this.createStarfield();

    const titleText = this.add.text(320, 120, 'GET READY', {
      fontSize: '36px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#8844ff',
      strokeThickness: 4
    });
    titleText.setOrigin(0.5);

    this.add.text(320, 180, `LEVEL ${this.level}`, {
      fontSize: '24px',
      color: '#88ff88',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.countdownText = this.add.text(320, 260, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace'
    });
    this.countdownText.setOrigin(0.5);

    this.add.text(320, 320, 'Press SPACE or FIRE to skip', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.on('down', this.startGame, this);

    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select', { volume: 0.5 });
    }

    playSceneMusic(this, 'wizball_pre_life', { loop: false });
  }

  private createStarfield(): void {
    for (let i = 0; i < 30; i++) {
      const star = this.add.graphics();
      const x = Math.random() * 640;
      const y = Math.random() * 368;
      const size = 1 + Math.random() * 2;
      star.fillStyle(0xffffff, 0.3 + Math.random() * 0.7);
      star.fillCircle(x, y, size);
      this.starfield.push(star);
    }
  }

  private startGame(): void {
    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select', { volume: 0.6 }).play();
    }
    this.scene.start(GAME, { level: this.level });
  }

  update(): void {
    this.countdown--;

    const seconds = Math.ceil(this.countdown / 60);
    this.countdownText.setText(`Starting in ${seconds}...`);

    this.starfield.forEach((star, i) => {
      star.x += (i % 2 === 0 ? 0.5 : -0.5);
      if (star.x > 640) star.x = 0;
      if (star.x < 0) star.x = 640;
    });

    if (this.countdown <= 0) {
      this.startGame();
    }
  }
}
