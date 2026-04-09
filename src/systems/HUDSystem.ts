import Phaser from 'phaser';

export interface HUDState {
  score: number;
  lives: number;
  cauldronFill: number[];
  currentPaintColor: number;
  hasPaint: boolean;
  hasCatellite: boolean;
  catelliteHasShield: boolean;
  currentLevel: number;
}

// Layout matching original Wizball:
// Top bar (y=0..47): score, lives, weapon panels, level
// Game area (y=48..367): 320px play area
// Bottom bar (y=368..415): cauldrons, level indicator

const TOP_BAR_HEIGHT = 48;
const GAME_WIDTH = 640;
const GAME_HEIGHT = 416;
const BOTTOM_BAR_Y = GAME_HEIGHT - TOP_BAR_HEIGHT; // 368

export default class HUDSystem {
  private scene: Phaser.Scene;
  private state: HUDState;

  // Display objects
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private paintIndicator!: Phaser.GameObjects.Rectangle;
  private paintLabel!: Phaser.GameObjects.Text;
  private catelliteStatus!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private topBar!: Phaser.GameObjects.Rectangle;
  private bottomBar!: Phaser.GameObjects.Rectangle;
  private statusLine!: Phaser.GameObjects.Line;

  constructor(scene: Phaser.Scene, initialState: HUDState) {
    this.scene = scene;
    this.state = initialState;
    this.createHUD();
  }

  private createHUD(): void {
    // Top status bar background
    this.topBar = this.scene.add.rectangle(GAME_WIDTH / 2, TOP_BAR_HEIGHT / 2, GAME_WIDTH, TOP_BAR_HEIGHT, 0x000000);
    this.topBar.setScrollFactor(0).setDepth(90);

    // Bottom status bar background
    this.bottomBar = this.scene.add.rectangle(GAME_WIDTH / 2, BOTTOM_BAR_Y + TOP_BAR_HEIGHT / 2, GAME_WIDTH, TOP_BAR_HEIGHT, 0x000000);
    this.bottomBar.setScrollFactor(0).setDepth(90);

    // Divider lines (like the original's green/red borders)
    const topLine = this.scene.add.rectangle(GAME_WIDTH / 2, TOP_BAR_HEIGHT, GAME_WIDTH, 2, 0x448844);
    topLine.setScrollFactor(0).setDepth(95);
    const bottomLine = this.scene.add.rectangle(GAME_WIDTH / 2, BOTTOM_BAR_Y, GAME_WIDTH, 2, 0x448844);
    bottomLine.setScrollFactor(0).setDepth(95);

    // === TOP BAR ===

    // Score (top-left) — large, like the original's "000000"
    this.scoreText = this.scene.add.text(8, 6, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    this.scoreText.setScrollFactor(0).setDepth(100);

    // Lives (below score)
    this.livesText = this.scene.add.text(8, 28, '', {
      fontSize: '12px',
      color: '#ffff44',
      fontFamily: 'monospace',
    });
    this.livesText.setScrollFactor(0).setDepth(100);

    // Paint color indicator (top-right area)
    this.paintLabel = this.scene.add.text(GAME_WIDTH - 120, 8, 'PAINT:', {
      fontSize: '12px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });
    this.paintLabel.setScrollFactor(0).setDepth(100);

    this.paintIndicator = this.scene.add.rectangle(GAME_WIDTH - 50, 16, 28, 16, 0x666666);
    this.paintIndicator.setScrollFactor(0).setDepth(100).setAlpha(0.3);

    // Catellite status (top-right, below paint)
    this.catelliteStatus = this.scene.add.text(GAME_WIDTH - 120, 28, '', {
      fontSize: '10px',
      color: '#88aaff',
      fontFamily: 'monospace',
    });
    this.catelliteStatus.setScrollFactor(0).setDepth(100);

    // === BOTTOM BAR ===

    // Level indicator (bottom-right, like the "1" in the original)
    this.levelText = this.scene.add.text(GAME_WIDTH - 40, BOTTOM_BAR_Y + 14, '', {
      fontSize: '20px',
      color: '#44aaff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#0044aa',
      strokeThickness: 2,
    });
    this.levelText.setScrollFactor(0).setDepth(100).setOrigin(0.5);

    this.update();
  }

  public update(): void {
    this.scoreText.setText(this.state.score.toString().padStart(6, '0'));
    this.livesText.setText(`LIVES: ${this.state.lives}`);
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
      this.catelliteStatus.setText('CAT: SHIELD');
      this.catelliteStatus.setColor('#aaddff');
    } else {
      this.catelliteStatus.setText('CAT: ACTIVE');
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
    this.livesText.destroy();
    this.paintIndicator.destroy();
    this.paintLabel.destroy();
    this.catelliteStatus.destroy();
    this.levelText.destroy();
    this.topBar.destroy();
    this.bottomBar.destroy();
  }
}
