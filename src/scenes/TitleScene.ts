import Phaser from 'phaser';
import { SETTINGS } from '../types/game';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic } from '../systems/MusicManager';

export default class TitleScene extends Phaser.Scene {
  private startText!: Phaser.GameObjects.Text;
  private settingsText!: Phaser.GameObjects.Text;
  private titleImage!: Phaser.GameObjects.Image;
  private hiScorePanel!: Phaser.GameObjects.Container;
  private blinkTimer = 0;
  private attractTimer = 0;
  private showingScores = false;
  private started = false;
  private firePrev = false;
  private hiScoreSystem!: HiScoreSystem;

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.hiScoreSystem = new HiScoreSystem();
    this.blinkTimer = 0;
    this.attractTimer = 0;
    this.showingScores = false;
    this.started = false;
    this.firePrev = false;

    // Black backdrop (pillarbox bars), then the original Amiga title art
    // (Ocean / Sensible Software, 1987), scaled to fit preserving aspect.
    this.add.rectangle(320, 208, 640, 416, 0x000000).setDepth(-2);
    this.titleImage = this.add.image(320, 208, 'wizball_title_screen').setDepth(-1);
    if (this.textures.exists('wizball_title_screen')) {
      const src = this.textures.get('wizball_title_screen').getSourceImage();
      const scale = Math.min(640 / src.width, 416 / src.height);
      this.titleImage.setScale(scale);
    } else {
      // Fallback if the art is missing: a simple text logo.
      this.add.text(320, 90, 'WIZBALL', {
        fontSize: '56px', color: '#66ccff', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#003366', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(-1);
    }

    this.buildHiScorePanel();
    this.hiScorePanel.setVisible(false);

    this.startText = this.add.text(320, 388, 'PRESS SPACE / TAP TO START', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#000000cc', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(10);

    this.settingsText = this.add.text(636, 410, 'S: Settings', {
      fontSize: '11px', color: '#aaaaaa', fontFamily: 'monospace',
      backgroundColor: '#000000aa', padding: { x: 4, y: 2 },
    }).setOrigin(1, 1).setDepth(10);

    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, true);
    spaceKey.on('down', this.startGame, this);
    const settingsKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    settingsKey.on('down', this.openSettings, this);

    // Touch / mouse: tap anywhere (off the on-screen buttons) to start.
    this.input.on('pointerdown', this.startGame, this);

    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select');
    }

    playSceneMusic(this, 'wizball_title');
  }

  // Hi-score table on a dark panel — shown by alternating with the title art,
  // the way the original Amiga attract loop cycled title ↔ high scores.
  private buildHiScorePanel(): void {
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(320, 200, 420, 300, 0x000018, 0.86).setStrokeStyle(2, 0x335588));
    items.push(this.add.text(320, 70, 'HIGH SCORES', {
      fontSize: '20px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));

    const headerY = 104;
    items.push(this.add.text(140, headerY, 'RANK', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' }));
    items.push(this.add.text(210, headerY, 'NAME', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' }));
    items.push(this.add.text(330, headerY, 'SCORE', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' }));
    items.push(this.add.text(430, headerY, 'LEVEL', { fontSize: '12px', color: '#888888', fontFamily: 'monospace' }));

    this.hiScoreSystem.getScores().slice(0, 8).forEach((entry, i) => {
      const y = 128 + i * 22;
      const color = i === 0 ? '#ffff44' : (i < 3 ? '#88ff88' : '#ffffff');
      items.push(this.add.text(140, y, `${i + 1}.`, { fontSize: '13px', color, fontFamily: 'monospace' }));
      items.push(this.add.text(210, y, entry.name, { fontSize: '13px', color, fontFamily: 'monospace' }));
      items.push(this.add.text(330, y, entry.score.toString().padStart(7, ' '), { fontSize: '13px', color, fontFamily: 'monospace' }));
      items.push(this.add.text(440, y, `${entry.level}`, { fontSize: '13px', color, fontFamily: 'monospace' }));
    });

    this.hiScorePanel = this.add.container(0, 0, items).setDepth(5);
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select', { volume: 0.6 }).play();
    }
    this.scene.start('GetReady', { level: 1 });
  }

  private openSettings(): void {
    this.scene.launch(SETTINGS, { returnTo: 'Title' });
    this.scene.bringToTop(SETTINGS);
  }

  update(): void {
    // On-screen FIRE button (mobile) also starts the game.
    const fire = !!(window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch?.fire;
    if (fire && !this.firePrev) this.startGame();
    this.firePrev = fire;

    // Blink the start prompt.
    if (++this.blinkTimer > 30) {
      this.blinkTimer = 0;
      this.startText.setVisible(!this.startText.visible);
    }

    // Attract loop: swap title art ↔ high scores every ~6 seconds.
    if (++this.attractTimer > 360) {
      this.attractTimer = 0;
      this.showingScores = !this.showingScores;
      this.titleImage.setVisible(!this.showingScores);
      this.hiScorePanel.setVisible(this.showingScores);
    }
  }
}
