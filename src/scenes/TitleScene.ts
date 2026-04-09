import Phaser from 'phaser';
import { SETTINGS } from '../types/game';
import HiScoreSystem from '../systems/HiScoreSystem';

export default class TitleScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private startText!: Phaser.GameObjects.Text;
  private settingsText!: Phaser.GameObjects.Text;
  private blinkTimer: number = 0;
  private showStart: boolean = true;
  private hiScoreSystem!: HiScoreSystem;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.hiScoreSystem = new HiScoreSystem();

    this.add.rectangle(320, 184, 640, 368, 0x0a0a2a).setDepth(-1);

    this.titleText = this.add.text(320, 60, 'WIZBALL', {
      fontSize: '48px',
      color: '#8844ff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4
    });
    this.titleText.setOrigin(0.5);

    this.add.text(320, 110, 'A PHASER PORT', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.createHiScoreTable();

    this.startText = this.add.text(320, 330, 'PRESS SPACE TO START', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 12, y: 6 }
    });
    this.startText.setOrigin(0.5);

    // Settings option
    this.settingsText = this.add.text(320, 370, 'S: Settings', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: 'monospace',
    });
    this.settingsText.setOrigin(0.5);

    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.on('down', this.startGame, this);

    const settingsKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    settingsKey.on('down', this.openSettings, this);

    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select');
    }
  }

  private createHiScoreTable(): void {
    const scores = this.hiScoreSystem.getScores();

    this.add.text(320, 145, 'HIGH SCORES', {
      fontSize: '16px',
      color: '#ffff44',
      fontFamily: 'monospace',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const headerY = 170;
    this.add.text(150, headerY, 'RANK', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' });
    this.add.text(220, headerY, 'NAME', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' });
    this.add.text(320, headerY, 'SCORE', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' });
    this.add.text(420, headerY, 'LEVEL', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' });

    scores.slice(0, 8).forEach((entry, i) => {
      const y = 190 + i * 18;
      const color = i === 0 ? '#ffff44' : (i < 3 ? '#88ff88' : '#ffffff');

      this.add.text(150, y, `${i + 1}.`, { fontSize: '12px', color, fontFamily: 'monospace' });
      this.add.text(220, y, entry.name, { fontSize: '12px', color, fontFamily: 'monospace' });
      this.add.text(320, y, entry.score.toString().padStart(6, ' '), { fontSize: '12px', color, fontFamily: 'monospace' });
      this.add.text(420, y, `${entry.level}`, { fontSize: '12px', color, fontFamily: 'monospace' });
    });
  }

  private startGame(): void {
    if (this.cache.audio.exists('menu_select')) {
      const sound = this.sound.add('menu_select', { volume: 0.6 });
      sound.play();
    }

    this.scene.start('GetReady', { level: 1 });
  }

  private openSettings(): void {
    this.scene.launch(SETTINGS, { returnTo: 'Title' });
    this.scene.bringToTop(SETTINGS);
  }

  update(): void {
    this.blinkTimer++;
    if (this.blinkTimer > 30) {
      this.blinkTimer = 0;
      this.showStart = !this.showStart;
      this.startText.setVisible(this.showStart);
    }
  }
}
