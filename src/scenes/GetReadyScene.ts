import Phaser from 'phaser';
import { GAME } from '../types/game';
import { playSceneMusic } from '../systems/MusicManager';

export default class GetReadyScene extends Phaser.Scene {
  private level: number = 1;
  private countdown: number = 180; // ~3s at 60fps (was 20 frames ≈ 0.33s — far too quick)
  private inputLockFrames: number = 20; // C++ get_ready_screen.txt:40 — 20-frame input lockout
  private started: boolean = false;
  private firePrev: boolean = false;
  private countdownText!: Phaser.GameObjects.Text;
  private starfield?: Phaser.GameObjects.Graphics;
  private stars: { x: number; y: number; r: number; alpha: number; drift: number }[] = [];

  constructor() {
    super({ key: 'GetReady' });
  }

  init(data: { level: number }): void {
    this.level = data.level || 1;

    // Per-visit state. Phaser instantiates a scene class ONCE and reuses that
    // instance for every scene.start(), so field initialisers run only at
    // construction. countdown/inputLockFrames were left at <= 0 by the first
    // visit, so every later GET READY hit `countdown <= 0` on its very first
    // update() frame and started the level instantly — the screen was only ever
    // seen once per session.
    this.countdown = 180;
    this.inputLockFrames = 20; // C++ get_ready_screen.txt:40,48 — FIRE/ENTER ignored for 20 frames
    this.started = false;
    this.firePrev = false;
    // The old array kept 30 stale Graphics refs per visit and update() wrote .x
    // to objects the previous shutdown had already destroyed.
    this.stars = [];
    this.starfield = undefined;
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
    // C++ get_ready_screen.txt:53 also accepts ENTER to skip.
    const enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey.on('down', this.startGame, this);
    this.input.on('pointerdown', this.startGame, this); // tap to skip (mobile)

    playSceneMusic(this, 'wizball_pre_life', { loop: false });
  }

  // One Graphics for the whole field, redrawn each frame. Thirty separate
  // Graphics objects leaked a stale reference per visit and cost 30 display-list
  // entries for what is a single fill.
  private createStarfield(): void {
    this.starfield = this.add.graphics();
    for (let i = 0; i < 30; i++) {
      this.stars.push({
        x: Math.random() * 640,
        y: Math.random() * 368,
        r: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.7,
        drift: i % 2 === 0 ? 0.5 : -0.5
      });
    }
  }

  private drawStarfield(): void {
    const gfx = this.starfield;
    if (!gfx) return;
    gfx.clear();
    for (const star of this.stars) {
      star.x += star.drift;
      if (star.x > 640) star.x = 0;
      if (star.x < 0) star.x = 640;
      gfx.fillStyle(0xffffff, star.alpha);
      gfx.fillCircle(star.x, star.y, star.r);
    }
  }

  private startGame(): void {
    // C++ get_ready_screen.txt:48 holds input for the first 20 frames before
    // FIRE/ENTER can skip the screen.
    if (this.inputLockFrames > 0) return;
    if (this.started) return; // SPACE + tap + countdown can all land on one frame
    this.started = true;
    // sound.play() is the one-shot path — it self-cleans. sound.add() leaves a
    // Sound object owned by the (global) sound manager for the page's lifetime.
    if (this.cache.audio.exists('menu_select')) {
      this.sound.play('menu_select', { volume: 0.6 });
    }
    this.scene.start(GAME, { level: this.level });
  }

  update(): void {
    if (this.started) return;

    // The on-screen FIRE button is a DOM overlay, so its taps never reach the
    // canvas as a Phaser pointerdown — poll it directly, as the other scenes do.
    // The 20-frame lock above absorbs a FIRE still held from the previous level.
    const fire = !!(window as unknown as { __wizTouch?: Record<string, boolean> }).__wizTouch?.fire;
    if (fire && !this.firePrev) this.startGame();
    this.firePrev = fire;
    if (this.started) return;

    if (this.inputLockFrames > 0) this.inputLockFrames--;
    this.countdown--;

    const seconds = Math.max(0, Math.ceil(this.countdown / 60));
    this.countdownText.setText(`Starting in ${seconds}...`);

    this.drawStarfield();

    if (this.countdown <= 0) {
      this.startGame();
    }
  }
}
