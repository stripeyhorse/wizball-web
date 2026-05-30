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
  // Remaining on-screen enemy/pearl count shown as a 3-digit readout in the
  // status panel (mirrors the C++ enemy_count_digit display). Optional —
  // defaults to 0 when absent.
  enemyCount?: number;
}

// C++ reference (wizball_life_indicator): the life count is drawn as a single
// Wizball sprite-icon whose frame = base_frame + player_lives, where
// base_frame = 74, clamped to a max frame of 91. We reproduce that here using
// the 'wizball' spritesheet (48x48 frames, 10x10 grid = 100 frames).
const LIFE_ICON_BASE_FRAME = 74;
const LIFE_ICON_MAX_FRAME = 91;

// Match original Wizball layout:
//   Play area: y=0..367  (full height, 23 tile rows)
//   Status panel: y=368..415  (bottom 48px, 3 tile rows)
// No top bar — keeps the full tilemap visible so enemies and wizball don't
// disappear behind HUD when near the ceiling.

const PANEL_HEIGHT = 48;
const GAME_WIDTH = 640;
const GAME_HEIGHT = 416;
const PANEL_Y = GAME_HEIGHT - PANEL_HEIGHT; // 368

export default class HUDSystem {
  private scene: Phaser.Scene;
  private state: HUDState;

  private scoreText!: Phaser.GameObjects.Text;
  private hiScoreText!: Phaser.GameObjects.Text;
  private lifeIcon!: Phaser.GameObjects.Image;
  private livesText!: Phaser.GameObjects.Text;
  private enemyCountLabel!: Phaser.GameObjects.Text;
  private enemyCountText!: Phaser.GameObjects.Text;
  private paintLabel!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;
  private catelliteStatus!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private panelBG!: Phaser.GameObjects.Rectangle;
  private panelLine!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, initialState: HUDState) {
    this.scene = scene;
    this.state = initialState;
    this.createHUD();
  }

  private createHUD(): void {
    // Bottom status panel background
    this.panelBG = this.scene.add.rectangle(GAME_WIDTH / 2, PANEL_Y + PANEL_HEIGHT / 2, GAME_WIDTH, PANEL_HEIGHT, 0x000000);
    this.panelBG.setScrollFactor(0).setDepth(90);

    // Green divider line (matches original border)
    this.panelLine = this.scene.add.rectangle(GAME_WIDTH / 2, PANEL_Y, GAME_WIDTH, 2, 0x448844);
    this.panelLine.setScrollFactor(0).setDepth(95);

    // Score (left-top of panel)
    this.scoreText = this.scene.add.text(6, PANEL_Y + 4, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.scoreText.setScrollFactor(0).setDepth(100);

    // Hi-score (left, below score)
    this.hiScoreText = this.scene.add.text(6, PANEL_Y + 22, '', {
      fontSize: '11px', color: '#ffcc44', fontFamily: 'monospace',
    });
    this.hiScoreText.setScrollFactor(0).setDepth(100);

    // Lives (left, bottom) — Wizball sprite-icon counter (C++ parity).
    // A single 48x48 wizball frame, scaled down to ~16px and shown next to an
    // "xN" multiplier so the count stays readable even though the icon's frame
    // itself already encodes the remaining lives.
    this.lifeIcon = this.scene.add.image(13, PANEL_Y + 40, 'wizball', LIFE_ICON_BASE_FRAME);
    this.lifeIcon.setDisplaySize(16, 16);
    this.lifeIcon.setScrollFactor(0).setDepth(100);

    this.livesText = this.scene.add.text(24, PANEL_Y + 34, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold',
    });
    this.livesText.setScrollFactor(0).setDepth(100);

    // Enemy / pearl count (centre of panel) — 3-digit readout (C++ parity).
    this.enemyCountLabel = this.scene.add.text(GAME_WIDTH / 2 - 30, PANEL_Y + 6, 'ENEMIES', {
      fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    this.enemyCountLabel.setScrollFactor(0).setDepth(100);

    this.enemyCountText = this.scene.add.text(GAME_WIDTH / 2, PANEL_Y + 20, '', {
      fontSize: '18px', color: '#ff6644', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#440000', strokeThickness: 2,
    }).setOrigin(0.5, 0);
    this.enemyCountText.setScrollFactor(0).setDepth(100);

    // Paint indicator (top-right of panel, small swatch)
    this.paintLabel = this.scene.add.text(GAME_WIDTH - 60, PANEL_Y + 6, 'PAINT', {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    this.paintLabel.setScrollFactor(0).setDepth(100);

    this.paintIndicator = this.scene.add.rectangle(GAME_WIDTH - 20, PANEL_Y + 12, 14, 10, 0x666666);
    this.paintIndicator.setScrollFactor(0).setDepth(100).setAlpha(0.3);

    // Catellite status (right side, below paint)
    this.catelliteStatus = this.scene.add.text(GAME_WIDTH - 60, PANEL_Y + 20, '', {
      fontSize: '10px', color: '#88aaff', fontFamily: 'monospace',
    });
    this.catelliteStatus.setScrollFactor(0).setDepth(100);

    // Level indicator (far-right, larger)
    this.levelText = this.scene.add.text(GAME_WIDTH - 6, PANEL_Y + 28, '', {
      fontSize: '16px', color: '#44aaff', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#0044aa', strokeThickness: 2,
    }).setOrigin(1, 0);
    this.levelText.setScrollFactor(0).setDepth(100);

    this.update();
  }

  public update(): void {
    this.scoreText.setText(this.state.score.toString().padStart(7, '0'));
    this.hiScoreText.setText(`HI ${this.state.hiScore.toString().padStart(7, '0')}`);

    // Life indicator: frame = 74 + lives, clamped to the C++ max of 91.
    const lives = Math.max(0, this.state.lives);
    const lifeFrame = Math.min(LIFE_ICON_BASE_FRAME + lives, LIFE_ICON_MAX_FRAME);
    this.lifeIcon.setFrame(lifeFrame);
    this.livesText.setText(`x${lives}`);

    // Enemy / pearl count: 3-digit readout, defaults to 0 when absent.
    const enemyCount = Math.max(0, this.state.enemyCount ?? 0);
    this.enemyCountText.setText(Math.min(enemyCount, 999).toString().padStart(3, '0'));

    this.levelText.setText(`L${this.state.currentLevel}`);

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
      this.catelliteStatus.setText('CAT SHIELD');
      this.catelliteStatus.setColor('#aaddff');
    } else {
      this.catelliteStatus.setText('CAT');
      this.catelliteStatus.setColor('#88aaff');
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
    this.scoreText.destroy();
    this.hiScoreText.destroy();
    this.lifeIcon.destroy();
    this.livesText.destroy();
    this.enemyCountLabel.destroy();
    this.enemyCountText.destroy();
    this.paintIndicator.destroy();
    this.paintLabel.destroy();
    this.catelliteStatus.destroy();
    this.levelText.destroy();
    this.panelBG.destroy();
    this.panelLine.destroy();
  }
}
