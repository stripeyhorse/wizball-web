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
}

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
  private livesText!: Phaser.GameObjects.Text;
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

    // Lives (left, bottom)
    this.livesText = this.scene.add.text(6, PANEL_Y + 36, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace',
    });
    this.livesText.setScrollFactor(0).setDepth(100);

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
    this.livesText.setText(`LIVES ${this.state.lives}`);
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
    this.livesText.destroy();
    this.paintIndicator.destroy();
    this.paintLabel.destroy();
    this.catelliteStatus.destroy();
    this.levelText.destroy();
    this.panelBG.destroy();
    this.panelLine.destroy();
  }
}
