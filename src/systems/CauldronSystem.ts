import Phaser from 'phaser';
import { PaintColor } from '../types/game';

interface Cauldron {
  color: PaintColor;
  fillLevel: number;
  maxCapacity: number;
  position: { x: number; y: number };
}

interface LevelCauldronColors {
  red: { r: number; g: number; b: number };
  green: { r: number; g: number; b: number };
  blue: { r: number; g: number; b: number };
}

export default class CauldronSystem {
  private scene: Phaser.Scene;
  private cauldrons: Cauldron[] = [
    {
      color: PaintColor.RED,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.GREEN,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.BLUE,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    },
    {
      color: PaintColor.YELLOW,
      fillLevel: 0,
      maxCapacity: 20,
      position: { x: 0, y: 0 }
    }
  ];
  private currentPaintColor: PaintColor | null = null;
  private currentLevelCauldronColors: LevelCauldronColors;
  private cauldronSprites: Phaser.GameObjects.Container[] = [];
  private paintPercentage: number = 0;
  private totalPaintBlobs: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.currentLevelCauldronColors = {
      red: { r: 255, g: 0, b: 0 },
      green: { r: 255, g: 0, b: 255 },
      blue: { r: 0, g: 255, b: 255 }
    };
  }

  setupCauldrons(level: number): void {
    this.loadCauldronColors(level);
    this.positionCauldrons();
    this.renderCauldrons();
  }

  private loadCauldronColors(level: number): void {
    const colors = this.getLevelCauldronColors(level);
    this.currentLevelCauldronColors = colors;
  }

  private getLevelCauldronColors(level: number): LevelCauldronColors {
    // C++ datatables/level_cauldron_colours.txt - exact RGB values
    switch (level) {
      case 1:
        return {
          red: { r: 255, g: 0, b: 0 },       // Red
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 2:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 255, g: 128, b: 0 },    // Orange
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 3:
        return {
          red: { r: 0, g: 0, b: 255 },        // Blue
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 4:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 0, g: 255, b: 0 },      // Green
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 5:
        return {
          red: { r: 255, g: 0, b: 0 },        // Red
          green: { r: 255, g: 128, b: 0 },    // Orange
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      case 6:
        return {
          red: { r: 0, g: 0, b: 255 },        // Blue
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 7:
        return {
          red: { r: 255, g: 0, b: 0 },        // Red
          green: { r: 255, g: 0, b: 255 },    // Magenta
          blue: { r: 255, g: 255, b: 0 }      // Yellow
        };
      case 8:
        return {
          red: { r: 128, g: 64, b: 32 },      // Dark Brown
          green: { r: 255, g: 128, b: 128 },  // Light Pink/Salmon
          blue: { r: 0, g: 255, b: 255 }      // Cyan
        };
      default:
        return {
          red: { r: 255, g: 0, b: 0 },
          green: { r: 0, g: 255, b: 0 },
          blue: { r: 0, g: 0, b: 255 }
        };
    }
  }

  private positionCauldrons(): void {
    // Position cauldrons in bottom status bar (matching original layout)
    // Original: 4 cauldrons spread across bottom-left of screen
    const y = 392; // Bottom bar center (368 + 24)

    this.cauldrons[0].position = { x: 80, y };
    this.cauldrons[1].position = { x: 160, y };
    this.cauldrons[2].position = { x: 240, y };
    this.cauldrons[3].position = { x: 320, y };
  }

  private renderCauldrons(): void {
    this.cauldronSprites.forEach(s => s.destroy());
    this.cauldronSprites = [];

    this.cauldrons.forEach((cauldron) => {
      const container = this.scene.add.container(cauldron.position.x, cauldron.position.y);

      const color = this.getCauldronRGB(cauldron.color);
      const colorInt = (color.r << 16) | (color.g << 8) | color.b;

      const bowl = this.scene.add.ellipse(0, 4, 38, 22, 0x101820, 1);
      bowl.setStrokeStyle(2, 0x6a5a3a);

      const liquidBack = this.scene.add.ellipse(0, 0, 26, 10, 0x041018, 1);
      const fillWidth = 8 + (cauldron.fillLevel / cauldron.maxCapacity) * 18;
      const fill = this.scene.add.ellipse(0, 0, fillWidth, 8, colorInt, 0.85);
      const rim = this.scene.add.ellipse(0, -1, 30, 12, 0x1b1f28, 1);
      rim.setStrokeStyle(2, 0xb0b7c8);
      const shine = this.scene.add.ellipse(-6, -3, 10, 4, 0xffffff, 0.15);
      const glow = this.scene.add.ellipse(0, 0, 34, 16, colorInt, 0.18);

      container.add([glow, bowl, liquidBack, fill, rim, shine]);
      container.setDepth(100);
      container.setScrollFactor(0);

      this.cauldronSprites.push(container);
    });
  }

  private getCauldronRGB(color: PaintColor): { r: number; g: number; b: number } {
    switch (color) {
      case PaintColor.RED:
        return this.currentLevelCauldronColors.red;
      case PaintColor.GREEN:
        return this.currentLevelCauldronColors.green;
      case PaintColor.BLUE:
        return this.currentLevelCauldronColors.blue;
      case PaintColor.YELLOW:
        return { r: 200, g: 200, b: 200 };
      default:
        return { r: 255, g: 255, b: 255 };
    }
  }

  pickupPaint(color: PaintColor): void {
    this.currentPaintColor = color;
  }

  getCurrentPaintColor(): PaintColor | null {
    return this.currentPaintColor;
  }

  firePaintAtCauldron(x: number, y: number): boolean {
    if (this.currentPaintColor === null) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      const cauldron = this.cauldrons[i];
      const distance = Phaser.Math.Distance.Between(x, y, cauldron.position.x, cauldron.position.y);

      if (distance < 50) {
        if (cauldron.color === this.currentPaintColor && cauldron.fillLevel < cauldron.maxCapacity) {
          cauldron.fillLevel++;
          this.currentPaintColor = null;
          this.totalPaintBlobs++;
          this.updatePaintPercentage();
          this.checkCombinationCauldron();
          this.renderCauldrons();
          return true;
        }
      }
    }

    return false;
  }

  private checkCombinationCauldron(): void {
    const fullCauldrons = this.cauldrons.slice(0, 3).filter(c => c.fillLevel >= c.maxCapacity);
    const combination = this.cauldrons[3];

    if (fullCauldrons.length >= 2 && combination.fillLevel < combination.maxCapacity) {
      combination.fillLevel = Math.min(combination.fillLevel + 1, combination.maxCapacity);
    }
  }

  private updatePaintPercentage(): void {
    const totalCapacity = this.cauldrons.slice(0, 3).reduce((sum, c) => sum + c.maxCapacity, 0);
    const totalFill = this.cauldrons.slice(0, 3).reduce((sum, c) => sum + c.fillLevel, 0);
    this.paintPercentage = (totalFill / totalCapacity) * 100;
  }

  getPaintPercentage(): number {
    return this.paintPercentage;
  }

  isLevelComplete(): boolean {
    const paintComplete = this.paintPercentage >= 75;
    const allCauldronsFull = this.cauldrons.slice(0, 3).every(c => c.fillLevel >= c.maxCapacity);

    return paintComplete || allCauldronsFull;
  }

  getCauldronFillLevel(cauldronIndex: number): number {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return this.cauldrons[cauldronIndex].fillLevel;
    }
    return 0;
  }

  getCauldronMaxCapacity(cauldronIndex: number): number {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return this.cauldrons[cauldronIndex].maxCapacity;
    }
    return 20;
  }

  getCauldronPosition(cauldronIndex: number): { x: number; y: number } {
    if (cauldronIndex >= 0 && cauldronIndex < this.cauldrons.length) {
      return { ...this.cauldrons[cauldronIndex].position };
    }
    return { x: 0, y: 0 };
  }

  reset(): void {
    this.cauldrons.forEach(c => c.fillLevel = 0);
    this.currentPaintColor = null;
    this.paintPercentage = 0;
    this.totalPaintBlobs = 0;
    this.renderCauldrons();
  }

  setFillLevels(fillLevels: number[]): void {
    this.cauldrons.forEach((cauldron, index) => {
      cauldron.fillLevel = Math.max(0, Math.min(fillLevels[index] ?? 0, cauldron.maxCapacity));
    });
    this.updatePaintPercentage();
    this.renderCauldrons();
  }

  destroy(): void {
    this.cauldronSprites.forEach(sprite => sprite.destroy());
    this.cauldronSprites = [];
  }

  update(): void {
  }

  checkBulletCollision(x: number, y: number, paintColor: PaintColor | null): boolean {
    if (paintColor === null) return false;

    for (let i = 0; i < 3; i++) {
      const cauldron = this.cauldrons[i];
      const distance = Phaser.Math.Distance.Between(x, y, cauldron.position.x, cauldron.position.y);

      if (distance < 30) {
        if (cauldron.color === paintColor && cauldron.fillLevel < cauldron.maxCapacity) {
          cauldron.fillLevel++;
          this.updatePaintPercentage();
          this.checkCombinationCauldron();
          this.renderCauldrons();
          return true;
        }
      }
    }

    return false;
  }
}
