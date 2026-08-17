import Phaser from 'phaser';

export interface HUDState {
  score: number;
  hiScore: number;
  lives: number;
  cauldronFill: number[];
  currentPaintColor: number;
  hasPaint: boolean;
  hasCatellite: boolean;
  catelliteHasShield: boolean;
  currentLevel: number;
  weaponCollection: number;
  enemyCount?: number;
  // Whether the ball is currently in play — the life indicator's backing holds a
  // "waiting" frame between losing a life and the next ball appearing
  // (wizball_life_indicator_background.txt .wait_for_new_life).
  playerAlive?: boolean;
}

// C++ wizball_life_indicator.txt:19-20, :38 — the life count is a GLYPH from the
// font atlas, frame 74 + lives clamped to 91 ("TOO MANY"), blended additively.
// It was reading frame 74 of the *wizball* sheet, which is a frame of the
// new-life animation: a glowing orb, and a different orb for every life count.
const LIFE_GLYPH_BASE_FRAME = 74;
const LIFE_GLYPH_MAX_FRAME = 91;
// :36-37 — the glyph's scale eases back to 100% at 5% of the gap per frame, and
// the life-count change kicks it to 150% (gain) or 5% (loss) to pop it.
const LIFE_GLYPH_SCALE_EASE = 500;
const LIFE_GLYPH_GAIN_SCALE = 15000;
const LIFE_GLYPH_LOSS_SCALE = 500;

// wizball_life_indicator_background.txt — a second sprite behind the glyph, off
// the wizball sheet. Frames 64..94 are its idle animation (it runs up to 94 and
// holds), 96 down to 64 is the losing-a-life sequence, 97 is what it sits on
// while you have no ball, and gaining a life sweeps the ball's own spin frames
// 0..63 as a flourish.
const LIFE_BACK_IDLE_FIRST = 64;
const LIFE_BACK_IDLE_LAST = 94;
const LIFE_BACK_LOSS_FIRST = 96;
const LIFE_BACK_WAITING = 97;
const LIFE_BACK_GAIN_SPAN = 128;   // current_frame = 128 % biased_progress
const LIFE_BACK_GAIN_LAST = 63;
const LIFE_BACK_GAIN_STEP = 100;   // effect_progress += 100, up to 10000

const LIFE_STATE_NORMAL = 0;
const LIFE_STATE_GAIN = 1;
const LIFE_STATE_LOSS = 2;
const LIFE_STATE_WAITING = 3;

/** The C++ `>%` operator: move `current` toward `target` by percentage/10000. */
const easeTowards = (current: number, target: number, percentage: number): number =>
  current + (target - current) * (percentage / 10000);

/**
 * CURVE_PERCENTAGE_SISO — slow in, slow out. Smoothstep over 0..10000, which is
 * what makes the extra-life flourish accelerate into the middle of the spin and
 * settle at the end rather than running at a constant rate.
 */
const slowInSlowOut = (progress: number): number => {
  const t = Phaser.Math.Clamp(progress / 10000, 0, 1);
  return t * t * (3 - 2 * t) * 10000;
};

// C++ constant.txt:511 — "9999999 MAXIMUM_POSSIBLE_SCORE". Every scoring site
// in the scripts clamps with `!> MAXIMUM_POSSIBLE_SCORE` (e.g.
// scripts/generic_level_enemy.txt:611, scripts/bonus_pearl.txt:148), so the
// score can never exceed 7 digits in the original. Clamp on display too, so an
// out-of-range value can't overflow the padded field.
const MAXIMUM_POSSIBLE_SCORE = 9999999;

const displayScore = (value: number): string =>
  Math.min(Math.max(0, Math.floor(value) || 0), MAXIMUM_POSSIBLE_SCORE)
    .toString()
    .padStart(7, '0');

