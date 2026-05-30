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
}

// C++ wizball_life_indicator: the life count is drawn as a Wizball sprite-icon
// whose frame = 74 + lives, clamped to 91. Uses the 'wizball' spritesheet.
const LIFE_ICON_BASE_FRAME = 74;
const LIFE_ICON_MAX_FRAME = 91;

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
  private lifeIcon!: Phaser.GameObjects.Image;
  private livesText!: Phaser.GameObjects.Text;
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

    // Lives: Wizball sprite-icon + multiplier (bottom-left).
    this.lifeIcon = fix(s.add.image(16, BOT_Y + 16, 'wizball', LIFE_ICON_BASE_FRAME).setDisplaySize(20, 20)) as Phaser.GameObjects.Image;
    this.livesText = fix(s.add.text(30, BOT_Y + 9, '', { fontSize: '13px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold' })) as Phaser.GameObjects.Text;
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
    this.scoreText.setText(this.state.score.toString().padStart(7, '0'));
    this.hiScoreText.setText(`HI ${this.state.hiScore.toString().padStart(7, '0')}`);

    const lives = Math.max(0, this.state.lives);
    this.lifeIcon.setFrame(Math.min(LIFE_ICON_BASE_FRAME + lives, LIFE_ICON_MAX_FRAME));
    this.livesText.setText(`x${lives}`);

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

  public setState(newState: Partial<HUDState>): void {
    this.state = { ...this.state, ...newState };
    this.update();
  }

  public getState(): HUDState {
    return { ...this.state };
  }

  public destroy(): void {
    [this.topBG, this.topLine, this.botBG, this.botLine, this.scoreText, this.hiScoreText,
     this.lifeIcon, this.livesText, this.enemyCountText, this.oceanBox, this.oceanText,
     this.levelBox, this.levelText, this.paintLabel, this.paintIndicator, this.catelliteStatus]
      .forEach(o => o.destroy());
  }
}
