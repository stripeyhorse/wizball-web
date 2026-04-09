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
  
  constructor(scene: Phaser.Scene, initialState: HUDState) {
    this.scene = scene;
    this.state = initialState;
    this.createHUD();
  }

  private createHUD(): void {
    const baseY = 10;
    const rightX = 630;
    // Score (top-left)
    this.scoreText = this.scene.add.text(10, baseY, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 }
    });
    this.scoreText.setScrollFactor(0);
    this.scoreText.setDepth(100);

    // Lives (next to score)
    this.livesText = this.scene.add.text(120, baseY, '', {
      fontSize: '14px',
      color: '#ffff00',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 }
    });
    this.livesText.setScrollFactor(0);
    this.livesText.setDepth(100);

    // Level indicator
    this.levelText = this.scene.add.text(10, baseY + 25, '', {
      fontSize: '12px',
      color: '#88ff88',
      fontFamily: 'monospace',
      backgroundColor: '#00000088',
      padding: { x: 6, y: 3 }
    });
    this.levelText.setScrollFactor(0);
    this.levelText.setDepth(100);

    // Paint color indicator (top-right)
    this.paintLabel = this.scene.add.text(rightX - 90, baseY, 'PAINT:', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace'
    });
    this.paintLabel.setScrollFactor(0);
    this.paintLabel.setOrigin(1, 0);
    this.paintLabel.setDepth(100);

    this.paintIndicator = this.scene.add.rectangle(rightX - 10, baseY + 10, 24, 16, 0x666666);
    this.paintIndicator.setScrollFactor(0);
    this.paintIndicator.setDepth(100);
    this.paintIndicator.setAlpha(0.3);

    // Catellite status
    this.catelliteStatus = this.scene.add.text(rightX - 90, baseY + 30, '', {
      fontSize: '12px',
      color: '#88aaff',
      fontFamily: 'monospace'
    });
    this.catelliteStatus.setScrollFactor(0);
    this.catelliteStatus.setOrigin(1, 0);
    this.catelliteStatus.setDepth(100);

    this.update();
  }

  public update(): void {
    // Update score
    this.scoreText.setText(`SCORE: ${this.state.score.toString().padStart(6, '0')}`);

    // Update lives
    this.livesText.setText(`LIVES: ${this.state.lives}`);

    // Update level
    this.levelText.setText(`LEVEL: ${this.state.currentLevel}`);

    // Update paint indicator
    if (this.state.hasPaint) {
      const colors = [0xff0000, 0x00ff00, 0x0000ff];
      this.paintIndicator.fillColor = colors[this.state.currentPaintColor];
      this.paintIndicator.setAlpha(1);
    } else {
      this.paintIndicator.fillColor = 0x666666;
      this.paintIndicator.setAlpha(0.3);
    }

    // Update catellite status
    if (!this.state.hasCatellite) {
      this.catelliteStatus.setText('');
    } else if (this.state.catelliteHasShield) {
      this.catelliteStatus.setText('CATELLITE: SHIELD');
      this.catelliteStatus.setColor('#aaddff');
    } else {
      this.catelliteStatus.setText('CATELLITE: ACTIVE');
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
  }
}