// Original Amiga layout: a TOP status bar (scores + the weapon-icon panel) and a
// BOTTOM status bar (lives, cauldrons, OCEAN box, level box, paint), with the
// playfield between them. The weapon-icon panel is drawn by
// BonusSelectionPanelSystem into the top bar; the cauldron pots by CauldronSystem
// into the bottom bar — this class lays out the rest to match.
const GAME_WIDTH = 640;
const GAME_HEIGHT = 416;
const TOP_H = 34;
const BOT_H = 48;
const BOT_Y = GAME_HEIGHT - BOT_H; // 368

export default class HUDSystem {
  private scene: Phaser.Scene;
  private state: HUDState;

  private topBG!: Phaser.GameObjects.Rectangle;
  private topLine!: Phaser.GameObjects.Rectangle;
  private botBG!: Phaser.GameObjects.Rectangle;
  private botLine!: Phaser.GameObjects.Rectangle;

  private scoreText!: Phaser.GameObjects.Text;
  private hiScoreText!: Phaser.GameObjects.Text;
  private lifeBacking!: Phaser.GameObjects.Image;
  private lifeGlyph!: Phaser.GameObjects.Image;
  private lifeState: number = LIFE_STATE_NORMAL;
  private lifeBackFrame: number = LIFE_BACK_IDLE_FIRST;
  private lifeGainProgress: number = 0;
  private lifeGlyphScale: number = 10000;
  private lastLifeCount: number = -1;
  private enemyCountText!: Phaser.GameObjects.Text;
  private oceanBox!: Phaser.GameObjects.Rectangle;
  private oceanText!: Phaser.GameObjects.Text;
  private levelBox!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private paintLabel!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;
  private catelliteStatus!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, initialState: HUDState) {
    this.scene = scene;
    this.state = initialState;
    this.createHUD();
  }

  private createHUD(): void {
    const s = this.scene;
    const fix = (o: Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth, d = 100) => {
      o.setScrollFactor(0); o.setDepth(d); return o;
    };

    // ---- TOP bar: scores flank the weapon-icon panel (drawn by the panel system) ----
    this.topBG = fix(s.add.rectangle(GAME_WIDTH / 2, TOP_H / 2, GAME_WIDTH, TOP_H, 0x000000), 90) as Phaser.GameObjects.Rectangle;
    this.topLine = fix(s.add.rectangle(GAME_WIDTH / 2, TOP_H, GAME_WIDTH, 2, 0x448844), 95) as Phaser.GameObjects.Rectangle;

    this.scoreText = fix(s.add.text(8, 8, '', { fontSize: '15px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold' })) as Phaser.GameObjects.Text;
    this.hiScoreText = fix(s.add.text(GAME_WIDTH - 8, 8, '', { fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace' }).setOrigin(1, 0)) as Phaser.GameObjects.Text;

    // ---- BOTTOM bar ----
    this.botBG = fix(s.add.rectangle(GAME_WIDTH / 2, BOT_Y + BOT_H / 2, GAME_WIDTH, BOT_H, 0x000000), 90) as Phaser.GameObjects.Rectangle;
    this.botLine = fix(s.add.rectangle(GAME_WIDTH / 2, BOT_Y, GAME_WIDTH, 2, 0x448844), 95) as Phaser.GameObjects.Rectangle;

    // Lives: the animated wizball backing with the life-count glyph over it
    // (wizball_life_indicator.txt + _background.txt). The glyph IS the number, so
    // there is no separate "xN" text.
    this.lifeBacking = fix(
      s.add.image(28, BOT_Y + 22, 'wizball', LIFE_BACK_IDLE_FIRST).setDisplaySize(40, 40)
    ) as Phaser.GameObjects.Image;
    const hasFont = s.textures.exists('font');
    this.lifeGlyph = fix(
      hasFont
        ? s.add.image(28, BOT_Y + 22, 'font', `font_${LIFE_GLYPH_BASE_FRAME}`)
        : s.add.image(28, BOT_Y + 22, 'wizball', LIFE_GLYPH_BASE_FRAME).setDisplaySize(20, 20),
      101
    ) as Phaser.GameObjects.Image;
    // opengl_boolean_blend_add (:32) — the glyph is white-on-black artwork, so
    // additive is what drops its background and lets the ball show through.
    if (hasFont) this.lifeGlyph.setBlendMode(Phaser.BlendModes.ADD);
    // Enemy/pearl count (bottom-left, below lives).
    this.enemyCountText = fix(s.add.text(8, BOT_Y + 32, '', { fontSize: '11px', color: '#ff6644', fontFamily: 'monospace' })) as Phaser.GameObjects.Text;

    // OCEAN box (bottom, centre-right) — the publisher badge, as in the original.
    this.oceanBox = fix(s.add.rectangle(452, BOT_Y + 24, 84, 26, 0x1133aa).setStrokeStyle(2, 0x88bbff), 99) as Phaser.GameObjects.Rectangle;
    this.oceanText = fix(s.add.text(452, BOT_Y + 24, 'OCEAN', { fontSize: '15px', color: '#bfe0ff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5)) as Phaser.GameObjects.Text;

    // Level box (bottom, right of OCEAN).
    this.levelBox = fix(s.add.rectangle(534, BOT_Y + 24, 40, 26, 0x102a55).setStrokeStyle(2, 0x44aaff), 99) as Phaser.GameObjects.Rectangle;
    this.levelText = fix(s.add.text(534, BOT_Y + 24, '', { fontSize: '17px', color: '#66bbff', fontFamily: 'monospace', fontStyle: 'bold' }).setOrigin(0.5)) as Phaser.GameObjects.Text;

    // Paint indicator + catellite status (bottom-right).
    this.paintLabel = fix(s.add.text(GAME_WIDTH - 66, BOT_Y + 6, 'PAINT', { fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace' })) as Phaser.GameObjects.Text;
    this.paintIndicator = fix(s.add.rectangle(GAME_WIDTH - 22, BOT_Y + 12, 16, 10, 0x666666).setAlpha(0.3)) as Phaser.GameObjects.Rectangle;
    this.catelliteStatus = fix(s.add.text(GAME_WIDTH - 66, BOT_Y + 28, '', { fontSize: '10px', color: '#88aaff', fontFamily: 'monospace' })) as Phaser.GameObjects.Text;

    this.update();
  }

  public update(): void {
    this.scoreText.setText(displayScore(this.state.score));
    this.hiScoreText.setText(`HI ${displayScore(this.state.hiScore)}`);

    this.updateLifeIndicator();

    const enemyCount = Math.min(Math.max(0, this.state.enemyCount ?? 0), 999);
    this.enemyCountText.setText(`ENE ${enemyCount.toString().padStart(3, '0')}`);

    this.levelText.setText(`${this.state.currentLevel}`);

    if (this.state.hasPaint) {
      const colors = [0xff0000, 0x00ff00, 0x0000ff];
      this.paintIndicator.fillColor = colors[this.state.currentPaintColor];
      this.paintIndicator.setAlpha(1);
    } else {
      this.paintIndicator.fillColor = 0x666666;
      this.paintIndicator.setAlpha(0.3);
    }

    if (!this.state.hasCatellite) {
      this.catelliteStatus.setText('');
    } else if (this.state.catelliteHasShield) {
      this.catelliteStatus.setText('CAT SHIELD').setColor('#aaddff');
    } else {
      this.catelliteStatus.setText('CAT').setColor('#88aaff');
    }
  }

  /**
   * C++ wizball_life_indicator.txt (the glyph) and
   * wizball_life_indicator_background.txt (the ball behind it), which run every
   * frame off the game panel. Both react to the life count changing: gaining one
   * pops the glyph to 150% and sweeps the backing through the ball's spin frames,
   * losing one shrinks the glyph to nothing and winds the backing down.
   */
  private updateLifeIndicator(): void {
    const lives = Math.max(0, Math.floor(this.state.lives) || 0);

    if (this.lastLifeCount >= 0 && lives !== this.lastLifeCount) {
      const gained = lives > this.lastLifeCount;
      this.lifeGlyphScale = gained ? LIFE_GLYPH_GAIN_SCALE : LIFE_GLYPH_LOSS_SCALE;
      this.lifeState = gained ? LIFE_STATE_GAIN : LIFE_STATE_LOSS;
      this.lifeGainProgress = 0;
      if (!gained) this.lifeBackFrame = LIFE_BACK_LOSS_FIRST;
    }
    this.lastLifeCount = lives;

    // :38 — `base_frame + lives !> 91`, so 17+ lives all show "TOO MANY".
    const glyphFrame = Math.min(LIFE_GLYPH_BASE_FRAME + lives, LIFE_GLYPH_MAX_FRAME);
    this.lifeGlyph.setFrame(
      this.lifeGlyph.texture.key === 'font' ? `font_${glyphFrame}` : glyphFrame
    );

    // :36-37 — ease the pop back out. Both axes follow scale_x.
    this.lifeGlyphScale = easeTowards(this.lifeGlyphScale, 10000, LIFE_GLYPH_SCALE_EASE);
    this.lifeGlyph.setScale(this.lifeGlyphScale / 10000);

    this.advanceLifeBacking();
    this.lifeBacking.setFrame(this.lifeBackFrame);
  }

  private advanceLifeBacking(): void {
    switch (this.lifeState) {
      case LIFE_STATE_GAIN: {
        // .extra_life — sweep the spin frames on a slow-in/slow-out curve, then
        // rejoin the idle animation at its last frame.
        const biased = slowInSlowOut(this.lifeGainProgress);
        this.lifeBackFrame = Phaser.Math.Clamp(
          Math.trunc((LIFE_BACK_GAIN_SPAN * biased) / 10000), 0, LIFE_BACK_GAIN_LAST
        );
        this.lifeGainProgress = Math.min(10000, this.lifeGainProgress + LIFE_BACK_GAIN_STEP);
        if (this.lifeGainProgress === 10000) {
          this.lifeBackFrame = LIFE_BACK_IDLE_LAST;
          this.lifeState = LIFE_STATE_NORMAL;
        }
        break;
      }
      case LIFE_STATE_LOSS:
        // .lose_life — count back down to the first idle frame, then wait.
        this.lifeBackFrame = Math.max(LIFE_BACK_IDLE_FIRST, this.lifeBackFrame - 1);
        if (this.lifeBackFrame === LIFE_BACK_IDLE_FIRST) {
          this.lifeState = LIFE_STATE_WAITING;
          this.lifeBackFrame = LIFE_BACK_WAITING;
        }
        break;
      case LIFE_STATE_WAITING:
        // .wait_for_new_life — hold until there is a ball in the world again.
        if (this.state.playerAlive !== false) {
          this.lifeState = LIFE_STATE_NORMAL;
          this.lifeBackFrame = LIFE_BACK_IDLE_FIRST;
        }
        break;
      default:
        // .normal_behaviour — `current_frame + 1 !> 94`: runs once and holds.
        this.lifeBackFrame = Math.min(LIFE_BACK_IDLE_LAST, this.lifeBackFrame + 1);
        break;
    }
  }

  public setState(newState: Partial<HUDState>): void {
    this.state = { ...this.state, ...newState };
    this.update();
  }

  public getState(): HUDState {
    return { ...this.state };
  }

  public destroy(): void {
    [this.topBG, this.topLine, this.botBG, this.botLine, this.scoreText, this.hiScoreText,
     this.lifeBacking, this.lifeGlyph, this.enemyCountText, this.oceanBox, this.oceanText,
     this.levelBox, this.levelText, this.paintLabel, this.paintIndicator, this.catelliteStatus]
      .forEach(o => o.destroy());
  }
}
