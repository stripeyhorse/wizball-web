import Phaser from 'phaser';
import { SETTINGS } from '../types/game';
import HiScoreSystem from '../systems/HiScoreSystem';
import { playSceneMusic } from '../systems/MusicManager';

export default class TitleScene extends Phaser.Scene {
  private startText!: Phaser.GameObjects.Text;
  private titleImage!: Phaser.GameObjects.Image;
  private hiScorePanel!: Phaser.GameObjects.Container;
  private creditLogos: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle> = [];
  private blinkTimer = 0;
  private attractTimer = 0;
  private showingScores = false;
  private started = false;
  private firePrev = false;
  private settingsOpen = false;
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
    this.settingsOpen = false;
    // The previous visit's logos were destroyed with that scene instance; without
    // this, every return to the Title appended four more and update() called
    // setVisible() on destroyed objects.
    this.creditLogos = [];

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

    this.buildCreditLogos();
    this.buildHiScorePanel();
    this.hiScorePanel.setVisible(false);

    this.startText = this.add.text(320, 388, 'PRESS SPACE / TAP TO START', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      backgroundColor: '#000000cc', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(10);

    // A real button, not just a key hint: on touch the S key does not exist, and
    // this is the only route into the Settings menu before a game has started.
    const settingsButton = this.add.text(632, 408, '[ SETTINGS ]', {
      fontSize: '13px', color: '#aaddff', fontFamily: 'monospace',
      backgroundColor: '#000000cc', padding: { x: 10, y: 8 },
    }).setOrigin(1, 1).setDepth(10);
    settingsButton.setInteractive({ useHandCursor: true });
    settingsButton.on('pointerdown', this.openSettings, this);

    this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, true);
    spaceKey.on('down', this.startGame, this);
    const settingsKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    settingsKey.on('down', this.openSettings, this);

    // Touch / mouse: tap anywhere (off the on-screen buttons) to start.
    this.input.on('pointerdown', this.onPointerDown, this);

    if (this.cache.audio.exists('menu_select')) {
      this.sound.add('menu_select');
    }

    playSceneMusic(this, 'wizball_title');
  }

  // The original Retrospec-remake credit logos (graphics: Smila, music: Infamous),
  // extracted from the recovered intro art and shown along the bottom of the title.
  private buildCreditLogos(): void {
    const y = 360;
    const place = (key: string, x: number, h: number): void => {
      if (!this.textures.exists(key)) return;
      const src = this.textures.get(key).getSourceImage();
      const img = this.add.image(x, y, key).setOrigin(0.5).setDepth(8);
      img.setScale(h / src.height);
      this.creditLogos.push(img);
    };
    // Faint strip behind for legibility over the title art.
    this.creditLogos.push(
      this.add.rectangle(320, y, 300, 38, 0x000000, 0.45).setDepth(7)
    );
    place('logo_smila', 244, 30);
    place('logo_retrospec', 320, 24);
    place('logo_infamous', 392, 30);
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

  // Tap-anywhere-to-start, minus the taps that landed on a button of our own
  // (the Settings button). Phaser still emits the scene-level pointerdown when
  // the press hits an interactive object, so it has to be filtered here.
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.input.hitTestPointer(pointer).length > 0) return;
    this.startGame();
  }

  private openSettings(): void {
    if (this.scene.isActive(SETTINGS)) return; // already up — don't restart it
    this.setSuspended(true);
    this.scene.launch(SETTINGS, { returnTo: 'Title' });
    this.scene.bringToTop(SETTINGS);
  }

  // Settings is launched in *parallel*, so without this the Title still holds a
  // scene-wide pointerdown->startGame and a captured SPACE: clicking anywhere in
  // the Settings overlay, or pressing SPACE, started a real game underneath it.
  // Derived from whether Settings is actually running (see update()) so no exit
  // path can leave the Title with its input switched off.
  private setSuspended(suspended: boolean): void {
    this.settingsOpen = suspended;
    this.input.enabled = !suspended;
    if (this.input.keyboard) this.input.keyboard.enabled = !suspended;
  }

  update(): void {
    const settingsActive = this.scene.isActive(SETTINGS);
    if (settingsActive !== this.settingsOpen) {
      this.setSuspended(settingsActive);
    }
    if (settingsActive) {
      // Swallow the overlay's touches so releasing FIRE over Settings doesn't
      // register as an edge the moment it closes.
      this.firePrev = !!(window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch?.fire;
      return;
    }

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
      this.creditLogos.forEach(l => l.setVisible(!this.showingScores));
      this.hiScorePanel.setVisible(this.showingScores);
    }
  }
}
