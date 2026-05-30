import Phaser from 'phaser';
import { playSceneMusic } from '../systems/MusicManager';

/**
 * Old-skool Amiga demoscene intro — copper bars, starfield, a bouncing rasterised
 * logo and a per-character sine-wave scroller. A StripeyHorse production, in the
 * spirit of the cracktros that fronted every Amiga game. Fire / Enter / click
 * skips to the title.
 */
const SCROLL_TEXT =
  '              STRIPEYHORSE PROUDLY PRESENTS ........ ' +
  'W I Z B A L L ........ THE 1987 AMIGA CLASSIC, FAITHFULLY REBUILT FOR YOUR BROWSER, ' +
  'PIXEL BY PIXEL AND CAULDRON BY CAULDRON ........ ' +
  'CODED WITH LOVE, NOSTALGIA AND FAR TOO MUCH COFFEE ........ ' +
  'BIG RESPEK TO ALL THE OLD SKOOL SCENERS STILL KEEPING THE FLAME ALIVE ........ ' +
  'NOW GRAB YOUR JOYSTICK, HOLD FIRE TO STEER THE CATELLITE, AND GO PAINT THE WIZWORLD !!! ........ ' +
  'THIS SCROLLER WRAPS AROUND IN 3 ... 2 ... 1 ...                    ';

export default class IntroScene extends Phaser.Scene {
  private done = false;
  private t = 0;

  private copper!: Phaser.GameObjects.Graphics;
  private stars: { x: number; y: number; spd: number; size: number }[] = [];
  private starGfx!: Phaser.GameObjects.Graphics;
  private logo!: Phaser.GameObjects.Text;
  private credit!: Phaser.GameObjects.Text;
  private scrollChars: Phaser.GameObjects.Text[] = [];
  private scrollOffset = 0;
  private scrollWidth = 0;
  private readonly charW = 13;

  constructor() {
    super({ key: 'Intro' });
  }

  create(): void {
    this.t = 0;
    this.done = false;
    this.scrollOffset = 0;
    this.scrollChars = [];
    this.stars = [];

    this.add.rectangle(320, 208, 640, 416, 0x000000).setDepth(-10);

    // Copper bars band (behind the logo).
    this.copper = this.add.graphics().setDepth(0);

    // Starfield.
    this.starGfx = this.add.graphics().setDepth(1);
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * 640,
        y: Math.random() * 416,
        spd: 0.4 + Math.random() * 2.6,
        size: Math.random() < 0.3 ? 2 : 1,
      });
    }

    // Bouncing rasterised logo.
    this.logo = this.add.text(320, 120, 'WIZBALL', {
      fontSize: '72px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(5);

    this.credit = this.add.text(320, 188, 'a  StripeyHorse  production', {
      fontSize: '16px', fontFamily: 'monospace', color: '#88ddff',
    }).setOrigin(0.5).setDepth(5);

    // Per-character sine scroller.
    for (let i = 0; i < SCROLL_TEXT.length; i++) {
      const c = this.add.text(0, 0, SCROLL_TEXT[i], {
        fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffe44a',
      }).setOrigin(0.5).setDepth(6).setVisible(false);
      this.scrollChars.push(c);
    }
    this.scrollWidth = SCROLL_TEXT.length * this.charW;

    this.add.text(320, 404, 'press FIRE to begin', {
      fontSize: '11px', fontFamily: 'monospace', color: '#5566aa',
    }).setOrigin(0.5).setDepth(6);

    playSceneMusic(this, 'wizball_title');

    const skip = () => this.finish();
    this.input.keyboard?.once('keydown-SPACE', skip);
    this.input.keyboard?.once('keydown-ENTER', skip);
    this.input.once('pointerdown', skip);

    // Auto-advance after a full attract loop.
    this.time.delayedCall(14000, () => this.finish());
  }

  update(_time: number, delta: number): void {
    const dt = delta / 16.6667; // normalise to 60fps steps
    this.t += dt;

    // --- Copper bars: a stack of horizontal bars, hue cycling + vertical bob ---
    this.copper.clear();
    const bandCY = 120 + Math.sin(this.t * 0.03) * 14;
    const bars = 26;
    for (let i = 0; i < bars; i++) {
      const y = bandCY - (bars * 3) / 2 + i * 3;
      const hue = (this.t * 4 + i * 14) % 360;
      // Triangle brightness across the band → fake specular highlight per bar.
      const tri = 1 - Math.abs(i - bars / 2) / (bars / 2);
      const col = Phaser.Display.Color.HSVToRGB(hue / 360, 0.85, 0.45 + tri * 0.55) as Phaser.Types.Display.ColorObject;
      this.copper.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
      this.copper.fillRect(0, y, 640, 3);
    }

    // --- Starfield ---
    this.starGfx.clear();
    this.starGfx.fillStyle(0xffffff, 1);
    for (const s of this.stars) {
      s.x -= s.spd * dt;
      if (s.x < 0) { s.x = 640; s.y = Math.random() * 416; }
      const shade = Math.min(255, 80 + s.spd * 60) | 0;
      this.starGfx.fillStyle(Phaser.Display.Color.GetColor(shade, shade, shade), 1);
      this.starGfx.fillRect(s.x, s.y, s.size, s.size);
    }

    // --- Logo bounce + rainbow ---
    this.logo.y = 120 + Math.sin(this.t * 0.06) * 10;
    this.logo.setScale(1 + Math.sin(this.t * 0.05) * 0.06);
    const lh = (this.t * 3) % 360;
    const lc = Phaser.Display.Color.HSVToRGB(lh / 360, 0.7, 1) as Phaser.Types.Display.ColorObject;
    this.logo.setColor(Phaser.Display.Color.RGBToString(lc.r, lc.g, lc.b));
    this.credit.setAlpha(0.6 + Math.sin(this.t * 0.08) * 0.4);

    // --- Sine scroller ---
    this.scrollOffset += 2.4 * dt;
    if (this.scrollOffset > this.scrollWidth) this.scrollOffset -= this.scrollWidth;
    for (let i = 0; i < this.scrollChars.length; i++) {
      let x = 640 + i * this.charW - this.scrollOffset;
      // Wrap chars that have passed the left edge back to the right (continuous loop).
      if (x < -this.charW) x += this.scrollWidth;
      const ch = this.scrollChars[i];
      if (x < -this.charW || x > 640 + this.charW) { ch.setVisible(false); continue; }
      ch.setVisible(true);
      ch.x = x;
      ch.y = 320 + Math.sin(x * 0.02 + this.t * 0.08) * 26;
      const sh = (x * 1.5 + this.t * 4) % 360;
      const sc = Phaser.Display.Color.HSVToRGB(sh / 360, 0.55, 1) as Phaser.Types.Display.ColorObject;
      ch.setColor(Phaser.Display.Color.RGBToString(sc.r, sc.g, sc.b));
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
  }
}
